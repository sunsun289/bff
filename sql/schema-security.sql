-- ============================================================
-- Banfa POS — Security Migration (Sprint 0)
-- Supabase → SQL Editor → New query → วางทั้งหมด → Run
--
-- แก้อะไร:
--   1. ย้าย PIN พนักงานออกจาก app_config → ตาราง staff + bcrypt hash
--   2. ล็อกอินผ่าน RPC (client อ่าน PIN ไม่ได้อีกต่อไป)
--   3. DB constraints กันข้อมูลผิดรูป
--   4. created_at ใช้เวลาของ server (เครื่องตั้งเวลาผิดก็ไม่กระทบ)
--
-- ปลอดภัย: รันทับได้ ไม่ลบบิล/ยอดขาย
-- ============================================================

-- pgcrypto อยู่ใน schema extensions (ค่าเริ่มต้นของ Supabase)
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ให้ session นี้มองเห็น crypt()/gen_salt() ได้
set search_path = public, extensions;

-- ตรวจว่า crypt() ใช้ได้จริงก่อนไปต่อ (ถ้า error ตรงนี้ ให้ส่งข้อความมาบอก)
do $$
begin
  perform crypt('test', gen_salt('bf'));
  raise notice 'pgcrypto พร้อมใช้งาน (schema: %)',
    (select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace
      where e.extname='pgcrypto');
end $$;

-- ------------------------------------------------------------
-- 1) ตารางพนักงาน (PIN เก็บเป็น hash เท่านั้น)
-- ------------------------------------------------------------
create table if not exists public.staff (
  id         text primary key,
  name       text not null,
  pin_hash   text not null,
  role       text not null default 'cashier',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.staff drop constraint if exists staff_role_valid;
alter table public.staff add constraint staff_role_valid
  check (role in ('cashier','admin'));

-- ------------------------------------------------------------
-- 2) ย้ายข้อมูลพนักงานเดิมจาก app_config มาใส่ (ทำครั้งเดียว)
-- ------------------------------------------------------------
do $$
declare v jsonb; s jsonb;
begin
  select value into v from public.app_config where key = 'staff';
  if v is not null then
    for s in select * from jsonb_array_elements(v) loop
      insert into public.staff (id, name, pin_hash, role, active)
      values (
        coalesce(s->>'id', 's_' || md5(random()::text)),
        coalesce(s->>'name', 'พนักงาน'),
        crypt(coalesce(s->>'pin','0000'), gen_salt('bf')),
        coalesce(s->>'role','cashier'),
        coalesce((s->>'active')::boolean, true)
      )
      on conflict (id) do nothing;
    end loop;
    -- ลบ PIN ดิบทิ้งจาก app_config
    delete from public.app_config where key = 'staff';
    raise notice 'ย้ายพนักงานเรียบร้อย และลบ PIN ดิบออกจาก app_config แล้ว';
  end if;
end $$;

-- ------------------------------------------------------------
-- 3) RPC: ตรวจ PIN (client ไม่มีทางอ่าน hash ได้)
-- ------------------------------------------------------------
create or replace function public.verify_pin(p_pin text)
returns table(id text, name text, role text)
language sql security definer set search_path = public, extensions as $$
  select s.id, s.name, s.role
  from public.staff s
  where s.active and s.pin_hash = crypt(p_pin, s.pin_hash)
  limit 1;
$$;

-- ------------------------------------------------------------
-- 4) RPC: เพิ่ม/แก้พนักงาน (ส่ง PIN ดิบเข้ามา เก็บเป็น hash)
--    ส่ง p_pin = null เมื่อไม่ต้องการเปลี่ยน PIN
-- ------------------------------------------------------------
create or replace function public.upsert_staff(
  p_id text, p_name text, p_pin text, p_role text, p_active boolean
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_id text;
begin
  if p_role not in ('cashier','admin') then
    raise exception 'role ไม่ถูกต้อง';
  end if;

  v_id := coalesce(nullif(p_id,''), 's_' || replace(gen_random_uuid()::text,'-',''));

  if exists (select 1 from public.staff where id = v_id) then
    update public.staff
       set name = p_name,
           role = p_role,
           active = coalesce(p_active,true),
           pin_hash = case when p_pin is null or p_pin = ''
                           then pin_hash
                           else crypt(p_pin, gen_salt('bf')) end
     where id = v_id;
  else
    if p_pin is null or length(p_pin) < 4 then
      raise exception 'พนักงานใหม่ต้องมี PIN อย่างน้อย 4 หลัก';
    end if;
    insert into public.staff (id,name,pin_hash,role,active)
    values (v_id, p_name, crypt(p_pin, gen_salt('bf')), p_role, coalesce(p_active,true));
  end if;

  -- ต้องมีแอดมินที่ใช้งานได้อย่างน้อย 1 คนเสมอ
  if not exists (select 1 from public.staff where role='admin' and active) then
    raise exception 'ต้องมีแอดมินที่ใช้งานได้อย่างน้อย 1 คน';
  end if;

  return v_id;
end $$;

create or replace function public.delete_staff(p_id text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.staff where id = p_id;
  if not exists (select 1 from public.staff where role='admin' and active) then
    raise exception 'ต้องมีแอดมินที่ใช้งานได้อย่างน้อย 1 คน';
  end if;
end $$;

-- ------------------------------------------------------------
-- 5) VIEW: รายชื่อพนักงานแบบไม่มี PIN (ให้หลังบ้านอ่าน)
-- ------------------------------------------------------------
create or replace view public.staff_public as
  select id, name, role, active from public.staff order by name;

-- ------------------------------------------------------------
-- 6) ป้องกันข้อมูลผิดรูป
-- ------------------------------------------------------------
alter table public.orders drop constraint if exists orders_total_positive;
alter table public.orders drop constraint if exists orders_discount_valid;
alter table public.orders drop constraint if exists orders_method_valid;
alter table public.orders drop constraint if exists orders_status_valid;

alter table public.orders
  add constraint orders_total_positive check (total >= 0),
  add constraint orders_discount_valid check (discount >= 0),
  add constraint orders_method_valid   check (payment_method in ('cash','pp')),
  add constraint orders_status_valid   check (status in ('ok','void'));

alter table public.shifts drop constraint if exists shifts_cash_positive;
alter table public.shifts
  add constraint shifts_cash_positive check (opening_cash >= 0);

-- ------------------------------------------------------------
-- 7) เวลาจาก server เสมอ (เครื่องตั้งเวลาผิดก็ไม่กระทบรายงาน)
--    เก็บเวลาที่เครื่องส่งมาไว้ดูเทียบ
-- ------------------------------------------------------------
alter table public.orders    add column if not exists client_time timestamptz;
alter table public.orders    alter column created_at set default now();
alter table public.audit_log alter column created_at set default now();

create or replace function public.orders_force_server_time()
returns trigger language plpgsql as $$
begin
  new.client_time := new.created_at;
  new.created_at  := now();
  return new;
end $$;

drop trigger if exists trg_orders_server_time on public.orders;
create trigger trg_orders_server_time
  before insert on public.orders
  for each row execute function public.orders_force_server_time();

-- ------------------------------------------------------------
-- 8) สิทธิ์
-- ------------------------------------------------------------
grant usage on schema public to anon, authenticated;

-- ตาราง staff: ห้าม client แตะโดยตรงเด็ดขาด (ผ่าน RPC/VIEW เท่านั้น)
revoke all on public.staff from anon, authenticated;
grant select on public.staff_public to anon, authenticated;

grant execute on function public.verify_pin(text)                              to anon, authenticated;
grant execute on function public.upsert_staff(text,text,text,text,boolean)     to anon, authenticated;
grant execute on function public.delete_staff(text)                            to anon, authenticated;

alter table public.staff enable row level security;   -- ไม่มี policy = ปิดสนิท

-- ------------------------------------------------------------
-- 9) ตรวจผล
-- ------------------------------------------------------------
select 'พนักงานทั้งหมด: ' || count(*)::text as result from public.staff
union all
select 'PIN ดิบใน app_config: ' ||
       coalesce((select count(*)::text from public.app_config where key='staff'),'0')
       || ' (ต้องเป็น 0)'
union all
select 'แอดมินที่ใช้งานได้: ' || count(*)::text from public.staff where role='admin' and active;
