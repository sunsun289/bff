/* ================= ฟอร์มเริ่มต้น ================= */
function newTxnForm(){
  return {id:null, type:"expense", account:ACCOUNTS[0]?.id||"", category:"", amount:"", note:"", date:today()};
}
function newRecurForm(){
  return {id:null, name:"", account:ACCOUNTS[0]?.id||"", category:"", type:"expense",
    amount:"", interval_days:30, next_due:today(), note:""};
}
function collectTxnForm(){
  if(!TXN_FORM) return;
  TXN_FORM.date     = $("#tfDate")?.value || today();
  TXN_FORM.account  = $("#tfAccount")?.value || "";
  TXN_FORM.category = $("#tfCategory")?.value || "";
  TXN_FORM.amount   = $("#tfAmount")?.value || "";
  TXN_FORM.note     = $("#tfNote")?.value || "";
}
function collectRecurForm(){
  if(!RECUR_FORM) return;
  RECUR_FORM.name          = $("#rfName")?.value ?? RECUR_FORM.name;
  RECUR_FORM.account       = $("#rfAccount")?.value ?? RECUR_FORM.account;
  RECUR_FORM.category      = $("#rfCategory")?.value ?? RECUR_FORM.category;
  RECUR_FORM.amount        = $("#rfAmount")?.value ?? RECUR_FORM.amount;
  RECUR_FORM.interval_days = $("#rfInterval")?.value ?? RECUR_FORM.interval_days;
  RECUR_FORM.next_due      = $("#rfNextDue")?.value ?? RECUR_FORM.next_due;
  RECUR_FORM.note          = $("#rfNote")?.value ?? RECUR_FORM.note;
}

/* ================= หน้า: ภาพรวม ================= */
function pageDash(){
  const totalBal = BALANCES.filter(b=>b.active).reduce((s,b)=>s+(+b.balance||0),0);
  const totIncome = TXNS.filter(t=>t.type==="income").reduce((s,t)=>s+(+t.amount||0),0);
  const totExpense = TXNS.filter(t=>t.type==="expense").reduce((s,t)=>s+(+t.amount||0),0);
  const net = totIncome - totExpense;
  let h = `<div class="grid4">
    <div class="card kpi hero"><div class="k">ยอดคงเหลือรวมทุกบัญชี</div><div class="v">${baht(totalBal)}</div></div>
    <div class="card kpi"><div class="k">รายรับ (ช่วงที่เลือก)</div><div class="v" style="color:var(--good)">${baht(totIncome)}</div>
      <div class="s">${TXNS.filter(t=>t.type==="income").length} รายการ</div></div>
    <div class="card kpi"><div class="k">รายจ่าย (ช่วงที่เลือก)</div><div class="v" style="color:var(--bad)">${baht(totExpense)}</div>
      <div class="s">${TXNS.filter(t=>t.type==="expense").length} รายการ</div></div>
    <div class="card kpi"><div class="k">สุทธิ</div><div class="v ${net<0?"down":"up"}">${net>=0?"+":""}${baht(net)}</div></div>
  </div>`;

  h += `<div class="card"><h3>ยอดต่อบัญชี</h3>`;
  if(!BALANCES.length) h += `<div class="msg">ยังไม่มีบัญชี — ไปเพิ่มที่หน้า "ตั้งค่า" ก่อน</div>`;
  else BALANCES.filter(b=>b.active).forEach(b=>{
    h += `<div class="trow"><span>${esc(b.name)}</span><b class="${b.balance<0?"down":""}">${baht(b.balance)}</b></div>`;
  });
  h += `</div>`;

  h += `<div class="card"><h3>รายการล่าสุด<span class="sub">ในช่วงที่เลือก</span></h3>`;
  const recent = TXNS.slice(0,8);
  if(!recent.length) h += `<div class="msg">${esc(lastErr||"ยังไม่มีรายการในช่วงนี้")}</div>`;
  else recent.forEach(t=> h += txnRow(t));
  h += `</div>`;
  return h;
}

/* ================= หน้า: บันทึกรายการ ================= */
function txnRow(t){
  const a=findAcc(t.account_id), c=findCat(t.category_id);
  const sign = t.type==="income" ? "+" : "−";
  const cls  = t.type==="income" ? "up" : "down";
  return `<div class="brow" data-txn="${esc(t.id)}">
    <span class="tm">${new Date(t.occurred_at+"T00:00:00").toLocaleDateString("th-TH",{day:"numeric",month:"short"})}</span>
    <span class="it"><b>${esc(c?c.name:(t.type==="income"?"รายรับ":"รายจ่าย"))}</b>${t.note?` · ${esc(t.note)}`:""}
      <span class="by">${esc(a?a.name:"-")}</span></span>
    <span class="am ${cls}">${sign}${baht(t.amount)}</span>
    <button class="x" data-txnedit="${esc(t.id)}" title="แก้ไข">✎</button>
    <button class="x" data-txndel="${esc(t.id)}" title="ลบ">×</button></div>`;
}
function pageTxns(){
  if(!TXN_FORM) TXN_FORM = newTxnForm();
  const f = TXN_FORM;
  const cats = CATEGORIES.filter(c=>c.active && c.type===f.type);
  let h = `<div class="card"><h3>${f.id?"แก้ไขรายการ":"บันทึกรายการใหม่"}</h3>`;
  if(!ACCOUNTS.length){
    h += `<div class="msg err">ยังไม่มีบัญชี — ไปเพิ่มที่หน้า "ตั้งค่า" ก่อน</div></div>`;
    return h;
  }
  h += `<div class="addbar">
      <button class="chip-b${f.type==="expense"?" on":""}" data-tftype="expense">รายจ่าย</button>
      <button class="chip-b${f.type==="income"?" on":""}" data-tftype="income">รายรับ</button>
    </div>
    <div class="addbar" style="margin-top:12px">
      <input type="date" id="tfDate" value="${esc(f.date)}">
      <select id="tfAccount">${ACCOUNTS.filter(a=>a.active).map(a=>
        `<option value="${esc(a.id)}"${a.id===f.account?" selected":""}>${esc(a.name)}</option>`).join("")}</select>
      <select id="tfCategory"><option value="">— ไม่ระบุหมวด —</option>
        ${cats.map(c=>`<option value="${esc(c.id)}"${c.id===f.category?" selected":""}>${esc(c.name)}</option>`).join("")}</select>
      <input type="number" step="0.01" id="tfAmount" placeholder="จำนวนเงิน" style="width:130px" value="${esc(f.amount)}">
      <input class="f-name" id="tfNote" type="text" placeholder="หมายเหตุ (ไม่บังคับ)" value="${esc(f.note)}">
    </div>
    <div class="addbar" style="margin-top:14px">
      <button class="btn primary" id="tfSave">${f.id?"บันทึกการแก้ไข":"บันทึกรายการ"}</button>
      ${f.id?`<button class="btn ghost" id="tfCancel">ยกเลิกแก้ไข</button>`:`<button class="btn ghost" id="tfClear">ล้างฟอร์ม</button>`}
    </div></div>`;

  h += `<div class="card"><h3>รายการ<span class="sub">${TXNS.length} รายการ ในช่วงที่เลือก</span>
      <button class="btn ghost sm" id="txnCsvBtn">ส่งออก CSV</button></h3>`;
  if(!TXNS.length) h += `<div class="msg">${esc(lastErr||"ไม่มีรายการในช่วงนี้")}</div>`;
  else h += TXNS.map(txnRow).join("");
  h += `</div>`;
  return h;
}
async function saveTxn(){
  if(busy) return;
  collectTxnForm();
  const f = TXN_FORM;
  if(!f.account){ toast("เลือกบัญชีก่อน","err"); return; }
  const amt = parseFloat(f.amount);
  if(!amt || amt<=0){ toast("ใส่จำนวนเงินให้ถูกต้อง","err"); return; }
  busy = true;
  const btn = $("#tfSave"); if(btn){ btn.disabled=true; btn.textContent="กำลังบันทึก…"; }
  try{
    if(f.id){
      const r = await api(`/rest/v1/fin_transactions?id=eq.${encodeURIComponent(f.id)}`,{
        method:"PATCH", extraHeaders:{Prefer:"return=minimal"},
        body:JSON.stringify({account_id:f.account, category_id:f.category||null, type:f.type,
          amount:n2(amt), note:f.note||null, occurred_at:f.date})});
      if(!r.ok) throw {status:r.status, body:await r.text()};
      toast("แก้ไขรายการแล้ว","ok");
    }else{
      /* กันบันทึกซ้ำถ้ากดซ้ำ/network timeout (C4 pattern) — ใช้ client_id เดิมถ้ายังไม่เคลียร์ */
      if(!txnClientId) txnClientId = newClientId();
      const r = await api(`/rest/v1/fin_transactions?on_conflict=client_id`,{
        method:"POST", extraHeaders:{Prefer:"resolution=merge-duplicates,return=minimal"},
        body:JSON.stringify({client_id:txnClientId, account_id:f.account, category_id:f.category||null,
          type:f.type, amount:n2(amt), note:f.note||null, occurred_at:f.date})});
      if(!r.ok) throw {status:r.status, body:await r.text()};
      toast("บันทึกรายการแล้ว","ok");
      txnClientId = null;
    }
    TXN_FORM = newTxnForm();
    await loadAll(); await loadTxns(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
  finally{ busy=false; const b=$("#tfSave"); if(b){ b.disabled=false; } }
}
function editTxn(id){
  const t = TXNS.find(x=>x.id===id); if(!t) return;
  TXN_FORM = {id:t.id, type:t.type, account:t.account_id, category:t.category_id||"",
    amount:String(t.amount), note:t.note||"", date:t.occurred_at};
  render();
}
async function deleteTxn(id){
  const t = TXNS.find(x=>x.id===id); if(!t) return;
  if(!await ask("ลบรายการ", `ลบรายการนี้ถาวร?\n${baht(t.amount)}`, {yes:"ลบ"})) return;
  try{
    const r = await api(`/rest/v1/fin_transactions?id=eq.${encodeURIComponent(id)}`,
      {method:"DELETE", extraHeaders:{Prefer:"return=minimal"}});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    toast("ลบแล้ว","ok");
    if(TXN_FORM?.id===id) TXN_FORM = newTxnForm();
    await loadAll(); await loadTxns(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
}
function exportTxnsCSV(){
  if(!TXNS.length){ toast("ไม่มีข้อมูลให้ส่งออก","err"); return; }
  const rows = TXNS.map(t=>{
    const a=findAcc(t.account_id), c=findCat(t.category_id);
    return [t.occurred_at, t.type==="income"?"รายรับ":"รายจ่าย", c?c.name:"-", a?a.name:"-", t.amount, t.note||""];
  });
  csvDownload(`banfa_รายรับรายจ่าย_${$("#from").value}_${$("#to").value}.csv`,
    ["วันที่","ประเภท","หมวดหมู่","บัญชี","จำนวนเงิน","หมายเหตุ"], rows);
  toast(`ส่งออก ${TXNS.length} รายการแล้ว`,"ok");
}

/* ================= หน้า: รายการประจำ ================= */
function pageRecurring(){
  if(!RECUR_FORM) RECUR_FORM = newRecurForm();
  const f = RECUR_FORM;
  const cats = CATEGORIES.filter(c=>c.active && c.type===f.type);
  let h = `<div class="card"><h3>${f.id?"แก้ไขรายการประจำ":"ตั้งรายการประจำใหม่"}
      <span class="sub">ถึงกำหนดเมื่อไหร่ ระบบจะสร้างรายการจริงให้อัตโนมัติตอนเปิดแอป</span></h3>`;
  if(!ACCOUNTS.length){
    h += `<div class="msg err">ยังไม่มีบัญชี — ไปเพิ่มที่หน้า "ตั้งค่า" ก่อน</div></div>`;
    return h;
  }
  h += `<div class="addbar">
      <button class="chip-b${f.type==="expense"?" on":""}" data-rftype="expense">รายจ่าย</button>
      <button class="chip-b${f.type==="income"?" on":""}" data-rftype="income">รายรับ</button>
    </div>
    <div class="addbar" style="margin-top:12px">
      <input class="f-name" id="rfName" type="text" placeholder="ชื่อรายการ เช่น ค่าเช่าร้าน" value="${esc(f.name)}">
      <select id="rfAccount">${ACCOUNTS.filter(a=>a.active).map(a=>
        `<option value="${esc(a.id)}"${a.id===f.account?" selected":""}>${esc(a.name)}</option>`).join("")}</select>
      <select id="rfCategory"><option value="">— ไม่ระบุหมวด —</option>
        ${cats.map(c=>`<option value="${esc(c.id)}"${c.id===f.category?" selected":""}>${esc(c.name)}</option>`).join("")}</select>
    </div>
    <div class="addbar" style="margin-top:10px">
      <input type="number" step="0.01" id="rfAmount" placeholder="จำนวนเงิน" style="width:130px" value="${esc(f.amount)}">
      <span class="info">ทุก</span>
      <input type="number" step="1" min="1" id="rfInterval" style="width:70px" value="${esc(f.interval_days)}">
      <span class="info">วัน เริ่มวันที่</span>
      <input type="date" id="rfNextDue" value="${esc(f.next_due)}">
      <input class="f-name" id="rfNote" type="text" placeholder="หมายเหตุ (ไม่บังคับ)" value="${esc(f.note)}">
    </div>
    <div class="addbar" style="margin-top:14px">
      <button class="btn primary" id="rfSave">${f.id?"บันทึกการแก้ไข":"เพิ่มรายการประจำ"}</button>
      ${f.id?`<button class="btn ghost" id="rfCancel">ยกเลิกแก้ไข</button>`:""}
    </div></div>`;

  h += `<div class="card"><h3>รายการประจำทั้งหมด<span class="sub">${RECURRING.length} รายการ</span></h3>`;
  if(!RECURRING.length) h += `<div class="msg">ยังไม่มีรายการประจำ</div>`;
  else h += RECURRING.map(r=>{
    const a=findAcc(r.account_id), c=findCat(r.category_id);
    const due = new Date(r.next_due+"T00:00:00").toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"2-digit"});
    return `<div class="trow" data-rec="${esc(r.id)}">
      <span><b>${esc(r.name)}</b><br><span class="by">${esc(a?a.name:"-")}${c?` · ${esc(c.name)}`:""} ·
        ทุก ${r.interval_days} วัน · ครั้งถัดไป ${due}${r.active?"":" · ปิดใช้งานอยู่"}</span></span>
      <span style="display:flex;align-items:center;gap:10px">
        <b class="${r.type==="income"?"up":"down"}">${r.type==="income"?"+":"−"}${baht(r.amount)}</b>
        <span class="sw${r.active?" on":""}" data-rectoggle="${esc(r.id)}" title="${r.active?"ปิดใช้งาน":"เปิดใช้งาน"}"></span>
        <button class="x" data-recedit="${esc(r.id)}" title="แก้ไข">✎</button>
        <button class="x" data-recdel="${esc(r.id)}" title="ลบ">×</button></span></div>`;
  }).join("");
  h += `</div>`;
  return h;
}
async function saveRecur(){
  if(busy) return;
  collectRecurForm();
  const f = RECUR_FORM;
  f.name = (f.name||"").trim();
  const amt = parseFloat(f.amount), days = parseInt(f.interval_days,10);
  if(!f.name){ toast("ใส่ชื่อรายการก่อน","err"); return; }
  if(!f.account){ toast("เลือกบัญชีก่อน","err"); return; }
  if(!amt || amt<=0){ toast("ใส่จำนวนเงินให้ถูกต้อง","err"); return; }
  if(!days || days<=0){ toast("ใส่จำนวนวันให้ถูกต้อง","err"); return; }
  busy = true;
  try{
    const payload = {name:f.name, account_id:f.account, category_id:f.category||null, type:f.type,
      amount:n2(amt), interval_days:days, next_due:f.next_due, note:f.note||null};
    const r = f.id
      ? await api(`/rest/v1/fin_recurring?id=eq.${encodeURIComponent(f.id)}`,
          {method:"PATCH", extraHeaders:{Prefer:"return=minimal"}, body:JSON.stringify(payload)})
      : await api(`/rest/v1/fin_recurring`,
          {method:"POST", extraHeaders:{Prefer:"return=minimal"}, body:JSON.stringify(payload)});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    toast(f.id?"แก้ไขแล้ว":"เพิ่มรายการประจำแล้ว","ok");
    RECUR_FORM = newRecurForm();
    await loadAll(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
  finally{ busy=false; }
}
function editRecur(id){
  const r = RECURRING.find(x=>x.id===id); if(!r) return;
  RECUR_FORM = {id:r.id, name:r.name, account:r.account_id, category:r.category_id||"", type:r.type,
    amount:String(r.amount), interval_days:r.interval_days, next_due:r.next_due, note:r.note||""};
  render();
}
async function toggleRecur(id){
  const r = RECURRING.find(x=>x.id===id); if(!r) return;
  try{
    const resp = await api(`/rest/v1/fin_recurring?id=eq.${encodeURIComponent(id)}`,
      {method:"PATCH", extraHeaders:{Prefer:"return=minimal"}, body:JSON.stringify({active:!r.active})});
    if(!resp.ok) throw {status:resp.status, body:await resp.text()};
    await loadAll(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
}
async function deleteRecur(id){
  const r = RECURRING.find(x=>x.id===id); if(!r) return;
  if(!await ask("ลบรายการประจำ", `ลบ "${r.name}" ? (รายการที่เคยสร้างไปแล้วจะยังอยู่ ไม่ถูกลบตาม)`, {yes:"ลบ"})) return;
  try{
    const resp = await api(`/rest/v1/fin_recurring?id=eq.${encodeURIComponent(id)}`,
      {method:"DELETE", extraHeaders:{Prefer:"return=minimal"}});
    if(!resp.ok) throw {status:resp.status, body:await resp.text()};
    toast("ลบแล้ว","ok");
    if(RECUR_FORM?.id===id) RECUR_FORM = newRecurForm();
    await loadAll(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
}

/* ================= หน้า: รายงาน ================= */
function pageReports(){
  const totIncome = TXNS.filter(t=>t.type==="income").reduce((s,t)=>s+(+t.amount||0),0);
  const totExpense = TXNS.filter(t=>t.type==="expense").reduce((s,t)=>s+(+t.amount||0),0);
  const net = totIncome - totExpense;
  let h = `<div class="grid4">
    <div class="card kpi"><div class="k">รายรับ</div><div class="v" style="color:var(--good)">${baht(totIncome)}</div></div>
    <div class="card kpi"><div class="k">รายจ่าย</div><div class="v" style="color:var(--bad)">${baht(totExpense)}</div></div>
    <div class="card kpi hero"><div class="k">สุทธิ</div><div class="v ${net<0?"down":"up"}">${net>=0?"+":""}${baht(net)}</div></div>
    <div class="card kpi"><div class="k">จำนวนรายการ</div><div class="v">${TXNS.length}</div></div>
  </div>`;

  /* แนวโน้มรายวัน */
  const byDay = {};
  TXNS.forEach(t=>{ (byDay[t.occurred_at] ||= {income:0,expense:0})[t.type] += +t.amount||0; });
  const days = Object.keys(byDay).sort();
  if(days.length){
    const incMap={}, expMap={};
    days.forEach(d=>{ incMap[d]=byDay[d].income; expMap[d]=byDay[d].expense; });
    const labels = days.map(d=> new Date(d+"T00:00:00").toLocaleDateString("th-TH",{day:"numeric",month:"short"}));
    h += `<div class="card"><h3>รายรับตามวัน</h3>${barChart(incMap, days, labels, "var(--good)")}</div>`;
    h += `<div class="card"><h3>รายจ่ายตามวัน</h3>${barChart(expMap, days, labels, "var(--bad)")}</div>`;
  }

  /* แยกตามหมวดหมู่ (รายจ่าย) */
  const byCat = {};
  TXNS.filter(t=>t.type==="expense").forEach(t=>{
    const key = t.category_id || "__none";
    byCat[key] = (byCat[key]||0) + (+t.amount||0);
  });
  const catIds = Object.keys(byCat).sort((a,b)=>byCat[b]-byCat[a]);
  h += `<div class="card"><h3>รายจ่ายแยกตามหมวดหมู่</h3>`;
  if(!catIds.length) h += `<div class="msg">ไม่มีรายจ่ายในช่วงนี้</div>`;
  else catIds.forEach(id=>{
    const c = id==="__none" ? null : findCat(id);
    const pct = totExpense ? Math.round(byCat[id]/totExpense*100) : 0;
    h += `<div class="trow"><span>${esc(c?c.name:"ไม่ระบุหมวด")}</span>
      <b>${baht(byCat[id])} <span class="by">(${pct}%)</span></b></div>`;
  });
  h += `</div>`;

  h += `<div class="card"><h3>ยอดคงเหลือต่อบัญชี</h3>`;
  if(!BALANCES.length) h += `<div class="msg">ยังไม่มีบัญชี</div>`;
  else BALANCES.filter(b=>b.active).forEach(b=>{
    h += `<div class="trow"><span>${esc(b.name)}</span><b class="${b.balance<0?"down":""}">${baht(b.balance)}</b></div>`;
  });
  h += `</div>`;
  return h;
}

/* ================= หน้า: ตั้งค่า (บัญชี + หมวดหมู่) ================= */
function catRows(type){
  return CATEGORIES.filter(c=>c.type===type).map(c=>`<div class="row" data-cat="${esc(c.id)}">
    <input class="f-name" type="text" data-f="name" value="${esc(c.name)}">
    <span class="sw${c.active?" on":""}" data-cattoggle="${esc(c.id)}" title="${c.active?"ปิดใช้งาน":"เปิดใช้งาน"}"></span>
    <button class="x" data-catdel="${esc(c.id)}" title="ลบ">×</button></div>`).join("");
}
function whiRows(){
  return WH_ITEMS.map(it=>{
    const low = it.active && it.low_qty>0 && it.qty_on_hand<=it.low_qty;
    return `<div class="row" data-whi="${esc(it.id)}">
      <input class="f-name" type="text" data-f="name" value="${esc(it.name)}">
      <input class="f-num" style="width:70px" type="text" data-f="unit" value="${esc(it.unit)}">
      <span class="info">ต้นทุน/หน่วย</span>
      <input class="f-num" style="width:90px" type="number" step="0.01" data-f="cost" value="${it.cost}">
      <span class="info">เตือนต่ำกว่า</span>
      <input class="f-num" style="width:80px" type="number" step="0.01" data-f="low_qty" value="${it.low_qty}">
      <span class="info">คงเหลือ <b class="${low?"neg":""}">${qtyStr(it.qty_on_hand)} ${esc(it.unit)}</b></span>
      <span class="sw${it.active?" on":""}" data-whitoggle="${esc(it.id)}" title="${it.active?"ปิดใช้งาน":"เปิดใช้งาน"}"></span>
      <button class="x" data-whidel="${esc(it.id)}" title="ลบ">×</button></div>`;
  }).join("");
}
function pageWhSettings(){
  let h = `<div class="card"><h3>รายการของในคลัง<button class="btn primary sm" id="whiSave">บันทึก</button></h3>`;
  h += whiRows() || `<div class="msg">ยังไม่มีรายการของ — เพิ่มด้านล่าง</div>`;
  h += `<div class="addbar">
    <input class="f-name" id="whiName" type="text" placeholder="ชื่อของใหม่ เช่น เมล็ดกาแฟ, แก้วเย็น 16oz">
    <input id="whiUnit" type="text" placeholder="หน่วย เช่น ถุง,ลัง,ชิ้น" style="width:110px">
    <input id="whiCost" type="number" step="0.01" placeholder="ต้นทุน/หน่วย" style="width:110px">
    <input id="whiLow" type="number" step="0.01" placeholder="เตือนเมื่อต่ำกว่า" style="width:130px">
    <button class="btn dark" id="whiAdd">+ เพิ่มของ</button></div></div>`;
  return h;
}
function pageSettings(){
  let h = `<div class="card"><h3>บัญชี/กระเป๋าเงิน<button class="btn primary sm" id="accSave">บันทึก</button></h3>`;
  if(!ACCOUNTS.length) h += `<div class="msg">ยังไม่มีบัญชี — เพิ่มด้านล่าง</div>`;
  for(const a of ACCOUNTS){
    h += `<div class="row" data-acc="${esc(a.id)}">
      <input class="f-name" type="text" data-f="name" value="${esc(a.name)}">
      <span class="info">ยอดยกมา</span>
      <input class="f-num" style="width:110px" type="number" step="0.01" data-f="opening_balance" value="${a.opening_balance}">
      <span class="info">ยอดปัจจุบัน <b class="${accBal(a.id)<0?"neg":""}">${baht(accBal(a.id))}</b></span>
      <span class="sw${a.active?" on":""}" data-acctoggle="${esc(a.id)}" title="${a.active?"ปิดใช้งาน":"เปิดใช้งาน"}"></span>
      <button class="x" data-accdel="${esc(a.id)}" title="ลบ">×</button></div>`;
  }
  h += `<div class="addbar">
    <input class="f-name" id="naName" type="text" placeholder="ชื่อบัญชีใหม่ เช่น เงินสด, ธนาคารกสิกร">
    <input id="naOpen" type="number" step="0.01" placeholder="ยอดยกมา" style="width:130px">
    <button class="btn dark" id="accAdd">+ เพิ่มบัญชี</button></div></div>`;

  h += `<div class="card" id="catExpCard"><h3>หมวดหมู่รายจ่าย<button class="btn primary sm" id="catExpSave">บันทึก</button></h3>`;
  h += catRows("expense") || `<div class="msg">ยังไม่มีหมวดหมู่</div>`;
  h += `<div class="addbar"><input class="f-name" id="ncExpName" type="text" placeholder="ชื่อหมวดใหม่">
    <button class="btn dark" id="catExpAdd">+ เพิ่มหมวด</button></div></div>`;

  h += `<div class="card" id="catIncCard"><h3>หมวดหมู่รายรับ<button class="btn primary sm" id="catIncSave">บันทึก</button></h3>`;
  h += catRows("income") || `<div class="msg">ยังไม่มีหมวดหมู่</div>`;
  h += `<div class="addbar"><input class="f-name" id="ncIncName" type="text" placeholder="ชื่อหมวดใหม่">
    <button class="btn dark" id="catIncAdd">+ เพิ่มหมวด</button></div></div>`;
  return h;
}
async function saveAccounts(){
  if(busy) return; busy=true;
  const rows = $$("#page .row[data-acc]").map(row=>{
    const g = f => row.querySelector(`[data-f="${f}"]`)?.value ?? "";
    return {id:row.dataset.acc, name:g("name").trim(), opening_balance:parseFloat(g("opening_balance"))||0};
  });
  try{
    const r = await api("/rest/v1/fin_accounts?on_conflict=id",{method:"POST",
      extraHeaders:{Prefer:"resolution=merge-duplicates,return=minimal"}, body:JSON.stringify(rows)});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    toast("บันทึกบัญชีแล้ว","ok");
    await loadAll(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
  finally{ busy=false; }
}
async function addAccount(){
  const nm = $("#naName")?.value.trim();
  if(!nm){ toast("ใส่ชื่อบัญชีก่อน","err"); return; }
  const open = parseFloat($("#naOpen")?.value)||0;
  try{
    const r = await api("/rest/v1/fin_accounts",{method:"POST", extraHeaders:{Prefer:"return=minimal"},
      body:JSON.stringify([{name:nm, opening_balance:open}])});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    toast(`เพิ่ม ${nm} แล้ว`,"ok");
    await loadAll(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
}
async function toggleAccount(id){
  const a = findAcc(id); if(!a) return;
  try{
    const r = await api(`/rest/v1/fin_accounts?id=eq.${encodeURIComponent(id)}`,
      {method:"PATCH", extraHeaders:{Prefer:"return=minimal"}, body:JSON.stringify({active:!a.active})});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    await loadAll(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
}
async function deleteAccount(id){
  const a = findAcc(id); if(!a) return;
  if(!await ask("ลบบัญชี", `ลบ "${a.name}" ? ลบไม่ได้ถ้ายังมีรายการผูกอยู่กับบัญชีนี้`, {yes:"ลบ"})) return;
  try{
    const r = await api(`/rest/v1/fin_accounts?id=eq.${encodeURIComponent(id)}`,
      {method:"DELETE", extraHeaders:{Prefer:"return=minimal"}});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    toast("ลบแล้ว","ok");
    await loadAll(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
}
async function saveCategories(type){
  if(busy) return; busy=true;
  const scope = type==="expense" ? "#catExpCard" : "#catIncCard";
  const rows = $$(`${scope} .row[data-cat]`).map(row=>{
    const g = f => row.querySelector(`[data-f="${f}"]`)?.value ?? "";
    return {id:row.dataset.cat, name:g("name").trim(), type};
  });
  try{
    const r = await api("/rest/v1/fin_categories?on_conflict=id",{method:"POST",
      extraHeaders:{Prefer:"resolution=merge-duplicates,return=minimal"}, body:JSON.stringify(rows)});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    toast("บันทึกหมวดหมู่แล้ว","ok");
    await loadAll(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
  finally{ busy=false; }
}
async function addCategory(type){
  const el = type==="expense" ? $("#ncExpName") : $("#ncIncName");
  const nm = el?.value.trim();
  if(!nm){ toast("ใส่ชื่อหมวดก่อน","err"); return; }
  try{
    const r = await api("/rest/v1/fin_categories",{method:"POST", extraHeaders:{Prefer:"return=minimal"},
      body:JSON.stringify([{name:nm, type}])});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    toast(`เพิ่ม ${nm} แล้ว`,"ok");
    await loadAll(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
}
async function toggleCategory(id){
  const c = findCat(id); if(!c) return;
  try{
    const r = await api(`/rest/v1/fin_categories?id=eq.${encodeURIComponent(id)}`,
      {method:"PATCH", extraHeaders:{Prefer:"return=minimal"}, body:JSON.stringify({active:!c.active})});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    await loadAll(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
}
async function deleteCategory(id){
  const c = findCat(id); if(!c) return;
  if(!await ask("ลบหมวดหมู่", `ลบ "${c.name}" ? ลบไม่ได้ถ้ายังมีรายการผูกอยู่กับหมวดนี้`, {yes:"ลบ"})) return;
  try{
    const r = await api(`/rest/v1/fin_categories?id=eq.${encodeURIComponent(id)}`,
      {method:"DELETE", extraHeaders:{Prefer:"return=minimal"}});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    toast("ลบแล้ว","ok");
    await loadAll(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
}

/* ================= คลังหลังร้าน: คงเหลือ (ดูอย่างเดียว ดูง่าย — ไปเพิ่ม/แก้รายการของที่หน้า "ตั้งค่า") ================= */
/* คนละตารางกับ ingredients/stock_docs ของ POS เดิมทั้งหมด — ไม่แตะระบบขายหน้าร้าน/หลังบ้านร้านกาแฟเลย */
function pageWhItems(){
  const lowItems = WH_ITEMS.filter(i=>i.active && i.low_qty>0 && i.qty_on_hand<=i.low_qty);
  let h = "";
  if(lowItems.length){
    h += `<div class="card" style="border-color:var(--bad)"><h3 style="color:var(--bad)">ของใกล้หมด (${lowItems.length})</h3>`;
    lowItems.forEach(i=> h += `<div class="trow"><span>${esc(i.name)}</span><b class="down">${qtyStr(i.qty_on_hand)} ${esc(i.unit)}</b></div>`);
    h += `</div>`;
  }
  const activeItems = WH_ITEMS.filter(i=>i.active);
  h += `<div class="card"><h3>คงเหลือในคลัง<span class="sub">${activeItems.length} รายการ</span></h3>`;
  if(!activeItems.length) h += `<div class="msg">ยังไม่มีรายการของ — ไปเพิ่มที่หน้า "ตั้งค่า" ก่อน</div>`;
  else{
    h += `<div class="stk head"><span class="nm">ชื่อ</span><span class="num">คงเหลือ</span></div>`;
    activeItems.forEach(it=>{
      const low = it.low_qty>0 && it.qty_on_hand<=it.low_qty;
      h += `<div class="stk"><span class="nm">${esc(it.name)}</span>
        <span class="num${low?" warn":""}">${qtyStr(it.qty_on_hand)} <span class="u">${esc(it.unit)}</span></span></div>`;
    });
  }
  h += `</div>`;
  return h;
}
async function saveWhItems(){
  if(busy) return; busy=true;
  const rows = $$("#page .row[data-whi]").map(row=>{
    const g = f => row.querySelector(`[data-f="${f}"]`)?.value ?? "";
    return {id:row.dataset.whi, name:g("name").trim(), unit:g("unit").trim()||"ชิ้น",
      cost:parseFloat(g("cost"))||0, low_qty:parseFloat(g("low_qty"))||0};
  });
  try{
    const r = await api("/rest/v1/wh_items?on_conflict=id",{method:"POST",
      extraHeaders:{Prefer:"resolution=merge-duplicates,return=minimal"}, body:JSON.stringify(rows)});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    toast("บันทึกแล้ว","ok");
    await loadAll(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
  finally{ busy=false; }
}
async function addWhItem(){
  const nm = $("#whiName")?.value.trim();
  if(!nm){ toast("ใส่ชื่อของก่อน","err"); return; }
  const unit = $("#whiUnit")?.value.trim() || "ชิ้น";
  const cost = parseFloat($("#whiCost")?.value)||0;
  const low  = parseFloat($("#whiLow")?.value)||0;
  try{
    const r = await api("/rest/v1/wh_items",{method:"POST", extraHeaders:{Prefer:"return=minimal"},
      body:JSON.stringify([{name:nm, unit, cost, low_qty:low}])});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    toast(`เพิ่ม ${nm} แล้ว`,"ok");
    await loadAll(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
}
async function toggleWhItem(id){
  const it = findWhItem(id); if(!it) return;
  try{
    const r = await api(`/rest/v1/wh_items?id=eq.${encodeURIComponent(id)}`,
      {method:"PATCH", extraHeaders:{Prefer:"return=minimal"}, body:JSON.stringify({active:!it.active})});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    await loadAll(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
}
async function deleteWhItem(id){
  const it = findWhItem(id); if(!it) return;
  if(!await ask("ลบรายการของ", `ลบ "${it.name}" ? ลบไม่ได้ถ้ายังมีประวัติเคลื่อนไหวผูกอยู่`, {yes:"ลบ"})) return;
  try{
    const r = await api(`/rest/v1/wh_items?id=eq.${encodeURIComponent(id)}`,
      {method:"DELETE", extraHeaders:{Prefer:"return=minimal"}});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    toast("ลบแล้ว","ok");
    await loadAll(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
}

/* ================= คลังหลังร้าน: รับเข้า/จ่ายออก ================= */
function newWhMoveForm(){
  return {id:null, type:"in", item:WH_ITEMS.find(i=>i.active)?.id||"", qty:"", cost:"", dest:"", note:"", date:today()};
}
function collectWhMoveForm(){
  if(!WHM_FORM) return;
  WHM_FORM.date = $("#wmDate")?.value || today();
  WHM_FORM.item = $("#wmItem")?.value || "";
  WHM_FORM.qty  = $("#wmQty")?.value || "";
  WHM_FORM.cost = $("#wmCost")?.value ?? WHM_FORM.cost;
  WHM_FORM.dest = $("#wmDest")?.value || "";
  WHM_FORM.note = $("#wmNote")?.value || "";
}
function whMoveRow(m){
  const it = findWhItem(m.item_id);
  const sign = m.type==="in" ? "+" : "−";
  const cls  = m.type==="in" ? "up" : "down";
  return `<div class="brow" data-whm="${esc(m.id)}">
    <span class="tm">${new Date(m.occurred_at+"T00:00:00").toLocaleDateString("th-TH",{day:"numeric",month:"short"})}</span>
    <span class="it"><b>${esc(it?it.name:"-")}</b>${m.dest?` · ${esc(m.dest)}`:""}${m.note?` · ${esc(m.note)}`:""}
      <span class="by">${esc(it?it.unit:"")}</span></span>
    <span class="am ${cls}">${sign}${qtyStr(m.qty)}</span>
    <button class="x" data-whmedit="${esc(m.id)}" title="แก้ไข">✎</button>
    <button class="x" data-whmdel="${esc(m.id)}" title="ลบ">×</button></div>`;
}
function pageWhMoves(){
  if(!WHM_FORM) WHM_FORM = newWhMoveForm();
  const f = WHM_FORM;
  let h = `<div class="card"><h3>${f.id?"แก้ไขรายการ":"บันทึกรับเข้า/จ่ายออก"}</h3>`;
  if(!WH_ITEMS.filter(i=>i.active).length){
    h += `<div class="msg err">ยังไม่มีรายการของ — ไปเพิ่มที่หน้า "รายการของ" ก่อน</div></div>`;
    return h;
  }
  h += `<div class="addbar">
      <button class="chip-b${f.type==="in"?" on":""}" data-wmtype="in">รับเข้า</button>
      <button class="chip-b${f.type==="out"?" on":""}" data-wmtype="out">จ่ายออก</button>
    </div>
    <div class="addbar" style="margin-top:12px">
      <input type="date" id="wmDate" value="${esc(f.date)}">
      <select id="wmItem">${WH_ITEMS.filter(i=>i.active).map(i=>
        `<option value="${esc(i.id)}"${i.id===f.item?" selected":""}>${esc(i.name)} (${esc(i.unit)})</option>`).join("")}</select>
      <input type="number" step="0.01" id="wmQty" placeholder="จำนวน" style="width:100px" value="${esc(f.qty)}">
      <input type="number" step="0.01" id="wmCost" placeholder="ต้นทุน/หน่วย (เว้นว่าง=ใช้ค่าล่าสุด)" style="width:190px" value="${esc(f.cost)}">
    </div>
    <div class="addbar" style="margin-top:10px">
      <input class="f-name" id="wmDest" type="text" placeholder="${f.type==="in"?"รับจากไหน (ไม่บังคับ)":"ส่งไปร้านไหน (ไม่บังคับ)"}" value="${esc(f.dest)}">
      <input class="f-name" id="wmNote" type="text" placeholder="หมายเหตุ (ไม่บังคับ)" value="${esc(f.note)}">
    </div>
    <div class="addbar" style="margin-top:14px">
      <button class="btn primary" id="wmSave">${f.id?"บันทึกการแก้ไข":"บันทึกรายการ"}</button>
      ${f.id?`<button class="btn ghost" id="wmCancel">ยกเลิกแก้ไข</button>`:`<button class="btn ghost" id="wmClear">ล้างฟอร์ม</button>`}
    </div></div>`;

  h += `<div class="card"><h3>ประวัติเคลื่อนไหว<span class="sub">${WH_MOVES.length} รายการ ในช่วงที่เลือก</span>
      <button class="btn ghost sm" id="whmCsvBtn">ส่งออก CSV</button></h3>`;
  if(!WH_MOVES.length) h += `<div class="msg">${esc(lastErr||"ไม่มีรายการในช่วงนี้")}</div>`;
  else h += WH_MOVES.map(whMoveRow).join("");
  h += `</div>`;
  return h;
}
async function saveWhMove(){
  if(busy) return;
  collectWhMoveForm();
  const f = WHM_FORM;
  if(!f.item){ toast("เลือกรายการของก่อน","err"); return; }
  const qtyVal = parseFloat(f.qty);
  if(!qtyVal || qtyVal<=0){ toast("ใส่จำนวนให้ถูกต้อง","err"); return; }
  const it = findWhItem(f.item);
  const costVal = (f.cost===""||f.cost==null) ? (it?.cost||0) : (parseFloat(f.cost)||0);
  busy = true;
  const btn = $("#wmSave"); if(btn){ btn.disabled=true; btn.textContent="กำลังบันทึก…"; }
  try{
    if(f.id){
      const r = await api(`/rest/v1/wh_moves?id=eq.${encodeURIComponent(f.id)}`,{
        method:"PATCH", extraHeaders:{Prefer:"return=minimal"},
        body:JSON.stringify({item_id:f.item, type:f.type, qty:n2(qtyVal), cost:n2(costVal),
          dest:f.dest||null, note:f.note||null, occurred_at:f.date})});
      if(!r.ok) throw {status:r.status, body:await r.text()};
      toast("แก้ไขรายการแล้ว","ok");
    }else{
      /* กันบันทึกซ้ำถ้ากดซ้ำ/network timeout (pattern เดียวกับ txn/stock) */
      if(!whmClientId) whmClientId = newClientId();
      const r = await api(`/rest/v1/wh_moves?on_conflict=client_id`,{
        method:"POST", extraHeaders:{Prefer:"resolution=merge-duplicates,return=minimal"},
        body:JSON.stringify({client_id:whmClientId, item_id:f.item, type:f.type, qty:n2(qtyVal), cost:n2(costVal),
          dest:f.dest||null, note:f.note||null, occurred_at:f.date})});
      if(!r.ok) throw {status:r.status, body:await r.text()};
      toast("บันทึกรายการแล้ว","ok");
      whmClientId = null;
    }
    WHM_FORM = newWhMoveForm();
    await loadAll(); await loadWhMoves(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
  finally{ busy=false; const b=$("#wmSave"); if(b){ b.disabled=false; } }
}
function editWhMove(id){
  const m = WH_MOVES.find(x=>x.id===id); if(!m) return;
  WHM_FORM = {id:m.id, type:m.type, item:m.item_id, qty:String(m.qty), cost:String(m.cost),
    dest:m.dest||"", note:m.note||"", date:m.occurred_at};
  render();
}
async function deleteWhMove(id){
  const m = WH_MOVES.find(x=>x.id===id); if(!m) return;
  if(!await ask("ลบรายการ", "ลบรายการนี้ถาวร?", {yes:"ลบ"})) return;
  try{
    const r = await api(`/rest/v1/wh_moves?id=eq.${encodeURIComponent(id)}`,
      {method:"DELETE", extraHeaders:{Prefer:"return=minimal"}});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    toast("ลบแล้ว","ok");
    if(WHM_FORM?.id===id) WHM_FORM = newWhMoveForm();
    await loadAll(); await loadWhMoves(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
}
function exportWhMovesCSV(){
  if(!WH_MOVES.length){ toast("ไม่มีข้อมูลให้ส่งออก","err"); return; }
  const rows = WH_MOVES.map(m=>{
    const it = findWhItem(m.item_id);
    return [m.occurred_at, m.type==="in"?"รับเข้า":"จ่ายออก", it?it.name:"-", m.qty, it?it.unit:"", m.cost, m.dest||"", m.note||""];
  });
  csvDownload(`banfa_คลังหลังร้าน_${$("#from").value}_${$("#to").value}.csv`,
    ["วันที่","ประเภท","รายการของ","จำนวน","หน่วย","ต้นทุน/หน่วย","ปลายทาง/แหล่งที่มา","หมายเหตุ"], rows);
  toast(`ส่งออก ${WH_MOVES.length} รายการแล้ว`,"ok");
}
