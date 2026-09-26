/* ================= หน้า: ภาพรวมสต็อก ================= */
function pageStock(){
  if(!STOCK.length) return `<div class="card"><div class="msg err">${esc(lastErr||"ยังไม่มีวัตถุดิบ — ตรวจว่ารัน schema-stock.sql แล้ว")}</div></div>`;
  /* ระบบคลังกลาง (wh) แยกออกไปเป็นระบบต่างหากแล้ว (2026.09) — หน้านี้เหลือแค่ยอดหน้าร้านเท่านั้น */
  let h0 = `<div class="card" style="border-color:var(--brand-soft);background:var(--brand-soft)">
    <div style="font-size:var(--fs-3);color:var(--brand-ink);line-height:1.6">
      <b>ยอดหน้าร้านคำนวณสดจากเอกสารทั้งหมดทุกครั้ง</b> (รับเข้า+นับสต็อก+ยอดขายจริงจากบิล) —
      ไม่ได้อ่านจากตัวเลขสะสมเก่าที่อาจคลาดเคลื่อนอีกต่อไป กด "↻ รีเฟรชยอด" เพื่อคำนวณใหม่ล่าสุดได้ทุกเมื่อ</div></div>`;
  const val = STOCK.reduce((a,x)=>a+(+x.value_total||0),0);
  const lowF = STOCK.filter(x=>x.low_front_flag).length;
  const negF = STOCK.filter(x=>+x.qty_front<0);
  let h = `<div class="grid4">
    <div class="card kpi"><div class="k">มูลค่าสต็อกรวม</div><div class="v" style="font-size:24px">${baht(val)}</div>
      <div class="s">${STOCK.length} รายการ</div></div>
    <div class="card kpi"><div class="k">ใกล้หมด</div><div class="v ${lowF?"down":"up"}">${lowF}</div></div>
    <div class="card kpi"><div class="k">ติดลบ</div><div class="v ${negF.length?"down":"up"}">${negF.length}</div>
      <div class="s">${negF.length?"ยอดใช้เกินที่มีจริง — ดูด้านล่าง":"ไม่มี"}</div></div></div>`;

  /* แจ้งเตือนติดลบแยกจากที่อื่นชัดเจน — ไม่ต้องไล่หาเองในตารางยาวๆ */
  if(negF.length){
    h += `<div class="card" style="border-color:var(--bad);background:var(--bad-soft)">
      <h3 style="border:none;padding:0;margin-bottom:8px">
        <span style="color:var(--bad)">⚠ สต็อกติดลบ ${negF.length} รายการ</span></h3>
      <div style="font-size:12.5px;color:var(--ink-2);margin-bottom:10px;line-height:1.6">
        แปลว่าตัดออกมากกว่าที่เคยรับเข้า+นับไว้ — มักเกิดจากสูตรตัดเกินจริง หรือลืมบันทึกรับของเข้าหน้าร้าน
        ดูสาเหตุที่หน้า <b>การใช้ &amp; ของหาย</b> แล้วแก้ด้วยการ <b>นับสต็อกจริง</b> เพื่อรีเซ็ตยอดให้ตรง</div>
      ${negF.map(x=>`<div class="trow"><span>${esc(x.name)}</span>
        <b style="color:var(--bad)">${qty(x.qty_front,x.unit)}</b></div>`).join("")}
    </div>`;
  }

  h = h0 + h; h += `<div class="card"><h3>ยอดคงเหลือหน้าร้าน
    <button class="btn ghost sm" id="stockRefresh">↻ รีเฟรชยอด</button></h3>
    <div class="stk head"><span class="nm">วัตถุดิบ</span><span class="u">หน่วย</span>
      <span class="num">หน้าร้าน</span><span class="num">มูลค่า</span></div>`;
  for(const x of STOCK){
    const showBuy = !!(x.disp_buy && x.buy_unit);
    const dQty = showBuy ? (x.qty_front/(+x.buy_factor||1)) : x.qty_front;
    const dUnit = showBuy ? x.buy_unit : x.unit;
    h += `<div class="stk"><span class="nm">${esc(x.name)}
      ${x.low_front_flag?`<span class="pill bad">ใกล้หมด</span>`:""}</span>
      <span class="u">${esc(dUnit)}</span>
      <span class="num${x.low_front_flag?" warn":""}" data-l="หน้าร้าน">${qty(dQty)}</span>
      <span class="num" data-l="มูลค่า">${baht(x.value_total)}</span></div>`;
  }
  h += `</div><div class="card"><h3>ข้อมูลวัตถุดิบ
    <span class="sub">ชื่อ · หน่วยใช้ · ทุน/หน่วย · เตือนใกล้หมด · หน่วยซื้อ · ตัวคูณ · หน่วยแสดงยอดคงเหลือ</span>
    <button class="btn primary sm" id="ingSave">บันทึก</button></h3>`;
  for(const x of STOCK){
    h += `<div class="row" data-ing="${esc(x.id)}">
      <input class="f-name" type="text" data-f="name" value="${esc(x.name)}">
      <input class="f-unit" type="text" data-f="unit" value="${esc(x.unit)}">
      <input class="f-num" type="number" step="0.001" data-f="cost" value="${x.cost}">
      <input class="f-num" type="number" step="0.01" data-f="low_front" value="${x.low_front}">
      <input class="f-unit" type="text" data-f="buy_unit" value="${esc(x.buy_unit||"")}" placeholder="ลัง">
      <input class="f-num" type="number" step="0.01" data-f="buy_factor" value="${x.buy_factor||1}">
      <label style="display:flex;align-items:center;gap:5px;font-size:var(--fs-2);color:var(--ink-2);white-space:nowrap">
        <input type="checkbox" data-f="disp_buy" ${x.disp_buy?"checked":""}>โชว์เป็นหน่วยซื้อ</label>
      <button class="x" data-ingdel="${esc(x.id)}" title="ลบ">×</button></div>`;
  }
  h += `<div class="addbar">
    <input class="f-name" id="niName" type="text" placeholder="ชื่อวัตถุดิบใหม่">
    <input id="niUnit" type="text" placeholder="หน่วย (g/ml/ใบ)" style="width:150px">
    <input id="niCost" type="number" step="0.001" placeholder="ทุน/หน่วย" style="width:130px">
    <button class="btn dark" id="ingAdd">+ เพิ่มวัตถุดิบ</button></div></div>`;
  return h;
}

/* ================= หน้า: รับของเข้าหน้าร้าน ================= */
/* ระบบคลังกลาง (รับเข้าคลัง / จ่ายออกจากคลังไปหน้าร้านหรือที่อื่น) แยกออกไปเป็นระบบต่างหากแล้ว
   (2026.09) — เว็บนี้เหลือแค่ "รับของเข้าหน้าร้าน" ตรงๆ จุดเดียว ของที่มาจากคลังกลาง/ซื้อมาให้บันทึก
   รับเข้าที่นี่ เอกสารคลังเก่า (receive→wh, transfer, issue) ที่เคยบันทึกไว้ยังอยู่ในประวัติเหมือนเดิม
   แค่จากนี้ไปหน้านี้ไม่สร้างเอกสารประเภทนั้นอีก */
const BUY_UNIT_DEFAULT = new Set(["receive"]);   /* นับเป็นหน่วยเติมสต็อก (ลัง/แพ็ค) เป็นค่าเริ่มต้น — คนหยิบของจริงนับแบบนี้ */
function newDocLine(type){
  return {ing:"", qty:"", cost:"", buy: BUY_UNIT_DEFAULT.has(type)};
}
const DOC = {
  receive: {title:"รับของเข้าหน้าร้าน", from:null, btn:"บันทึกรับของเข้าหน้าร้าน", cost:true}
};
const lineQty  = ln => { const g=findIng(ln.ing); if(!g) return 0; const q=+ln.qty||0; return ln.buy ? q*(+g.buy_factor||1) : q; };
const lineCost = ln => { const g=findIng(ln.ing); if(!g) return 0; const c=parseFloat(ln.cost);
  if(isNaN(c)) return +g.cost||0; return ln.buy ? c/(+g.buy_factor||1) : c; };

function pageDoc(type){
  const cfg = DOC[type];
  if(!docLines.length) docLines=[newDocLine(type)];
  let total=0;

  let h = `<div class="card"><h3>${cfg.title}</h3>`;
  h += `<div class="addbar">
    <input class="f-name" id="docNote" type="text" placeholder="หมายเหตุ (ไม่บังคับ)"></div>
    <div style="margin-top:14px">
    <div class="dline" style="border-bottom:2px solid var(--line);font-weight:600;color:var(--ink-3);font-size:11.5px">
      <span style="min-width:196px">วัตถุดิบ</span><span class="q">จำนวน</span><span style="width:110px">หน่วย</span>
      <span class="c">ราคา/หน่วย</span><span class="amt">รวม</span>
      <span style="width:32px"></span></div>`;
  docLines.forEach((ln,i)=>{
    const g = findIng(ln.ing);
    const use = lineQty(ln), amt = use*lineCost(ln);
    total += amt;
    h += `<div class="dline" data-ln="${i}">
      <select data-f="ing"><option value="">— เลือกวัตถุดิบ —</option>
        ${STOCK.map(x=>`<option value="${esc(x.id)}"${x.id===ln.ing?" selected":""}>${esc(x.name)}</option>`).join("")}</select>
      <input class="q" type="number" step="0.01" data-f="qty" value="${esc(ln.qty)}" placeholder="0">`;
    h += g?.buy_unit
      ? `<select data-f="buy" style="min-width:auto;width:110px">
           <option value="0"${!ln.buy?" selected":""}>${esc(g.unit)}</option>
           <option value="1"${ln.buy?" selected":""}>${esc(g.buy_unit)}</option></select>`
      : `<span style="width:110px;color:var(--ink-3);font-size:13px">${esc(g?.unit||"—")}</span>`;
    h += `<input class="c" type="number" step="0.001" data-f="cost" value="${esc(ln.cost)}" placeholder="${g?g.cost:0}">
         <span class="amt">${baht(amt)}</span>`;
    h += `<button class="x" data-lndel="${i}">×</button></div>`;
  });
  h += `</div><div class="addbar"><button class="btn ghost" id="lnAdd">+ เพิ่มรายการ</button></div>`;
  h += `<div class="doc-total"><span style="font-weight:600">รวมทั้งสิ้น</span><span class="v">${baht(total)}</span></div>`;
  h += `<div class="addbar" style="margin-top:16px">
    <button class="btn primary" id="docSave" data-type="${type}">${cfg.btn}</button>
    <button class="btn ghost" id="docClear">ล้างรายการ</button></div></div>
    <div class="card"><h3>เอกสารล่าสุด</h3><div id="recentDocs">${skeletonList(3)}</div></div>`;
  return h;
}
function collectDoc(){
  $$("#page .dline[data-ln]").forEach(row=>{
    const i = +row.dataset.ln;
    if(!docLines[i]) return;
    docLines[i].ing  = row.querySelector('[data-f="ing"]')?.value || "";
    docLines[i].qty  = row.querySelector('[data-f="qty"]')?.value || "";
    docLines[i].cost = row.querySelector('[data-f="cost"]')?.value || "";
    docLines[i].buy  = row.querySelector('[data-f="buy"]')?.value === "1";
  });
}
function exportMovesCSV(){
  if(!moveList.length){ toast("ไม่มีข้อมูลให้ส่งออก","err"); return; }
  const rows = moveList.map(m=>{
    const g = findIng(m.ingredient_id);
    return [new Date(m.created_at).toLocaleString("th-TH"), MOVE_TH[m.type]||m.type,
      g?g.name:m.ingredient_id, qty(m.qty, g?g.unit:""),
      locName(m.from_location), locName(m.to_location), m.recipient||"", m.doc_id||"", m.actor||""];
  });
  csvDownload(`banfa_เคลื่อนไหวสต็อก_${$("#from").value}_${$("#to").value}.csv`,
    ["วันเวลา","ประเภท","วัตถุดิบ","จำนวน","จาก","ไป","ผู้รับ","เอกสาร","ผู้ทำ"], rows);
  toast(`ส่งออก ${moveList.length} รายการแล้ว`,"ok");
}
async function loadRecentDocs(type){
  try{
    const list = await apiJson(`/rest/v1/stock_docs?select=*&type=eq.${type}&order=created_at.desc&limit=10`);
    const el = $("#recentDocs"); if(!el) return;
    if(!list.length){ el.innerHTML = `<div class="msg">ยังไม่มีเอกสาร</div>`; return; }
    /* ดึงรายการวัตถุดิบจริงของแต่ละเอกสารมาโชว์ด้วย — แค่รหัสเอกสารอ่านไม่ออกว่ารับอะไรเข้ามา */
    let movesByDoc = {};
    try{
      const ids = list.map(d=>encodeURIComponent(d.id)).join(",");
      const moves = await apiJson(`/rest/v1/stock_moves?select=doc_id,ingredient_id,qty&doc_id=in.(${ids})`);
      moves.forEach(m=>{ (movesByDoc[m.doc_id] ||= []).push(m); });
    }catch(e){ console.warn("โหลดรายการวัตถุดิบของเอกสารไม่สำเร็จ:", e); }
    el.innerHTML = list.map(d=>{
      const ml = movesByDoc[d.id] || [];
      const itemsTxt = ml.map(m=>{ const g = findIng(m.ingredient_id);
        return `${esc(g?g.name:m.ingredient_id)} ${qty(m.qty, g?g.unit:"")}`; }).join(", ") || `${d.lines} รายการ`;
      return `<div class="brow">
      <span class="tm">${new Date(d.created_at).toLocaleDateString("th-TH",{day:"numeric",month:"short"})}</span>
      <span class="it">${esc(itemsTxt)}
        <span class="by">${esc(d.actor||"-")}${d.supplier?` · ${esc(d.supplier)}`:""}${d.recipient?` · ให้ ${esc(d.recipient)}`:""}</span></span>
      <span class="am">${+d.total_cost?baht(d.total_cost):""}</span></div>`;
    }).join("");
  }catch{}
}

/* ================= หน้า: นับสต็อกจริง ================= */
function pageCount(){
  if(!STOCK.length) return `<div class="card"><div class="msg err">ยังไม่มีวัตถุดิบ</div></div>`;
  let h = `<div class="card"><h3>นับสต็อกจริงแล้วปรับยอด (หน้าร้าน)<span class="sub">กรอกเฉพาะรายการที่นับ — เว้นว่าง = ไม่แตะ</span></h3>
    <div class="addbar">
      <input class="f-name" id="ctNote" type="text" placeholder="หมายเหตุ เช่น นับสิ้นเดือน"></div>
    <div class="lbl">ระบบบันทึกส่วนต่างเป็นประวัติ ตรวจย้อนหลังได้</div>
    <div class="stk head"><span class="nm">วัตถุดิบ</span><span class="u">หน่วย</span>
      <span class="num">ในระบบ</span><span class="num">นับได้จริง</span><span class="num">ส่วนต่าง</span></div>`;
  for(const x of STOCK){
    /* วัตถุดิบแต่ละตัวนับถนัดคนละหน่วย — บางอย่างนับเป็นลัง/แพ็ค (หน่วยซื้อ) บางอย่างนับเป็น g/ml (หน่วยใช้)
       เก็บสต็อกจริงเป็นหน่วยใช้เสมอ (usage unit) แต่ให้เลือกหน่วยตอนกรอกได้ต่อวัตถุดิบ แล้วแปลงกลับตอนคำนวณ/บันทึก */
    const buyOk = !!x.buy_unit;
    const useBuy = buyOk && (countUnitBuy[x.id] ?? true);
    const factor = +x.buy_factor || 1;
    const cur = +x.qty_front;
    const curDisp = useBuy ? cur/factor : cur;
    const val = counted[x.id];
    const d = (val===undefined||val==="") ? null : (parseFloat(val)-curDisp);
    const cls = d===null?"flat":d<0?"down":d>0?"":"up";
    h += `<div class="stk" data-ct="${esc(x.id)}" data-factor="${factor}" data-usebuy="${useBuy?1:0}">
      <span class="nm">${esc(x.name)}</span>
      <span class="u ctu-wrap">${buyOk
        ? `<select class="ctu-sel" data-f="ctu">
             <option value="0"${!useBuy?" selected":""}>${esc(x.unit)}</option>
             <option value="1"${useBuy?" selected":""}>${esc(x.buy_unit)}</option></select>`
        : esc(x.unit)}</span>
      <span class="num" data-l="ในระบบ">${qty(curDisp)}</span>
      <span class="num" data-l="นับได้จริง"><input type="number" step="0.01" data-f="cnt"
        value="${esc(val ?? "")}" placeholder="—" style="width:100px"></span>
      <span class="num ${cls}" data-l="ส่วนต่าง" data-diff>${d===null?"—":(d>0?"+":"")+qty(d)}</span></div>`;
  }
  return h + `<div class="addbar" style="margin-top:16px">
    <button class="btn primary" id="ctSave">บันทึกการนับ</button>
    <button class="btn ghost" id="ctClear">ล้างที่กรอก</button></div></div>`;
}

/* ================= หน้า: การใช้ & ของหาย ================= */
let moveList=[];
async function fetchMoves(limit=5000){
  const R=range();
  try{
    moveList = await apiJson(`/rest/v1/stock_moves?select=*&created_at=gte.${encodeURIComponent(R.from)}`
      +`&created_at=lt.${encodeURIComponent(R.to)}&order=created_at.desc&limit=${limit}`);
    return true;
  }catch(e){ moveList=[]; lastErr=friendly(e.status,e.body); return false; }
}
/* ยอด "ใช้ไปกับการขาย" คำนวณจากบิลจริง (สูตร + ตัวเลือกที่ผูกวัตถุดิบ) โดยตรง
   ไม่อ่านจาก stock_moves ประเภท sale อีกแล้ว — เพราะ POS เลิกตัดสต็อกตอนขายไปแล้ว
   (เดิมอ่านจาก stock_moves ได้ เพราะ POS เคยยิง RPC สร้างแถวนี้ทุกครั้งที่ขาย) */
let soldFromBills = {};
async function fetchSoldFromBills(){
  const R = range();
  soldFromBills = {};
  try{
    const list = await fetchRawRange(R.from, R.to, 5000);
    for(const o of list){
      if(o.status==="void") continue;
      for(const it of (o.items||[])){
        recipeAt(it).forEach(r=>{ soldFromBills[r.ing]=(soldFromBills[r.ing]||0)+r.qty*(+it.qty||0); });
        /* ตัวเลือกเก็บแค่ "ชื่อ" ในบิล — ย้อนหาว่าผูกวัตถุดิบอะไรจากกลุ่มตัวเลือกปัจจุบัน (ใช้หมวดช่วยแยกด้วย) */
        const cat = MENU.find(m=>m.id===it.id)?.cat;
        (it.options||[]).forEach(opt=>{
          const o2 = optIngIqty(opt, cat);
          if(o2 && o2.ing) soldFromBills[o2.ing]=(soldFromBills[o2.ing]||0)+o2.iqty*(+it.qty||0);
        });
      }
    }
    return true;
  }catch(e){ lastErr=friendly(e.status,e.body); return false; }
}
function pageUsage(){
  const agg={};
  for(const m of moveList){
    const a = agg[m.ingredient_id] ||= {recv:0,tr:0,iss:0,sold:0,adj:0};
    const q = +m.qty||0;
    if(m.type==="receive") a.recv+=q; else if(m.type==="transfer") a.tr+=q;
    else if(m.type==="issue") a.iss+=q;
    else if(m.type==="adjust") a.adj+=q;
    /* type==="sale" ไม่นับจาก stock_moves อีกแล้ว — ดูด้านล่างแทน */
  }
  for(const ing in soldFromBills){
    (agg[ing] ||= {recv:0,tr:0,iss:0,sold:0,adj:0}).sold = soldFromBills[ing];
  }
  let totBuy=0, totSold=0, totIssue=0, totLoss=0;
  const ids = Object.keys(agg).filter(id=>findIng(id));
  for(const id of ids){
    const g=findIng(id), a=agg[id], c=+g.cost||0;
    totBuy+=a.recv*c; totSold+=a.sold*c; totIssue+=a.iss*c;
    if(a.adj<0) totLoss += -a.adj*c;
  }
  let h = `<div class="grid4">
    <div class="card kpi"><div class="k">ซื้อเข้าคลัง</div><div class="v" style="font-size:23px">${baht(totBuy)}</div></div>
    <div class="card kpi"><div class="k">ใช้ไปกับการขาย</div><div class="v" style="font-size:23px">${baht(totSold)}</div></div>
    <div class="card kpi"><div class="k">จ่ายออกจากคลัง</div><div class="v" style="font-size:23px">${baht(totIssue)}</div>
      <div class="s">ให้สาขาอื่น</div></div>
    <div class="card kpi"><div class="k">ของขาดจากการนับ</div>
      <div class="v ${totLoss?"down":"up"}" style="font-size:23px">${baht(totLoss)}</div></div></div>`;
  h += `<div class="card"><h3>แยกรายวัตถุดิบ<span class="sub">ในช่วงที่เลือก</span></h3>
    <div class="stk head"><span class="nm">วัตถุดิบ</span><span class="num">ซื้อเข้า</span><span class="num">เบิกหน้าร้าน</span>
      <span class="num">จ่ายออก</span><span class="num">ขายไป</span><span class="num">ปรับยอด</span><span class="num">ต้นทุนที่ขาย</span></div>`;
  if(!ids.length) h += `<div class="msg">${esc(lastErr||"ไม่มีการเคลื่อนไหวในช่วงนี้")}</div>`;
  ids.sort((a,b)=>(agg[b].sold*(findIng(b)?.cost||0))-(agg[a].sold*(findIng(a)?.cost||0)));
  for(const id of ids){
    const g=findIng(id), a=agg[id], c=+g.cost||0;
    h += `<div class="stk"><span class="nm">${esc(g.name)} <span class="by">${esc(g.unit)}</span></span>
      <span class="num" data-l="ซื้อเข้า">${a.recv?qty(a.recv):"—"}</span>
      <span class="num" data-l="เบิกหน้าร้าน">${a.tr?qty(a.tr):"—"}</span>
      <span class="num" data-l="จ่ายออก">${a.iss?qty(a.iss):"—"}</span>
      <span class="num" data-l="ขายไป">${a.sold?qty(a.sold):"—"}</span>
      <span class="num ${a.adj<0?"down":a.adj>0?"":"flat"}" data-l="ปรับยอด">${a.adj?(a.adj>0?"+":"")+qty(a.adj):"—"}</span>
      <span class="num" data-l="ต้นทุนที่ขาย">${baht(a.sold*c)}</span></div>`;
  }
  return h + `</div>`;
}

/* ================= หน้า: ประวัติเคลื่อนไหว ================= */
function pageMoves(){
  const byType={};
  moveList.forEach(m=> byType[m.type]=(byType[m.type]||0)+1);
  let h = `<div class="grid4">${["receive","transfer","issue","sale"].map(k=>
    `<div class="card kpi"><div class="k">${MOVE_TH[k]}</div><div class="v">${byType[k]||0}</div>
      <div class="s">รายการ</div></div>`).join("")}</div>`;

  /* สรุปจ่ายออกแยกตามผู้รับ — ตอบ "ของไปไหนรวมเท่าไร" โดยไม่ต้องไล่อ่านทีละบรรทัด */
  const byRecipient = {};
  moveList.forEach(m=>{
    if(m.type!=="issue" || !m.recipient) return;
    const g = findIng(m.ingredient_id);
    byRecipient[m.recipient] = (byRecipient[m.recipient]||0) + m.qty*(g?.cost||0);
  });
  const recipients = Object.keys(byRecipient).sort((a,b)=>byRecipient[b]-byRecipient[a]);
  if(recipients.length){
    h += `<div class="card"><h3>จ่ายออกแยกตามผู้รับ<span class="sub">ในช่วงที่เลือก</span></h3>`;
    h += recipients.map(r=>`<div class="trow"><span>${esc(r)}</span><b>${baht(byRecipient[r])}</b></div>`).join("");
    h += `</div>`;
  }

  h += `<div class="card"><h3>ประวัติเคลื่อนไหว<span class="sub">${moveList.length} รายการ</span></h3>
    <div class="addbar" style="margin:-8px 0 14px"><button class="btn ghost sm" id="movesCsvBtn">ส่งออก CSV</button></div>`;
  h += moveList.length ? moveList.slice(0,500).map(m=>{
    const g = findIng(m.ingredient_id);
    return `<div class="brow">
      <span class="tm">${new Date(m.created_at).toLocaleString("th-TH",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
      <span class="it"><b>${esc(g?g.name:m.ingredient_id)}</b>
        ${m.recipient?`<span class="pill warn">ให้ ${esc(m.recipient)}</span>`:""}
        <span class="by">${MOVE_TH[m.type]||m.type} · ${locName(m.from_location)} → ${locName(m.to_location)}
        ${m.doc_id?` · ${esc(m.doc_id)}`:""} · ${esc(m.actor||"-")}</span></span>
      <span class="am">${qty(m.qty, g?g.unit:"")}</span></div>`;
  }).join("") : `<div class="msg">${esc(lastErr||"ไม่มีการเคลื่อนไหวในช่วงนี้")}</div>`;
  return h + `</div>`;
}


async function saveIngredients(){
  if(busy) return; busy=true;
  const rows = $$("#page .row[data-ing]").map(row=>{
    const g = f => row.querySelector(`[data-f="${f}"]`)?.value ?? "";
    return {id:row.dataset.ing, name:g("name").trim(), unit:g("unit").trim()||"g",
      cost:parseFloat(g("cost"))||0, low_front:parseFloat(g("low_front"))||0,
      buy_unit:g("buy_unit").trim()||null,
      buy_factor:parseFloat(g("buy_factor"))||1,
      disp_buy: !!row.querySelector('[data-f="disp_buy"]')?.checked};
  });
  setSync("busy","กำลังบันทึก…");
  try{
    const r = await api("/rest/v1/ingredients?on_conflict=id",{method:"POST",
      extraHeaders:{Prefer:"resolution=merge-duplicates,return=minimal"}, body:JSON.stringify(rows)});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    setSync("ok","พร้อม"); toast("บันทึกวัตถุดิบแล้ว","ok");
    await logAct("ing_edit","แก้ข้อมูลวัตถุดิบ");
    await loadStock(); render();
  }catch(e){ setSync("bad","ผิดพลาด"); toast(friendly(e.status,e.body),"err"); }
  finally{ busy=false; }
}
async function postDoc(type){
  if(busy) return;
  collectDoc();
  const cfg = DOC[type];

  const lines = docLines.filter(l=>l.ing && lineQty(l)>0)
    .map(l=>({ingredient_id:l.ing, qty:n2(lineQty(l)), unit_cost:lineCost(l)}));
  if(!lines.length){ toast("ยังไม่มีรายการที่กรอกครบ","err"); return; }
  const note = $("#docNote")?.value.trim() || "";

  busy = true;
  const btn = $("#docSave"); if(btn){ btn.disabled=true; btn.textContent="กำลังบันทึก…"; }
  /* กันเอกสารซ้ำถ้า network timeout แล้วกดบันทึกซ้ำ (C4) — ใช้ client_id เดิมถ้ายังไม่เคลียร์
     (แปลว่าครั้งก่อนอาจส่งไม่สำเร็จ/ไม่รู้ผล) ไม่สร้างใหม่ทุกครั้งที่กด */
  if(!docClientId) docClientId = newClientId();
  try{
    /* จุดหมายเดียวตายตัวแล้ว — รับเข้าหน้าร้านตรงๆ (p_from=null, p_to="front") */
    const doc = await rpc("post_stock_doc",{p_type:type, p_from:null, p_to:"front",
      p_actor:ME?.name||"-", p_lines:lines,
      p_supplier:null, p_recipient:null,
      p_note:note||null, p_ref:null, p_client_id:docClientId});

    await logAct("stock_"+type, `${doc} · ${lines.length} รายการ`);
    toast(`บันทึกแล้ว เลขที่ ${doc}`,"ok");
    docLines = [newDocLine(type)]; docClientId = null;
    await loadStock(); render(); loadRecentDocs(type);
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
  finally{ busy=false; const b=$("#docSave"); if(b){ b.disabled=false; b.textContent=cfg.btn; } }
}
async function saveCount(){
  if(busy) return;
  $$("#page .stk[data-ct]").forEach(row=>{
    const el = row.querySelector('[data-f="cnt"]');
    if(el) counted[row.dataset.ct] = el.value;
  });
  const raw = Object.entries(counted).filter(([,v])=>v!==undefined && v!=="");
  if(!raw.length){ toast("ยังไม่ได้กรอกยอดที่นับได้ หรือยอดเท่าเดิมไม่มีอะไรต้องปรับ","err"); return; }
  /* คำนวณส่วนต่างเองจากค่า "ในระบบ" ที่จอแสดง (คำนวณสดแล้ว ถูกต้องแน่นอน) — ส่งส่วนต่างไปตรงๆ
     ไม่ส่งยอดนับดิบให้ SQL ไปเดาเอง เพราะฐานข้อมูลไม่มีทางรู้ยอดที่หักยอดขายไปแล้วแบบที่จอเห็น */
  /* ค่าที่กรอกอาจเป็นหน่วยซื้อ (ลัง/แพ็ค) หรือหน่วยใช้ (g/ml) แล้วแต่ที่เลือกไว้ต่อวัตถุดิบ (countUnitBuy)
     ต้องแปลงกลับเป็นหน่วยใช้เสมอก่อนคำนวณส่วนต่าง เพราะยอดในระบบ/RPC ทำงานเป็นหน่วยใช้ล้วนๆ */
  const buildLines = () => raw.map(([id,v])=>{
      const g = findIng(id);
      const factor = +(g?.buy_factor)||1;
      const useBuy = !!(g?.buy_unit) && (countUnitBuy[id] ?? true);
      const cur = g ? +g.qty_front : 0;
      const enteredUsage = useBuy ? (parseFloat(v)||0)*factor : (parseFloat(v)||0);
      return {ingredient_id:id, diff:n2(enteredUsage-cur)};
    }).filter(l=>l.diff!==0);
  const preview = buildLines();
  if(!preview.length){ toast("ยังไม่ได้กรอกยอดที่นับได้ หรือยอดเท่าเดิมไม่มีอะไรต้องปรับ","err"); return; }
  const ok = await ask("ยืนยันการนับสต็อก",
    `ปรับยอด ${preview.length} รายการที่หน้าร้าน — บันทึกแล้วแก้ไม่ได้ (แต่ดูประวัติได้)`,
    {yes:"บันทึก", safe:true});
  if(!ok) return;
  busy = true;
  /* กันเอกสารนับสต็อกซ้ำถ้า network timeout แล้วกดบันทึกซ้ำ (C4) — ใช้ client_id เดิมถ้ายังไม่เคลียร์ */
  if(!countClientId) countClientId = newClientId();
  try{
    /* คำนวณยอด "ในระบบ" ใหม่อีกครั้งตอนบันทึกจริง ไม่ใช้ค่าที่แคชไว้ตอนเปิดหน้า —
       กันเคสมีรับของ/เบิก/จ่ายออก/ขาย/นับสต็อกจากเครื่องอื่นเข้ามาระหว่างหน้านี้เปิดค้างอยู่
       (ยิ่งเปิดหน้าทิ้งไว้นาน ยิ่งเสี่ยงส่วนต่างเพี้ยนถ้าไม่รีเฟรชก่อนส่งจริง) */
    await loadStock(true);
    const lines = buildLines();
    if(!lines.length){
      toast("ยอดในระบบเปลี่ยนไปหลังคำนวณสดใหม่ล่าสุด — ไม่มีส่วนต่างแล้ว ไม่ต้องบันทึก","ok");
      counted = {}; countClientId = null; render();
      return;
    }
    const doc = await rpc("set_stock_count",{p_location:countLoc, p_actor:ME?.name||"-",
      p_lines:lines, p_note:$("#ctNote")?.value.trim()||null, p_client_id:countClientId});
    await logAct("stock_count", `${doc} · ${lines.length} รายการ`);
    toast(`บันทึกการนับแล้ว เลขที่ ${doc}`,"ok");
    counted = {}; countClientId = null;
    await loadStock(true); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
  finally{ busy=false; }
}
