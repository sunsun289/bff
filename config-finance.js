/* ค่าจริง — ไฟล์นี้ไม่ขึ้น git (.gitignore กันไว้แล้ว)
   เครื่องใหม่: ก็อปจาก config-finance.example.js มาเป็นไฟล์นี้ แล้วใส่ค่าจริง
   ค่าเหมือน config-admin.js ทุกตัว เพราะใช้ Supabase โปรเจกต์เดียวกัน */
const CONFIG = {
  URL:  "https://etacqenamvnfgizqzwjm.supabase.co",
  KEY:  "sb_publishable_9eX9y7xzsC5CUmrFXtiM1A_9rAQ7geB",
  AUTH_EMAIL: "pos@banfa.local",
  AUTH_PASSWORD: "Artit0402",
  ADMIN_URL: ""   /* ถ้า deploy แยกโดเมน/โปรเจกต์จาก Banfa POS ใส่ URL เต็มของหลังบ้าน POS ตรงนี้ เช่น
                     "https://banfa-admin.pages.dev/" — เว้นว่างถ้ายังอยู่โดเมนเดียวกัน */
};
