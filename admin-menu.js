/* ================= หน้า: เมนู & ราคา ================= */
const nextMenuId = () => MENU.reduce((m,p)=>Math.max(m,p.id),0)+1;
function catSelect(sel){
  return `<select class="f-cat" data-f="cat">${CATS.map(c=>
    `<option value="${c.id}"${c.id===sel?" selected":""}>${c.th}</option>`).join("")}</select>`;
}
let menuFilter="", menuCat="all";
function pageMenu(){
  const q = menuFilter.trim().toLowerCase();
  const list = MENU.filter(p =>
    (menuCat==="all" || p.cat===menuCat) &&
    (!q || p.name.toLowerCase().includes(q)));

  let h = `<div class="card"><h3>เมนู &amp; ราคา
    <span class="sub">${list.length}${list.length!==MENU.length?` จาก ${MENU.length}`:""} รายการ</span>
    <button class="btn primary sm" id="menuSave">บันทึก</button></h3>

    <div class="addbar" style="margin-top:0">
      <input class="f-name" id="menuSearch" type="text" placeholder="ค้นหาเมนู…" value="${esc(menuFilter)}" style="text-align:left">
    </div>
    <div class="chips">
      <button class="chip${menuCat==="all"?" on":""}" data-mcat="all">ทั้งหมด</button>
      ${CATS.map(c=>`<button class="chip${menuCat===c.id?" on":""}" data-mcat="${c.id}">${c.th}
        <span class="by">${MENU.filter(p=>p.cat===c.id).length}</span></button>`).join("")}
    </div>`;

  /* แก้ราคาทั้งหมวดพร้อมกัน */
  if(menuCat!=="all" && list.length){
    h += `<div class="box" style="margin-top:12px"><div class="bh">
      <b style="font-size:13px">แก้ราคาทั้งหมวด (${list.length} เมนู)</b>
      <select id="bulkMode" style="width:130px">
        <option value="add">บวกเพิ่ม</option>
        <option value="sub">ลดลง</option>
        <option value="set">ตั้งเป็น</option>
      </select>
      <input class="f-num" id="bulkVal" type="number" placeholder="บาท">
      <button class="btn ghost sm" id="bulkPrice">ใช้กับทั้งหมวด</button></div></div>`;
  }

  if(!list.length){
    h += `<div class="msg">${MENU.length?"ไม่พบเมนูที่ค้นหา":"ยังไม่มีเมนู — เพิ่มด้านล่างได้เลย"}</div>`;
  }else{
    const groups = menuCat==="all" ? CATS.map(c=>[c.th, list.filter(p=>p.cat===c.id)]) : [["", list]];
    for(const [title, items] of groups){
      if(!items.length) continue;
      if(title) h += `<div class="lbl">${title}</div>`;
      for(const p of items){
        const i = MENU.indexOf(p), cost = menuCost(p.id), pf = p.price-cost;
        h += `<div class="row" data-i="${i}">
          <input class="f-name" type="text" data-f="name" value="${esc(p.name)}">
          <input class="f-num" type="number" data-f="price" value="${p.price}">
          ${catSelect(p.cat)}
          <span class="info">ทุน ${baht(cost)} · กำไร <b class="${pf<0?"neg":""}">${baht(pf)}</b></span>
          <div class="sw${p.active!==false?" on":""}" data-f="active" title="พร้อมขาย"></div>
          <button class="btn ghost sm" data-dup="${i}" title="ทำสำเนา">สำเนา</button>
          <button class="x" data-del="${i}" title="ลบ">×</button></div>`;
      }
    }
  }

  /* เพิ่มทีละรายการ */
  h += `<div class="lbl">เพิ่มทีละรายการ</div>
    <div class="addbar" style="margin-top:0">
      <input class="f-name" id="newName" type="text" placeholder="ชื่อเมนูใหม่" style="text-align:left">
      <input id="newPrice" type="number" placeholder="ราคา" style="width:100px">
      <select id="newCat">${CATS.map(c=>
        `<option value="${c.id}"${c.id===menuCat?" selected":""}>${c.th}</option>`).join("")}</select>
      <button class="btn dark" id="menuAdd">+ เพิ่ม</button></div>`;

  /* เพิ่มหลายรายการพร้อมกัน */
  h += `<div class="box" style="margin-top:16px">
    <div class="bh"><b>เพิ่มหลายเมนูพร้อมกัน</b></div>
    <div class="lbl" style="margin-top:0">พิมพ์บรรทัดละ 1 เมนู — <b>ชื่อ ตามด้วยราคา</b><br>
      เช่น <code>ลาเต้-ร้อน 40</code> หรือ <code>ชาไทย-เย็น, 45</code> · ไม่ใส่ราคาได้ (เป็น 0)</div>
    <textarea id="bulkText" rows="6" placeholder="มอคค่า-ร้อน 40&#10;ลาเต้-ร้อน 40&#10;อเมริกาโน-ร้อน 30"
      style="width:100%;padding:11px;border:1px solid var(--line);border-radius:var(--r-sm);
             font-family:var(--f-num);font-size:13.5px;background:var(--surface);resize:vertical"></textarea>
    <div class="addbar">
      <select id="bulkCat" style="min-width:170px">${CATS.map(c=>
        `<option value="${c.id}"${c.id===menuCat?" selected":""}>${c.th}</option>`).join("")}</select>
      <button class="btn primary" id="bulkAdd">เพิ่มทั้งหมด</button>
      <span class="by">ระบบข้ามชื่อที่มีอยู่แล้วให้อัตโนมัติ</span></div></div>`;

  return h + `</div>`;
}
function parseBulk(text){
  const out = [], skipped = [];
  for(let raw of text.split("\n")){
    const line = raw.trim().replace(/,\s*/g," ");
    if(!line) continue;
    const m = line.match(/^(.*?)[\s]+(\d+(?:\.\d+)?)$/);
    const name  = (m ? m[1] : line).trim();
    const price = m ? parseFloat(m[2]) : 0;
    if(!name) continue;
    if(MENU.some(p=>p.name===name) || out.some(o=>o.name===name)){ skipped.push(name); continue; }
    out.push({name, price});
  }
  return {items:out, skipped};
}
function collectMenu(){
  $$("#page .row[data-i]").forEach(row=>{
    const p = MENU[+row.dataset.i]; if(!p) return;
    const g = f => row.querySelector(`[data-f="${f}"]`);
    if(!g("name")) return;
    p.name = g("name").value.trim() || p.name;
    p.price = parseFloat(g("price").value) || 0;
    p.cat = g("cat").value;
    p.active = g("active").classList.contains("on");
  });
}

/* ================= หน้า: สูตร & ต้นทุน ================= */
function ingSelect(sel){
  return `<select data-f="ring"><option value="">— เลือกวัตถุดิบ —</option>${STOCK.map(i=>
    `<option value="${esc(i.id)}"${i.id===sel?" selected":""}>${esc(i.name)} (${esc(i.unit)})</option>`).join("")}</select>`;
}
function pageRecipe(){
  const noRec = MENU.filter(p=>!recipeOf(p.id).length).length;
  const withRec = MENU.filter(p=>recipeOf(p.id).length);
  let h = `<div class="card"><h3>สูตร &amp; ต้นทุนต่อเมนู
    ${noRec?`<span class="pill warn">ยังไม่มีสูตร ${noRec} เมนู</span>`:`<span class="pill ok">มีสูตรครบทุกเมนู</span>`}
    <button class="btn primary sm" id="recSave">บันทึก</button></h3>`;

  /* คัดลอกสูตร — ตัวช่วยสำคัญ ไม่ต้องใส่ทีละเมนู */
  if(withRec.length){
    h += `<div class="box"><div class="bh"><b>คัดลอกสูตรไปเมนูอื่น</b></div>
      <div class="lbl" style="margin-top:0">เลือกสูตรต้นแบบ แล้วเลือกว่าจะคัดลอกไปไหน — สูตรเดิมของปลายทางจะถูกแทนที่</div>
      <div class="addbar" style="margin-top:8px">
        <select id="copyFrom" style="min-width:200px">
          ${withRec.map(p=>`<option value="${p.id}">${esc(p.name)} (${recipeOf(p.id).length} วัตถุดิบ)</option>`).join("")}
        </select>
        <span style="color:var(--ink-3)">→</span>
        <select id="copyTo" style="min-width:200px">
          <option value="__norec">เมนูที่ยังไม่มีสูตรทั้งหมด (${noRec})</option>
          ${CATS.map(c=>{
            const n = MENU.filter(p=>p.cat===c.id).length;
            return n?`<option value="cat_${c.id}">ทั้งหมวด ${c.th} (${n})</option>`:"";
          }).join("")}
          ${MENU.map(p=>`<option value="one_${p.id}">${esc(p.name)}</option>`).join("")}
        </select>
        <button class="btn ghost" id="copyRec">คัดลอก</button></div></div>`;
  }

  h += `<div class="addbar"><input class="f-name" id="recSearch" type="text"
      placeholder="ค้นหาเมนู…" value="${esc(recFilter)}" style="text-align:left">
    <button class="chip${recFilter==="__norec"?" on":""}" id="onlyNoRec">เฉพาะที่ยังไม่มีสูตร</button></div>
    <div class="lbl">แตะชื่อเมนูเพื่อกางดู/แก้สูตร — ตัดสต็อกอัตโนมัติตอนขาย และคำนวณกำไรให้</div>`;

  let list;
  const filtering = recFilter && recFilter!=="__norec";
  if(recFilter==="__norec") list = MENU.filter(p=>!recipeOf(p.id).length);
  else if(filtering) list = MENU.filter(p=>p.name.toLowerCase().includes(recFilter.toLowerCase()));
  else list = MENU;

  if(!list.length){ h += `<div class="msg">ไม่พบเมนู</div>`; return h + `</div>`; }

  const recipeRow = p => {
    const r = recipeOf(p.id), cost = menuCost(p.id), pf = p.price-cost, open = !!recipeOpen[p.id];
    let row = `<div class="box" style="padding:0;overflow:visible">
      <button class="bh" data-rtoggle="${p.id}" style="width:100%;text-align:left;padding:14px 16px;
        background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:10px">
        <span style="flex:1;min-width:0"><b>${esc(p.name)}</b>${!r.length?` <span class="pill warn">ยังไม่มีสูตร</span>`:""}</span>
        <span class="info" style="flex-shrink:0">ทุน ${baht(cost)} · กำไร <b class="${pf<0?"neg":""}">${baht(pf)}</b></span>
        <span style="color:var(--ink-3);transition:transform .15s;transform:rotate(${open?90:0}deg)">›</span>
      </button>`;
    if(open){
      row += `<div style="padding:0 16px 14px">
        <div class="addbar" style="margin-top:0"><button class="btn ghost sm" data-radd="${p.id}">+ วัตถุดิบ</button></div>`;
      if(!r.length) row += `<div style="color:var(--ink-3);font-size:var(--fs-4);margin-top:8px">ยังไม่มีสูตร</div>`;
      r.forEach((x,xi)=>{
        const ig = findIng(x.ing);
        row += `<div class="row" data-m="${p.id}" data-x="${xi}">${ingSelect(x.ing)}
          <input class="f-unit" type="number" step="0.01" data-f="rqty" value="${x.qty}">
          <span class="info">${ig?`${esc(ig.unit)} · ${baht((+ig.cost||0)*x.qty)}`:""}</span>
          <button class="x" data-rdel="${p.id}_${xi}">×</button></div>`;
      });
      row += `</div>`;
    }
    return row + `</div>`;
  };

  if(filtering || recFilter==="__norec"){
    /* กำลังค้นหา/กรอง — แสดงผลลัพธ์เป็นลิสต์เดียว ไม่ต้องแบ่งหมวด */
    list.forEach(p=> h += recipeRow(p));
  }else{
    /* ปกติ — จัดกลุ่มตามหมวดเหมือนหน้า "เมนู & ราคา" เห็นครบทุกเมนูไม่มีตัดทิ้ง */
    for(const c of CATS){
      const items = MENU.filter(p=>p.cat===c.id);
      if(!items.length) continue;
      h += `<div class="lbl">${c.th} <span class="by">${items.length} เมนู</span></div>`;
      items.forEach(p=> h += recipeRow(p));
    }
  }
  return h + `</div>`;
}
function collectRec(){
  $$("#page .row[data-m]").forEach(row=>{
    const arr = REC[String(row.dataset.m)];
    const xi = +row.dataset.x;
    if(!arr?.[xi]) return;
    arr[xi].ing = row.querySelector('[data-f="ring"]').value;
    arr[xi].qty = parseFloat(row.querySelector('[data-f="rqty"]').value) || 0;
  });
}

/* ================= หน้า: กลุ่มตัวเลือก ================= */
function optIngSelect(sel){
  return `<select data-f="oing"><option value="">— ไม่ตัดสต็อก —</option>${STOCK.map(i=>
    `<option value="${esc(i.id)}"${i.id===sel?" selected":""}>${esc(i.name)}</option>`).join("")}</select>`;
}
function pageOptions(){
  let h = `<div class="card"><h3>กลุ่มตัวเลือก<button class="btn primary sm" id="optSave">บันทึก</button></h3>`;
  if(!OPTG.length) h += `<div class="msg">ยังไม่มีกลุ่มตัวเลือก</div>`;
  OPTG.forEach((g,gi)=>{
    h += `<div class="box" data-g="${gi}"><div class="bh">
      <input data-f="gname" type="text" value="${esc(g.name)}">
      <select data-f="gtype">
        <option value="single"${g.type==="single"?" selected":""}>เลือก 1</option>
        <option value="multi"${g.type==="multi"?" selected":""}>เลือกหลายอย่าง</option></select>
      <select data-f="greq">
        <option value="1"${g.required?" selected":""}>ต้องเลือก</option>
        <option value="0"${!g.required?" selected":""}>ไม่บังคับ</option></select>
      <button class="x" data-gdel="${gi}">×</button></div>
      <div class="lbl">ใช้กับหมวด</div>
      <div class="chips">${CATS.map(c=>
        `<button class="chip${g.cats.includes(c.id)?" on":""}" data-gc="${gi}" data-c="${c.id}">${c.th}</button>`).join("")}</div>
      ${(()=>{
        const items = MENU.filter(m=>g.cats.includes(m.cat));
        if(!items.length) return "";
        const excl = g.excludeItems||[];
        return `<div class="lbl">ยกเว้นเมนู <span class="by">— เมนูที่ไม่ต้องมีตัวเลือกกลุ่มนี้ ทั้งที่อยู่ในหมวดข้างบน</span></div>
          <div class="chips">${items.map(m=>
            `<button class="chip${excl.includes(m.id)?" on":""}" data-gex="${gi}" data-ei="${m.id}">${esc(m.name)}</button>`).join("")}</div>`;
      })()}
      <div class="lbl">ตัวเลือก — ชื่อ / บวกเงิน / ตัดวัตถุดิบ / จำนวน</div>`;
    g.options.forEach((o,oi)=>{
      h += `<div class="row" data-go="${gi}" data-o="${oi}">
        <input class="f-name" type="text" data-f="oname" value="${esc(o.name)}">
        <input class="f-num" type="number" data-f="oprice" value="${o.price}">
        ${optIngSelect(o.ing||"")}
        <input class="f-unit" type="number" step="0.01" data-f="oiqty" value="${o.iqty||0}">
        <button class="x" data-odel="${gi}_${oi}">×</button></div>`;
    });
    h += `<button class="btn ghost sm" data-oadd="${gi}" style="margin-top:8px">+ ตัวเลือก</button></div>`;
  });
  return h + `<button class="btn dark" id="grpAdd">+ เพิ่มกลุ่มตัวเลือก</button></div>`;
}
function collectOpt(){
  $$("#page .box[data-g]").forEach(box=>{
    const g = OPTG[+box.dataset.g]; if(!g) return;
    g.name = box.querySelector('[data-f="gname"]').value.trim() || g.name;
    g.type = box.querySelector('[data-f="gtype"]').value;
    g.required = box.querySelector('[data-f="greq"]').value === "1";
    box.querySelectorAll('.row[data-o]').forEach(row=>{
      const o = g.options[+row.dataset.o]; if(!o) return;
      o.name  = row.querySelector('[data-f="oname"]').value.trim() || o.name;
      o.price = parseFloat(row.querySelector('[data-f="oprice"]').value) || 0;
      o.ing   = row.querySelector('[data-f="oing"]').value;
      o.iqty  = parseFloat(row.querySelector('[data-f="oiqty"]').value) || 0;
    });
  });
}

