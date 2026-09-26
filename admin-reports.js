/* ================= หน้า: ภาพรวม ================= */
function fallbackBanner(){
  if(useRPC) return "";
  return `<div class="card" style="border-color:var(--crema);background:var(--crema-soft)">
    <div style="font-size:13px;color:var(--crema);font-weight:500;line-height:1.7">
      <b>กำลังใช้โหมดคำนวณในเครื่อง</b> — ยังไม่ได้ติดตั้งตัวสรุปยอดบนเซิร์ฟเวอร์<br>
      ตัวเลขถูกต้อง แต่ช้ากว่า และดูได้สูงสุด 3,000 บิลต่อช่วง
      ${SUM?.capped?`<br><b>ช่วงนี้เกิน 3,000 บิล — ข้อมูลไม่ครบ</b>`:""}<br>
      <span style="color:var(--ink-2)">แก้ได้โดยรัน <code>sql/schema-reports.sql</code> ใน Supabase → SQL Editor</span>
    </div></div>`;
}
function pageDash(){
  if(!SUM) return `<div class="card"><div class="msg err">${esc(lastErr||"ไม่มีข้อมูล")}<br>
    <button class="btn ghost sm" id="reloadAll" style="margin-top:12px">ลองใหม่</button></div></div>`;
  const s=SUM, p=PREV||{};
  const cashPct = s.rev>0 ? Math.round(s.cash/s.rev*100) : 0;
  let h = fallbackBanner() + `<div class="grid4">
    <div class="card kpi hero"><div class="k">ยอดขายสุทธิ</div><div class="v">${baht(s.rev)}</div>
      <div class="s">${s.bills} บิล · เฉลี่ย ${baht(s.avg)}/บิล</div>${delta(s.rev,p.rev)}</div>
    <div class="card kpi good"><div class="k">กำไรขั้นต้น</div><div class="v">${baht(s.profit)}</div>
      <div class="s">margin ${s.margin}% · ต้นทุน ${baht(s.cost)}</div>${delta(s.profit,p.profit)}</div>
    <div class="card kpi"><div class="k">ส่วนลดที่ให้</div><div class="v">${baht(s.disc)}</div></div>
    <div class="card kpi"><div class="k">บิลที่ยกเลิก</div><div class="v">${s.voids}</div>
      <div class="s">มูลค่า ${baht(s.voidAmt)}</div></div></div>`;

  const staffKeys = Object.keys(s.staff).sort((a,b)=>s.staff[b]-s.staff[a]);
  h += `<div class="grid2">
    <div class="card"><h3>ช่องทางชำระเงิน</h3>
      <div class="splitbar"><i style="width:${cashPct}%;background:var(--brand)"></i><i style="width:${100-cashPct}%;background:var(--crema)"></i></div>
      <div class="legend"><span class="a">เงินสด ${cashPct}% · ${baht(s.cash)}</span><span class="b">พร้อมเพย์ ${100-cashPct}% · ${baht(s.pp)}</span></div>
      <div class="lbl">ยอดขายตามพนักงาน</div>
      ${staffKeys.length ? staffKeys.map(k=>`<div class="trow"><span>${esc(k)}</span><b>${baht(s.staff[k])}</b></div>`).join("")
        : `<div class="msg">ยังไม่มีข้อมูล</div>`}</div>`;

  const dayKeys = Object.keys(s.days).sort();
  const dayLabels = dayKeys.map(k=>`${k.slice(8)}/${k.slice(5,7)}`);
  h += `<div class="card"><h3>ยอดขายรายวัน<span class="sub">${dayKeys.length} วัน</span></h3>
    ${dayKeys.length ? barChart(s.days,dayKeys,dayLabels,"var(--brand)") : `<div class="msg">ยังไม่มีข้อมูล</div>`}</div></div>`;

  const hrs = Object.keys(s.hours).map(Number);
  let peak=null, pv=0;
  hrs.forEach(x=>{ if(s.hours[x]>pv){ pv=s.hours[x]; peak=x; } });
  let lo=6, hi=20;
  if(hrs.length){
    lo=Math.max(0,Math.min(...hrs)-1); hi=Math.min(23,Math.max(...hrs)+1);
    if(hi-lo<5) hi=Math.min(23,lo+5);
  }
  const hk=[], hl=[];
  for(let i=lo;i<=hi;i++){ hk.push(i); hl.push(i+":00"); }
  h += `<div class="card"><h3>ยอดขายแยกตามช่วงเวลา
    <span class="sub">${peak!==null?`ขายดีที่สุด ${peak}:00 น. · ${baht(pv)}`:"ยังไม่มีข้อมูล"}</span></h3>
    ${hrs.length ? barChart(s.hours,hk,hl) : `<div class="msg">ยังไม่มีการขายในช่วงที่เลือก</div>`}</div>`;

  const stockVal = STOCK.reduce((a,x)=>a+(+x.value_total||0),0);
  const low = STOCK.filter(x=>x.low_front_flag);
  h += `<div class="grid3">
    <div class="card"><h3>10 อันดับสินค้าขายดี</h3>
      ${s.top.length ? s.top.slice(0,10).map((t,i)=>
        `<div class="rank"><span class="no">${i+1}</span><span class="nm">${esc(t.name)}</span>
         <span class="q">${t.q} แก้ว</span><span class="a">${baht(t.a)}</span></div>`).join("")
        : `<div class="msg">ยังไม่มีข้อมูล</div>`}</div>
    <div class="card"><h3>สินค้าคงคลัง</h3>
      <div class="kpi"><div class="k">มูลค่าสต็อกรวม</div><div class="v" style="font-size:24px">${baht(stockVal)}</div>
        <div class="s">${STOCK.length} รายการ</div></div>
      <div class="lbl">ใกล้หมด</div>
      ${low.length ? low.map(i=>`<div class="trow"><span>${esc(i.name)}</span>
        <span class="pill warn">${qty(i.qty_total,i.unit)}</span></div>`).join("")
        : `<div style="color:var(--ink-2);font-size:13.5px">ทุกอย่างเพียงพอ</div>`}</div></div>`;

  const ck = Object.keys(s.cats).filter(k=>s.cats[k]).sort((a,b)=>s.cats[b]-s.cats[a]);
  if(ck.length){
    h += `<div class="card"><h3>ยอดขายตามหมวดหมู่</h3>${ck.map(id=>{
      const pct = s.rev>0 ? Math.round(s.cats[id]/s.rev*100) : 0;
      return `<div class="trow"><span style="min-width:120px">${esc(catTh(id))}</span>
        <span style="flex:1;margin:0 12px"><span style="display:block;height:7px;border-radius:4px;background:var(--line-2)">
        <i style="display:block;height:100%;width:${pct}%;border-radius:4px;background:${catColor(id)}"></i></span></span>
        <b>${baht(s.cats[id])}</b></div>`;}).join("")}</div>`;
  }
  return h;
}

/* ================= หน้า: รายงานการขาย ================= */
function pagerHTML(){
  const pages = Math.ceil(billTotal/PER_PAGE) || 1;
  if(billTotal<=PER_PAGE) return `<div class="msg" style="padding:14px">ทั้งหมด ${billTotal} บิล</div>`;
  const from = billPage*PER_PAGE+1, to = Math.min((billPage+1)*PER_PAGE, billTotal);
  return `<div class="billpager">
    <button class="btn ghost sm" id="bpPrev"${billPage<=0?" disabled":""}>‹ ก่อนหน้า</button>
    <span class="bpinfo">${from}–${to} จาก ${billTotal.toLocaleString("en-US")} บิล
      <span class="by">(หน้า ${billPage+1}/${pages})</span></span>
    <button class="btn ghost sm" id="bpNext"${billPage>=pages-1?" disabled":""}>ถัดไป ›</button></div>`;
}
function pageSales(){
  const s = SUM || {rev:0,bills:0,cash:0,pp:0};
  let h = `<div class="grid4">
    <div class="card kpi"><div class="k">ยอดขาย</div><div class="v">${baht(s.rev)}</div></div>
    <div class="card kpi"><div class="k">บิล</div><div class="v">${s.bills}</div></div>
    <div class="card kpi"><div class="k">เงินสด</div><div class="v">${baht(s.cash)}</div></div>
    <div class="card kpi"><div class="k">พร้อมเพย์</div><div class="v">${baht(s.pp)}</div></div></div>`;
  h += `<div class="card"><h3>รายการบิล<button class="btn ghost sm" id="csvBtn">ส่งออก CSV</button></h3>`;
  h += rows.length ? rows.map(o=>{
    const v = o.status==="void";
    const tm = new Date(o.created_at).toLocaleString("th-TH",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
    const names = (o.items||[]).map(i=>i.name+(i.qty>1?`×${i.qty}`:"")).join(", ");
    const pill = v ? `<span class="pill bad">ยกเลิก</span>`
      : o.payment_method==="cash" ? `<span class="pill cash">เงินสด</span>` : `<span class="pill pp">พร้อมเพย์</span>`;
    return `<div class="brow${v?" void":""}"><span class="tm">${tm}</span>
      <span class="it">${esc(names)} ${pill}
        <span class="by">${esc(o.staff||"-")}${v&&o.void_reason?` · ${esc(o.void_reason)}`:""}</span></span>
      <span class="am">${baht(o.total)}</span>
      ${v?"":`<button class="vbtn" data-void="${o.id}">ยกเลิก</button>`}</div>`;
  }).join("") : `<div class="msg">${esc(lastErr||"ไม่มีบิลในช่วงที่เลือก")}</div>`;
  h += pagerHTML() + `</div>`;
  return h;
}

/* ================= หน้า: รายละเอียดสินค้า ================= */
function pageProducts(){
  const s = SUM || {top:[]};
  const sold = Object.fromEntries(s.top.map(t=>[t.name,t]));
  const noRec = MENU.filter(p=>!recipeOf(p.id).length).length;
  let h = `<div class="grid4">
    <div class="card kpi"><div class="k">เมนูทั้งหมด</div><div class="v">${MENU.length}</div>
      <div class="s">ขายได้จริง ${s.top.length} เมนู</div></div>
    <div class="card kpi"><div class="k">ขายดีที่สุด</div><div class="v" style="font-size:19px">${esc(s.top[0]?.name||"—")}</div>
      <div class="s">${s.top[0]?s.top[0].q+" แก้ว":""}</div></div>
    <div class="card kpi"><div class="k">เมนูปิดขาย</div><div class="v">${MENU.filter(p=>p.active===false).length}</div></div>
    <div class="card kpi"><div class="k">ยังไม่มีสูตร</div><div class="v">${noRec}</div>
      <div class="s">ยังคำนวณกำไรไม่ได้</div></div></div>`;
  h += `<div class="card"><h3>รายละเอียดสินค้า<span class="sub">ในช่วงที่เลือก</span></h3>`;
  for(const c of CATS){
    const items = MENU.filter(p=>p.cat===c.id);
    if(!items.length) continue;
    h += `<div class="lbl">${c.th}</div>`;
    for(const p of items){
      const t = sold[p.name];
      const cost = menuCost(p.id), pf = p.price - cost;
      h += `<div class="trow"><span style="flex:1">${esc(p.name)}${p.active===false?` <span class="pill warn">ปิดขาย</span>`:""}</span>
        <span class="by">ขาย ${t?t.q:0} · ${baht(t?t.a:0)}</span>
        <span class="info">ราคา ${baht(p.price)} · ทุน ${baht(cost)} · กำไร <b class="${pf<0?"neg":""}">${baht(pf)}</b></span></div>`;
    }
  }
  return h + `</div>`;
}

/* ================= หน้า: ยอดขายตามหมวด ================= */
function pageByCat(){
  if(!SUM) return `<div class="card"><div class="msg err">${esc(lastErr||"ไม่มีข้อมูล")}</div></div>`;
  const s = SUM;
  /* รวมยอดต่อหมวดจากสินค้าขายดี (ได้ทั้งจำนวนแก้วและเงิน) */
  const catOf = name => (MENU.find(m=>m.name===name)||{}).cat || "etc";
  const agg = {};
  for(const t of s.top){
    const c = catOf(t.name);
    const a = agg[c] ||= {q:0, amt:0, items:[]};
    a.q += t.q; a.amt += t.a; a.items.push(t);
  }
  /* ถ้า sales_by_category ให้ยอดมา ใช้ยอดนั้นเป็นหลัก (แม่นกว่าเพราะรวมทุกบิล) */
  for(const c in s.cats){ (agg[c] ||= {q:0, amt:0, items:[]}).amt = s.cats[c]; }
  const keys = Object.keys(agg).filter(k=>agg[k].amt>0).sort((a,b)=>agg[b].amt-agg[a].amt);
  const total = keys.reduce((x,k)=>x+agg[k].amt,0);

  let h = fallbackBanner();
  h += `<div class="grid4">
    <div class="card kpi hero"><div class="k">ยอดขายรวม</div><div class="v">${baht(total)}</div>
      <div class="s">${keys.length} หมวด</div></div>
    <div class="card kpi"><div class="k">หมวดที่ขายดีที่สุด</div>
      <div class="v" style="font-size:20px">${esc(catTh(keys[0])||"—")}</div>
      <div class="s">${keys[0]?baht(agg[keys[0]].amt):""}</div></div>
    <div class="card kpi"><div class="k">จำนวนแก้ว/ชิ้นรวม</div>
      <div class="v">${keys.reduce((x,k)=>x+agg[k].q,0).toLocaleString("en-US")}</div></div>
    <div class="card kpi"><div class="k">เฉลี่ยต่อชิ้น</div>
      <div class="v">${baht(keys.reduce((x,k)=>x+agg[k].q,0)?total/keys.reduce((x,k)=>x+agg[k].q,0):0)}</div></div>
  </div>`;

  h += `<div class="card"><h3>สัดส่วนยอดขายตามหมวด</h3>
    <div class="stk head"><span class="nm">หมวด</span><span class="num">จำนวน</span>
      <span class="num">ยอดขาย</span><span class="num">สัดส่วน</span></div>`;
  for(const k of keys){
    const pct = total>0 ? Math.round(agg[k].amt/total*100) : 0;
    h += `<div class="stk"><span class="nm">
        <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${catColor(k)};margin-right:8px"></span>
        ${esc(catTh(k))}</span>
      <span class="num" data-l="จำนวน">${agg[k].q?agg[k].q.toLocaleString("en-US"):"—"}</span>
      <span class="num" data-l="ยอดขาย">${baht(agg[k].amt)}</span>
      <span class="num" data-l="สัดส่วน">${pct}%</span></div>
      <div style="height:6px;border-radius:4px;background:var(--line-2);margin:-4px 0 8px">
        <i style="display:block;height:100%;width:${pct}%;border-radius:4px;background:${catColor(k)}"></i></div>`;
  }
  h += `</div>`;

  /* แจกแจงสินค้าในแต่ละหมวด */
  h += `<div class="card"><h3>สินค้าในแต่ละหมวด<span class="sub">เรียงตามยอดขาย</span></h3>
    <div class="addbar" style="margin:-8px 0 14px"><button class="btn ghost sm" id="catCsvBtn">ส่งออก CSV</button></div>`;
  for(const k of keys){
    const items = agg[k].items.sort((a,b)=>b.a-a.a);
    if(!items.length) continue;
    h += `<div class="lbl">${esc(catTh(k))} — ${baht(agg[k].amt)}</div>`;
    h += items.map((t,i)=>`<div class="rank"><span class="no">${i+1}</span>
      <span class="nm">${esc(t.name)}</span><span class="q">${t.q} ชิ้น</span>
      <span class="a">${baht(t.a)}</span></div>`).join("");
  }
  return h + `</div>`;
}

/* ================= หน้า: ยอดขายรายวัน ================= */
function pageByDay(){
  if(!SUM) return `<div class="card"><div class="msg err">${esc(lastErr||"ไม่มีข้อมูล")}</div></div>`;
  const days = Object.keys(SUM.days).sort();
  if(!days.length) return fallbackBanner()+`<div class="card"><div class="msg">ไม่มีการขายในช่วงที่เลือก</div></div>`;
  const vals = days.map(d=>SUM.days[d]);
  const total = vals.reduce((a,b)=>a+b,0);
  const avg = total/days.length;
  const best = days[vals.indexOf(Math.max(...vals))];
  const worst = days[vals.indexOf(Math.min(...vals))];
  const fmt = d => new Date(d+"T00:00:00").toLocaleDateString("th-TH",{weekday:"short",day:"numeric",month:"short"});

  let h = fallbackBanner();
  h += `<div class="grid4">
    <div class="card kpi hero"><div class="k">ยอดขายรวม</div><div class="v">${baht(total)}</div>
      <div class="s">${days.length} วัน</div></div>
    <div class="card kpi"><div class="k">เฉลี่ยต่อวัน</div><div class="v">${baht(avg)}</div></div>
    <div class="card kpi good"><div class="k">วันที่ขายดีที่สุด</div>
      <div class="v" style="font-size:20px">${fmt(best)}</div><div class="s">${baht(SUM.days[best])}</div></div>
    <div class="card kpi"><div class="k">วันที่ขายน้อยที่สุด</div>
      <div class="v" style="font-size:20px">${fmt(worst)}</div><div class="s">${baht(SUM.days[worst])}</div></div>
  </div>`;
  h += `<div class="card"><h3>กราฟรายวัน</h3>
    ${barChart(SUM.days, days, days.map(k=>k.slice(8)+"/"+k.slice(5,7)), "var(--brand)")}</div>`;
  h += `<div class="card"><h3>ตารางรายวัน<span class="sub">เทียบกับค่าเฉลี่ย ${baht(avg)}</span></h3>
    <button class="btn ghost sm" id="dayCsvBtn" style="margin-left:auto">ส่งออก CSV</button>
    <div class="stk head"><span class="nm">วันที่</span><span class="num">ยอดขาย</span>
      <span class="num">เทียบเฉลี่ย</span><span class="num">สัดส่วน</span></div>`;
  for(const d of [...days].reverse()){
    const v = SUM.days[d];
    const diff = v - avg;
    const pct = total>0 ? Math.round(v/total*100) : 0;
    h += `<div class="stk"><span class="nm">${fmt(d)}</span>
      <span class="num" data-l="ยอดขาย">${baht(v)}</span>
      <span class="num ${diff>0?"up":diff<0?"down":"flat"}" data-l="เทียบเฉลี่ย">${diff>0?"+":""}${baht(diff)}</span>
      <span class="num" data-l="สัดส่วน">${pct}%</span></div>`;
  }
  return h + `</div>`;
}

/* ================= หน้า: ยอดขายรายเดือน ================= */
let MONTHS = null;
async function loadMonths(){
  const to = new Date();
  const from = new Date(); from.setMonth(from.getMonth()-11); from.setDate(1);
  const arg = {p_from:from.toISOString(), p_to:to.toISOString()};
  setSync("busy","กำลังสรุป…");
  const byMonth = {};
  const add = (key, rev, bills)=>{
    const m = byMonth[key] ||= {rev:0, bills:0};
    m.rev += rev; m.bills += bills;
  };
  try{
    if(useRPC){
      const d = await rpc("sales_by_day", arg);
      (d||[]).forEach(x=> add(String(x.day).slice(0,7), +x.revenue||0, +x.bills||0));
    }else{
      const list = await fetchRawRange(arg.p_from, arg.p_to, 5000);
      for(const o of list){
        if(o.status==="void") continue;
        const dt = new Date(o.created_at);
        add(`${dt.getFullYear()}-${pad2(dt.getMonth()+1)}`, +o.total||0, 1);
      }
    }
    MONTHS = byMonth;
    setSync("ok","พร้อม");
    return true;
  }catch(e){
    MONTHS=null; setSync("bad","โหลดไม่สำเร็จ");
    lastErr = friendly(e.status, e.body);
    return false;
  }
}
function pageByMonth(){
  if(!MONTHS) return `<div class="card"><div class="msg err">${esc(lastErr||"ไม่มีข้อมูล")}</div></div>`;
  const keys = Object.keys(MONTHS).sort();
  if(!keys.length) return `<div class="card"><div class="msg">ยังไม่มีข้อมูลย้อนหลัง</div></div>`;
  const TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const label = k => { const [y,m]=k.split("-"); return `${TH[+m-1]} ${String(+y+543).slice(2)}`; };
  const revMap = Object.fromEntries(keys.map(k=>[k, MONTHS[k].rev]));
  const total = keys.reduce((a,k)=>a+MONTHS[k].rev,0);
  const cur = keys[keys.length-1], prev = keys[keys.length-2];
  const growth = prev ? MONTHS[cur].rev - MONTHS[prev].rev : null;

  let h = `<div class="card" style="border-color:var(--brand-soft);background:var(--brand-soft)">
    <div style="font-size:13px;color:var(--brand-ink)">แสดงย้อนหลัง 12 เดือน — ไม่ขึ้นกับช่วงวันที่ด้านบน</div></div>`;
  h += `<div class="grid4">
    <div class="card kpi hero"><div class="k">เดือนล่าสุด</div><div class="v">${baht(MONTHS[cur].rev)}</div>
      <div class="s">${label(cur)} · ${MONTHS[cur].bills} บิล</div>
      ${growth!==null?delta(MONTHS[cur].rev, MONTHS[prev].rev):""}</div>
    <div class="card kpi"><div class="k">รวม 12 เดือน</div><div class="v">${baht(total)}</div>
      <div class="s">${keys.length} เดือนที่มีข้อมูล</div></div>
    <div class="card kpi"><div class="k">เฉลี่ยต่อเดือน</div><div class="v">${baht(total/keys.length)}</div></div>
    <div class="card kpi"><div class="k">เดือนที่ดีที่สุด</div>
      <div class="v" style="font-size:20px">${label(keys.reduce((a,b)=>MONTHS[a].rev>MONTHS[b].rev?a:b))}</div></div>
  </div>`;
  h += `<div class="card"><h3>กราฟรายเดือน</h3>
    ${barChart(revMap, keys, keys.map(label), "var(--brand)")}</div>`;
  h += `<div class="card"><h3>ตารางรายเดือน<button class="btn ghost sm" id="monthCsvBtn" style="margin-left:auto">ส่งออก CSV</button></h3>
    <div class="stk head"><span class="nm">เดือน</span><span class="num">บิล</span>
      <span class="num">ยอดขาย</span><span class="num">เฉลี่ย/บิล</span><span class="num">เทียบเดือนก่อน</span></div>`;
  [...keys].reverse().forEach((k,i,arr)=>{
    const m = MONTHS[k];
    const pk = arr[i+1];
    const d = pk ? m.rev - MONTHS[pk].rev : null;
    h += `<div class="stk"><span class="nm">${label(k)}</span>
      <span class="num" data-l="บิล">${m.bills.toLocaleString("en-US")}</span>
      <span class="num" data-l="ยอดขาย">${baht(m.rev)}</span>
      <span class="num" data-l="เฉลี่ย/บิล">${baht(m.bills?m.rev/m.bills:0)}</span>
      <span class="num ${d===null?"flat":d>0?"up":d<0?"down":"flat"}" data-l="เทียบเดือนก่อน">${
        d===null?"—":(d>0?"+":"")+baht(d)}</span></div>`;
  });
  return h + `</div>`;
}

/* ================= หน้า: ยอดขายตามสินค้า ================= */
let productDetail=null, productDetailFor="";
async function loadProductDetail(name){
  const R = range();
  if(useRPC){
    try{
      const [h,d] = await Promise.all([
        rpc("product_sales_by_hour",{p_from:R.from,p_to:R.to,p_name:name}),
        rpc("product_sales_by_day",{p_from:R.from,p_to:R.to,p_name:name})
      ]);
      productDetail = {
        hours: Object.fromEntries((h||[]).map(x=>[x.hour,+x.qty||0])),
        hoursAmt: Object.fromEntries((h||[]).map(x=>[x.hour,+x.amount||0])),
        days: Object.fromEntries((d||[]).map(x=>[x.day,+x.qty||0])),
        daysAmt: Object.fromEntries((d||[]).map(x=>[x.day,+x.amount||0])),
      };
      productDetailFor = name;
      return true;
    }catch{ /* ตกไปทางถอย */ }
  }
  try{
    const list = await fetchRawRange(R.from, R.to);
    const hours={}, hoursAmt={}, days={}, daysAmt={};
    for(const o of list){
      if(o.status==="void") continue;
      for(const it of (o.items||[])){
        if(it.name!==name) continue;
        const d = new Date(o.created_at);
        const hr = d.getHours();
        const dk = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
        const amt = (+it.price||0)*(+it.qty||0);
        hours[hr]=(hours[hr]||0)+(+it.qty||0); hoursAmt[hr]=(hoursAmt[hr]||0)+amt;
        days[dk]=(days[dk]||0)+(+it.qty||0);   daysAmt[dk]=(daysAmt[dk]||0)+amt;
      }
    }
    productDetail = {hours,hoursAmt,days,daysAmt};
    productDetailFor = name;
    return true;
  }catch(e){ productDetail=null; return false; }
}
function pageByProduct(){
  const s = SUM || {top:[]};
  if(!s.top.length) return fallbackBanner()+`<div class="card"><div class="msg">${esc(lastErr||"ยังไม่มีข้อมูลในช่วงที่เลือก")}</div></div>`;
  let h = fallbackBanner();
  h += `<div class="card"><h3>สินค้าทั้งหมด<span class="sub">แตะรายการเพื่อดูรายละเอียดรายชั่วโมง/รายวัน</span>
    <button class="btn ghost sm" id="productCsvBtn" style="margin-left:auto">ส่งออก CSV</button></h3>`;
  h += s.top.map((t,i)=>`<div class="rank" data-prod="${esc(t.name)}" style="cursor:pointer;${productDetailFor===t.name?"background:var(--brand-soft);margin:0 -20px;padding-left:20px;padding-right:20px":""}">
      <span class="no">${i+1}</span><span class="nm">${esc(t.name)}</span>
      <span class="q">${t.q} ชิ้น</span><span class="a">${baht(t.a)}</span></div>`).join("");
  h += `</div>`;

  if(productDetailFor && productDetail){
    const d = productDetail;
    const hrs = Object.keys(d.hours).map(Number).sort((a,b)=>a-b);
    const dayKeys = Object.keys(d.days).sort();
    const totalQty = Object.values(d.hours).reduce((a,b)=>a+b,0);
    const totalAmt = Object.values(d.hoursAmt).reduce((a,b)=>a+b,0);
    h += `<div class="card"><h3>${esc(productDetailFor)}<span class="sub">${totalQty} ชิ้น · ${baht(totalAmt)}</span></h3>`;
    if(hrs.length){
      h += `<div class="lbl" style="margin-top:0">แยกตามช่วงเวลา</div>
        ${barChart(d.hours, hrs, hrs.map(x=>x+":00"), "var(--brand)")}`;
    }
    if(dayKeys.length>1){
      h += `<div class="lbl">แยกตามวัน</div>
        ${barChart(d.days, dayKeys, dayKeys.map(k=>k.slice(8)+"/"+k.slice(5,7)), "var(--crema)")}`;
    }
    if(!hrs.length && !dayKeys.length) h += `<div class="msg">ไม่มีข้อมูลในช่วงที่เลือก</div>`;
    h += `</div>`;
  }
  return h;
}

/* ================= หน้า: ยอดขายตามกลุ่มตัวเลือก ================= */
let optionGroups=null;   /* {grpKey: {label, options:{name:qty}, total}} */
async function loadOptionCounts(){
  const R = range();
  optionGroups = {};
  try{
    const list = await fetchRawRange(R.from, R.to);
    for(const o of list){
      if(o.status==="void") continue;
      for(const it of (o.items||[])){
        for(const opt of (it.options||[])){
          const name = (typeof opt==="object" ? opt?.name : opt) || "";
          if(!name) continue;
          let grpKey, grpLabel;
          if(typeof opt==="object" && opt.grp){
            /* บิลใหม่ — เก็บกลุ่มไว้ตรงๆ ตอนขาย แม่นตลอดกาล ไม่ว่าจะเปลี่ยนชื่อ/ลบกลุ่มทีหลังแค่ไหน */
            grpKey = opt.grp; grpLabel = opt.grpName || "กลุ่ม (ไม่มีชื่อ)";
          }else{
            /* บิลเก่า — ไม่มีข้อมูลกลุ่มติดมา ถอยไปเทียบชื่อตัวเลือกกับกลุ่มปัจจุบัน
               ใช้ "หมวดหมู่ของเมนู" ช่วยแยกด้วย — กันเคสที่ 2 กลุ่มใช้ชื่อตัวเลือกซ้ำกัน
               (เช่น "แก้วร้อน" กับ "แก้วเย็น" ต่างก็มีตัวเลือก "ไม่ได้นำแก้วมา" เหมือนกัน)
               ถ้าไม่เจอกลุ่มที่ตรงหมวดเป๊ะ ค่อยถอยไปหาแบบไม่สนหมวด (ยังดีกว่าไม่เจอเลย) */
            const cat = MENU.find(m=>m.id===it.id)?.cat;
            let found = cat && OPTG.find(g=>g.cats.includes(cat) && (g.options||[]).some(x=>(x.name||"").trim()===name.trim()));
            if(!found) found = OPTG.find(g=>(g.options||[]).some(x=>(x.name||"").trim()===name.trim()));
            grpKey = found ? found.id : "__unknown";
            grpLabel = found ? found.name : "ไม่ทราบกลุ่ม (บิลเก่าก่อนมีการเก็บกลุ่ม)";
          }
          const g = optionGroups[grpKey] ||= {label:grpLabel, options:{}, total:0};
          g.options[name] = (g.options[name]||0) + (+it.qty||0);
          g.total += (+it.qty||0);
        }
      }
    }
    return true;
  }catch(e){ lastErr=friendly(e.status,e.body); optionGroups=null; return false; }
}
function pageByOption(){
  if(!optionGroups) return `<div class="card"><div class="msg err">${esc(lastErr||"โหลดไม่สำเร็จ")}</div></div>`;
  let h = fallbackBanner();
  h += `<div class="card" style="border-color:var(--brand-soft);background:var(--brand-soft)">
    <div style="font-size:var(--fs-3);color:var(--brand-ink);line-height:1.6">
      นับจำนวนครั้งที่แต่ละตัวเลือกถูกสั่ง แยกตามกลุ่มตัวเลือก — บอกได้แค่ "สั่งกี่แก้ว" เพราะบิลไม่ได้ผูกราคาของตัวเลือกไว้แยก จึงคิดเป็นเงินแยกตามตัวเลือกไม่ได้</div></div>`;
  const keys = Object.keys(optionGroups).sort((a,b)=>optionGroups[b].total-optionGroups[a].total);
  if(!keys.length){ h += `<div class="card"><div class="msg">ไม่มีข้อมูลตัวเลือกในช่วงที่เลือก</div></div>`; return h; }
  for(const k of keys){
    const g = optionGroups[k];
    const optNames = Object.keys(g.options).sort((a,b)=>g.options[b]-g.options[a]);
    h += `<div class="card"><h3>${esc(g.label)}<span class="sub">${g.total} ครั้งรวม</span></h3>`;
    h += optNames.map((name,i)=>{
      const qtyN = g.options[name];
      const pct = g.total ? Math.round(qtyN/g.total*100) : 0;
      return `<div class="rank"><span class="no">${i+1}</span><span class="nm">${esc(name)}</span>
        <span class="q">${pct}%</span><span class="a">${qtyN} ครั้ง</span></div>`;
    }).join("");
    h += `</div>`;
  }
  return h;
}

/* ================= หน้า: ประวัติกะ ================= */
let shiftList=[];
async function fetchShifts(){
  const R=range();
  try{
    shiftList = await apiJson(`/rest/v1/shifts?select=*&opened_at=gte.${encodeURIComponent(R.from)}`
      +`&opened_at=lt.${encodeURIComponent(R.to)}&order=opened_at.desc&limit=200`);
    return true;
  }catch(e){ shiftList=[]; lastErr=friendly(e.status,e.body); return false; }
}
function pageShifts(){
  const closed = shiftList.filter(x=>x.status==="closed");
  const openN  = shiftList.length - closed.length;
  let over=0, short=0, exact=0, totalDiff=0;
  closed.forEach(x=>{ const d=+x.diff||0; totalDiff+=d; d>0?over++:d<0?short++:exact++; });
  let h = `<div class="grid4">
    <div class="card kpi"><div class="k">กะทั้งหมด</div><div class="v">${shiftList.length}</div>
      <div class="s">ปิดแล้ว ${closed.length} · เปิดอยู่ ${openN}</div></div>
    <div class="card kpi"><div class="k">ผลต่างสะสม</div>
      <div class="v ${totalDiff<0?"down":totalDiff>0?"":"up"}">${totalDiff>0?"+":""}${baht(totalDiff)}</div></div>
    <div class="card kpi"><div class="k">กะที่เงินขาด</div><div class="v ${short?"down":"up"}">${short}</div></div>
    <div class="card kpi"><div class="k">ตรงพอดี / เกิน</div><div class="v">${exact} / ${over}</div></div></div>`;
  h += `<div class="card"><h3>รายละเอียดแต่ละกะ
    ${openN>1?`<span class="pill bad">กะค้าง ${openN} กะ — ควรปิดให้เหลืออันเดียว</span>`:""}</h3>`;
  if(!shiftList.length) h += `<div class="msg">${esc(lastErr||"ไม่มีกะในช่วงที่เลือก")}</div>`;
  for(const x of shiftList){
    const op=new Date(x.opened_at), cl=x.closed_at?new Date(x.closed_at):null;
    const d=+x.diff||0;
    const badge = x.status!=="closed" ? `<span class="pill warn">ยังเปิดอยู่</span>`
      : d===0 ? `<span class="pill ok">ตรงพอดี</span>`
      : d>0 ? `<span class="pill warn">เกิน ${baht(d)}</span>` : `<span class="pill bad">ขาด ${baht(Math.abs(d))}</span>`;
    h += `<div class="box"><div class="trow" style="border-bottom:1px solid var(--line-2);padding-bottom:9px">
      <span><b>${esc(x.staff||"-")}</b> <span class="by">${op.toLocaleDateString("th-TH",{day:"numeric",month:"short"})} ·
        ${op.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"})}${cl?` – ${cl.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"})}`:" – ยังไม่ปิด"}</span></span>
      ${badge}</div>
      <div class="trow"><span>ยอดขาย</span><b>${baht(x.sales_total)} (${x.bills||0} บิล)</b></div>
      <div class="trow"><span>เงินสด / พร้อมเพย์</span><b>${baht(x.sales_cash)} / ${baht(x.sales_pp)}</b></div>
      <div class="trow"><span>กำไรขั้นต้น</span><b class="up">${baht((+x.sales_total||0)-(+x.cost||0))}</b></div>
      <div class="trow"><span>เงินทอนตั้งต้น</span><b>${baht(x.opening_cash)}</b></div>
      ${(+x.cash_in||0)?`<div class="trow"><span>เงินใส่เพิ่ม</span><b class="up">+${baht(x.cash_in)}</b></div>`:""}
      ${(+x.cash_out||0)?`<div class="trow"><span>เงินหยิบออก</span><b class="down">-${baht(x.cash_out)}</b></div>`:""}
      ${x.status==="closed"?`
        <div class="trow"><span>ควรมีในลิ้นชัก</span><b>${baht(x.expected_cash)}</b></div>
        <div class="trow"><span>นับได้จริง</span><b>${baht(x.counted_cash)}</b></div>
        <div class="trow"><span>ผลต่าง</span><b class="${d<0?"down":d>0?"":"up"}">${d>0?"+":""}${baht(d)}</b></div>`
       :`<div class="addbar"><button class="btn ghost sm" data-fclose="${esc(x.local_id)}" data-oc="${x.opening_cash||0}">ปิดกะนี้</button>
          <span class="by">กะค้างทำให้เครื่องขายเข้าร่วมกะเก่า</span></div>`}
      ${x.closed_by&&x.closed_by!==x.staff?`<div class="trow"><span>ปิดกะโดย</span><b>${esc(x.closed_by)}</b></div>`:""}
    </div>`;
  }
  return h + `</div>`;
}

/* ================= หน้า: ประวัติการแก้ไข ================= */
let auditList=[];
async function fetchAudit(){
  try{ auditList = await apiJson("/rest/v1/audit_log?select=*&order=created_at.desc&limit=300"); return true; }
  catch(e){ auditList=[]; lastErr=friendly(e.status,e.body); return false; }
}
function pageAudit(){
  return `<div class="card"><h3>ประวัติการแก้ไข<span class="sub">${auditList.length} รายการล่าสุด</span></h3>`
    + (auditList.length ? auditList.map(e=>`<div class="brow">
        <span class="tm">${new Date(e.created_at).toLocaleString("th-TH",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
        <span class="it"><b>${esc(e.actor)}</b> · ${esc(e.action)} <span class="by">${esc(e.detail)}</span></span></div>`).join("")
      : `<div class="msg">${esc(lastErr||"ยังไม่มีประวัติ")}</div>`) + `</div>`;
}


async function voidOrder(id){
  const reason = await ask("ยกเลิกบิล","ระบุเหตุผล (บันทึกไว้ตรวจสอบ)",
    {input:true, placeholder:"เช่น ลูกค้าเปลี่ยนใจ / กดผิด", yes:"ยกเลิกบิล"});
  if(reason===null) return;
  if(!reason){ toast("ต้องระบุเหตุผล","err"); return; }
  try{
    const r = await api(`/rest/v1/orders?id=eq.${encodeURIComponent(id)}`,{
      method:"PATCH", extraHeaders:{Prefer:"return=minimal"},
      body:JSON.stringify({status:"void", void_reason:reason, void_by:ME?.name||"-"})});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    await logAct("void", `บิล ${id} — ${reason}`);
    /* ไม่ต้องคืนสต็อก — หน้าร้านเลิกตัดสต็อกตอนขายแล้ว บิลนี้ไม่เคยตัดอะไรออกไปตั้งแต่แรก
       ส่วน "การใช้" คำนวณจากบิลที่ status ไม่ใช่ void อยู่แล้ว บิลนี้จะหลุดออกจากยอดใช้เองอัตโนมัติ */
    toast("ยกเลิกบิลแล้ว","ok");
    await loadSummary(); await loadBills(); render();
  }catch(e){ toast(friendly(e.status,e.body),"err"); }
}
async function exportCSV(){
  const R = range();
  let all=[], p=0;
  toast("กำลังรวบรวมข้อมูล…");
  try{
    for(;p<200;p++){
      const d = await apiJson(`/rest/v1/orders?select=created_at,staff,total,cost,discount,payment_method,status,void_reason,items`
        +`&created_at=gte.${encodeURIComponent(R.from)}&created_at=lt.${encodeURIComponent(R.to)}`
        +`&order=created_at.desc&offset=${p*1000}&limit=1000`);
      if(!d.length) break;   /* หยุดเมื่อหน้าว่างเปล่าจริงๆ เท่านั้น — กันเซิร์ฟเวอร์ตัดแถวให้น้อยกว่าที่ขอเงียบๆ */
      all = all.concat(d);
      toast(`โหลดแล้ว ${all.length} บิล…`);
    }
  }catch(e){ toast(friendly(e.status,e.body),"err"); return; }
  if(!all.length){ toast("ไม่มีข้อมูลในช่วงที่เลือก","err"); return; }
  const rows = all.map(o=>[new Date(o.created_at).toLocaleString("th-TH"), o.staff||"-",
    (o.items||[]).map(i=>`${i.name}x${i.qty}`).join(" / "), o.total, o.cost||0, o.discount||0,
    o.payment_method==="cash"?"เงินสด":"พร้อมเพย์", o.status==="void"?"ยกเลิก":"ปกติ", o.void_reason||""]);
  csvDownload(`banfa_${$("#from").value}_${$("#to").value}.csv`,
    ["วันเวลา","พนักงาน","รายการ","ยอด","ต้นทุน","ส่วนลด","ช่องทาง","สถานะ","เหตุผลยกเลิก"], rows);
  toast(`ส่งออก ${all.length} บิลแล้ว`,"ok");
}

/* ================= Export: ยอดขายรายวัน ================= */
function exportDayCSV(){
  if(!SUM || !Object.keys(SUM.days).length){ toast("ไม่มีข้อมูลให้ส่งออก","err"); return; }
  const days = Object.keys(SUM.days).sort();
  const rows = days.map(d=>[d, SUM.days[d]]);
  csvDownload(`banfa_รายวัน_${$("#from").value}_${$("#to").value}.csv`, ["วันที่","ยอดขาย"], rows);
  toast(`ส่งออก ${days.length} วันแล้ว`,"ok");
}

/* ================= Export: ยอดขายรายเดือน ================= */
function exportMonthCSV(){
  if(!MONTHS || !Object.keys(MONTHS).length){ toast("ไม่มีข้อมูลให้ส่งออก","err"); return; }
  const keys = Object.keys(MONTHS).sort();
  const rows = keys.map(k=>[k, MONTHS[k].rev, MONTHS[k].bills]);
  csvDownload(`banfa_รายเดือน.csv`, ["เดือน","ยอดขาย","จำนวนบิล"], rows);
  toast(`ส่งออก ${keys.length} เดือนแล้ว`,"ok");
}

/* ================= Export: ยอดขายตามหมวด ================= */
function exportCatCSV(){
  if(!SUM || !SUM.top.length){ toast("ไม่มีข้อมูลให้ส่งออก","err"); return; }
  const catOf = name => (MENU.find(m=>m.name===name)||{}).cat || "etc";
  const catName = id => (CATS.find(c=>c.id===id)||{}).th || id;
  const agg = {};
  for(const t of SUM.top){ const c=catOf(t.name); const a=agg[c] ||= {q:0,amt:0}; a.q+=t.q; a.amt+=t.a; }
  for(const c in SUM.cats){ (agg[c] ||= {q:0,amt:0}).amt = SUM.cats[c]; }
  const keys = Object.keys(agg).filter(k=>agg[k].amt>0).sort((a,b)=>agg[b].amt-agg[a].amt);
  if(!keys.length){ toast("ไม่มีข้อมูลให้ส่งออก","err"); return; }
  const rows = keys.map(k=>[catName(k), agg[k].q, agg[k].amt]);
  csvDownload(`banfa_ตามหมวด_${$("#from").value}_${$("#to").value}.csv`, ["หมวด","จำนวนชิ้น","ยอดขาย"], rows);
  toast(`ส่งออก ${keys.length} หมวดแล้ว`,"ok");
}

/* ================= Export: ยอดขายตามสินค้า ================= */
function exportProductCSV(){
  const s = SUM || {top:[]};
  if(!s.top.length){ toast("ไม่มีข้อมูลให้ส่งออก","err"); return; }
  const rows = s.top.map((t,i)=>[i+1, t.name, t.q, t.a]);
  csvDownload(`banfa_ตามสินค้า_${$("#from").value}_${$("#to").value}.csv`, ["อันดับ","สินค้า","จำนวนชิ้น","ยอดขาย"], rows);
  toast(`ส่งออก ${s.top.length} รายการแล้ว`,"ok");
}
