-- ============================================================
-- แก้: บิลที่ส่งซ้ำเสียเวลาขายจริง
--
-- ปัญหา: trigger เดิมเขียนทับ created_at ด้วย now() เสมอ
--        บิลที่ขายตอน 08:15 แล้วส่งซ้ำตอน 10:20 จะกลายเป็น 10:20
--        ทำให้รายงานรายชั่วโมงผิด และหาบิลไม่เจอ
--
-- แก้เป็น: ถ้าเครื่องส่งเวลามาและเป็นเวลาในอดีตที่สมเหตุสมผล (ไม่เกิน 30 วัน)
--         ให้ใช้เวลานั้น — ถ้าเวลาเพี้ยน/อนาคต ค่อยใช้เวลาเซิร์ฟเวอร์
--
-- Supabase → SQL Editor → New query → Run
-- ============================================================

set search_path = public, extensions;

create or replace function public.orders_force_server_time()
returns trigger language plpgsql as $$
declare v_in timestamptz;
begin
  v_in := new.created_at;
  new.client_time := v_in;

  if v_in is null
     or v_in > now() + interval '5 minutes'      -- เวลาเครื่องเดินหน้าเกินจริง
     or v_in < now() - interval '30 days'        -- เก่าเกินไป น่าจะเพี้ยน
  then
    new.created_at := now();                      -- ใช้เวลาเซิร์ฟเวอร์
  else
    new.created_at := v_in;                       -- เชื่อเวลาที่ส่งมา (บิลย้อนหลัง/ส่งซ้ำ)
  end if;

  return new;
end $$;

drop trigger if exists trg_orders_server_time on public.orders;
create trigger trg_orders_server_time
  before insert on public.orders
  for each row execute function public.orders_force_server_time();

notify pgrst, 'reload schema';

select 'แก้ไขเวลาบิลเรียบร้อย' as result;
