/* ================= ล็อกอิน (เหมือน admin-init.js ของ Banfa POS ทุกประการ — ใช้ staff/PIN ชุดเดียวกัน) ================= */
let pin = "";
function renderDots(){
  const n = pin.length, mx = Math.max(n,4);
  $("#dots").innerHTML = Array.from({length:mx},(_,i)=>`<i class="${i<n?"f":""}"></i>`).join("");
}
async function doLogin(code){
  try{
    const list = await rpc("verify_pin",{p_pin:String(code)});
    if(!list?.length) return "PIN ไม่ถูกต้อง";
    const s = list[0];
    if(s.role!=="admin") return "บัญชีนี้ไม่มีสิทธิ์เข้าระบบการเงิน";
    ME = {id:s.id, name:s.name, role:s.role};
    store.set("fin_me", ME);
    $("#login").classList.remove("on");
    $("#whoAv").textContent = s.name.charAt(0).toUpperCase();
    $("#whoName").textContent = s.name;
    $("#whoRole").textContent = "แอดมิน";
    setRange(30);
    await bootstrapAfterLogin();
    return null;
  }catch(e){ return friendly(e.status, e.body); }
}
async function keypad(k){
  $("#lgErr").textContent = "";
  if(k==="c"){ pin=""; renderDots(); return; }
  if(k==="ok"){
    if(pin.length<4){ $("#lgErr").textContent="PIN อย่างน้อย 4 หลัก"; return; }
    $("#lgErr").textContent = "กำลังตรวจสอบ…";
    const tried = pin; pin=""; renderDots();
    const err = await doLogin(tried);
    $("#lgErr").textContent = err || "";
    return;
  }
  if(pin.length<8){ pin+=k; renderDots(); }
}
function logout(){
  ME=null; store.set("fin_me",null); pin=""; renderDots();
  $("#login").classList.add("on");
}

/* ================= Events ================= */
$("#side").addEventListener("click", e=>{
  const grp = e.target.closest("[data-g]");
  if(grp){ setGroupOpen(grp.dataset.g, !grp.classList.contains("open")); return; }
  const b = e.target.closest("[data-p]");
  if(b) go(b.dataset.p);
});
$("#toAdmin").addEventListener("click", ()=>{ window.location.href = CONFIG.ADMIN_URL || "admin.html"; });
$("#logout").addEventListener("click", async ()=>{
  if(await ask("ออกจากระบบ","ต้องใส่ PIN ใหม่เพื่อเข้าอีกครั้ง",{yes:"ออก",safe:true})) logout();
});
$("#range").addEventListener("click", e=>{
  const b = e.target.closest("[data-d]");
  if(b){ $$("#range .chip-b").forEach(x=>x.classList.toggle("on", x===b));
    setRange(+b.dataset.d); go(page); return; }
  if(e.target.id==="apply"){ $$("#range .chip-b").forEach(x=>x.classList.remove("on")); go(page); }
});
$("#keypad").addEventListener("click", e=>{
  const b = e.target.closest("[data-k]"); if(b) keypad(b.dataset.k);
});
document.addEventListener("keydown", e=>{
  if(!$("#login").classList.contains("on")) return;
  if(e.key>="0"&&e.key<="9") keypad(e.key);
  else if(e.key==="Enter") keypad("ok");
  else if(e.key==="Backspace"){ pin=pin.slice(0,-1); renderDots(); }
});
$("#dlgNo").addEventListener("click", ()=>closeDlg(null));
$("#dlgYes").addEventListener("click", ()=>{
  const inp = $("#dlgInput");
  closeDlg(inp.hidden ? true : inp.value.trim());
});
$("#dlg").addEventListener("click", e=>{ if(e.target.id==="dlg") closeDlg(null); });
$("#dlgInput").addEventListener("keydown", e=>{ if(e.key==="Enter") $("#dlgYes").click(); });

/* ── คลิกในหน้า ── */
$("#page").addEventListener("click", async e=>{
  const t = e.target;

  /* บันทึกรายการ */
  const tft = t.closest("[data-tftype]");
  if(tft){ collectTxnForm(); TXN_FORM.type = tft.dataset.tftype; TXN_FORM.category=""; render(); return; }
  if(t.id==="tfSave"){ saveTxn(); return; }
  if(t.id==="tfCancel" || t.id==="tfClear"){ TXN_FORM = newTxnForm(); render(); return; }
  const txe = t.closest("[data-txnedit]"); if(txe){ editTxn(txe.dataset.txnedit); return; }
  const txd = t.closest("[data-txndel]");  if(txd){ deleteTxn(txd.dataset.txndel); return; }
  if(t.id==="txnCsvBtn"){ exportTxnsCSV(); return; }

  /* รายการประจำ */
  const rft = t.closest("[data-rftype]");
  if(rft){ collectRecurForm(); RECUR_FORM.type = rft.dataset.rftype; RECUR_FORM.category=""; render(); return; }
  if(t.id==="rfSave"){ saveRecur(); return; }
  if(t.id==="rfCancel"){ RECUR_FORM = newRecurForm(); render(); return; }
  const rce = t.closest("[data-recedit]");   if(rce){ editRecur(rce.dataset.recedit); return; }
  const rcd = t.closest("[data-recdel]");    if(rcd){ deleteRecur(rcd.dataset.recdel); return; }
  const rct = t.closest("[data-rectoggle]"); if(rct){ toggleRecur(rct.dataset.rectoggle); return; }

  /* ตั้งค่า: บัญชี */
  if(t.id==="accSave"){ saveAccounts(); return; }
  if(t.id==="accAdd"){ addAccount(); return; }
  const at = t.closest("[data-acctoggle]"); if(at){ toggleAccount(at.dataset.acctoggle); return; }
  const ad = t.closest("[data-accdel]");    if(ad){ deleteAccount(ad.dataset.accdel); return; }

  /* ตั้งค่า: หมวดหมู่ */
  if(t.id==="catExpSave"){ saveCategories("expense"); return; }
  if(t.id==="catIncSave"){ saveCategories("income"); return; }
  if(t.id==="catExpAdd"){ addCategory("expense"); return; }
  if(t.id==="catIncAdd"){ addCategory("income"); return; }
  const ct = t.closest("[data-cattoggle]"); if(ct){ toggleCategory(ct.dataset.cattoggle); return; }
  const cd = t.closest("[data-catdel]");    if(cd){ deleteCategory(cd.dataset.catdel); return; }

  /* คลังหลังร้าน: รายการของ */
  if(t.id==="whiSave"){ saveWhItems(); return; }
  if(t.id==="whiAdd"){ addWhItem(); return; }
  const wit = t.closest("[data-whitoggle]"); if(wit){ toggleWhItem(wit.dataset.whitoggle); return; }
  const wid = t.closest("[data-whidel]");    if(wid){ deleteWhItem(wid.dataset.whidel); return; }

  /* คลังหลังร้าน: รับเข้า/จ่ายออก */
  const wmt = t.closest("[data-wmtype]");
  if(wmt){ collectWhMoveForm(); WHM_FORM.type = wmt.dataset.wmtype; render(); return; }
  if(t.id==="wmSave"){ saveWhMove(); return; }
  if(t.id==="wmCancel" || t.id==="wmClear"){ WHM_FORM = newWhMoveForm(); render(); return; }
  const wme = t.closest("[data-whmedit]"); if(wme){ editWhMove(wme.dataset.whmedit); return; }
  const wmd = t.closest("[data-whmdel]");  if(wmd){ deleteWhMove(wmd.dataset.whmdel); return; }
  if(t.id==="whmCsvBtn"){ exportWhMovesCSV(); return; }
});

/* ================= เริ่มต้น ================= */
async function bootstrapAfterLogin(){
  /* ประมวลผลรายการประจำที่ถึงกำหนดก่อนเสมอ — เผื่อไม่ได้เข้าแอปมานาน จะได้ไล่สร้างรายการที่ค้างให้ครบ
     ก่อนที่หน้าภาพรวม/รายงานจะคำนวณตัวเลข ไม่งั้นยอดจะขาดรายการที่ควรมีไปแล้ว */
  try{ await rpc("run_due_recurring",{}); }catch(e){ console.warn("run_due_recurring ล้มเหลว:", e); }
  await go("dash");
}
(async function init(){
  applyTheme(getTheme());
  $("#lgVer").textContent = `v${APP_VERSION}`;
  $("#foot").innerHTML = `รายรับ-รายจ่าย<br>v${APP_VERSION}`;
  console.log(`Banfa Finance v${APP_VERSION}`);
  token = store.get("fin_tok"); refreshTok = store.get("fin_rtok");
  setRange(30); renderDots();
  await signIn();
  const me = store.get("fin_me");
  if(me && me.id && me.role === "admin"){
    ME = me;
    $("#login").classList.remove("on");
    $("#whoAv").textContent = me.name.charAt(0).toUpperCase();
    $("#whoName").textContent = me.name;
    $("#whoRole").textContent = "แอดมิน";
    await bootstrapAfterLogin();
  }else{
    $("#login").classList.add("on");
  }
})();
