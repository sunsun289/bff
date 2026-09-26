-- ============================================================
-- เพิ่ม 2 รายงาน: ยอดขายตามสินค้า (รายชั่วโมง/รายวัน) + ยอดขายตามตัวเลือก
-- Supabase → SQL Editor → New query → Run (รันทับได้ปลอดภัย)
-- ต้องรัน schema-reports.sql มาก่อนแล้ว (ใช้ pattern เดียวกัน)
-- ============================================================

set search_path = public, extensions;

-- ------------------------------------------------------------
-- 1) ยอดขายของ "เมนูเดียว" แยกรายชั่วโมง — จับคู่ด้วยชื่อเมนู (แบบเดียวกับ top_items)
-- ------------------------------------------------------------
create or replace function public.product_sales_by_hour(p_from timestamptz, p_to timestamptz, p_name text)
returns table(hour int, qty numeric, amount numeric)
language sql security definer set search_path = public, extensions as $$
  select extract(hour from (o.created_at at time zone 'Asia/Bangkok'))::int,
         sum((it->>'qty')::numeric),
         sum((it->>'qty')::numeric * (it->>'price')::numeric)
  from public.orders o
  cross join lateral jsonb_array_elements(o.items) as it
  where o.created_at >= p_from and o.created_at < p_to and o.status <> 'void'
    and it->>'name' = p_name
  group by 1 order by 1;
$$;

-- ------------------------------------------------------------
-- 2) ยอดขายของ "เมนูเดียว" แยกรายวัน
-- ------------------------------------------------------------
create or replace function public.product_sales_by_day(p_from timestamptz, p_to timestamptz, p_name text)
returns table(day date, qty numeric, amount numeric)
language sql security definer set search_path = public, extensions as $$
  select (o.created_at at time zone 'Asia/Bangkok')::date,
         sum((it->>'qty')::numeric),
         sum((it->>'qty')::numeric * (it->>'price')::numeric)
  from public.orders o
  cross join lateral jsonb_array_elements(o.items) as it
  where o.created_at >= p_from and o.created_at < p_to and o.status <> 'void'
    and it->>'name' = p_name
  group by 1 order by 1;
$$;

-- ------------------------------------------------------------
-- 3) ยอดขายตามตัวเลือก — นับจำนวนครั้งที่แต่ละตัวเลือกถูกสั่ง
--    ข้อจำกัด: บิลเก็บชื่อตัวเลือกเป็นข้อความ ไม่ได้ผูกราคา
--    จึงบอกได้แค่ "ถูกสั่งกี่แก้ว" ไม่ใช่ "ทำเงินให้เท่าไร" แยกเป็นตัวเลือก
-- ------------------------------------------------------------
create or replace function public.option_counts(p_from timestamptz, p_to timestamptz)
returns table(option_name text, qty bigint)
language sql security definer set search_path = public, extensions as $$
  select opt, sum((it->>'qty')::numeric)::bigint
  from public.orders o
  cross join lateral jsonb_array_elements(o.items) as it
  cross join lateral jsonb_array_elements_text(coalesce(it->'options','[]'::jsonb)) as opt
  where o.created_at >= p_from and o.created_at < p_to and o.status <> 'void'
  group by 1 order by 2 desc;
$$;

-- ------------------------------------------------------------
-- 4) สิทธิ์
-- ------------------------------------------------------------
grant execute on function public.product_sales_by_hour(timestamptz,timestamptz,text) to anon, authenticated;
grant execute on function public.product_sales_by_day(timestamptz,timestamptz,text)  to anon, authenticated;
grant execute on function public.option_counts(timestamptz,timestamptz)             to anon, authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 5) ทดสอบ
-- ------------------------------------------------------------
select * from public.option_counts(now() - interval '30 days', now()) limit 10;
