-- ============================================================
-- Banfa POS — โมดูลคลังสินค้า (Stock Module)
-- Supabase → SQL Editor → New query → วางทั้งหมด → Run
--
-- โครงสร้าง:
--   locations     = สถานที่เก็บของ (คลังหลังร้าน / หน้าร้าน)
--   ingredients   = ข้อมูลวัตถุดิบ (ไม่มีคอลัมน์ stock อีกต่อไป)
--   stock_levels  = วัตถุดิบ A ที่สถานที่ B เหลือเท่าไร
--   stock_moves   = ประวัติทุกการเคลื่อนไหว (ห้ามลบ ห้ามแก้)
--   stock_docs    = หัวเอกสาร (1 เอกสาร = หลายรายการ)
--
-- ปลอดภัย: รันทับได้ ไม่ลบบิล/ยอดขาย
-- ============================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

-- ------------------------------------------------------------
-- 1) สถานที่
-- ------------------------------------------------------------
create table if not exists public.locations (
  id         text primary key,
  name       text not null,
  type       text not null default 'front',   -- warehouse | front | external
  active     boolean not null default true,
  sort_order int default 0
);

insert into public.locations (id,name,type,sort_order) values
  ('wh',   'คลังหลังร้าน', 'warehouse', 1),
  ('front','หน้าร้าน',     'front',     2)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 2) วัตถุดิบ
-- ------------------------------------------------------------
create table if not exists public.ingredients (
  id         text primary key,
  name       text not null,
  unit       text not null default 'g',   -- หน่วยที่ใช้ในสูตร
  cost       numeric not null default 0,  -- ต้นทุนต่อหน่วยใช้งาน
  low_front  numeric not null default 0,  -- จุดเตือนหน้าร้าน
  low_wh     numeric not null default 0,  -- จุดเตือนคลัง
  buy_unit   text,                        -- หน่วยซื้อ เช่น 'ลัง'
  buy_factor numeric not null default 1,  -- 1 หน่วยซื้อ = กี่หน่วยใช้งาน
  active     boolean not null default true,
  sort_order int default 0
);

-- ------------------------------------------------------------
-- 3) ยอดคงเหลือแยกตามสถานที่
-- ------------------------------------------------------------
create table if not exists public.stock_levels (
  ingredient_id text not null references public.ingredients(id) on delete cascade,
  location_id   text not null references public.locations(id)   on delete cascade,
  qty           numeric not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (ingredient_id, location_id)
);

-- ------------------------------------------------------------
-- 4) เอกสาร + รายการเคลื่อนไหว
-- ------------------------------------------------------------
create table if not exists public.stock_docs (
  id            text primary key,
  created_at    timestamptz not null default now(),
  type          text not null,          -- receive|transfer|issue|adjust|sale
  from_location text,
  to_location   text,
  actor         text,
  supplier      text,
  recipient     text,                   -- ใครรับของ (กรณีจ่ายออก)
  total_cost    numeric not null default 0,
  lines         int not null default 0,
  note          text
);

create table if not exists public.stock_moves (
  id            uuid primary key default gen_random_uuid(),
  doc_id        text references public.stock_docs(id) on delete cascade,
  created_at    timestamptz not null default now(),
  type          text not null,
  ingredient_id text not null,
  qty           numeric not null,       -- จำนวนในหน่วยใช้งาน
  from_location text,
  to_location   text,
  unit_cost     numeric,
  actor         text,
  ref           text,                   -- order local_id เมื่อเป็นการขาย
  note          text
);

create index if not exists moves_created_idx on public.stock_moves (created_at desc);
create index if not exists moves_ing_idx     on public.stock_moves (ingredient_id);
create index if not exists moves_doc_idx     on public.stock_moves (doc_id);
create index if not exists docs_created_idx  on public.stock_docs  (created_at desc);

-- ------------------------------------------------------------
-- 5) RPC หลัก — บันทึกเอกสารเคลื่อนไหวแบบ atomic
--    p_lines = [{"ingredient_id":"i_milk","qty":12000,"unit_cost":0.048}, ...]
--    qty เป็นหน่วยใช้งานเสมอ (แปลงจากหน่วยซื้อมาแล้วฝั่ง client)
-- ------------------------------------------------------------
create or replace function public.post_stock_doc(
  p_type      text,
  p_from      text,
  p_to        text,
  p_actor     text,
  p_lines     jsonb,
  p_supplier  text default null,
  p_recipient text default null,
  p_note      text default null,
  p_ref       text default null
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_doc   text;
  v_line  jsonb;
  v_total numeric := 0;
  v_n     int := 0;
  v_qty   numeric;
  v_ing   text;
  v_pfx   text;
begin
  if p_type not in ('receive','transfer','issue','adjust','sale') then
    raise exception 'ประเภทเอกสารไม่ถูกต้อง: %', p_type;
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'ไม่มีรายการในเอกสาร';
  end if;

  v_pfx := case p_type
             when 'receive'  then 'RC' when 'transfer' then 'TF'
             when 'issue'    then 'IS' when 'adjust'   then 'AD'
             else 'SL' end;

  v_doc := v_pfx || '-' || to_char(now() at time zone 'Asia/Bangkok','YYMMDD') || '-' ||
           lpad((select count(*)+1 from public.stock_docs
                  where type = p_type
                    and (created_at at time zone 'Asia/Bangkok')::date
                        = (now() at time zone 'Asia/Bangkok')::date)::text, 3, '0');

  insert into public.stock_docs(id,type,from_location,to_location,actor,supplier,recipient,note)
  values (v_doc,p_type,p_from,p_to,p_actor,p_supplier,p_recipient,p_note);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_ing := v_line->>'ingredient_id';
    v_qty := coalesce((v_line->>'qty')::numeric, 0);
    if v_qty = 0 then continue; end if;
    if not exists (select 1 from public.ingredients where id = v_ing) then
      raise exception 'ไม่พบวัตถุดิบ: %', v_ing;
    end if;

    -- ตัดออกจากต้นทาง
    if p_from is not null then
      insert into public.stock_levels(ingredient_id,location_id,qty)
      values (v_ing, p_from, -v_qty)
      on conflict (ingredient_id,location_id) do update
        set qty = public.stock_levels.qty - v_qty, updated_at = now();
    end if;

    -- เพิ่มเข้าปลายทาง
    if p_to is not null then
      insert into public.stock_levels(ingredient_id,location_id,qty)
      values (v_ing, p_to, v_qty)
      on conflict (ingredient_id,location_id) do update
        set qty = public.stock_levels.qty + v_qty, updated_at = now();
    end if;

    insert into public.stock_moves(doc_id,type,ingredient_id,qty,from_location,to_location,unit_cost,actor,ref)
    values (v_doc,p_type,v_ing,v_qty,p_from,p_to,(v_line->>'unit_cost')::numeric,p_actor,p_ref);

    v_total := v_total + v_qty * coalesce((v_line->>'unit_cost')::numeric,0);
    v_n := v_n + 1;

    -- รับของเข้า: อัปเดตต้นทุนต่อหน่วยล่าสุด
    if p_type = 'receive' and (v_line->>'unit_cost') is not null then
      update public.ingredients set cost = (v_line->>'unit_cost')::numeric where id = v_ing;
    end if;
  end loop;

  update public.stock_docs set total_cost = v_total, lines = v_n where id = v_doc;
  return v_doc;
end $$;

-- ------------------------------------------------------------
-- 6) VIEW: ภาพรวมสต็อก (วัตถุดิบ × สถานที่)
-- ------------------------------------------------------------
create or replace view public.stock_overview as
select
  i.id, i.name, i.unit, i.cost, i.buy_unit, i.buy_factor,
  i.low_front, i.low_wh, i.active,
  coalesce(w.qty,0) as qty_wh,
  coalesce(f.qty,0) as qty_front,
  coalesce(w.qty,0) + coalesce(f.qty,0) as qty_total,
  (coalesce(w.qty,0) + coalesce(f.qty,0)) * i.cost as value_total,
  (coalesce(f.qty,0) <= i.low_front) as low_front_flag,
  (coalesce(w.qty,0) <= i.low_wh)    as low_wh_flag
from public.ingredients i
left join public.stock_levels w on w.ingredient_id = i.id and w.location_id = 'wh'
left join public.stock_levels f on f.ingredient_id = i.id and f.location_id = 'front'
where i.active;

-- ------------------------------------------------------------
-- 7) ย้ายวัตถุดิบเดิมจาก app_config เข้าตาราง (ทำครั้งเดียว)
--    ยอดเดิมถือว่าอยู่ "หน้าร้าน"
-- ------------------------------------------------------------
do $$
declare v jsonb; r jsonb; n int := 0;
begin
  if exists (select 1 from public.ingredients) then
    raise notice 'มีวัตถุดิบในตารางแล้ว ข้ามการย้ายข้อมูล';
    return;
  end if;
  select value into v from public.app_config where key = 'ingredients';
  if v is null then
    raise notice 'ไม่พบวัตถุดิบเดิมใน app_config';
    return;
  end if;
  for r in select * from jsonb_array_elements(v) loop
    insert into public.ingredients (id,name,unit,cost,low_front,low_wh,sort_order)
    values (r->>'id', r->>'name', coalesce(r->>'unit','g'),
            coalesce((r->>'cost')::numeric,0),
            coalesce((r->>'low')::numeric,0),
            coalesce((r->>'low')::numeric,0), n)
    on conflict (id) do nothing;

    insert into public.stock_levels (ingredient_id,location_id,qty)
    values (r->>'id','front', coalesce((r->>'stock')::numeric,0))
    on conflict do nothing;
    n := n + 1;
  end loop;
  raise notice 'ย้ายวัตถุดิบ % รายการเข้าหน้าร้านแล้ว', n;
end $$;

-- ------------------------------------------------------------
-- 8) สิทธิ์
-- ------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.ingredients  to anon, authenticated;
grant select                          on public.locations    to anon, authenticated;
grant select                          on public.stock_levels to anon, authenticated;
grant select                          on public.stock_moves  to anon, authenticated;
grant select                          on public.stock_docs   to anon, authenticated;
grant select                          on public.stock_overview to anon, authenticated;
grant execute on function public.post_stock_doc(text,text,text,text,jsonb,text,text,text,text)
  to anon, authenticated;

alter table public.locations    enable row level security;
alter table public.ingredients  enable row level security;
alter table public.stock_levels enable row level security;
alter table public.stock_moves  enable row level security;
alter table public.stock_docs   enable row level security;

drop policy if exists "read locations"    on public.locations;
drop policy if exists "rw ingredients"    on public.ingredients;
drop policy if exists "read levels"       on public.stock_levels;
drop policy if exists "read moves"        on public.stock_moves;
drop policy if exists "read docs"         on public.stock_docs;

create policy "read locations" on public.locations    for select to anon, authenticated using (true);
create policy "rw ingredients" on public.ingredients  for all    to anon, authenticated using (true) with check (true);
create policy "read levels"    on public.stock_levels for select to anon, authenticated using (true);
create policy "read moves"     on public.stock_moves  for select to anon, authenticated using (true);
create policy "read docs"      on public.stock_docs   for select to anon, authenticated using (true);

-- ------------------------------------------------------------
-- 9) ตรวจผล
-- ------------------------------------------------------------
select 'สถานที่: ' || count(*)::text as result from public.locations
union all select 'วัตถุดิบ: ' || count(*)::text from public.ingredients
union all select 'ยอดคงเหลือ: ' || count(*)::text || ' รายการ' from public.stock_levels
union all select 'มูลค่าสต็อกรวม: ' ||
       coalesce(round(sum(value_total))::text,'0') || ' บาท' from public.stock_overview;
