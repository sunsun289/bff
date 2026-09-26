-- ============================================================
-- เพิ่มคอลัมน์ "ผู้รับ" ในประวัติเคลื่อนไหว (stock_moves)
-- ปัญหาเดิม: ตอน "จ่ายออกจากคลัง" พิมพ์ชื่อผู้รับไว้ (เช่น "ร้านสอง")
--           ข้อมูลนี้เก็บอยู่ใน stock_docs เท่านั้น
--           หน้า "ประวัติเคลื่อนไหว" ไม่โผล่ให้เห็น ต้องเปิดเอกสารทีละใบ
-- แก้: คัดลอกชื่อผู้รับมาเก็บไว้ใน stock_moves ด้วย โชว์ในประวัติได้ตรงๆ
-- Supabase → SQL Editor → New query → Run (ปลอดภัย ไม่ลบข้อมูลเดิม)
-- ============================================================

set search_path = public, extensions;

-- ------------------------------------------------------------
-- 1) เพิ่มคอลัมน์ (ถ้ายังไม่มี)
-- ------------------------------------------------------------
alter table public.stock_moves add column if not exists recipient text;

-- ------------------------------------------------------------
-- 2) เติมข้อมูลย้อนหลังจากเอกสารที่มีอยู่แล้ว (ทำครั้งเดียว ไม่กระทบของใหม่)
-- ------------------------------------------------------------
update public.stock_moves m
set recipient = d.recipient
from public.stock_docs d
where m.doc_id = d.id and d.recipient is not null and m.recipient is null;

-- ------------------------------------------------------------
-- 3) แก้ post_stock_doc() ให้บันทึกผู้รับลง stock_moves ทุกครั้งที่มีค่านี้
--    (ไม่ใช่แค่ตอนจ่ายออก — เผื่ออนาคตอยากใช้กับประเภทอื่นด้วย)
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
  p_ref       text default null
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
begin
  if p_type not in ('receive','transfer','issue','adjust','sale') then
    raise exception 'ประเภทเอกสารไม่ถูกต้อง: %', p_type;
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'ไม่มีรายการในเอกสาร';
  end if;

  v_pfx := case p_type
             when 'receive'  then 'RC' when 'transfer' then 'TF'
             when 'issue'    then 'IS' when 'adjust'   then 'AD'
             else 'SL' end;

  v_doc := v_pfx || '-' || to_char(now() at time zone 'Asia/Bangkok','YYMMDD') || '-' ||
           lpad((select count(*)+1 from public.stock_docs
                  where type = p_type
                    and (created_at at time zone 'Asia/Bangkok')::date
                        = (now() at time zone 'Asia/Bangkok')::date)::text, 3, '0');

  insert into public.stock_docs(id,type,from_location,to_location,actor,supplier,recipient,note)
  values (v_doc,p_type,p_from,p_to,p_actor,p_supplier,p_recipient,p_note);

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

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 4) ทดสอบ
-- ------------------------------------------------------------
select id, type, recipient, created_at from public.stock_moves
where recipient is not null order by created_at desc limit 5;
