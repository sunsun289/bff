/* ================= ล็อกอิน ================= */
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
    if(s.role!=="admin") return "บัญชีนี้ไม่มีสิทธิ์เข้าหลังบ้าน";
    ME = {id:s.id, name:s.name, role:s.role};
    store.set("me", ME);
    $("#login").classList.remove("on");
    $("#whoAv").textContent = s.name.charAt(0).toUpperCase();
    $("#whoName").textContent = s.name;
    $("#whoRole").textContent = "แอดมิน";
    logAct("login_backoffice","เข้าหลังบ้าน");
    setRange(0);
    await loadConfig();
    applyBranding();
    await go("dash");
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
  ME=null; store.set("me",null); pin=""; renderDots();
  $("#login").classList.add("on");
}

/* ================= Events ================= */
function setSideOpen(open){
  $("#side").classList.toggle("open", open);
  document.body.classList.toggle("side-open", open);
  window.scrollTo(0,0);   /* สลับไปมาแล้วเริ่มจากบนสุดเสมอ ไม่ค้างตำแหน่งเลื่อนเดิม */
}
$("#side").addEventListener("click", e=>{
  const grp = e.target.closest("[data-g]");
  if(grp){ e.stopPropagation(); setGroupOpen(grp.dataset.g, !grp.classList.contains("open")); return; }
  const b = e.target.closest("[data-p]");
  if(b){
    e.stopPropagation();
    if(b.dataset.p==="finance"){ window.location.href = CONFIG.FINANCE_URL || "finance.html"; return; }
    go(b.dataset.p);
  }
});
$("#tabbar").addEventListener("click", e=>{
  const b = e.target.closest("button"); if(!b) return;
  if(b.id==="more"){ setSideOpen(true); return; }
  if(b.dataset.p) go(b.dataset.p);
});
$("#toPos").addEventListener("click", ()=>{ window.location.href=CONFIG.POS_URL||"/"; });
$("#burger").addEventListener("click", e=>{ e.stopPropagation(); setSideOpen(!$("#side").classList.contains("open")); });
document.addEventListener("click", e=>{
  const side = $("#side");
  if(!side.classList.contains("open")) return;
  if(side.contains(e.target) || e.target.closest("#burger") || e.target.closest("#more")) return;
  setSideOpen(false);
});
$("#logout").addEventListener("click", async e=>{
  e.stopPropagation();
  if(await ask("ออกจากระบบ","ต้องใส่ PIN ใหม่เพื่อเข้าอีกครั้ง",{yes:"ออก",safe:true})) logout();
});
$("#range").addEventListener("click", e=>{
  const b = e.target.closest("[data-d]");
  if(b){ $$("#range .chip-b").forEach(x=>x.classList.toggle("on", x===b));
    setRange(+b.dataset.d); billPage=0; go(page); return; }
  if(e.target.id==="apply"){ $$("#range .chip-b").forEach(x=>x.classList.remove("on"));
    billPage=0; go(page); }
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

/* ── คำนวณสดขณะพิมพ์ ── */
$("#page").addEventListener("change", e=>{
  const f = e.target.dataset?.f;
  if(f==="ing"){
    collectDoc();   /* เก็บค่าจากทุกช่องก่อน — รวมค่า ing ที่เพิ่งเปลี่ยน */
    /* แล้วค่อยตั้งหน่วยเริ่มต้น: รับของเข้าคลัง + วัตถุดิบนี้มีหน่วยเติมสต็อก -> ใช้หน่วยนั้นเป็นค่าเริ่มต้น
       ต้องทำหลัง collectDoc() เสมอ ไม่งั้นค่าที่ตั้งจะถูกอ่านทับด้วย DOM เก่า */
    const row = e.target.closest("[data-ln]");
    if(row){
      const ln = docLines[+row.dataset.ln];
      const g = findIng(e.target.value);
      const buyOk = BUY_UNIT_DEFAULT.has(page);
      if(ln) ln.buy = buyOk && !!(g && g.buy_unit);
    }
    render(); return;
  }
  if(f==="buy"){ collectDoc(); render(); }
  if(f==="ctu"){
    const row = e.target.closest("[data-ct]"); if(!row) return;
    /* เปลี่ยนหน่วยที่ใช้นับ วัตถุดิบตัวนี้ — เลขที่กรอกไว้อ้างอิงหน่วยเก่า เทียบกับหน่วยใหม่ไม่ได้ ล้างช่องนี้ทิ้ง กันกรอกผิด */
    delete counted[row.dataset.ct];
    countUnitBuy[row.dataset.ct] = e.target.value === "1";
    store.set("count_unit_buy", countUnitBuy);   /* จำไว้ใช้ครั้งหน้า ไม่ต้องมาเลือกใหม่ทุกครั้ง */
    render();
  }
});
$("#page").addEventListener("input", e=>{
  const f = e.target.dataset?.f;
  if(f==="cnt"){
    const row = e.target.closest("[data-ct]"); if(!row) return;
    const g = findIng(row.dataset.ct); if(!g) return;
    const factor = +row.dataset.factor || 1;
    const useBuy = row.dataset.usebuy === "1";
    const curDisp = useBuy ? (+g.qty_front)/factor : +g.qty_front;
    const cell = row.querySelector("[data-diff]");
    if(e.target.value===""){ cell.textContent="—"; cell.className="num flat"; }
    else{
      const d = (parseFloat(e.target.value)||0)-curDisp;
      cell.textContent = (d>0?"+":"")+qty(d);
      cell.className = "num " + (d<0?"down":d>0?"":"up");
    }
    return;
  }
  if((f==="qty"||f==="cost") && DOC[page]){
    collectDoc();
    const row = e.target.closest("[data-ln]");
    if(row){
      const ln = docLines[+row.dataset.ln];
      const amt = row.querySelector(".amt");
      if(amt) amt.textContent = baht(lineQty(ln)*lineCost(ln));
    }
    const tot = docLines.reduce((s,l)=>s+lineQty(l)*lineCost(l),0);
    const el = document.querySelector(".doc-total .v");
    if(el) el.textContent = baht(tot);
  }
});

/* ── คลิกในหน้า ── */
$("#page").addEventListener("click", async e=>{
  const t = e.target;

  if(t.classList.contains("sw") && t.dataset.f){ t.classList.toggle("on"); return; }

  const th = t.closest(".themeopt");
  if(th){
    applyTheme(th.dataset.theme); render();
    toast(`เปลี่ยนธีมเป็น ${th.querySelector(".tt").textContent}แล้ว`,"ok");
    return;
  }

  const v = t.closest("[data-void]"); if(v){ voidOrder(v.dataset.void); return; }
  if(t.id==="csvBtn"){ exportCSV(); return; }
  if(t.id==="dayCsvBtn"){ exportDayCSV(); return; }
  if(t.id==="monthCsvBtn"){ exportMonthCSV(); return; }
  if(t.id==="catCsvBtn"){ exportCatCSV(); return; }
  if(t.id==="productCsvBtn"){ exportProductCSV(); return; }
  if(t.id==="movesCsvBtn"){ exportMovesCSV(); return; }
  const prod = t.closest("[data-prod]");
  if(prod){ await loadProductDetail(prod.dataset.prod); render(); return; }
  if(t.id==="bpPrev"){ if(billPage>0){ billPage--; await loadBills(); render(); } return; }
  if(t.id==="bpNext"){
    const pg = Math.ceil(billTotal/PER_PAGE);
    if(billPage<pg-1){ billPage++; await loadBills(); render(); }
    return;
  }

  const fc = t.closest("[data-fclose]");
  if(fc){
    const oc = +fc.dataset.oc||0;
    if(!await ask("ปิดกะค้าง","ปิดกะนี้โดยถือว่าเงินในลิ้นชักตรงตามระบบ\n(ใช้กับกะที่เปิดค้างไว้โดยไม่ได้ขาย)",{yes:"ปิดกะ"})) return;
    try{
      const r = await api(`/rest/v1/shifts?local_id=eq.${encodeURIComponent(fc.dataset.fclose)}`,{
        method:"PATCH", extraHeaders:{Prefer:"return=minimal"},
        body:JSON.stringify({closed_at:new Date().toISOString(), closed_by:ME?.name||"-",
          counted_cash:oc, expected_cash:oc, diff:0, status:"closed", note:"ปิดจากหลังบ้าน"})});
      if(!r.ok) throw {status:r.status, body:await r.text()};
      await logAct("shift_force_close", fc.dataset.fclose);
      toast("ปิดกะแล้ว","ok"); await fetchShifts(); render();
    }catch(err){ toast(friendly(err.status,err.body),"err"); }
    return;
  }

  if(t.id==="stockRefresh"){
    setSync("busy","กำลังคำนวณยอดใหม่ทั้งหมด…");
    await loadStock(true); render();
    toast("คำนวณยอดใหม่จากเอกสารทั้งหมดแล้ว","ok"); return;
  }
  if(t.id==="ingSave"){ saveIngredients(); return; }
  const idel = t.closest("[data-ingdel]");
  if(idel){
    const g = findIng(idel.dataset.ingdel);
    if(!await ask("ลบวัตถุดิบ",`ลบ "${g?.name||""}" ? สูตรที่ใช้อยู่จะเสียไปด้วย`,{yes:"ลบ"})) return;
    try{
      /* ปิดใช้งานแทนการลบแถวจริง (soft delete) — stock_moves.ingredient_id ไม่มี FK ป้องกันไว้
         ลบแถว ingredients จริงแล้วประวัติรับ/เบิก/จ่ายออก/นับสต็อกเก่าของวัตถุดิบนี้จะกลายเป็น
         orphan อ่านชื่อ/หน่วย/ต้นทุนไม่ได้อีกเลย (กู้คืนไม่ได้) ส่วน UI จะหายจากรายการเหมือนเดิม
         เพราะ stock_overview กรอง active อยู่แล้ว */
      const r = await api(`/rest/v1/ingredients?id=eq.${encodeURIComponent(idel.dataset.ingdel)}`,{
        method:"PATCH", extraHeaders:{Prefer:"return=minimal"},
        body:JSON.stringify({active:false})});
      if(!r.ok) throw {status:r.status, body:await r.text()};
      toast("ลบแล้ว","ok"); await logAct("ing_delete", g?.name||"");
      await loadStock(); render();
    }catch(err){ toast(friendly(err.status,err.body),"err"); }
    return;
  }
  if(t.id==="ingAdd"){
    const nm = $("#niName").value.trim();
    if(!nm){ toast("ใส่ชื่อวัตถุดิบก่อน","err"); return; }
    try{
      const r = await api("/rest/v1/ingredients",{method:"POST", extraHeaders:{Prefer:"return=minimal"},
        body:JSON.stringify([{id:"i_"+Date.now(), name:nm, unit:$("#niUnit").value.trim()||"g",
          cost:parseFloat($("#niCost").value)||0, low_front:0, buy_factor:1}])});
      if(!r.ok) throw {status:r.status, body:await r.text()};
      toast(`เพิ่ม ${nm} แล้ว`,"ok"); await logAct("ing_add", nm);
      await loadStock(); render();
    }catch(err){ toast(friendly(err.status,err.body),"err"); }
    return;
  }

  if(t.id==="lnAdd"){ collectDoc(); docLines.push(newDocLine(page)); render(); return; }
  const lnd = t.closest("[data-lndel]");
  if(lnd){
    collectDoc(); docLines.splice(+lnd.dataset.lndel,1);
    if(!docLines.length) docLines=[newDocLine(page)];
    render(); return;
  }
  if(t.id==="docClear"){ docLines=[newDocLine(page)]; docClientId=null; render(); return; }
  if(t.id==="docSave"){ postDoc(t.dataset.type); return; }

  if(t.id==="ctSave"){ saveCount(); return; }
  if(t.id==="ctClear"){ counted={}; countClientId=null; render(); return; }

  /* กรองหมวดในหน้าเมนู */
  const mc = t.closest("[data-mcat]");
  if(mc){ collectMenu(); menuCat = mc.dataset.mcat; render(); return; }

  /* ทำสำเนาเมนู */
  const dup = t.closest("[data-dup]");
  if(dup){
    collectMenu();
    const src = MENU[+dup.dataset.dup]; if(!src) return;
    let name = src.name + " (สำเนา)", n = 2;
    while(MENU.some(p=>p.name===name)) name = `${src.name} (สำเนา ${n++})`;
    const id = nextMenuId();
    MENU.push({...src, id, name});
    if(recipeOf(src.id).length) REC[String(id)] = JSON.parse(JSON.stringify(recipeOf(src.id)));
    await saveConfig("menu", `ทำสำเนา ${name} แล้ว`);
    if(REC[String(id)]) await saveConfig("recipes","");
    render(); return;
  }

  /* แก้ราคาทั้งหมวด */
  if(t.id==="bulkPrice"){
    collectMenu();
    const mode = $("#bulkMode").value;
    const val = parseFloat($("#bulkVal").value);
    if(isNaN(val)){ toast("ใส่จำนวนเงินก่อน","err"); return; }
    const items = MENU.filter(p=>p.cat===menuCat);
    const label = mode==="add"?`บวก ${val}`:mode==="sub"?`ลด ${val}`:`ตั้งเป็น ${val}`;
    if(!await ask("แก้ราคาทั้งหมวด",`${label} บาท กับ ${items.length} เมนูในหมวด ${catTh(menuCat)}`,
      {yes:"ใช้เลย", safe:true})) return;
    items.forEach(p=>{
      p.price = mode==="set" ? val : mode==="add" ? p.price+val : Math.max(0,p.price-val);
    });
    await saveConfig("menu",`แก้ราคา ${items.length} เมนูแล้ว`);
    await logAct("menu_bulk_price", `${catTh(menuCat)} · ${label}`);
    render(); return;
  }

  /* เพิ่มหลายเมนูพร้อมกัน */
  if(t.id==="bulkAdd"){
    collectMenu();
    const {items, skipped} = parseBulk($("#bulkText").value);
    if(!items.length){
      toast(skipped.length?`ทุกชื่อมีอยู่แล้ว (${skipped.length})`:"ยังไม่ได้พิมพ์รายการ","err");
      return;
    }
    const cat = $("#bulkCat").value;
    const preview = items.slice(0,5).map(i=>`${i.name} ${i.price}`).join("\n")
      + (items.length>5?`\n… และอีก ${items.length-5} รายการ`:"");
    if(!await ask(`เพิ่ม ${items.length} เมนู`,
      `หมวด ${catTh(cat)}\n\n${preview}${skipped.length?`\n\nข้าม ${skipped.length} ชื่อที่มีอยู่แล้ว`:""}`,
      {yes:"เพิ่มทั้งหมด", safe:true})) return;
    let id = nextMenuId();
    items.forEach(i=> MENU.push({id:id++, name:i.name, price:i.price, cat, active:true, track:false, stock:0}));
    await saveConfig("menu", `เพิ่ม ${items.length} เมนูแล้ว`);
    await logAct("menu_bulk_add", `${items.length} เมนู · ${catTh(cat)}`);
    menuCat = cat; render(); return;
  }

  /* คัดลอกสูตร */
  if(t.id==="copyRec"){
    collectRec();
    const from = $("#copyFrom").value;
    const to = $("#copyTo").value;
    const src = recipeOf(from);
    if(!src.length){ toast("เมนูต้นแบบยังไม่มีสูตร","err"); return; }
    let targets = [];
    if(to==="__norec") targets = MENU.filter(p=>!recipeOf(p.id).length);
    else if(to.startsWith("cat_")) targets = MENU.filter(p=>p.cat===to.slice(4));
    else targets = MENU.filter(p=>String(p.id)===to.slice(4));
    targets = targets.filter(p=>String(p.id)!==String(from));
    if(!targets.length){ toast("ไม่มีเมนูปลายทาง","err"); return; }
    const srcName = (MENU.find(p=>String(p.id)===String(from))||{}).name||"";
    if(!await ask("คัดลอกสูตร",
      `คัดลอกสูตรของ "${srcName}" ไปยัง ${targets.length} เมนู\nสูตรเดิมของปลายทางจะถูกแทนที่`,
      {yes:"คัดลอก", safe:true})) return;
    targets.forEach(p=> REC[String(p.id)] = JSON.parse(JSON.stringify(src)));
    await saveConfig("recipes", `คัดลอกสูตรไป ${targets.length} เมนูแล้ว`);
    await logAct("recipe_copy", `${srcName} → ${targets.length} เมนู`);
    render(); return;
  }
  if(t.id==="onlyNoRec"){
    collectRec();
    recFilter = recFilter==="__norec" ? "" : "__norec";
    render(); return;
  }

  if(t.id==="menuSave"){
    collectMenu(); await saveConfig("menu","บันทึกเมนูแล้ว");
    await logAct("menu_edit","แก้เมนู/ราคา"); render(); return;
  }
  const del = t.closest("[data-del]");
  if(del){
    const i = +del.dataset.del, nm = MENU[i]?.name || "";
    if(!await ask("ลบเมนู",`ลบ "${nm}" ออกถาวร?`,{yes:"ลบ"})) return;
    collectMenu(); MENU.splice(i,1);
    await saveConfig("menu","ลบแล้ว"); await logAct("menu_delete", nm); render(); return;
  }
  if(t.id==="menuAdd"){
    collectMenu();
    const nm = $("#newName").value.trim();
    if(!nm){ toast("ใส่ชื่อเมนูก่อน","err"); return; }
    MENU.push({id:nextMenuId(), name:nm, price:parseFloat($("#newPrice").value)||0,
      cat:$("#newCat").value, active:true, track:false, stock:0});
    await saveConfig("menu",`เพิ่ม ${nm} แล้ว`); await logAct("menu_add", nm); render(); return;
  }

  const rtoggle = t.closest("[data-rtoggle]");
  if(rtoggle){
    collectRec();
    const k = rtoggle.dataset.rtoggle;
    recipeOpen[k] = !recipeOpen[k];
    render(); return;
  }

  const radd = t.closest("[data-radd]");
  if(radd){
    collectRec();
    const k = String(radd.dataset.radd);
    if(!REC[k]) REC[k] = [];
    REC[k].push({ing:"",qty:0}); render(); return;
  }
  const rdel = t.closest("[data-rdel]");
  if(rdel){
    collectRec();
    const [m,i] = rdel.dataset.rdel.split("_");
    REC[m].splice(+i,1); render(); return;
  }
  if(t.id==="recSave"){
    collectRec();
    for(const k in REC) REC[k] = REC[k].filter(x=>x.ing && x.qty>0);
    await saveConfig("recipes","บันทึกสูตรแล้ว");
    await logAct("recipe_edit","แก้สูตร/ต้นทุน"); render(); return;
  }

  const gc = t.closest("[data-gc]");
  if(gc && t.classList.contains("chip")){
    collectOpt();
    const arr = OPTG[+gc.dataset.gc].cats, c = gc.dataset.c;
    const i = arr.indexOf(c);
    if(i>=0) arr.splice(i,1); else arr.push(c);
    render(); return;
  }
  const gex = t.closest("[data-gex]");
  if(gex && t.classList.contains("chip")){
    collectOpt();
    const g = OPTG[+gex.dataset.gex];
    if(!g.excludeItems) g.excludeItems = [];
    const id = +gex.dataset.ei;
    const i = g.excludeItems.indexOf(id);
    if(i>=0) g.excludeItems.splice(i,1); else g.excludeItems.push(id);
    render(); return;
  }
  const oadd = t.closest("[data-oadd]");
  if(oadd){
    collectOpt();
    OPTG[+oadd.dataset.oadd].options.push({name:"ตัวเลือกใหม่",price:0,ing:"",iqty:0});
    render(); return;
  }
  const odel = t.closest("[data-odel]");
  if(odel){
    collectOpt();
    const [g,o] = odel.dataset.odel.split("_");
    OPTG[+g].options.splice(+o,1); render(); return;
  }
  const gdel = t.closest("[data-gdel]");
  if(gdel){
    const gi = +gdel.dataset.gdel, nm = OPTG[gi]?.name || "";
    if(!await ask("ลบกลุ่มตัวเลือก",`ลบ "${nm}" ?`,{yes:"ลบ"})) return;
    collectOpt(); OPTG.splice(gi,1);
    await saveConfig("optgroups","ลบแล้ว"); await logAct("option_delete", nm); render(); return;
  }
  if(t.id==="grpAdd"){
    collectOpt();
    OPTG.push({id:"g_"+Date.now(), name:"กลุ่มใหม่", type:"single", required:false, cats:[],
      options:[{name:"ตัวเลือก",price:0,ing:"",iqty:0}]});
    render(); return;
  }
  if(t.id==="optSave"){
    collectOpt(); await saveConfig("optgroups","บันทึกแล้ว");
    await logAct("option_edit","แก้กลุ่มตัวเลือก"); render(); return;
  }

  const ss = t.closest("[data-ssave]");
  if(ss){
    const row = ss.closest("[data-sid]");
    rpcStaff(row.dataset.sid,
      row.querySelector('[data-f="name"]').value.trim(),
      row.querySelector('[data-f="pin"]').value.replace(/\D/g,""),
      row.querySelector('[data-f="role"]').value,
      row.querySelector('[data-f="active"]').classList.contains("on"));
    return;
  }
  const sd = t.closest("[data-sdel]");
  if(sd){
    const s = STAFF.find(x=>x.id===sd.dataset.sdel);
    if(!await ask("ลบพนักงาน",`ลบ "${s?.name||""}" ออกจากระบบ?`,{yes:"ลบ"})) return;
    try{
      await rpc("delete_staff",{p_id:sd.dataset.sdel});
      toast("ลบแล้ว","ok"); await logAct("staff_delete", s?.name||"");
      await fetchStaff(); render();
    }catch(err){
      const m = (err.body||"").includes("แอดมิน") ? "ต้องมีแอดมินอย่างน้อย 1 คน" : friendly(err.status,err.body);
      toast(m,"err");
    }
    return;
  }
  if(t.id==="staffAdd"){
    const n = $("#stName").value.trim(), p = $("#stPin").value.replace(/\D/g,"");
    if(!n || p.length<4){ toast("ใส่ชื่อ และ PIN 4 หลักขึ้นไป","err"); return; }
    rpcStaff("", n, p, $("#stRole").value, true, `เพิ่ม ${n} แล้ว`); return;
  }

  if(t.id==="setSave"){
    SETTINGS.shopName = ($("#setShopName").value||"").trim() || "บ้านฟ้ากาแฟสด";
    SETTINGS.pp = ($("#setPP").value||"").replace(/\D/g,"");
    SETTINGS.cash_out_reasons = splitCsv($("#setCmOut").value);
    await saveConfig("settings","บันทึกแล้ว"); await logAct("settings","แก้ตั้งค่าร้าน");
    applyBranding(); render(); return;
  }
  if(t.id==="reloadAll"){
    await loadConfig(); await loadStock(); go(page);
    toast("โหลดข้อมูลใหม่แล้ว","ok"); return;
  }
  if(t.id==="backup"){ backup(); return; }
});

/* ================= เริ่มต้น ================= */
(async function init(){
  applyTheme(getTheme());
  $("#lgVer").textContent = `v${APP_VERSION}`;
  $("#foot").innerHTML = `Banfa Back Office<br>v${APP_VERSION}`;
  console.log(`Banfa Back Office v${APP_VERSION}`);
  token = store.get("tok"); refreshTok = store.get("rtok");
  setRange(0); renderDots();
  await signIn();
  await loadShopNameOnly();
  const me = store.get("me");
  if(me && me.id && me.role === "admin"){
    ME = me;
    $("#login").classList.remove("on");
    $("#whoAv").textContent = me.name.charAt(0).toUpperCase();
    $("#whoName").textContent = me.name;
    $("#whoRole").textContent = "แอดมิน";
    await loadConfig();
    applyBranding();
    await go("dash");
  }else{
    $("#login").classList.add("on");
  }
})();
