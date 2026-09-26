/* ================= หน้า: พนักงาน ================= */
async function fetchStaff(){
  try{ STAFF = await apiJson("/rest/v1/staff_public?select=*"); return true; }
  catch(e){ STAFF=[]; lastErr=friendly(e.status,e.body); return false; }
}
function pageStaff(){
  let h = `<div class="card"><h3>พนักงาน &amp; สิทธิ์<span class="sub">${STAFF.length} คน</span></h3>
    <div class="lbl">PIN เก็บเป็นรหัสเข้ารหัสบนเซิร์ฟเวอร์ — ดูย้อนหลังไม่ได้ ตั้งใหม่ได้อย่างเดียว</div>`;
  if(!STAFF.length) h += `<div class="msg">${esc(lastErr||"ยังไม่มีพนักงาน")}</div>`;
  for(const s of STAFF){
    h += `<div class="row" data-sid="${esc(s.id)}">
      <input class="f-name" type="text" data-f="name" value="${esc(s.name)}">
      <select data-f="role">
        <option value="cashier"${s.role==="cashier"?" selected":""}>พนักงาน</option>
        <option value="admin"${s.role==="admin"?" selected":""}>แอดมิน</option></select>
      <input class="f-num" type="text" inputmode="numeric" data-f="pin" placeholder="ตั้ง PIN ใหม่" style="width:130px;text-align:left">
      <div class="sw${s.active?" on":""}" data-f="active"></div>
      <button class="btn ghost sm" data-ssave="${esc(s.id)}">บันทึก</button>
      <button class="x" data-sdel="${esc(s.id)}">×</button></div>`;
  }
  return h + `<div class="addbar">
    <input class="f-name" id="stName" type="text" placeholder="ชื่อพนักงานใหม่">
    <input id="stPin" type="text" inputmode="numeric" placeholder="PIN 4-6 หลัก" style="width:150px">
    <select id="stRole"><option value="cashier">พนักงาน</option><option value="admin">แอดมิน</option></select>
    <button class="btn dark" id="staffAdd">+ เพิ่มพนักงาน</button></div></div>`;
}

/* ================= หน้า: ตั้งค่า ================= */
function pageSettings(){
  const cur = getTheme();
  let h = `<div class="card"><h3>หน้าตา</h3><div class="lbl" style="margin-top:0">ธีมสี</div>
    <div class="themepick">${THEMES.map(([id,name,desc])=>
      `<button class="themeopt${id===cur?" on":""}" data-theme="${id}">
        <span class="prev ${id}"></span><span class="tt">${name}</span><span class="td">${desc}</span></button>`).join("")}
    </div></div>`;
  h += `<div class="card"><h3>ตั้งค่าร้าน<button class="btn primary sm" id="setSave">บันทึก</button></h3>
    <div class="lbl" style="margin-top:0">ชื่อร้าน (ใช้แสดงในระบบทั้งหมด — หน้าล็อกอิน, แถบบน, หน้าขาย)</div>
    <div class="row"><input class="f-name" id="setShopName" type="text"
      value="${esc(SETTINGS.shopName||"บ้านฟ้ากาแฟสด")}" placeholder="ชื่อร้าน" style="text-align:left"></div>
    <div class="lbl">เบอร์พร้อมเพย์ / เลขบัตรประชาชน (ใช้สร้าง QR ที่เครื่องขาย)</div>
    <div class="row"><input class="f-name" id="setPP" type="text" inputmode="numeric"
      value="${esc(SETTINGS.pp||"")}" placeholder="เช่น 0812345678" style="text-align:left"></div>
    <div class="lbl">ปุ่มลัดเหตุผลรายจ่ายที่หน้าขาย (คั่นด้วยจุลภาค ,)</div>
    <div class="row"><input class="f-name" id="setCmOut" type="text"
      value="${esc((SETTINGS.cash_out_reasons&&SETTINGS.cash_out_reasons.length?SETTINGS.cash_out_reasons:DEFAULT_CM_OUT).join(", "))}"
      placeholder="เช่น ซื้อวัตถุดิบ, ค่าขนส่ง" style="text-align:left"></div></div>`;
  h += `<div class="card"><h3>สถานะระบบ</h3>
    <div class="trow"><span>เวอร์ชัน</span><b>v${APP_VERSION}</b></div>
    <div class="trow"><span>Supabase</span><b>${CONFIG.URL?`<span class="pill ok">เชื่อมต่อแล้ว</span>`:`<span class="pill warn">ยังไม่ตั้งค่า</span>`}</b></div>
    <div class="trow"><span>Supabase Auth</span><b>${token?`<span class="pill ok">เปิดใช้งาน</span>`:`<span class="pill warn">ยังไม่เปิด</span>`}</b></div>
    <div class="trow"><span>ตัวสรุปยอดบนเซิร์ฟเวอร์</span>
      <b>${useRPC?`<span class="pill ok">ติดตั้งแล้ว</span>`:`<span class="pill warn">ยังไม่ได้ติดตั้ง — รัน schema-reports.sql</span>`}</b></div>
    <div class="trow"><span>เมนู / วัตถุดิบ / สูตร</span><b>${MENU.length} · ${STOCK.length} · ${Object.keys(REC).length}</b></div>
    <div class="addbar">
      <button class="btn ghost" id="reloadAll">โหลดข้อมูลใหม่</button>
      <button class="btn ghost" id="backup">ดาวน์โหลดไฟล์สำรอง</button></div></div>`;
  return h;
}
function backup(){
  const data = {menu:MENU, optgroups:OPTG, recipes:REC, settings:SETTINGS,
    ingredients:STOCK.map(({id,name,unit,cost,low_front,low_wh,buy_unit,buy_factor})=>
      ({id,name,unit,cost,low_front,low_wh,buy_unit,buy_factor})),
    version:APP_VERSION, at:new Date().toISOString()};
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
  a.download = `banfa_backup_${today()}.json`; a.click();
  toast("ดาวน์โหลดไฟล์สำรองแล้ว","ok");
}


async function rpcStaff(id,name,pin,role,active,okMsg="บันทึกแล้ว"){
  try{
    await rpc("upsert_staff",{p_id:id||"", p_name:name, p_pin:pin||null, p_role:role, p_active:active});
    toast(okMsg,"ok");
    await logAct("staff_edit", name);
    await fetchStaff(); render();
  }catch(e){
    const raw = e.body || "";
    const msg = raw.includes("แอดมิน") ? "ต้องมีแอดมินที่ใช้งานได้อย่างน้อย 1 คน"
      : raw.includes("4 หลัก") ? "พนักงานใหม่ต้องมี PIN อย่างน้อย 4 หลัก"
      : friendly(e.status, raw);
    toast(msg,"err");
  }
}

