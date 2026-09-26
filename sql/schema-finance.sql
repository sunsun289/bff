-- ============================================================
-- บ้านฟ้ากาแฟสด — โมดูลรายรับ-รายจ่าย (Finance Module)
-- แอปแยกต่างหากจาก Banfa POS (finance.html) แต่ใช้ Supabase โปรเจกต์เดียวกัน
-- Supabase → SQL Editor → New query → วางทั้งหมด → Run
--
-- โครงสร้าง:
--   fin_accounts      = บัญชี/กระเป๋าเงิน (เงินสด/ธนาคาร/พร้อมเพย์ ฯลฯ) + ยอดยกมา
--   fin_categories    = หมวดหมู่รายรับ/รายจ่าย
--   fin_recurring     = รายการประจำ (ตั้งซ้ำทุก N วัน)
--   fin_transactions  = รายการรับ-จ่ายจริงทุกรายการ (รวมที่เกิดจากรายการประจำด้วย)
--
-- คีย์เป็น text แบบเดียวกับ stock module เดิม (ing_xxx, cat_xxx) เพื่อความสอดคล้องในโค้ดเบส
-- Auth: ใช้ authenticated เดียวกับ admin.html (Supabase Auth email/password ที่มีอยู่แล้ว)
--       ไม่มี anon เข้าถึงเลย เพราะเป็นแอปเดียว ผู้ใช้คนเดียว ไม่มีฝั่ง public ที่ต้อง insert ตรง
--
-- ปลอดภัย: รันทับได้ ไม่กระทบตาราง stock_*/orders/ingredients ของ POS เดิม
-- ============================================================

set search_path = public, extensions;

-- ------------------------------------------------------------
-- 1) บัญชี/กระเป๋าเงิน
-- ------------------------------------------------------------
create table if not exists public.fin_accounts (
  id               text primary key default ('acc_' || substr(gen_random_uuid()::text,1,10)),
  name             text not null,
  opening_balance  numeric not null default 0,
  active           boolean not null default true,
  sort_order       int default 0,
  created_at       timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2) หมวดหมู่รายรับ/รายจ่าย
-- ------------------------------------------------------------
create table if not exists public.fin_categories (
  id         text primary key default ('cat_' || substr(gen_random_uuid()::text,1,10)),
  name       text not null,
  type       text not null check (type in ('income','expense')),
  active     boolean not null default true,
  sort_order int default 0,
  unique(name, type)   -- กัน insert หมวดเริ่มต้นซ้ำถ้ารัน script นี้ซ้ำ (ดูข้อ 8)
);

-- ------------------------------------------------------------
-- 3) รายการประจำ — ต้นแบบที่ระบบใช้ไปสร้างรายการจริงให้อัตโนมัติ
-- ------------------------------------------------------------
create table if not exists public.fin_recurring (
  id             text primary key default ('rec_' || substr(gen_random_uuid()::text,1,10)),
  name           text not null,
  account_id     text not null references public.fin_accounts(id),
  category_id    text references public.fin_categories(id),
  type           text not null check (type in ('income','expense')),
  amount         numeric not null check (amount > 0),
  note           text,
  interval_days  int not null check (interval_days > 0),
  next_due       date not null,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4) รายการรับ-จ่ายจริง
-- ------------------------------------------------------------
create table if not exists public.fin_transactions (
  id            uuid primary key default gen_random_uuid(),
  client_id     text unique,     -- กันบันทึกซ้ำถ้ากดซ้ำ/network timeout (pattern เดียวกับ stock_docs.client_id)
  account_id    text not null references public.fin_accounts(id),
  category_id   text references public.fin_categories(id),
  type          text not null check (type in ('income','expense')),
  amount        numeric not null check (amount > 0),
  note          text,
  occurred_at   date not null default (now() at time zone 'Asia/Bangkok')::date,
  recurring_id  text references public.fin_recurring(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists fin_txn_date_idx    on public.fin_transactions (occurred_at desc);
create index if not exists fin_txn_account_idx on public.fin_transactions (account_id);
create index if not exists fin_txn_cat_idx     on public.fin_transactions (category_id);

-- ------------------------------------------------------------
-- 5) VIEW: ยอดคงเหลือต่อบัญชี — คำนวณสดจากยอดยกมา + รายการทั้งหมดเสมอ
--    (ไม่เก็บ running balance แยก กันปัญหาเลขไม่ตรงแบบที่เจอในโมดูลสต็อกมาแล้ว)
-- ------------------------------------------------------------
create or replace view public.fin_account_balance as
select
  a.id, a.name, a.opening_balance, a.sort_order, a.active,
  a.opening_balance
    + coalesce(sum(case when t.type='income'  then t.amount else 0 end),0)
    - coalesce(sum(case when t.type='expense' then t.amount else 0 end),0) as balance
from public.fin_accounts a
left join public.fin_transactions t on t.account_id = a.id
group by a.id, a.name, a.opening_balance, a.sort_order, a.active;

-- ------------------------------------------------------------
-- 6) RPC: ประมวลผลรายการประจำที่ถึงกำหนด
--    เรียกทุกครั้งที่เปิดแอป — ถ้าไม่ได้เข้ามานาน (เช่น 2 เดือน) จะไล่สร้างให้ครบ
--    ทุกรอบที่ค้าง (occurred_at เป็นวันที่ควรจะเกิดจริง ไม่ใช่วันที่กดเปิดแอป)
-- ------------------------------------------------------------
create or replace function public.run_due_recurring()
returns int
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_due   date;
  v_n     int := 0;
begin
  for r in select * from public.fin_recurring where active and next_due <= v_today loop
    v_due := r.next_due;
    while v_due <= v_today loop
      insert into public.fin_transactions(account_id,category_id,type,amount,note,occurred_at,recurring_id)
      values (r.account_id, r.category_id, r.type, r.amount, r.note, v_due, r.id);
      v_due := v_due + r.interval_days;
      v_n := v_n + 1;
    end loop;
    update public.fin_recurring set next_due = v_due where id = r.id;
  end loop;
  return v_n;
end $$;

-- ------------------------------------------------------------
-- 7) สิทธิ์ — authenticated เท่านั้น (ใช้ล็อกอินเดียวกับ admin.html)
--    ไม่ให้ anon แตะตารางการเงินพวกนี้เลยแม้แต่ select เดียว
-- ------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.fin_accounts     to authenticated;
grant select, insert, update, delete on public.fin_categories   to authenticated;
grant select, insert, update, delete on public.fin_recurring    to authenticated;
grant select, insert, update, delete on public.fin_transactions to authenticated;
grant select on public.fin_account_balance to authenticated;
grant execute on function public.run_due_recurring() to authenticated;

alter table public.fin_accounts     enable row level security;
alter table public.fin_categories   enable row level security;
alter table public.fin_recurring    enable row level security;
alter table public.fin_transactions enable row level security;

drop policy if exists "auth all accounts"     on public.fin_accounts;
drop policy if exists "auth all categories"   on public.fin_categories;
drop policy if exists "auth all recurring"    on public.fin_recurring;
drop policy if exists "auth all transactions" on public.fin_transactions;

create policy "auth all accounts"     on public.fin_accounts     for all to authenticated using (true) with check (true);
create policy "auth all categories"   on public.fin_categories   for all to authenticated using (true) with check (true);
create policy "auth all recurring"    on public.fin_recurring    for all to authenticated using (true) with check (true);
create policy "auth all transactions" on public.fin_transactions for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 8) หมวดหมู่เริ่มต้น — ใส่ให้พร้อมใช้ (แก้/เพิ่มเองได้ทีหลังในแอป)
-- ------------------------------------------------------------
insert into public.fin_categories (name,type,sort_order) values
  ('ขายหน้าร้าน','income',1),
  ('รายรับอื่นๆ','income',9),
  ('วัตถุดิบ/ของเข้าร้าน','expense',1),
  ('ค่าเช่า','expense',2),
  ('ค่าไฟ','expense',3),
  ('ค่าน้ำ','expense',4),
  ('เงินเดือนพนักงาน','expense',5),
  ('ค่าใช้จ่ายอื่นๆ','expense',9)
on conflict (name, type) do nothing;

-- ------------------------------------------------------------
-- 9) ตรวจผล
-- ------------------------------------------------------------
select 'บัญชี: ' || count(*)::text as result from public.fin_accounts
union all select 'หมวดหมู่: ' || count(*)::text from public.fin_categories
union all select 'รายการประจำ: ' || count(*)::text from public.fin_recurring
union all select 'รายการ: ' || count(*)::text from public.fin_transactions;
