-- ============================================================
-- Banfa POS — schema v5
-- รองรับ: เงินเข้า-ออกลิ้นชัก · นับสต็อก/ปรับยอด · ขายตัดสต็อกผ่าน RPC
-- Supabase → SQL Editor → New query → Run  (รันทับได้ ไม่ลบข้อมูล)
-- ============================================================

set search_path = public, extensions;

-- ------------------------------------------------------------
-- 1) เงินเข้า-ออกลิ้นชักระหว่างกะ
--    เช่น เอาเงินไปซื้อของ / เติมเงินทอน / ถอนไปฝากธนาคาร
-- ------------------------------------------------------------
create table if not exists public.cash_movements (
  id         uuid primary key default gen_random_uuid(),
  local_id   text unique not null,
  created_at timestamptz not null default now(),
  shift_id   text,
  direction  text not null,              -- 'in' = เข้าลิ้นชัก | 'out' = ออกจากลิ้นชัก
  amount     numeric not null,
  reason     text,
  actor      text
);
alter table public.cash_movements drop constraint if exists cm_dir_valid;
alter table public.cash_movements add constraint cm_dir_valid
  check (direction in ('in','out'));
alter table public.cash_movements drop constraint if exists cm_amount_positive;
alter table public.cash_movements add constraint cm_amount_positive
  check (amount > 0);

create index if not exists cm_shift_idx   on public.cash_movements (shift_id);
create index if not exists cm_created_idx on public.cash_movements (created_at desc);

-- เก็บยอดสรุปไว้ในกะด้วย เพื่อดูย้อนหลังได้เร็ว
alter table public.shifts add column if not exists cash_in  numeric not null default 0;
alter table public.shifts add column if not exists cash_out numeric not null default 0;

-- ------------------------------------------------------------
-- 2) สต็อก: รองรับยอดติดลบไม่ได้ + ปรับยอด (นับจริง)
--    RPC post_stock_doc รองรับ type='adjust' อยู่แล้ว
--    เพิ่มฟังก์ชันช่วย "ตั้งยอดเป็นค่าที่นับได้" (ไม่ใช่บวก/ลบ)
-- ------------------------------------------------------------
create or replace function public.set_stock_count(
  p_location text,
  p_actor    text,
  p_lines    jsonb,     -- [{"ingredient_id":"i_milk","counted":5400}, ...]
  p_note     text default null
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_doc text; v_line jsonb; v_n int := 0;
  v_cur numeric; v_diff numeric; v_ing text;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'ไม่มีรายการให้ปรับยอด';
  end if;

  v_doc := 'CT-' || to_char(now() at time zone 'Asia/Bangkok','YYMMDD') || '-' ||
           lpad((select count(*)+1 from public.stock_docs
                  where type='adjust'
                    and (created_at at time zone 'Asia/Bangkok')::date
                        = (now() at time zone 'Asia/Bangkok')::date)::text, 3, '0');

  insert into public.stock_docs(id,type,from_location,to_location,actor,note)
  values (v_doc,'adjust',p_location,p_location,p_actor,coalesce(p_note,'นับสต็อกจริง'));

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_ing := v_line->>'ingredient_id';

    select coalesce(qty,0) into v_cur
      from public.stock_levels
     where ingredient_id = v_ing and location_id = p_location;
    v_cur := coalesce(v_cur,0);

    v_diff := (v_line->>'counted')::numeric - v_cur;
    if v_diff = 0 then continue; end if;

    insert into public.stock_levels(ingredient_id,location_id,qty)
    values (v_ing, p_location, (v_line->>'counted')::numeric)
    on conflict (ingredient_id,location_id) do update
      set qty = (v_line->>'counted')::numeric, updated_at = now();

    insert into public.stock_moves(doc_id,type,ingredient_id,qty,from_location,to_location,actor,note)
    values (v_doc,'adjust',v_ing,v_diff,
            case when v_diff < 0 then p_location else null end,
            case when v_diff > 0 then p_location else null end,
            p_actor,
            'นับได้ ' || (v_line->>'counted') || ' (เดิม ' || v_cur || ')');
    v_n := v_n + 1;
  end loop;

  update public.stock_docs set lines = v_n where id = v_doc;
  return v_doc;
end $$;

-- ------------------------------------------------------------
-- 3) VIEW: การใช้วัตถุดิบ + ของหาย (สำหรับรายงานข้อ 9)
-- ------------------------------------------------------------
create or replace view public.ingredient_flow as
select
  m.ingredient_id,
  i.name, i.unit, i.cost,
  sum(case when m.type='receive'  then m.qty else 0 end) as received,
  sum(case when m.type='transfer' then m.qty else 0 end) as transferred,
  sum(case when m.type='issue'    then m.qty else 0 end) as issued,
  sum(case when m.type='sale'     then m.qty else 0 end) as sold,
  sum(case when m.type='adjust'   then m.qty else 0 end) as adjusted,
  sum(case when m.type='sale'     then m.qty else 0 end) * i.cost as sold_value,
  sum(case when m.type='adjust' and m.qty < 0 then -m.qty else 0 end) * i.cost as loss_value,
  min(m.created_at) as first_move,
  max(m.created_at) as last_move
from public.stock_moves m
join public.ingredients i on i.id = m.ingredient_id
group by m.ingredient_id, i.name, i.unit, i.cost;

-- ------------------------------------------------------------
-- 4) สิทธิ์
-- ------------------------------------------------------------
grant select, insert on public.cash_movements to anon, authenticated;
grant select          on public.ingredient_flow to anon, authenticated;
grant execute on function public.set_stock_count(text,text,jsonb,text) to anon, authenticated;

alter table public.cash_movements enable row level security;
drop policy if exists "read cash"   on public.cash_movements;
drop policy if exists "insert cash" on public.cash_movements;
create policy "read cash"   on public.cash_movements for select to anon, authenticated using (true);
create policy "insert cash" on public.cash_movements for insert to anon, authenticated with check (true);

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 5) ตรวจผล
-- ------------------------------------------------------------
select 'cash_movements พร้อม' as result
union all select 'set_stock_count พร้อม'
union all select 'ingredient_flow: ' || count(*)::text || ' วัตถุดิบมีการเคลื่อนไหว'
          from public.ingredient_flow;
