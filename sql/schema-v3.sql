-- ============================================================
-- Banfa POS — schema v3 (รันทับได้ ปลอดภัย ไม่ลบข้อมูลเดิม)
-- Supabase → SQL Editor → New query → วางทั้งหมด → Run
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- orders ----------
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

create index if not exists orders_created_at_idx on public.orders (created_at);
create index if not exists orders_status_idx     on public.orders (status);

-- ---------- app_config (เมนู/สูตร/วัตถุดิบ/พนักงาน/ตั้งค่า) ----------
create table if not exists public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- audit_log ----------
create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  local_id   text unique not null,
  created_at timestamptz not null default now(),
  actor      text,
  action     text not null,
  detail     text
);
create index if not exists audit_created_at_idx on public.audit_log (created_at);

-- ---------- grants ----------
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.orders     to anon, authenticated;
grant select, insert, update on public.app_config to anon, authenticated;
grant select, insert          on public.audit_log to anon, authenticated;

-- ---------- RLS ----------
alter table public.orders     enable row level security;
alter table public.app_config enable row level security;
alter table public.audit_log  enable row level security;

drop policy if exists "anon insert orders" on public.orders;
drop policy if exists "anon read orders"   on public.orders;
drop policy if exists "anon update orders" on public.orders;
create policy "anon insert orders" on public.orders for insert to anon, authenticated with check (true);
create policy "anon read orders"   on public.orders for select to anon, authenticated using (true);
create policy "anon update orders" on public.orders for update to anon, authenticated using (true) with check (true);

drop policy if exists "anon read config"   on public.app_config;
drop policy if exists "anon insert config" on public.app_config;
drop policy if exists "anon update config" on public.app_config;
create policy "anon read config"   on public.app_config for select to anon, authenticated using (true);
create policy "anon insert config" on public.app_config for insert to anon, authenticated with check (true);
create policy "anon update config" on public.app_config for update to anon, authenticated using (true) with check (true);

drop policy if exists "anon read audit"   on public.audit_log;
drop policy if exists "anon insert audit" on public.audit_log;
create policy "anon read audit"   on public.audit_log for select to anon, authenticated using (true);
create policy "anon insert audit" on public.audit_log for insert to anon, authenticated with check (true);
