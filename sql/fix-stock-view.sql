-- ============================================================
-- แก้ปัญหา "โหลดสต็อกไม่สำเร็จ"
-- รันใน Supabase → SQL Editor → New query → Run
-- ปลอดภัย รันทับได้
-- ============================================================

set search_path = public, extensions;

-- 1) สร้าง view ใหม่ให้มี sort_order ด้วย
drop view if exists public.stock_overview;

create view public.stock_overview as
select
  i.id, i.name, i.unit, i.cost, i.buy_unit, i.buy_factor,
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

-- 2) ให้สิทธิ์อ่าน
grant select on public.stock_overview to anon, authenticated;
grant select on public.locations     to anon, authenticated;
grant select on public.stock_levels  to anon, authenticated;
grant select on public.stock_moves   to anon, authenticated;
grant select on public.stock_docs    to anon, authenticated;
grant select, insert, update, delete on public.ingredients to anon, authenticated;
grant execute on function public.post_stock_doc(text,text,text,text,jsonb,text,text,text,text)
  to anon, authenticated;

-- 3) บังคับ PostgREST โหลด schema ใหม่ (สาเหตุที่พบบ่อยเมื่อเพิ่ง create view)
notify pgrst, 'reload schema';

-- 4) ตรวจผล — ต้องเห็นข้อมูล ไม่ error
select id, name, unit, qty_wh, qty_front, qty_total
from public.stock_overview
order by name
limit 10;
