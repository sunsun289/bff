-- ============================================================
-- FIX 401 / 42501 permission denied for table orders
-- รันทั้งก้อนใน Supabase → SQL Editor → New query → Run
-- ปลอดภัย ไม่ลบข้อมูล
-- ============================================================

-- 1) สร้างตารางที่อาจยังไม่มี
create extension if not exists pgcrypto;

create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  local_id       text unique not null,
  subtotal       numeric not null default 0,
  discount       numeric not null default 0,
  total          numeric not null default 0,
  payment_method text not null,
  received       numeric,
  items          jsonb not null default '[]'::jsonb
);
alter table public.orders add column if not exists status      text not null default 'ok';
alter table public.orders add column if not exists cost        numeric not null default 0;
alter table public.orders add column if not exists staff       text;
alter table public.orders add column if not exists void_reason text;
alter table public.orders add column if not exists void_by     text;

create table if not exists public.app_config (
  key text primary key, value jsonb not null, updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  local_id text unique not null,
  created_at timestamptz not null default now(),
  actor text, action text not null, detail text
);

-- 2) คืนสิทธิ์ให้ anon (ตรงนี้คือตัวที่พัง)
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.orders     to anon, authenticated;
grant select, insert, update on public.app_config to anon, authenticated;
grant select, insert          on public.audit_log to anon, authenticated;

-- 3) เปิด RLS + สร้าง policy ใหม่ทั้งหมด
alter table public.orders     enable row level security;
alter table public.app_config enable row level security;
alter table public.audit_log  enable row level security;

drop policy if exists "anon insert orders" on public.orders;
drop policy if exists "anon read orders"   on public.orders;
drop policy if exists "anon update orders" on public.orders;
drop policy if exists "auth insert orders" on public.orders;
drop policy if exists "auth read orders"   on public.orders;
drop policy if exists "auth update orders" on public.orders;
create policy "anon insert orders" on public.orders for insert to anon, authenticated with check (true);
create policy "anon read orders"   on public.orders for select to anon, authenticated using (true);
create policy "anon update orders" on public.orders for update to anon, authenticated using (true) with check (true);

drop policy if exists "anon read config"   on public.app_config;
drop policy if exists "anon insert config" on public.app_config;
drop policy if exists "anon update config" on public.app_config;
drop policy if exists "auth read config"   on public.app_config;
drop policy if exists "auth insert config" on public.app_config;
drop policy if exists "auth update config" on public.app_config;
create policy "anon read config"   on public.app_config for select to anon, authenticated using (true);
create policy "anon insert config" on public.app_config for insert to anon, authenticated with check (true);
create policy "anon update config" on public.app_config for update to anon, authenticated using (true) with check (true);

drop policy if exists "anon read audit"   on public.audit_log;
drop policy if exists "anon insert audit" on public.audit_log;
drop policy if exists "auth read audit"   on public.audit_log;
drop policy if exists "auth insert audit" on public.audit_log;
create policy "anon read audit"   on public.audit_log for select to anon, authenticated using (true);
create policy "anon insert audit" on public.audit_log for insert to anon, authenticated with check (true);

-- 4) ตรวจผล — ต้องเห็น anon มีสิทธิ์ครบทั้ง 3 ตาราง
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('orders','app_config','audit_log')
  and grantee in ('anon','authenticated')
group by table_name, grantee
order by table_name, grantee;
