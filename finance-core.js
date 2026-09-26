/* ================= CONFIG ================= */
/* ค่าจริง (URL/KEY/รหัสผ่าน) อยู่ที่ config-finance.js แยกไฟล์ — ไฟล์นั้นไม่ขึ้น git
   ถ้าเพิ่งโคลนมาเครื่องใหม่แล้วเจอ "CONFIG is not defined" ให้ก็อป config-finance.example.js
   เป็น config-finance.js แล้วใส่ค่าจริง (ค่าเดียวกับ config-admin.js ของ Banfa POS เพราะใช้
   Supabase โปรเจกต์เดียวกัน — แค่คนละไฟล์ front-end)
   บั๊กแคช .js คนละไฟล์ไม่พร้อมกัน (เจอมาแล้วฝั่ง admin) — ทุกครั้งที่ bump APP_VERSION
   ตรงนี้ ต้องแก้เลขใน finance.html (query string ท้าย <script src>) ให้ตรงกันด้วยเสมอ */
const APP_VERSION = "2026.09.24-c";

/* ================= สถานะ ================= */
let ME=null, page="dash", token=null, refreshTok=null, authBusy=false, busy=false;
let ACCOUNTS=[], CATEGORIES=[], TXNS=[], RECURRING=[], BALANCES=[];
let WH_ITEMS=[], WH_MOVES=[];   /* คลังหลังร้าน — คนละตารางกับ ingredients/stock_docs ของ POS เดิมเลย ไม่กระทบกัน */
let lastErr = "";
let txnClientId=null;             /* กันบันทึกรายการซ้ำถ้ากดซ้ำ/network timeout (pattern เดียวกับ stock) */
let whmClientId=null;             /* เหมือนกัน แต่สำหรับรายการเข้า-ออกคลังหลังร้าน */
const newClientId = () => Date.now().toString(36)+Math.random().toString(36).slice(2,8);
let TXN_FORM=null, RECUR_FORM=null;   /* ฟอร์มบันทึกรายการ/รายการประจำ — null = ยังไม่เปิดฟอร์ม (สร้างค่าเริ่มต้นตอนเข้าเพจ) */
let WHM_FORM=null;                    /* ฟอร์มรับเข้า/จ่ายออกคลังหลังร้าน */

/* ================= เครื่องมือพื้นฐาน ================= */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const baht = n => "฿" + Number(Math.round((+n||0)*100)/100).toLocaleString("en-US");
const n2 = n => Math.round((+n||0)*100)/100;
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
const findAcc = id => ACCOUNTS.find(a=>a.id===id);
const findCat = id => CATEGORIES.find(c=>c.id===id);
const accBal  = id => { const b=BALANCES.find(x=>x.id===id); return b ? +b.balance : 0; };
const findWhItem = id => WH_ITEMS.find(i=>i.id===id);
const qtyStr = n => (Math.round((+n||0)*100)/100).toLocaleString("en-US",{maximumFractionDigits:2});

/* ================= แจ้งเตือน / กล่องยืนยัน ================= */
let toastTimer=null;
function toast(msg, kind=""){
  const t=$("#toast"); t.textContent=msg; t.className=`toast on ${kind}`;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{ t.className=`toast ${kind}`; },2400);
}
function setSync(state, txt){ const c=$("#sync"); if(c){ c.className=`syncchip ${state}`; c.textContent=txt; } }

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

/* ================= API (เหมือน admin-core.js ทุกประการ — คนละแอป แต่ Supabase โปรเจกต์เดียวกัน) ================= */
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
  if(raw) console.error("[banfa-finance]", status, raw);
  return ERR[status] || ERR[500];
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
      store.set("fin_tok",token); store.set("fin_rtok",refreshTok);
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
        store.set("fin_tok",token); store.set("fin_rtok",refreshTok);
        return true;
      }
    }
    return await signIn();
  } finally { authBusy=false; }
}
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

/* ================= ธีม (เหมือน admin.html) ================= */
const THEMES=[["auto","ตามเครื่อง","สว่างกลางวัน มืดกลางคืน ตามการตั้งค่าอุปกรณ์"],
              ["light","สว่าง","พื้นขาว เหมาะกับกลางวัน"],
              ["dark","มืด","ถนอมสายตาตอนกลางคืน"]];
const getTheme = () => { const t=store.get("fin_theme"); return (t==="light"||t==="dark")?t:"auto"; };
function applyTheme(t){ document.documentElement.setAttribute("data-theme",t); store.set("fin_theme",t); }
function applyBranding(){
  const foot = $("#foot"); if(foot) foot.innerHTML = `รายรับ-รายจ่าย<br>v${APP_VERSION}`;
}

/* ================= ช่วงวันที่ (เหมือน admin-core.js) ================= */
function setRange(days){
  const to=new Date(), from=new Date();
  if(days===1){ to.setDate(to.getDate()-1); from.setDate(from.getDate()-1); }
  else if(days>1){ from.setDate(from.getDate()-(days-1)); }
  $("#from").value=dstr(from); $("#to").value=dstr(to);
}
function range(){
  const f=$("#from").value||today(), t=$("#to").value||today();
  const a=new Date(f+"T00:00:00"), b=new Date(t+"T00:00:00"); b.setDate(b.getDate()+1);
  return {from:a.toISOString(), to:b.toISOString(), fromDate:f, toDate:t};
}

/* ================= กราฟแท่ง (คัดลอกจาก admin-core.js — เสถียรแล้ว ไม่พึ่งการวัด DOM) ================= */
function barChart(map, keys, labels, color="var(--brand)"){
  const mx = Math.max(0, ...keys.map(k=>map[k]||0));
  const dense = keys.length > 24;
  const n = keys.length || 1;
  const W = 1000, H = 160;
  const gap = dense ? 2 : 6;
  const barW = Math.max((W - gap*(n-1)) / n, 1);

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
  const cols = keys.map((k,i)=>{
    const v = map[k]||0;
    return `<div class="chart-col">
      <b class="${dense?"hide":""}">${v?shortNum(v):""}</b>
      <span class="${dense?"dense":""}">${esc(labels[i])}</span></div>`;
  }).join("");

  return `<div class="chart2">${svg}<div class="chart-labels">${cols}</div></div>`;
}

/* ดาวน์โหลด CSV (เหมือน admin-core.js) */
function csvSafe(v){ const t=String(v??""); return /^[=+\-@]/.test(t) ? "'"+t : t; }
function csvDownload(filename, header, rows){
  const out = [header, ...rows];
  const csv = "﻿" + out.map(r=>r.map(c=>`"${csvSafe(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  a.download = filename; a.click();
}
function skeletonList(n=3){
  return Array(n).fill('<div class="skel skel-row w80" style="margin:14px 0"></div>').join("");
}
function skeletonPage(){
  return `<div class="grid4">${Array(4).fill('<div class="card kpi"><div class="skel skel-kpi"></div></div>').join("")}</div>
    <div class="card"><div class="skel skel-row w40"></div>
      ${Array(5).fill('<div class="skel skel-row"></div>').join("")}
    </div>`;
}

/* ================= โหลดข้อมูลหลัก ================= */
async function loadAll(){
  try{
    [ACCOUNTS, CATEGORIES, RECURRING, BALANCES, WH_ITEMS] = await Promise.all([
      apiJson("/rest/v1/fin_accounts?select=*&order=sort_order,name"),
      apiJson("/rest/v1/fin_categories?select=*&order=type,sort_order,name"),
      apiJson("/rest/v1/fin_recurring?select=*&order=next_due"),
      apiJson("/rest/v1/fin_account_balance?select=*&order=sort_order,name"),
      apiJson("/rest/v1/wh_stock?select=*&order=sort_order,name")
    ]);
    return true;
  }catch(e){ lastErr = friendly(e.status,e.body); return false; }
}
async function loadTxns(){
  const R = range();
  try{
    TXNS = await apiJson(`/rest/v1/fin_transactions?select=*`
      +`&occurred_at=gte.${R.fromDate}&occurred_at=lte.${R.toDate}&order=occurred_at.desc,created_at.desc&limit=1000`);
    return true;
  }catch(e){ TXNS=[]; lastErr = friendly(e.status,e.body); return false; }
}
async function loadWhMoves(){
  const R = range();
  try{
    WH_MOVES = await apiJson(`/rest/v1/wh_moves?select=*`
      +`&occurred_at=gte.${R.fromDate}&occurred_at=lte.${R.toDate}&order=occurred_at.desc,created_at.desc&limit=1000`);
    return true;
  }catch(e){ WH_MOVES=[]; lastErr = friendly(e.status,e.body); return false; }
}

/* ================= เมนูซ้าย: พับ/กางกลุ่ม (เหมือน admin-nav.js ของ Banfa POS ทุกประการ) ================= */
function setGroupOpen(id, open){
  const btn = document.querySelector(`[data-g="${id}"]`);
  const wrap = document.getElementById("wrap-"+id);
  if(!btn || !wrap) return;
  btn.classList.toggle("open", open);
  wrap.classList.toggle("open", open);
}
const GROUP_OF = {settings:"gSettings", whsettings:"gSettings"};

/* ================= หน้า/router ================= */
const TITLES = {dash:"ภาพรวม", txns:"รายการรับ-จ่าย", recurring:"รายการประจำ", reports:"รายงาน", settings:"ตั้งค่า",
  whitems:"คลังหลังร้าน — คงเหลือ", whmoves:"คลังหลังร้าน — รับเข้า/จ่ายออก", whsettings:"ตั้งค่าคลังหลังร้าน"};
const NEEDS_RANGE = new Set(["dash","txns","reports","whmoves"]);
function render(){
  $("#title").textContent = TITLES[page] || "";
  $("#range").style.display = NEEDS_RANGE.has(page) ? "flex" : "none";
  $$("nav [data-p]").forEach(b=> b.classList.toggle("on", b.dataset.p===page));
  const lowN = WH_ITEMS.filter(i=>i.active && i.low_qty>0 && i.qty_on_hand<=i.low_qty).length;
  const lowEl = $("#whLowCnt");
  if(lowEl){ lowEl.hidden = !lowN; lowEl.textContent = lowN; }
  const html = {dash:pageDash, txns:pageTxns, recurring:pageRecurring, reports:pageReports, settings:pageSettings,
    whitems:pageWhItems, whmoves:pageWhMoves, whsettings:pageWhSettings}[page];
  $("#page").innerHTML = html ? html() : "";
}
async function go(p){
  page = p;
  $("#page").innerHTML = skeletonPage();
  lastErr = "";
  try{
    await loadAll();
    if(p==="whmoves") await loadWhMoves();
    else if(NEEDS_RANGE.has(p)) await loadTxns();
  }catch(e){ lastErr = friendly(e.status,e.body); }
  const g = GROUP_OF[p]; if(g) setGroupOpen(g, true);
  render();
}
