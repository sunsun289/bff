-- ============================================================
-- Banfa POS — ปิดช่องโหว่ฐานข้อมูล (Security Lockdown)
--
-- ⚠️ ห้ามรันจนกว่าจะทำ 3 ขั้นนี้ครบและยืนยันแล้ว
--    รันก่อนพร้อม = ขายไม่ได้ทันที ทั้งเครื่องขายและหลังบ้าน
--
--  ขั้น 1  Supabase → Authentication → Users → Add user
--          Email: pos@banfa.local      (อีเมลปลอมได้ ไม่ต้องยืนยัน)
--          Password: ตั้งรหัสยาว ๆ เก็บไว้ให้ดี
--          ติ๊ก Auto Confirm User
--
--  ขั้น 2  แก้ CONFIG ในไฟล์ pos-sell.html และ admin.html ทั้งสองไฟล์
--          AUTH_EMAIL:"pos@banfa.local",
--          AUTH_PASSWORD:"รหัสที่ตั้งไว้"
--          แล้ว deploy
--
--  ขั้น 3  เปิดหลังบ้าน → ตั้งค่า → ต้องขึ้น "Supabase Auth: เปิดใช้งาน"
--          ถ้ายังขึ้น "ยังไม่เปิด" อย่ารันไฟล์นี้
--
--  ถ้ารันแล้วพัง: รัน fix-permissions.sql เพื่อย้อนกลับ
--
--  ⚠️ ต้องรัน sql/fix-stock-idempotency.sql มาก่อนไฟล์นี้แล้ว (2026.09.20 อัปเดต signature ของ
--     post_stock_doc/set_stock_count เพิ่ม p_client_id) ไม่งั้น revoke/grant execute ด้านล่างจะพัง
--     เพราะฟังก์ชันชื่อ/พารามิเตอร์แบบเก่าไม่มีอยู่แล้ว
-- ============================================================

set search_path = public, extensions;

-- ตรวจว่ามีบัญชีผู้ใช้แล้วจริง
do $$
begin
  if (select count(*) from auth.users) = 0 then
    raise exception 'ยังไม่มีบัญชีผู้ใช้ใน Supabase Auth — ทำขั้นที่ 1 ก่อน';
  end if;
end $$;

-- ------------------------------------------------------------
-- ถอนสิทธิ์ anon ทั้งหมด
-- ------------------------------------------------------------
revoke all on public.orders          from anon;
revoke all on public.app_config      from anon;
revoke all on public.audit_log       from anon;
revoke all on public.shifts          from anon;
revoke all on public.cash_movements  from anon;
revoke all on public.ingredients     from anon;
revoke all on public.locations       from anon;
revoke all on public.stock_levels    from anon;
revoke all on public.stock_moves     from anon;
revoke all on public.stock_docs      from anon;
revoke all on public.stock_overview  from anon;
revoke all on public.ingredient_flow from anon;
revoke all on public.staff_public    from anon;

-- ------------------------------------------------------------
-- ให้สิทธิ์เฉพาะผู้ที่ล็อกอินแล้ว
-- ------------------------------------------------------------
grant select, insert, update on public.orders         to authenticated;
grant select, insert, update on public.app_config     to authenticated;
grant select, insert         on public.audit_log      to authenticated;
grant select, insert, update on public.shifts         to authenticated;
grant select, insert         on public.cash_movements to authenticated;
grant select, insert, update, delete on public.ingredients to authenticated;
grant select on public.locations       to authenticated;
grant select on public.stock_levels    to authenticated;
grant select on public.stock_moves     to authenticated;
grant select on public.stock_docs      to authenticated;
grant select on public.stock_overview  to authenticated;
grant select on public.ingredient_flow to authenticated;
grant select on public.staff_public    to authenticated;

-- verify_pin ต้องเรียกได้ก่อนล็อกอิน PIN จึงยังเปิดให้ anon
grant execute on function public.verify_pin(text) to anon, authenticated;
revoke execute on function public.upsert_staff(text,text,text,text,boolean) from anon;
revoke execute on function public.delete_staff(text) from anon;
revoke execute on function public.post_stock_doc(text,text,text,text,jsonb,text,text,text,text,text) from anon;
revoke execute on function public.set_stock_count(text,text,jsonb,text,text) from anon;
grant execute on function public.upsert_staff(text,text,text,text,boolean) to authenticated;
grant execute on function public.delete_staff(text) to authenticated;
grant execute on function public.post_stock_doc(text,text,text,text,jsonb,text,text,text,text,text) to authenticated;
grant execute on function public.set_stock_count(text,text,jsonb,text,text) to authenticated;

-- ------------------------------------------------------------
-- Policy: เหลือเฉพาะ authenticated
-- ------------------------------------------------------------
do $$
declare t text; pol text;
begin
  for t in select unnest(array['orders','app_config','audit_log','shifts','cash_movements',
                               'ingredients','locations','stock_levels','stock_moves','stock_docs'])
  loop
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t
    loop
      execute format('drop policy if exists %I on public.%I', pol, t);
    end loop;
  end loop;
end $$;

create policy "auth all orders"   on public.orders         for all to authenticated using (true) with check (true);
create policy "auth all config"   on public.app_config     for all to authenticated using (true) with check (true);
create policy "auth all audit"    on public.audit_log      for all to authenticated using (true) with check (true);
create policy "auth all shifts"   on public.shifts         for all to authenticated using (true) with check (true);
create policy "auth all cash"     on public.cash_movements for all to authenticated using (true) with check (true);
create policy "auth all ing"      on public.ingredients    for all to authenticated using (true) with check (true);
create policy "auth read loc"     on public.locations      for select to authenticated using (true);
create policy "auth read levels"  on public.stock_levels   for select to authenticated using (true);
create policy "auth read moves"   on public.stock_moves    for select to authenticated using (true);
create policy "auth read docs"    on public.stock_docs     for select to authenticated using (true);

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- ตรวจผล — anon ต้องเหลือสิทธิ์เฉพาะที่ตั้งใจ
-- ------------------------------------------------------------
select table_name, grantee, string_agg(privilege_type,', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema='public' and grantee='anon'
group by table_name, grantee
order by table_name;
-- ผลที่ถูกต้อง: ว่างเปล่า หรือไม่มีตารางสำคัญเลย
