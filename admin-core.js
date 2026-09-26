/* ================= CONFIG ================= */
/* ค่าจริง (URL/KEY/รหัสผ่าน) อยู่ที่ config-admin.js แยกไฟล์ — ไฟล์นั้นไม่ขึ้น git
   ถ้าเพิ่งโคลนมาเครื่องใหม่แล้วเจอ "CONFIG is not defined" ให้ก็อป config-admin.example.js
   เป็น config-admin.js แล้วใส่ค่าจริงตามคู่มือใน README.md */
/* บั๊กที่เจอ 21/9: browser cache ไฟล์ .js แต่ละไฟล์ไม่พร้อมกัน (คนละ TTL/CDN) ทำให้ได้
   admin-core.js เก่า + admin-stock.js ใหม่มาคู่กัน -> ตัวแปรที่เพิ่งประกาศใน core หายไป
   ป้องกันด้วย query string ?v=... ต่อท้าย <script src> ทุกไฟล์ใน admin.html —
   ทุกครั้งที่ bump APP_VERSION ตรงนี้ ต้องแก้เลขใน admin.html ให้ตรงกันด้วยเสมอ */
const APP_VERSION = "2026.09.24-b";

/* ================= ค่าคงที่ ================= */
const CATS = [
  {id:"hc", th:"ร้อน-มีกาแฟ",   c:"#b5732e"},
  {id:"hn", th:"ร้อน-ไม่มีกาแฟ", c:"#d98a3f"},
  {id:"ic", th:"เย็น-มีกาแฟ",   c:"#2e86c9"},
  {id:"in", th:"เย็น-ไม่มีกาแฟ", c:"#33a9b0"},
  {id:"fc", th:"ปั่น-มีกาแฟ",   c:"#7d5aa8"},
  {id:"fn", th:"ปั่น-ไม่มีกาแฟ", c:"#b268a0"},
  {id:"sm", th:"Smoothie",     c:"#d95f7d"},
  {id:"etc",th:"อื่นๆ",         c:"#7a8896"}
];
const catTh = id => (CATS.find(c=>c.id===id)||{}).th || id;
const catColor = id => (CATS.find(c=>c.id===id)||{}).c || "#7a8896";
const locName = id => id==="wh" ? "คลังหลังร้าน" : id==="front" ? "หน้าร้าน" : (id||"—");
const MOVE_TH = {receive:"รับเข้าคลัง",transfer:"เบิกมาหน้าร้าน",issue:"จ่ายออก",adjust:"ปรับยอด",sale:"ขาย"};
/* ปุ่มลัดเหตุผลรายจ่ายที่หน้าขาย (POS ปิดกะ/บันทึกรายจ่าย) — ตั้งได้ที่นี่ (ตั้งค่า → ตั้งค่าร้าน)
   ต้องตรงกับ DEFAULT_CM_OUT ใน pos-sell.html (ใช้เป็นค่าเริ่มต้นถ้ายังไม่เคยตั้งเอง) */
const DEFAULT_CM_OUT = ["ซื้อวัตถุดิบ/ของใช้ร้าน","ค่าขนส่ง/ค่าน้ำมัน","ค่าจิปาถะอื่นในร้าน"];
const splitCsv = s => (s||"").split(",").map(x=>x.trim()).filter(Boolean);

/* ================= สถานะ ================= */
let ME=null, page="dash", token=null, refreshTok=null, authBusy=false;
let MENU=[], OPTG=[], REC={}, SETTINGS={pp:"",shopName:"บ้านฟ้ากาแฟสด"}, STOCK=[], STAFF=[];
let SUM=null, PREV=null, rows=[], billPage=0, billTotal=0;
let docLines=[], counted={}, countLoc="front", recFilter="", busy=false;
let countUnitBuy={};   /* นับสต็อกจริง: ต่อวัตถุดิบ — นับเป็นหน่วยซื้อ(true)หรือหน่วยใช้(false) ค่าเริ่มต้น = หน่วยซื้อถ้ามี
                           ค่าจริงโหลดจาก localStorage ทีหลัง (หลัง const store ประกาศแล้ว) — ดูด้านล่าง */
/* กันเอกสารสต็อก/นับสต็อกซ้ำถ้า retry หลัง network timeout (C4) — ยิงซ้ำด้วย client_id เดิมถ้ายังไม่
   ถูกเคลียร์ (แปลว่าครั้งก่อนไม่รู้ผล) เซิร์ฟเวอร์คืนเลขที่เอกสารเดิมกลับมาแทนสร้างซ้ำ
   ข้อจำกัดที่รู้: ถ้ากดบันทึกครั้งแรกพลาดเพราะ network (ไม่ใช่ validation error) แล้วแก้ไขรายการก่อนกดซ้ำ
   client_id เดิมจะยังผูกกับเนื้อหารอบแรก — เคสนี้แคบมาก (ต้องพลาดที่ network เป๊ะๆ +แก้ไขในหน้าต่างนั้นพอดี)
   ยอมรับความเสี่ยงนี้ไว้ก่อนตามสโคป "เบา" ของ C4 — ถ้าจะปิดให้สนิทต้อง reset ตอนแก้ไขทุกช่อง */
let docClientId=null, countClientId=null;
const newClientId = () => Date.now().toString(36)+Math.random().toString(36).slice(2,8);
let recipeOpen={};   /* {itemId:true} — เมนูไหนถูกกางดูรายละเอียดสูตรอยู่ */
const PER_PAGE = 200;

/* ================= เครื่องมือพื้นฐาน ================= */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const baht = n => "฿" + Number(Math.round((+n||0)*100)/100).toLocaleString("en-US");
const n2 = n => Math.round((+n||0)*100)/100;
const qty = (n,u) => Number(Math.round((+n||0)*100)/100).toLocaleString("en-US") + (u?` ${u}`:"");
const pad2 = n => String(n).padStart(2,"0");
const dstr = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const today = () => dstr(new Date());
const shortNum = n => {
  n = Math.round(n);
  if (n >= 100000) return Math.round(n/1000)+"k";
  if (n >= 10000)  return (n/1000).toFixed(1).replace(/\.0$/,"")+"k";
  return n.toLocaleString("en-US");
};
const store = {
  get(k){ try{ const v=localStorage.getItem(k); return v==null?null:JSON.parse(v);}catch{ return null; } },
  set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch{} }
};
countUnitBuy = store.get("count_unit_buy") || {};   /* จำหน่วยที่นับไว้ครั้งก่อนต่อวัตถุดิบ ข้ามเครื่อง/รีเฟรชได้ */

/* ================= แจ้งเตือน / กล่องยืนยัน ================= */
let toastTimer=null;
function toast(msg, kind=""){
  const t=$("#toast"); t.textContent=msg; t.className=`toast on ${kind}`;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{ t.className=`toast ${kind}`; },2400);
}
function setSync(state, txt){ const c=$("#sync"); c.className=`syncchip ${state}`; c.textContent=txt; }

let dlgResolve=null;
function ask(title, msg, opts={}){
  return new Promise(res=>{
    dlgResolve=res;
    $("#dlgTitle").textContent=title;
    $("#dlgMsg").textContent=msg||"";
    const inp=$("#dlgInput");
    inp.hidden=!opts.input; inp.value=opts.value||""; inp.placeholder=opts.placeholder||"";
    $("#dlgYes").className=`yes${opts.safe?" safe":""}`;
    $("#dlgYes").textContent=opts.yes||"ยืนยัน";
    $("#dlg").classList.add("on");
    if(opts.input) setTimeout(()=>inp.focus(),60);
  });
}
function closeDlg(val=null){ $("#dlg").classList.remove("on"); if(dlgResolve){ dlgResolve(val); dlgResolve=null; } }

/* ================= API ================= */
const base = () => CONFIG.URL.replace(/\/+$/,"").replace(/\/rest\/v1$/,"");
const headers = extra => ({
  apikey: CONFIG.KEY,
  "Content-Type": "application/json",
  ...(token ? {Authorization:`Bearer ${token}`}
            : CONFIG.KEY.startsWith("eyJ") ? {Authorization:`Bearer ${CONFIG.KEY}`} : {}),
  ...extra
});
const ERR = {0:"เชื่อมต่ออินเทอร์เน็ตไม่ได้",400:"ข้อมูลไม่ถูกต้อง",
  401:"ไม่มีสิทธิ์เข้าถึงข้อมูล",403:"ไม่มีสิทธิ์เข้าถึงข้อมูล",404:"ไม่พบข้อมูล",
  409:"ข้อมูลซ้ำ",500:"ระบบขัดข้องชั่วคราว"};
function friendly(status, raw){
  if(raw) console.error("[banfa]", status, raw);
  return ERR[status] || ERR[500];
}
/* โครงหน้าจอเปล่าๆ ตอนกำลังโหลด — แทนข้อความ "กำลังโหลด" เฉยๆ
   ให้ความรู้สึกว่าเนื้อหากำลังจะมา ไม่ใช่หน้าจอค้าง */
function skeletonPage(){
  return `<div class="grid4">${Array(4).fill('<div class="card kpi"><div class="skel skel-kpi"></div></div>').join("")}</div>
    <div class="card"><div class="skel skel-row w40"></div>
      ${Array(5).fill('<div class="skel skel-row"></div>').join("")}
    </div>`;
}
/* ดาวน์โหลด CSV แบบใช้ร่วมกันทุกรายงาน — กัน formula injection + ใส่ BOM ให้ Excel อ่านไทยถูก */
function csvSafe(v){ const t=String(v??""); return /^[=+\-@]/.test(t) ? "'"+t : t; }
function csvDownload(filename, header, rows){
  const out = [header, ...rows];
  const csv = "\uFEFF" + out.map(r=>r.map(c=>`"${csvSafe(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  a.download = filename; a.click();
}
function skeletonList(n=3){
  return Array(n).fill('<div class="skel skel-row w80" style="margin:14px 0"></div>').join("");
}
async function signIn(){
  if(!CONFIG.AUTH_EMAIL || !CONFIG.AUTH_PASSWORD) return false;
  try{
    const r = await fetch(`${base()}/auth/v1/token?grant_type=password`,{
      method:"POST", headers:{apikey:CONFIG.KEY,"Content-Type":"application/json"},
      body:JSON.stringify({email:CONFIG.AUTH_EMAIL,password:CONFIG.AUTH_PASSWORD})});
    const d = await r.json();
    if(d?.access_token){
      token=d.access_token; refreshTok=d.refresh_token||null;
      store.set("tok",token); store.set("rtok",refreshTok);
      return true;
    }
  }catch{}
  return false;
}
async function renew(){
  if(authBusy){ await new Promise(r=>setTimeout(r,600)); return !!token; }
  authBusy=true;
  try{
    if(refreshTok){
      const r = await fetch(`${base()}/auth/v1/token?grant_type=refresh_token`,{
        method:"POST", headers:{apikey:CONFIG.KEY,"Content-Type":"application/json"},
        body:JSON.stringify({refresh_token:refreshTok})});
      const d = await r.json();
      if(d?.access_token){
        token=d.access_token; refreshTok=d.refresh_token||refreshTok;
        store.set("tok",token); store.set("rtok",refreshTok);
        return true;
      }
    }
    return await signIn();
  } finally { authBusy=false; }
}
/* ทุก request ผ่านตัวนี้ — token หมดอายุจะต่ออายุแล้วยิงซ้ำให้เอง */
async function api(path, init={}){
  const url = path.startsWith("http") ? path : base()+path;
  const opt = {...init, headers: headers(init.extraHeaders)};
  let r = await fetch(url, opt);
  if(r.status===401 && CONFIG.AUTH_EMAIL){
    await renew();
    r = await fetch(url, {...init, headers: headers(init.extraHeaders)});
  }
  return r;
}
async function apiJson(path, init){
  const r = await api(path, init);
  if(!r.ok){ const t=await r.text(); throw {status:r.status, body:t}; }
  return r.json();
}
const rpc = (fn, args) => apiJson(`/rest/v1/rpc/${fn}`,{method:"POST",body:JSON.stringify(args)});

/* ================= ธีม ================= */
const THEMES=[["auto","ตามเครื่อง","สว่างกลางวัน มืดกลางคืน ตามการตั้งค่าอุปกรณ์"],
              ["light","สว่าง","พื้นขาว เหมาะกับกลางวัน"],
              ["dark","มืด","ถนอมสายตาตอนกลางคืน"]];
const getTheme = () => { const t=store.get("theme"); return (t==="light"||t==="dark")?t:"auto"; };
function applyBranding(){
  const name = (SETTINGS.shopName||"บ้านฟ้ากาแฟสด").trim() || "บ้านฟ้ากาแฟสด";
  document.title = `${name} — หลังบ้าน`;
  document.querySelectorAll(".lgname, .side-top b").forEach(el=> el.textContent = name);
  const foot = $("#foot"); if(foot) foot.innerHTML = `${esc(name)} Back Office<br>v${APP_VERSION}`;
}
function applyTheme(t){ document.documentElement.setAttribute("data-theme",t); store.set("theme",t); }

/* ================= ช่วงวันที่ ================= */
function setRange(days){
  const to=new Date(), from=new Date();
  if(days===1){ to.setDate(to.getDate()-1); from.setDate(from.getDate()-1); }
  else if(days>1){ from.setDate(from.getDate()-(days-1)); }
  $("#from").value=dstr(from); $("#to").value=dstr(to);
}
function range(){
  const f=$("#from").value||today(), t=$("#to").value||today();
  const a=new Date(f+"T00:00:00"), b=new Date(t+"T00:00:00"); b.setDate(b.getDate()+1);
  return {from:a.toISOString(), to:b.toISOString()};
}
function prevRange(){
  const f=$("#from").value||today(), t=$("#to").value||today();
  const s=new Date(f+"T00:00:00"), e=new Date(t+"T00:00:00");
  const days=Math.round((e-s)/86400000)+1;
  const pe=new Date(s), ps=new Date(s); ps.setDate(ps.getDate()-days);
  return {from:ps.toISOString(), to:pe.toISOString()};
}

/* ================= กราฟแท่ง ================= */
/* กราฟแท่งแบบ SVG — วาดด้วยพิกัด viewBox คงที่ ไม่พึ่งการวัดความสูงจาก CSS/JS เลย
   จึงไม่มีทางพังจากความแตกต่างของเบราว์เซอร์ (ต่างจากวิธีเดิมที่ใช้ height:% ใน flex ซ้อนกัน) */
function barChart(map, keys, labels, color="var(--crema)"){
  const mx = Math.max(0, ...keys.map(k=>map[k]||0));
  const dense = keys.length > 24;
  const n = keys.length || 1;
  const W = 1000, H = 160;               /* หน่วยภายใน SVG — คงที่เสมอ ไม่ขึ้นกับจอ */
  const gap = dense ? 2 : 6;
  const barW = Math.max((W - gap*(n-1)) / n, 1);
  const skyColor = "var(--brand)";

  let rects = "";
  keys.forEach((k,i)=>{
    const v = map[k]||0;
    const pct = mx ? v/mx : 0;
    const bh = Math.max(pct*H, v>0 ? 3 : 1.5);
    const x = i*(barW+gap);
    const y = H-bh;
    const fill = v ? color : "var(--line-2)";
    rects += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${fill}">`
           + `<title>${esc(labels[i])}: ${baht(v)}</title></rect>`;
  });

  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="chartsvg">${rects}</svg>`;

  /* ป้ายค่า/เวลา แยกเป็น HTML ปกติ ใช้ flex:1 คอลัมน์เท่ากัน — วิธีนี้ใช้ในหน้าอื่นของระบบอยู่แล้วและเสถียร */
  const cols = keys.map((k,i)=>{
    const v = map[k]||0;
    return `<div class="chart-col">
      <b class="${dense?"hide":""}">${v?shortNum(v):""}</b>
      <span class="${dense?"dense":""}">${esc(labels[i])}</span></div>`;
  }).join("");

  return `<div class="chart2">${svg}<div class="chart-labels">${cols}</div></div>`;
}
function delta(now, prev){
  if(prev==null) return `<div class="s">ไม่มีข้อมูลเทียบ</div>`;
  const d = now - prev;
  const pct = prev!==0 ? Math.round(d/Math.abs(prev)*100) : (now>0?100:0);
  const cls = d>0?"up":d<0?"down":"flat";
  const arrow = d>0?"▲":d<0?"▼":"=";
  return `<div class="s ${cls}">${arrow} ${d>0?"+":""}${pct}% เทียบช่วงก่อน (${baht(prev)})</div>`;
}

/* ================= โหลดข้อมูล ================= */
async function loadShopNameOnly(){
  try{
    const list = await apiJson("/rest/v1/app_config?select=value&key=eq.settings");
    if(list?.[0]?.value?.shopName) SETTINGS.shopName = list[0].value.shopName;
  }catch{ /* เงียบไว้ — ใช้ชื่อ default แทน ไม่ใช่จุดสำคัญพอจะโชว์ error ตอนยังไม่ล็อกอิน */ }
  applyBranding();
}
let CFG_VER = {}; // key -> updated_at ล่าสุดที่โหลดมา (กันบันทึกทับข้อมูลที่คนอื่นแก้ไปแล้วเงียบๆ)
async function loadConfig(){
  try{
    const list = await apiJson("/rest/v1/app_config?select=*");
    for(const r of list){
      if(r.key==="menu" && r.value?.length) MENU=r.value;
      if(r.key==="optgroups" && r.value?.length) OPTG=r.value;
      if(r.key==="recipes") REC=r.value||{};
      if(r.key==="settings") SETTINGS=r.value||{pp:"",shopName:"บ้านฟ้ากาแฟสด"};
      CFG_VER[r.key]=r.updated_at||null;
    }
    store.set("menu",MENU); store.set("optgroups",OPTG);
    store.set("recipes",REC); store.set("settings",SETTINGS);
    return true;
  }catch(e){
    MENU=store.get("menu")||[]; OPTG=store.get("optgroups")||[];
    REC=store.get("recipes")||{}; SETTINGS=store.get("settings")||{pp:"",shopName:"บ้านฟ้ากาแฟสด"};
    return false;
  }
}
async function saveConfig(key, okMsg="บันทึกแล้ว"){
  const val = {menu:MENU, optgroups:OPTG, recipes:REC, settings:SETTINGS}[key];
  store.set(key,val);
  setSync("busy","กำลังบันทึก…");
  try{
    /* กันเขียนทับเงียบๆ: เช็ค updated_at ปัจจุบันในเซิร์ฟเวอร์เทียบกับตอนที่เราโหลดมาก่อนหน้านี้
       ถ้าไม่ตรงกัน แปลว่ามีคน/เครื่องอื่นแก้ config นี้ไปแล้วระหว่างที่เรากำลังแก้อยู่ */
    const cur = await apiJson(`/rest/v1/app_config?select=updated_at&key=eq.${key}`);
    const serverVer = cur?.[0]?.updated_at || null;
    if(CFG_VER[key] && serverVer && serverVer!==CFG_VER[key]){
      setSync("bad","มีการแก้ไขจากที่อื่น");
      toast("มีคนแก้ค่านี้ไปแล้วหลังจากที่คุณโหลด — กรุณาโหลดใหม่แล้วแก้อีกครั้ง","err");
      return false;
    }
    const nowIso = new Date().toISOString();
    const r = await api("/rest/v1/app_config?on_conflict=key",{
      method:"POST", extraHeaders:{Prefer:"resolution=merge-duplicates,return=minimal"},
      body:JSON.stringify({key,value:val,updated_at:nowIso})});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    CFG_VER[key]=nowIso;
    setSync("ok","พร้อม"); toast(okMsg,"ok");
    return true;
  }catch(e){
    setSync("bad","บันทึกไม่สำเร็จ"); toast(friendly(e.status,e.body),"err");
    return false;
  }
}
/* ================= คำนวณยอดคงเหลือสดจากเอกสารทั้งหมด =================
   เลิกเชื่อ stock_levels ที่สะสมไว้ทั้งหมด (เคยพังจากบั๊กสะสมมาก่อน — deductForResend พลาดตัวเลือก,
   void เคยคืนสต็อกผิด ฯลฯ) คำนวณจากต้นทางแท้ๆ 2 อย่างเท่านั้นทุกครั้ง: เอกสารสต็อก (รับ/เบิก/จ่ายออก/นับ)
   กับบิลขายจริงทั้งหมด — ไม่สนใจแถวประเภท "sale" เก่าที่อาจมีอยู่ในประวัติเลย (คำนวณจากบิลสดแทนเสมอ)
   คำนวณครั้งเดียวต่อเซสชัน แคชไว้ กด "รีเฟรชยอด" เพื่อคำนวณใหม่ */
let freshStockCache = null;
async function fetchAllPaged(path, pageSize=1000, maxPages=200){
  /* หยุดเมื่อได้หน้า "ว่างเปล่าจริงๆ" เท่านั้น (d.length===0) — ห้ามใช้ d.length<pageSize เป็นเงื่อนไขหยุด
     เพราะ apiJson() ไม่คืน header กลับมา เช็คไม่ได้ว่า Supabase แอบจำกัดจำนวนแถวต่อ request
     ไว้ต่ำกว่าที่ขอหรือเปล่า (ค่าเริ่มต้นทั่วไปมักเป็น 1000) ถ้าเซิร์ฟเวอร์ตัดจาก 2000 เหลือ 1000 เงียบๆ
     การเช็ค d.length<pageSize จะ true ทันทีและหยุดก่อนถึงข้อมูลจริง โดยไม่มี error ให้เห็นเลย
     ต้องรอให้เจอหน้าที่ว่างเปล่าสนิทเท่านั้นถึงจะมั่นใจได้ว่าถึงข้อมูลสุดท้ายแล้วจริงๆ */
  let all=[], p=0;
  for(;p<maxPages;p++){
    const d = await apiJson(`${path}&order=created_at.asc&offset=${p*pageSize}&limit=${pageSize}`);
    if(!d.length) break;
    all = all.concat(d);
  }
  return all;
}
/* หา ing/iqty ของตัวเลือกที่ถูกเลือกในบิล — บิลใหม่เก็บ ing/iqty ไว้ตรงๆ แล้ว (แม่นตลอดกาล
   ไม่ว่าจะเปลี่ยนชื่อ/โครงสร้างกลุ่มตัวเลือกทีหลังแค่ไหนก็ตาม) บิลเก่าก่อนหน้านี้เก็บแค่ชื่อ
   ต้องถอยไปเทียบชื่อกับกลุ่มตัวเลือกปัจจุบันแทน (แม่นน้อยกว่า เพราะชื่ออาจถูกเปลี่ยนไปแล้ว) */
/* ใช้สูตรที่บันทึกไว้ในบิล ณ ตอนขายก่อนเสมอ (แม่นตลอดกาล ไม่ว่าจะแก้สูตรทีหลังกี่ครั้ง)
   บิลเก่าก่อนหน้านี้ไม่มีสูตร snapshot ติดมา ต้องถอยไปใช้สูตรปัจจุบันแทน (แม่นน้อยกว่าถ้าเคยแก้สูตร) */
function recipeAt(it){
  return Array.isArray(it.recipe) ? it.recipe : recipeOf(it.id);
}
function optIngIqty(opt, cat){
  /* เช็คว่า field "ing" มีอยู่จริงไหม (ไม่ใช่ truthy) — บิลใหม่ที่ตัวเลือกตั้งใจไม่ผูกวัตถุดิบ
     จะมี ing:"" ติดมาด้วย ถ้าเช็คแบบ truthy จะตกไปเดาชื่อทับกับตัวเลือกอื่นที่ชื่อซ้ำกันโดยไม่ตั้งใจ
     ("ing" in opt) แยกกรณีนี้ออกจากบิลเก่าที่ไม่มี field ing ติดมาเลยจริงๆ */
  if(opt && typeof opt==="object" && "ing" in opt) return {ing:opt.ing||"", iqty:+opt.iqty||0};
  const name = (typeof opt==="object" ? opt?.name : opt) || "";
  /* บิลเก่าไม่มี ing ติดมา ต้องเดาจากชื่อ — ถ้ารู้หมวดของเมนู ให้ลองหาในกลุ่มที่ผูกหมวดนั้นก่อน
     กันเคส 2 กลุ่มใช้ชื่อตัวเลือกซ้ำกัน (เช่น "แก้วร้อน"/"แก้วเย็น" ต่างมี "ไม่ได้นำแก้วมา" เหมือนกัน) */
  if(cat){
    for(const g of OPTG){
      if(!g.cats.includes(cat)) continue;
      const o2 = (g.options||[]).find(x=>(x.name||"").trim()===name.trim() && x.ing && x.iqty);
      if(o2) return {ing:o2.ing, iqty:+o2.iqty||0};
    }
  }
  for(const g of OPTG){
    const o2 = (g.options||[]).find(x=>(x.name||"").trim()===name.trim() && x.ing && x.iqty);
    if(o2) return {ing:o2.ing, iqty:+o2.iqty||0};
  }
  return null;
}
async function computeFreshStock(){
  const out = {};   /* {ingId: {wh, front}} */
  const bump = (ing, loc, delta) => { const a = out[ing] ||= {wh:0, front:0}; a[loc] = (a[loc]||0) + delta; };

  const moves = await fetchAllPaged("/rest/v1/stock_moves?select=ingredient_id,type,qty,from_location,to_location");
  for(const m of moves){
    if(m.type==="sale") continue;   /* คำนวณยอดขายจากบิลสดแทนเสมอ กันนับซ้ำกับของเก่าที่อาจพลาดมา */
    const q = +m.qty||0;
    if(m.type==="adjust"){
      /* qty เป็นค่าติดลบได้ ทิศทางอยู่ที่ field ไหนถูกตั้ง ไม่ใช่ subtract-from เหมือนประเภทอื่น */
      if(m.to_location) bump(m.ingredient_id, m.to_location, q);
      else if(m.from_location) bump(m.ingredient_id, m.from_location, q);
    }else{
      if(m.to_location) bump(m.ingredient_id, m.to_location, q);
      if(m.from_location) bump(m.ingredient_id, m.from_location, -q);
    }
  }

  const orders = await fetchAllPaged("/rest/v1/orders?select=status,items");
  for(const o of orders){
    if(o.status==="void") continue;
    for(const it of (o.items||[])){
      recipeAt(it).forEach(r=> bump(r.ing, "front", -(r.qty*(+it.qty||0))));
      const cat = MENU.find(m=>m.id===it.id)?.cat;
      (it.options||[]).forEach(opt=>{
        const o2 = optIngIqty(opt, cat);
        if(o2 && o2.ing) bump(o2.ing, "front", -(o2.iqty*(+it.qty||0)));
      });
    }
  }
  return out;
}
async function loadStock(force){
  try{
    STOCK = await apiJson("/rest/v1/stock_overview?select=*&order=name");
    if(force || !freshStockCache) freshStockCache = await computeFreshStock();
    /* ระบบคลังกลาง (wh) แยกออกไปเป็นระบบต่างหากแล้ว (2026.09) — เว็บนี้จัดการแค่ "หน้าร้าน" เท่านั้น
       qty_total/value_total เลยนับจาก front ล้วนๆ ไม่บวก wh เข้ามาแล้ว (ของเก่าที่เคยรับเข้า wh
       ยังคำนวณ x.qty_wh ไว้เผื่อใช้/ตรวจสอบย้อนหลัง แต่ไม่มีผลกับยอด/มูลค่าที่แสดงในหน้านี้อีก) */
    STOCK.forEach(x=>{
      const c = freshStockCache[x.id] || {wh:0, front:0};
      x.qty_wh = n2(c.wh); x.qty_front = n2(c.front); x.qty_total = n2(c.front);
      x.value_total = n2(c.front * (+x.cost||0));
      x.low_wh_flag = x.qty_wh <= (+x.low_wh||0);
      x.low_front_flag = x.qty_front <= (+x.low_front||0);
    });
    const n = STOCK.filter(x=>x.low_front_flag).length;
    lowStockCount = n;
    $("#tabDot").hidden = !n;
    return true;
  }catch(e){ lastErr = friendly(e.status,e.body); return false; }
}
let lastErr = "";
const findIng = id => STOCK.find(x=>x.id===id);
const recipeOf = id => REC[String(id)] || [];
const menuCost = id => recipeOf(id).reduce((s,r)=>{ const i=findIng(r.ing); return s + (i? i.cost*r.qty : 0); },0);

let useRPC = true;   /* ถ้าไม่มี RPC สรุป จะถอยไปคำนวณเองจากบิลดิบ */

/* คำนวณสรุปจากบิลดิบ — ใช้เมื่อยังไม่ได้รัน schema-reports.sql */
function summarizeRaw(list){
  const S = {rev:0,cost:0,disc:0,cash:0,pp:0,bills:0,voids:0,voidAmt:0,
             days:{},hours:{},staff:{},cats:{},top:[]};
  const items = {};
  const catOf = id => (MENU.find(m=>m.id===id)||{}).cat || "etc";
  for(const o of list){
    const t = +o.total||0;
    if(o.status==="void"){ S.voids++; S.voidAmt+=t; continue; }
    S.bills++; S.rev+=t; S.cost+=+o.cost||0; S.disc+=+o.discount||0;
    if(o.payment_method==="cash") S.cash+=t; else S.pp+=t;
    const d = new Date(o.created_at);
    const dk = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
    S.days[dk] = (S.days[dk]||0)+t;
    S.hours[d.getHours()] = (S.hours[d.getHours()]||0)+t;
    const st = o.staff||"-";
    S.staff[st] = (S.staff[st]||0)+t;
    for(const it of (o.items||[])){
      const amt = (+it.price||0)*(+it.qty||0);
      const e = items[it.name] ||= {q:0,a:0};
      e.q += +it.qty||0; e.a += amt;
      const c = catOf(it.id);
      S.cats[c] = (S.cats[c]||0)+amt;
    }
  }
  S.profit = S.rev - S.cost;
  S.margin = S.rev>0 ? Math.round(S.profit/S.rev*100) : 0;
  S.avg    = S.bills>0 ? S.rev/S.bills : 0;
  S.top = Object.entries(items).map(([name,v])=>({name,q:v.q,a:v.a}))
            .sort((a,b)=>b.q-a.q).slice(0,20);
  return S;
}
let rawRangeCache = null;   /* {key, promise} — กันยิงซ้ำเวลาโหมดถอยหลายฟังก์ชันขอช่วงเดียวกันพร้อมกัน */
async function fetchRawRange(from,to,limit=3000){
  const key = `${from}|${to}|${limit}`;
  if(rawRangeCache && rawRangeCache.key===key) return rawRangeCache.promise;
  /* เดิมยิงครั้งเดียวเชื่อว่าเซิร์ฟเวอร์คืนครบตามที่ขอ — เสี่ยงข้อมูลหายเงียบๆ ถ้า Supabase
     จำกัดจำนวนแถวต่อ request ไว้ต่ำกว่า limit ที่ขอ (เช่นขอ 3000 แต่เซิร์ฟเวอร์ตัดเหลือ 1000)
     เปลี่ยนมาแบ่งหน้าอย่างปลอดภัย หยุดเมื่อเจอหน้าว่างเปล่าจริงๆ หรือครบ limit ที่ขอเท่านั้น */
  const p = (async () => {
    const pageSize = Math.min(1000, limit);
    let all = [], offset = 0;
    while(all.length < limit){
      const remain = limit - all.length;
      const take = Math.min(pageSize, remain);
      const d = await apiJson(`/rest/v1/orders?select=created_at,total,cost,discount,payment_method,status,staff,items`
        +`&created_at=gte.${encodeURIComponent(from)}&created_at=lt.${encodeURIComponent(to)}`
        +`&order=created_at.desc&offset=${offset}&limit=${take}`);
      if(!d.length) break;   /* หยุดเมื่อหน้าว่างเปล่าจริงๆ เท่านั้น — ห้ามเทียบ d.length กับ take
                                 เพราะเซิร์ฟเวอร์อาจตัดให้น้อยกว่าที่ขอโดยที่ยังมีข้อมูลเหลืออยู่ */
      all = all.concat(d);
      offset += d.length;
    }
    return all;
  })();
  rawRangeCache = {key, promise:p};
  return p;
}
async function loadSummary(){
  const R = range(), arg = {p_from:R.from, p_to:R.to};
  setSync("busy","กำลังสรุป…");
  if(useRPC){
    try{
      const [g,d,h,st,ti,ct] = await Promise.all([
        rpc("sales_summary",arg), rpc("sales_by_day",arg), rpc("sales_by_hour",arg),
        rpc("sales_by_staff",arg), rpc("top_items",{...arg,p_limit:20}), rpc("sales_by_category",arg)
      ]);
      const s = g?.[0] || {};
      SUM = {
        rev:+s.revenue||0, cost:+s.cost||0, disc:+s.discount||0,
        cash:+s.cash||0, pp:+s.pp||0,
        bills:+s.bills||0, voids:+s.voids||0, voidAmt:+s.void_amount||0,
        days:{}, hours:{}, staff:{}, cats:{},
        top:(ti||[]).map(x=>({name:x.name, q:+x.qty||0, a:+x.amount||0}))
      };
      SUM.profit = SUM.rev - SUM.cost;
      SUM.margin = SUM.rev>0 ? Math.round(SUM.profit/SUM.rev*100) : 0;
      SUM.avg    = SUM.bills>0 ? SUM.rev/SUM.bills : 0;
      (d||[]).forEach(x=> SUM.days[x.day]=+x.revenue||0);
      (h||[]).forEach(x=> SUM.hours[x.hour]=+x.revenue||0);
      (st||[]).forEach(x=> SUM.staff[x.staff]=+x.revenue||0);
      (ct||[]).forEach(x=> SUM.cats[x.cat]=+x.amount||0);
      setSync("ok","พร้อม");
      return true;
    }catch(e){
      /* ปัญหาสิทธิ์เข้าถึง (401/403) ต้องแจ้งตรงๆ — ถอยไปคำนวณเองก็จะพังด้วยเหตุผลเดียวกัน
         ทุกกรณีอื่น (RPC ไม่มี, พารามิเตอร์ผิด, ฟังก์ชันพัง ฯลฯ) ให้ถอยไปคำนวณเองแทนเสมอ
         เพื่อไม่ให้กราฟว่างเปล่าทั้งหน้าโดยไม่มีทางออก */
      if(e.status===401 || e.status===403){
        SUM=null; setSync("bad","ไม่มีสิทธิ์เข้าถึงข้อมูล");
        lastErr = friendly(e.status,e.body);
        return false;
      }
      useRPC = false;
      console.warn("[banfa] ตัวสรุปยอดบนเซิร์ฟเวอร์ใช้ไม่ได้ — ใช้วิธีคำนวณจากบิลดิบแทน", e.status, e.body);
    }
  }
  /* ทางถอย: ดึงบิลดิบมาคำนวณเอง */
  try{
    const list = await fetchRawRange(R.from, R.to);
    SUM = summarizeRaw(list);
    SUM.capped = list.length >= 3000;
    setSync("ok","พร้อม");
    return true;
  }catch(e){
    SUM=null; setSync("bad","โหลดไม่สำเร็จ");
    lastErr = friendly(e.status,e.body);
    return false;
  }
}
async function loadPrev(){
  const R = prevRange();
  if(useRPC){
    try{
      const r = await rpc("sales_summary",{p_from:R.from, p_to:R.to});
      const g = r?.[0] || {};
      PREV = {rev:+g.revenue||0, cost:+g.cost||0,
              profit:(+g.revenue||0)-(+g.cost||0), bills:+g.bills||0};
      return;
    }catch{ /* ตกไปใช้ทางถอย */ }
  }
  try{
    const list = await fetchRawRange(R.from, R.to);
    const s = summarizeRaw(list);
    PREV = {rev:s.rev, cost:s.cost, profit:s.profit, bills:s.bills};
  }catch{ PREV=null; }
}
async function loadBills(){
  const R = range();
  setSync("busy","กำลังโหลด…");
  try{
    if(useRPC){
      try{ billTotal = +await rpc("orders_count",{p_from:R.from,p_to:R.to}) || 0; }
      catch{ billTotal = 0; }
    }
    const r = await api(`/rest/v1/orders?select=id,created_at,total,cost,discount,payment_method,status,staff,void_reason,items`
      +`&created_at=gte.${encodeURIComponent(R.from)}&created_at=lt.${encodeURIComponent(R.to)}`
      +`&order=created_at.desc&offset=${billPage*PER_PAGE}&limit=${PER_PAGE}`,
      {extraHeaders:{Prefer:"count=exact"}});
    if(!r.ok) throw {status:r.status, body:await r.text()};
    rows = await r.json();
    /* ถ้าไม่มี RPC นับ ใช้ค่าจาก header Content-Range แทน */
    if(!billTotal){
      const cr = r.headers.get("content-range") || "";
      const n = parseInt(cr.split("/")[1],10);
      billTotal = isNaN(n) ? rows.length : n;
    }
    setSync("ok","พร้อม");
    return true;
  }catch(e){
    rows=[]; billTotal=0; setSync("bad","โหลดไม่สำเร็จ");
    lastErr = friendly(e.status,e.body);
    return false;
  }
}


async function logAct(action, detail=""){
  try{
    await api("/rest/v1/audit_log",{method:"POST", extraHeaders:{Prefer:"return=minimal"},
      body:JSON.stringify({local_id:Date.now().toString(36)+Math.random().toString(36).slice(2,8),
        created_at:new Date().toISOString(), actor:ME?.name||"-", action, detail})});
  }catch{}
}

const TITLES = {dash:"ภาพรวมร้านค้า", sales:"รายงานการขาย", products:"รายละเอียดสินค้า",
  bycat:"ยอดขายตามหมวด", byday:"ยอดขายรายวัน", bymonth:"ยอดขายรายเดือน",
  byproduct:"ยอดขายตามสินค้า", byoption:"ยอดขายตามกลุ่มตัวเลือก",
  shifts:"ประวัติกะ", audit:"ประวัติการแก้ไข", stock:"ภาพรวมสต็อก", receive:"รับของเข้าหน้าร้าน",
  count:"นับสต็อกจริง",
  usage:"การใช้วัตถุดิบ & ของหาย", moves:"ประวัติเคลื่อนไหว", menu:"เมนู & ราคา",
  recipe:"สูตร & ต้นทุน", options:"กลุ่มตัวเลือก", staff:"พนักงาน", settings:"ตั้งค่า"};
const NEEDS_RANGE = new Set(["dash","sales","products","bycat","byday","byproduct","byoption","shifts","usage","moves"]);
function render(){
  $("#title").textContent = TITLES[page] || "";
  $("#range").style.display = NEEDS_RANGE.has(page) ? "flex" : "none";
  $$(".side [data-p]").forEach(b=> b.classList.toggle("on", b.dataset.p===page));
  const g = GROUP_OF[page]; if(g) setGroupOpen(g, true);
  $$("#tabbar button").forEach(b=> b.classList.toggle("on", b.dataset.p===page));
  const html = {
    dash:pageDash, sales:pageSales, products:pageProducts,
    bycat:pageByCat, byday:pageByDay, bymonth:pageByMonth, byproduct:pageByProduct, byoption:pageByOption,
    shifts:pageShifts, audit:pageAudit,
    stock:pageStock, count:pageCount, usage:pageUsage, moves:pageMoves,
    menu:pageMenu, recipe:pageRecipe, options:pageOptions, staff:pageStaff, settings:pageSettings,
    receive:()=>pageDoc("receive")
  }[page];
  $("#page").innerHTML = html ? html() : "";
  if(page==="receive") loadRecentDocs(page);
  if(page==="recipe"){
    const el=$("#recSearch");
    el?.addEventListener("input", e=>{ collectRec(); recFilter=e.target.value; render();
      const x=$("#recSearch"); if(x){ x.focus(); x.setSelectionRange(x.value.length,x.value.length); } });
  }
  if(page==="menu"){
    const el=$("#menuSearch");
    el?.addEventListener("input", e=>{ collectMenu(); menuFilter=e.target.value; render();
      const x=$("#menuSearch"); if(x){ x.focus(); x.setSelectionRange(x.value.length,x.value.length); } });
  }
}
async function go(p){
  if(p!==page) billPage = 0;
  page = p;
  setSideOpen(false);
  $("#page").innerHTML = skeletonPage();
  lastErr = "";
  try{
    if(p==="dash"){ await loadStock(); await loadSummary(); await loadPrev(); }
    else if(p==="sales"){ await loadSummary(); await loadBills(); }
    else if(p==="products"){ await loadSummary(); await loadStock(); }
    else if(p==="byproduct"){ await loadSummary(); productDetailFor=""; productDetail=null;
      if(SUM?.top?.length) await loadProductDetail(SUM.top[0].name); }
    else if(p==="byoption"){ await loadOptionCounts(); }
    else if(p==="bycat"||p==="byday"){ await loadSummary(); await loadStock(); }
    else if(p==="bymonth"){ await loadMonths(); }
    else if(p==="shifts"){ await fetchShifts(); }
    else if(p==="audit"){ await fetchAudit(); }
    else if(p==="stock"){ await loadStock(); }
    else if(["receive","count"].includes(p)){ await loadStock(); }
    else if(p==="usage"){ await loadStock(); await fetchMoves(); await fetchSoldFromBills(); }
    else if(p==="moves"){ await loadStock(); await fetchMoves(); }
    else if(["menu","recipe","options"].includes(p)){ await loadStock(); }
    else if(p==="staff"){ await fetchStaff(); }
  }catch(e){ lastErr = friendly(e.status,e.body); }
  render();
}

