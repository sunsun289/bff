-- ============================================================
-- บ้านฟ้ากาแฟสด — คลังหลังร้าน (Warehouse Module)
-- อยู่ในแอปรายรับ-รายจ่าย (finance.html) แต่คนละตารางกับทุกอย่างของ POS/หลังบ้านร้านกาแฟเดิม
-- (ingredients / stock_docs / stock_moves ของ admin.html ไม่ถูกแตะเลยสักบรรทัด)
-- Supabase → SQL Editor → New query → วางทั้งหมด → Run
--
-- บริบท: คลังกลาง 1 จุด รับของ (กาแฟ/แก้ว/ของอื่นๆ) มาเก็บ แล้วแจกจ่ายไปร้าน 1,2,3
-- ต้องดูได้ว่าของแต่ละชิ้นเคลื่อนไหวยังไง และใกล้หมดหรือยัง
--
-- โครงสร้าง:
--   wh_items  = รายการของในคลัง (ชื่อ/หน่วย/ต้นทุนต่อหน่วย/จุดเตือนของใกล้หมด)
--   wh_moves  = ประวัติรับเข้า-จ่ายออกทุกรายการ
--   wh_stock  = VIEW คำนวณยอดคงเหลือสดจากผลรวมการเคลื่อนไหว (Option A เดียวกับ stock module เดิม —
--               ไม่เก็บ running balance แยก กันปัญหาเลขไม่ตรง)
--
-- Auth: authenticated เดียวกับ fin_* (ล็อกอิน PIN ชุดเดียวกับ admin.html/finance.html)
--       ไม่มี anon เข้าถึงเลย
--
-- ปลอดภัย: รันทับได้ ไม่กระทบตาราง stock_*/fin_*/orders/ingredients เดิมเลย
-- ============================================================

set search_path = public, extensions;

-- ------------------------------------------------------------
-- 1) รายการของในคลัง
-- ------------------------------------------------------------
create table if not exists public.wh_items (
  id         text primary key default ('whi_' || substr(gen_random_uuid()::text,1,10)),
  name       text not null,
  unit       text not null default 'ชิ้น',
  cost       numeric not null default 0,   -- ต้นทุนต่อหน่วยล่าสุด (ไว้ตั้งค่าเริ่มต้นตอนกรอกรับเข้า/คำนวณมูลค่าคงคลัง)
  low_qty    numeric not null default 0,   -- เตือนเมื่อคงเหลือต่ำกว่านี้ (0 = ไม่เตือน)
  active     boolean not null default true,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2) ประวัติรับเข้า-จ่ายออก
-- ------------------------------------------------------------
create table if not exists public.wh_moves (
  id          uuid primary key default gen_random_uuid(),
  client_id   text unique,     -- กันบันทึกซ้ำถ้ากดซ้ำ/network timeout (pattern เดียวกับ stock_docs/fin_transactions)
  item_id     text not null references public.wh_items(id),
  type        text not null check (type in ('in','out')),
  qty         numeric not null check (qty > 0),
  cost        numeric not null default 0,   -- ต้นทุนต่อหน่วย ณ ตอนทำรายการนี้ (snapshot ไว้ดูย้อนหลังได้ถูกต้อง)
  dest        text,            -- รับเข้า = มาจากไหน (ซัพพลายเออร์) / จ่ายออก = ไปไหน (เช่น ร้าน 1)
  note        text,
  occurred_at date not null default (now() at time zone 'Asia/Bangkok')::date,
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists wh_moves_item_idx on public.wh_moves (item_id);
create index if not exists wh_moves_date_idx on public.wh_moves (occurred_at desc);

-- ------------------------------------------------------------
-- 3) VIEW: ยอดคงเหลือต่อรายการ — คำนวณสดจากผลรวมรับเข้า-จ่ายออกเสมอ
-- ------------------------------------------------------------
create or replace view public.wh_stock as
select
  i.id, i.name, i.unit, i.cost, i.low_qty, i.active, i.sort_order,
  coalesce(m.qty_on_hand,0) as qty_on_hand,
  coalesce(m.qty_on_hand,0) * i.cost as value
from public.wh_items i
left join (
  select item_id, sum(case when type='in' then qty else -qty end) as qty_on_hand
  from public.wh_moves group by item_id
) m on m.item_id = i.id;

-- ------------------------------------------------------------
-- 4) สิทธิ์ — authenticated เท่านั้น (ใช้ล็อกอินเดียวกับ finance.html/admin.html)
-- ------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.wh_items to authenticated;
grant select, insert, update, delete on public.wh_moves to authenticated;
grant select on public.wh_stock to authenticated;

alter table public.wh_items enable row level security;
alter table public.wh_moves enable row level security;

drop policy if exists "auth all wh_items" on public.wh_items;
drop policy if exists "auth all wh_moves" on public.wh_moves;

create policy "auth all wh_items" on public.wh_items for all to authenticated using (true) with check (true);
create policy "auth all wh_moves" on public.wh_moves for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 5) ตรวจผล
-- ------------------------------------------------------------
select 'รายการของ: ' || count(*)::text as result from public.wh_items
union all select 'ประวัติเคลื่อนไหว: ' || count(*)::text from public.wh_moves;
