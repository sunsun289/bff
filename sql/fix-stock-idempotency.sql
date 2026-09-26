-- ============================================================
-- C4 + C5 — Phase 1 DB hardening (audit 2026.09.20)
--
-- C4 — ปัญหาเดิม: post_stock_doc / set_stock_count ไม่มี idempotency key
--      ต่างจากฝั่งขาย (orders) ที่มี local_id unique + 409=success
--      ถ้า network timeout แล้ว retry เอกสารรับของ/เบิก/จ่ายออก/นับสต็อกซ้ำได้จริง
-- แก้: เพิ่มคอลัมน์ stock_docs.client_id (unique เมื่อไม่ null) + parameter
--      p_client_id ในทั้งสองฟังก์ชัน — ถ้าเจอ client_id เดิมอยู่แล้ว คืนเลขที่เอกสารเดิมกลับไปเลย
--      ไม่สร้างซ้ำ (เหมือน 409=success ของฝั่งขาย)
--
-- C5 — ปัญหาเดิม: เลขที่เอกสาร v_doc คำนวณจาก count(*)+1 ไม่ lock
--      สองรายการ type เดียวกันวันเดียวกันพร้อมกันชนกันได้ (unique violation บน stock_docs.id)
-- แก้: ห่อการสร้างเลขที่+insert ด้วย retry-loop จับ unique_violation ในฟังก์ชันเดียวกัน
--      (SQL-only ไม่กระทบ API เดิม — ฟังก์ชัน rollback สะอาดอยู่แล้วตอน fail จึง retry ได้ปลอดภัย)
--
-- ปลอดภัย: ไม่ลบ/แก้ข้อมูลเดิม แค่เพิ่มคอลัมน์ + แก้ function (เพิ่ม parameter ใหม่ต่อท้ายแบบมี default
-- จึงไม่กระทบ call site เดิมที่ยังไม่ส่ง p_client_id มา — แต่ต้อง drop overload เก่าหลังสร้างใหม่
-- กัน PostgREST สับสนเลือกฟังก์ชันผิดตัวเมื่อ request ไม่ส่ง p_client_id มา)
--
-- ก่อนรัน: ต้องรันตามลำดับหลัง fix-move-recipient.sql และ fix-stock-count-diff.sql แล้ว (เป็น superset)
-- Supabase → SQL Editor → New query → วางทั้งหมด → Run
-- ============================================================

set search_path = public, extensions;

-- ------------------------------------------------------------
-- 1) เพิ่มคอลัมน์ client_id (ถ้ายังไม่มี) + unique index เฉพาะแถวที่ไม่ null
-- ------------------------------------------------------------
alter table public.stock_docs add column if not exists client_id text;
create unique index if not exists stock_docs_client_id_uidx
  on public.stock_docs (client_id) where client_id is not null;

-- ------------------------------------------------------------
-- 2) post_stock_doc — เพิ่ม p_client_id (C4) + retry-loop กันเลขที่ชน (C5)
-- ------------------------------------------------------------
create or replace function public.post_stock_doc(
  p_type      text,
  p_from      text,
  p_to        text,
  p_actor     text,
  p_lines     jsonb,
  p_supplier  text default null,
  p_recipient text default null,
  p_note      text default null,
  p_ref       text default null,
  p_client_id text default null
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_doc   text;
  v_line  jsonb;
  v_total numeric := 0;
  v_n     int := 0;
  v_qty   numeric;
  v_ing   text;
  v_pfx   text;
  v_tries int := 0;
begin
  if p_type not in ('receive','transfer','issue','adjust','sale') then
    raise exception 'ประเภทเอกสารไม่ถูกต้อง: %', p_type;
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'ไม่มีรายการในเอกสาร';
  end if;

  -- C4: idempotency — เจอ client_id เดิม คืนเลขที่เอกสารเดิมกลับไปเลย ไม่สร้างซ้ำ
  if p_client_id is not null then
    select id into v_doc from public.stock_docs where client_id = p_client_id;
    if v_doc is not null then
      return v_doc;
    end if;
  end if;

  v_pfx := case p_type
             when 'receive'  then 'RC' when 'transfer' then 'TF'
             when 'issue'    then 'IS' when 'adjust'   then 'AD'
             else 'SL' end;

  -- C5: retry-loop กันเลขที่เอกสารชนกัน (unique_violation) เมื่อสร้างพร้อมกันหลายรายการ
  loop
    v_tries := v_tries + 1;
    v_doc := v_pfx || '-' || to_char(now() at time zone 'Asia/Bangkok','YYMMDD') || '-' ||
             lpad((select count(*)+1 from public.stock_docs
                    where type = p_type
                      and (created_at at time zone 'Asia/Bangkok')::date
                          = (now() at time zone 'Asia/Bangkok')::date)::text, 3, '0');
    begin
      insert into public.stock_docs(id,type,from_location,to_location,actor,supplier,recipient,note,client_id)
      values (v_doc,p_type,p_from,p_to,p_actor,p_supplier,p_recipient,p_note,p_client_id);
      exit; -- insert สำเร็จ ออกจาก loop
    exception when unique_violation then
      if v_tries >= 20 then
        raise exception 'สร้างเลขที่เอกสารไม่สำเร็จหลังลองซ้ำ % ครั้ง', v_tries;
      end if;
      -- เลขที่ชน (หรือ client_id ชนแบบ race กับอีก request ที่กำลัง insert พร้อมกัน) ลองรอบถัดไป
    end;
  end loop;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_ing := v_line->>'ingredient_id';
    v_qty := coalesce((v_line->>'qty')::numeric, 0);
    if v_qty = 0 then continue; end if;
    if not exists (select 1 from public.ingredients where id = v_ing) then
      raise exception 'ไม่พบวัตถุดิบ: %', v_ing;
    end if;

    if p_from is not null then
      insert into public.stock_levels(ingredient_id,location_id,qty)
      values (v_ing, p_from, -v_qty)
      on conflict (ingredient_id,location_id) do update
        set qty = public.stock_levels.qty - v_qty, updated_at = now();
    end if;

    if p_to is not null then
      insert into public.stock_levels(ingredient_id,location_id,qty)
      values (v_ing, p_to, v_qty)
      on conflict (ingredient_id,location_id) do update
        set qty = public.stock_levels.qty + v_qty, updated_at = now();
    end if;

    insert into public.stock_moves(doc_id,type,ingredient_id,qty,from_location,to_location,unit_cost,actor,ref,recipient)
    values (v_doc,p_type,v_ing,v_qty,p_from,p_to,(v_line->>'unit_cost')::numeric,p_actor,p_ref,p_recipient);

    v_total := v_total + v_qty * coalesce((v_line->>'unit_cost')::numeric,0);
    v_n := v_n + 1;

    if p_type = 'receive' and (v_line->>'unit_cost') is not null then
      update public.ingredients set cost = (v_line->>'unit_cost')::numeric where id = v_ing;
    end if;
  end loop;

  update public.stock_docs set total_cost = v_total, lines = v_n where id = v_doc;
  return v_doc;
end $$;

grant execute on function public.post_stock_doc(text,text,text,text,jsonb,text,text,text,text,text)
  to anon, authenticated;

-- ลบ overload เก่า (9 พารามิเตอร์ ไม่มี p_client_id) กัน PostgREST เลือกฟังก์ชันผิดตัวตอนไม่ส่ง p_client_id
drop function if exists public.post_stock_doc(text,text,text,text,jsonb,text,text,text,text);

-- ------------------------------------------------------------
-- 3) set_stock_count — เพิ่ม p_client_id (C4) + retry-loop เดียวกัน (C5)
-- ------------------------------------------------------------
create or replace function public.set_stock_count(
  p_location  text,
  p_actor     text,
  p_lines     jsonb,
  p_note      text default null,
  p_client_id text default null
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_doc text; v_line jsonb; v_n int := 0;
  v_diff numeric; v_ing text; v_tries int := 0;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'ไม่มีรายการให้ปรับยอด';
  end if;

  if p_client_id is not null then
    select id into v_doc from public.stock_docs where client_id = p_client_id;
    if v_doc is not null then
      return v_doc;
    end if;
  end if;

  loop
    v_tries := v_tries + 1;
    v_doc := 'CT-' || to_char(now() at time zone 'Asia/Bangkok','YYMMDD') || '-' ||
             lpad((select count(*)+1 from public.stock_docs
                    where type='adjust'
                      and (created_at at time zone 'Asia/Bangkok')::date
                          = (now() at time zone 'Asia/Bangkok')::date)::text, 3, '0');
    begin
      insert into public.stock_docs(id,type,from_location,to_location,actor,note,client_id)
      values (v_doc,'adjust',p_location,p_location,p_actor,coalesce(p_note,'นับสต็อกจริง'),p_client_id);
      exit;
    exception when unique_violation then
      if v_tries >= 20 then
        raise exception 'สร้างเลขที่เอกสารไม่สำเร็จหลังลองซ้ำ % ครั้ง', v_tries;
      end if;
    end;
  end loop;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_ing  := v_line->>'ingredient_id';
    v_diff := (v_line->>'diff')::numeric;
    if v_diff is null or v_diff = 0 then continue; end if;

    if not exists (select 1 from public.ingredients where id = v_ing) then
      raise exception 'ไม่พบวัตถุดิบ: %', v_ing;
    end if;

    /* บวกส่วนต่างเข้ากับยอดเดิมตรงๆ ไม่คำนวณส่วนต่างเองอีกต่อไป (fix-stock-count-diff.sql) */
    insert into public.stock_levels(ingredient_id,location_id,qty)
    values (v_ing, p_location, v_diff)
    on conflict (ingredient_id,location_id) do update
      set qty = public.stock_levels.qty + v_diff, updated_at = now();

    insert into public.stock_moves(doc_id,type,ingredient_id,qty,from_location,to_location,actor,note)
    values (v_doc,'adjust',v_ing,v_diff,
            case when v_diff < 0 then p_location else null end,
            case when v_diff > 0 then p_location else null end,
            p_actor,
            'ปรับยอดจากการนับ (' || (case when v_diff>0 then '+' else '' end) || v_diff || ')');
    v_n := v_n + 1;
  end loop;

  update public.stock_docs set lines = v_n where id = v_doc;
  return v_doc;
end $$;

grant execute on function public.set_stock_count(text,text,jsonb,text,text) to anon, authenticated;

-- ลบ overload เก่า (4 พารามิเตอร์ ไม่มี p_client_id) กันเหตุผลเดียวกับข้างบน
drop function if exists public.set_stock_count(text,text,jsonb,text);

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 4) ตรวจผล
-- ------------------------------------------------------------
select column_name, is_nullable from information_schema.columns
where table_name='stock_docs' and column_name='client_id';

select routine_name, specific_name from information_schema.routines
where routine_schema='public' and routine_name in ('post_stock_doc','set_stock_count');
-- ต้องเห็นแค่ 1 แถวต่อชื่อฟังก์ชัน (ถ้าเห็น 2 แถว = overload เก่ายังไม่ถูก drop)
