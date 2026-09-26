-- ============================================================
-- แก้ปัญหา "ดูรายงานช่วงยาวแล้วข้อมูลไม่ครบ"
--
-- ปัญหาเดิม: หลังบ้านดึงบิลดิบทั้งหมด (select=*) มาสรุปฝั่งเบราว์เซอร์
--            30 วัน x 200 บิล = 6,000 แถว + JSON รายการสินค้า
--            -> โหลดช้า เปลือง bandwidth และต้องจำกัด 3,000 แถว
--
-- แก้เป็น: ให้ Postgres สรุปมาให้ ส่งกลับแค่ไม่กี่สิบแถว
--          เร็วขึ้นหลายสิบเท่า และ "ไม่มีเพดานอีกต่อไป"
--
-- Supabase → SQL Editor → New query → Run  (ปลอดภัย ไม่ลบข้อมูล)
-- ============================================================

set search_path = public, extensions;

-- ------------------------------------------------------------
-- 1) สรุปยอดตามช่วงเวลา — ใช้แทนการดึงบิลดิบ
--    คืนแถวเดียว
-- ------------------------------------------------------------
create or replace function public.sales_summary(p_from timestamptz, p_to timestamptz)
returns table(
  revenue numeric, cost numeric, discount numeric,
  cash numeric, pp numeric,
  bills bigint, voids bigint, void_amount numeric
)
language sql security definer set search_path = public, extensions as $$
  select
    coalesce(sum(total)    filter (where status <> 'void'), 0),
    coalesce(sum(cost)     filter (where status <> 'void'), 0),
    coalesce(sum(discount) filter (where status <> 'void'), 0),
    coalesce(sum(total)    filter (where status <> 'void' and payment_method = 'cash'), 0),
    coalesce(sum(total)    filter (where status <> 'void' and payment_method = 'pp'), 0),
    count(*)               filter (where status <> 'void'),
    count(*)               filter (where status =  'void'),
    coalesce(sum(total)    filter (where status =  'void'), 0)
  from public.orders
  where created_at >= p_from and created_at < p_to;
$$;

-- ------------------------------------------------------------
-- 2) ยอดรายวัน (สำหรับกราฟรายวัน)
-- ------------------------------------------------------------
create or replace function public.sales_by_day(p_from timestamptz, p_to timestamptz)
returns table(day date, revenue numeric, bills bigint)
language sql security definer set search_path = public, extensions as $$
  select (created_at at time zone 'Asia/Bangkok')::date as day,
         coalesce(sum(total),0), count(*)
  from public.orders
  where created_at >= p_from and created_at < p_to and status <> 'void'
  group by 1 order by 1;
$$;

-- ------------------------------------------------------------
-- 3) ยอดรายชั่วโมง (สำหรับกราฟช่วงเวลา)
-- ------------------------------------------------------------
create or replace function public.sales_by_hour(p_from timestamptz, p_to timestamptz)
returns table(hour int, revenue numeric, bills bigint)
language sql security definer set search_path = public, extensions as $$
  select extract(hour from (created_at at time zone 'Asia/Bangkok'))::int,
         coalesce(sum(total),0), count(*)
  from public.orders
  where created_at >= p_from and created_at < p_to and status <> 'void'
  group by 1 order by 1;
$$;

-- ------------------------------------------------------------
-- 4) ยอดตามพนักงาน
-- ------------------------------------------------------------
create or replace function public.sales_by_staff(p_from timestamptz, p_to timestamptz)
returns table(staff text, revenue numeric, bills bigint)
language sql security definer set search_path = public, extensions as $$
  select coalesce(staff,'-'), coalesce(sum(total),0), count(*)
  from public.orders
  where created_at >= p_from and created_at < p_to and status <> 'void'
  group by 1 order by 2 desc;
$$;

-- ------------------------------------------------------------
-- 5) สินค้าขายดี — กาง jsonb items ฝั่งเซิร์ฟเวอร์
--    (เดิมต้องลาก items ทุกบิลมากางฝั่งเบราว์เซอร์)
-- ------------------------------------------------------------
create or replace function public.top_items(p_from timestamptz, p_to timestamptz, p_limit int default 20)
returns table(name text, qty numeric, amount numeric)
language sql security definer set search_path = public, extensions as $$
  select it->>'name',
         sum((it->>'qty')::numeric),
         sum((it->>'qty')::numeric * (it->>'price')::numeric)
  from public.orders o
  cross join lateral jsonb_array_elements(o.items) as it
  where o.created_at >= p_from and o.created_at < p_to and o.status <> 'void'
  group by 1
  order by 2 desc
  limit p_limit;
$$;

-- ------------------------------------------------------------
-- 6) ยอดตามหมวดหมู่ (อ่านหมวดจาก app_config.menu)
-- ------------------------------------------------------------
create or replace function public.sales_by_category(p_from timestamptz, p_to timestamptz)
returns table(cat text, amount numeric)
language sql security definer set search_path = public, extensions as $$
  with menu as (
    select (m->>'id')::int as id, m->>'cat' as cat
    from public.app_config c
    cross join lateral jsonb_array_elements(c.value) as m
    where c.key = 'menu'
  )
  select coalesce(menu.cat,'etc'),
         sum((it->>'qty')::numeric * (it->>'price')::numeric)
  from public.orders o
  cross join lateral jsonb_array_elements(o.items) as it
  left join menu on menu.id = (it->>'id')::int
  where o.created_at >= p_from and o.created_at < p_to and o.status <> 'void'
  group by 1 order by 2 desc;
$$;

-- ------------------------------------------------------------
-- 7) นับจำนวนบิลในช่วง (สำหรับแบ่งหน้า)
-- ------------------------------------------------------------
create or replace function public.orders_count(p_from timestamptz, p_to timestamptz)
returns bigint
language sql security definer set search_path = public, extensions as $$
  select count(*) from public.orders
  where created_at >= p_from and created_at < p_to;
$$;

-- ------------------------------------------------------------
-- 8) ดัชนีช่วยให้เร็วขึ้น
-- ------------------------------------------------------------
create index if not exists orders_created_status_idx
  on public.orders (created_at desc, status);
create index if not exists orders_staff_idx
  on public.orders (staff);

-- ------------------------------------------------------------
-- 9) สิทธิ์
-- ------------------------------------------------------------
grant execute on function public.sales_summary(timestamptz,timestamptz)     to anon, authenticated;
grant execute on function public.sales_by_day(timestamptz,timestamptz)      to anon, authenticated;
grant execute on function public.sales_by_hour(timestamptz,timestamptz)     to anon, authenticated;
grant execute on function public.sales_by_staff(timestamptz,timestamptz)    to anon, authenticated;
grant execute on function public.top_items(timestamptz,timestamptz,int)     to anon, authenticated;
grant execute on function public.sales_by_category(timestamptz,timestamptz) to anon, authenticated;
grant execute on function public.orders_count(timestamptz,timestamptz)      to anon, authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 10) ทดสอบ — ดูยอด 30 วันย้อนหลัง
-- ------------------------------------------------------------
select * from public.sales_summary(now() - interval '30 days', now());
