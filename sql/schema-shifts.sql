-- ============================================================
-- Banfa POS — ตารางกะการขาย (shifts)
-- Supabase → SQL Editor → New query → วางทั้งหมด → Run
-- ปลอดภัย ไม่ลบข้อมูลเดิม
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.shifts (
  id            uuid primary key default gen_random_uuid(),
  local_id      text unique not null,
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  staff         text,                       -- คนเปิดกะ
  closed_by     text,                       -- คนปิดกะ
  opening_cash  numeric not null default 0, -- เงินทอนตั้งต้น
  counted_cash  numeric,                    -- เงินที่นับได้จริงตอนปิด
  expected_cash numeric,                    -- เงินที่ควรมี = ตั้งต้น + ยอดเงินสด
  diff          numeric,                    -- ขาด(-) / เกิน(+)
  sales_total   numeric default 0,
  sales_cash    numeric default 0,
  sales_pp      numeric default 0,
  bills         integer default 0,
  discount      numeric default 0,
  cost          numeric default 0,
  voids         integer default 0,
  note          text,
  status        text not null default 'open'  -- 'open' | 'closed'
);

create index if not exists shifts_opened_at_idx on public.shifts (opened_at);
create index if not exists shifts_status_idx    on public.shifts (status);

-- ผูกบิลเข้ากับกะ
alter table public.orders add column if not exists shift_id text;
create index if not exists orders_shift_idx on public.orders (shift_id);

-- ---------- grants ----------
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.shifts to anon, authenticated;

-- ---------- RLS ----------
alter table public.shifts enable row level security;

drop policy if exists "anon read shifts"   on public.shifts;
drop policy if exists "anon insert shifts" on public.shifts;
drop policy if exists "anon update shifts" on public.shifts;
create policy "anon read shifts"   on public.shifts for select to anon, authenticated using (true);
create policy "anon insert shifts" on public.shifts for insert to anon, authenticated with check (true);
create policy "anon update shifts" on public.shifts for update to anon, authenticated using (true) with check (true);

-- ตรวจผล
select 'shifts พร้อมใช้งาน' as result;
