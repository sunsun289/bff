/* ค่าจริง — ไฟล์นี้ไม่ขึ้น git (.gitignore กันไว้แล้ว)
   เครื่องใหม่: ก็อปจาก config-admin.example.js มาเป็นไฟล์นี้ แล้วใส่ค่าจริง */
const CONFIG = {
  URL:  "https://etacqenamvnfgizqzwjm.supabase.co",
  KEY:  "sb_publishable_9eX9y7xzsC5CUmrFXtiM1A_9rAQ7geB",
  AUTH_EMAIL: "pos@banfa.local",
  AUTH_PASSWORD: "Artit0402",
  POS_URL: "",   /* ถ้า deploy pos แยกโดเมน/โปรเจกต์ ใส่ URL เต็มของหน้าขายตรงนี้ เช่น
                    "https://banfa-pos.pages.dev/" — เว้นว่างถ้ายังอยู่โดเมนเดียวกัน */
  FINANCE_URL: "" /* ถ้า deploy แอปรายรับ-รายจ่ายแยกโดเมน/โปรเจกต์ ใส่ URL เต็มตรงนี้ เช่น
                      "https://banfa-finance.pages.dev/" — เว้นว่างถ้ายังอยู่โดเมนเดียวกัน */
};
