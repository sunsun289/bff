-- ============================================================
-- เพิ่ม "หน่วยแสดงผลยอดคงเหลือหน้าร้าน" ตั้งได้แยกทีละวัตถุดิบ
-- (ปกติแสดงเป็นหน่วยใช้ เช่น กรัม — ตั้งวัตถุดิบไหนเป็น "หน่วยซื้อ" จะโชว์เป็น ถุง/ลัง แทน)
-- รันใน Supabase → SQL Editor → New query → Run
-- ปลอดภัย รันทับได้
-- ============================================================

set search_path = public, extensions;

-- 1) เพิ่มคอลัมน์ตั้งค่า — false (ค่าเริ่มต้น) = โชว์เป็นหน่วยใช้, true = โชว์เป็นหน่วยซื้อ
alter table public.ingredients
  add column if not exists disp_buy boolean not null default false;

-- 2) สร้าง view ใหม่ให้มี disp_buy ด้วย (คงคอลัมน์เดิมทั้งหมดจาก fix-stock-view.sql)
drop view if exists public.stock_overview;

create view public.stock_overview as
select
  i.id, i.name, i.unit, i.cost, i.buy_unit, i.buy_factor, i.disp_buy,
  i.low_front, i.low_wh, i.active, i.sort_order,
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

-- 3) ให้สิทธิ์อ่าน
grant select on public.stock_overview to anon, authenticated;

-- 4) บังคับ PostgREST โหลด schema ใหม่
notify pgrst, 'reload schema';

-- 5) ตรวจผล — ต้องเห็นคอลัมน์ disp_buy ไม่ error
select id, name, unit, buy_unit, disp_buy, qty_front
from public.stock_overview
order by name
limit 10;
