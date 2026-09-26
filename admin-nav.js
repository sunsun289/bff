/* ================= เมนูซ้าย: พับ/กางกลุ่ม (CSS Grid accordion) =================
   ย้ายออกมาจาก admin-core.js — ไฟล์เดิมปนพฤติกรรม UI ของเมนูซ้ายกับ router หลักไว้ด้วยกัน
   ส่วนนี้เป็นแค่ "เปิด/ปิดกลุ่มไหน" ล้วนๆ ส่วน render()/go()/TITLES ยังคงเป็น router หลัก อยู่ที่ core ตามเดิม */
function setGroupOpen(id, open){
  const btn = document.querySelector(`[data-g="${id}"]`);
  const wrap = document.getElementById("wrap-"+id);
  if(!btn || !wrap) return;
  btn.classList.toggle("open", open);
  wrap.classList.toggle("open", open);
}
const GROUP_OF = {sales:"gSales",bycat:"gSales",byday:"gSales",bymonth:"gSales",byproduct:"gSales",byoption:"gSales",
  stock:"gStock",receive:"gStock",count:"gStock",usage:"gStock",moves:"gStock",
  menu:"gMenu",recipe:"gMenu",options:"gMenu", staff:"gSys",settings:"gSys",finance:"gSys"};

