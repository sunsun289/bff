-- ============================================================
-- แก้บั๊กร้ายแรง: "นับสต็อกจริง" ปรับยอดผิดเพี้ยน (กรอก 80 กลายเป็น 200)
--
-- สาเหตุ: ตั้งแต่เปลี่ยนมาคำนวณยอดสด (Option A) หน้าจอโชว์ "ในระบบ" จากการคำนวณสดฝั่ง JS
--         (รวมยอดขายที่หักไปแล้ว) แต่ตอนบันทึก SQL เดิมไปคำนวณส่วนต่างเทียบกับ stock_levels.qty
--         ในฐานข้อมูลตรงๆ ซึ่ง "ไม่เคยถูกยอดขายหักเลย" ตั้งแต่เปลี่ยนสถาปัตยกรรม
--         สองค่านี้ไม่ตรงกัน ส่วนต่างที่คำนวณได้เลยผิดเพี้ยนไปไกล
--
-- แก้: ให้ฝั่ง JS (ที่รู้ค่า "ในระบบ" ที่ถูกต้องอยู่แล้ว) คำนวณส่วนต่างเอง แล้วส่ง "ส่วนต่าง"
--      มาให้ตรงๆ แทนที่จะส่ง "ยอดนับได้" แล้วให้ SQL ไปเดาเอง
-- Supabase → SQL Editor → New query → Run
-- ============================================================

set search_path = public, extensions;

create or replace function public.set_stock_count(
  p_location text,
  p_actor    text,
  p_lines    jsonb,     -- [{"ingredient_id":"i_milk","diff":-120}, ...]  ส่วนต่างที่คำนวณมาจากฝั่ง JS แล้ว
  p_note     text default null
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_doc text; v_line jsonb; v_n int := 0;
  v_diff numeric; v_ing text;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'ไม่มีรายการให้ปรับยอด';
  end if;

  v_doc := 'CT-' || to_char(now() at time zone 'Asia/Bangkok','YYMMDD') || '-' ||
           lpad((select count(*)+1 from public.stock_docs
                  where type='adjust'
                    and (created_at at time zone 'Asia/Bangkok')::date
                        = (now() at time zone 'Asia/Bangkok')::date)::text, 3, '0');

  insert into public.stock_docs(id,type,from_location,to_location,actor,note)
  values (v_doc,'adjust',p_location,p_location,p_actor,coalesce(p_note,'นับสต็อกจริง'));

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_ing  := v_line->>'ingredient_id';
    v_diff := (v_line->>'diff')::numeric;
    if v_diff is null or v_diff = 0 then continue; end if;

    if not exists (select 1 from public.ingredients where id = v_ing) then
      raise exception 'ไม่พบวัตถุดิบ: %', v_ing;
    end if;

    /* บวกส่วนต่างเข้ากับยอดเดิมตรงๆ ไม่คำนวณส่วนต่างเองอีกต่อไป */
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

grant execute on function public.set_stock_count(text,text,jsonb,text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- ทดสอบ: ดูรายการนับสต็อกล่าสุด (ทำหลังเริ่มใช้จริงแล้ว)
-- ------------------------------------------------------------
select * from public.stock_moves where type='adjust' order by created_at desc limit 5;
