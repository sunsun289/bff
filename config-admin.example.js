/* แม่แบบไฟล์ตั้งค่า — ก็อปไฟล์นี้เป็น "config-admin.js" แล้วใส่ค่าจริงแทนของปลอมด้านล่าง
   หาค่า URL/KEY ได้จาก Supabase → Settings → API
   AUTH_EMAIL/AUTH_PASSWORD คือบัญชีที่สร้างไว้ใน Supabase → Authentication → Users */
const CONFIG = {
  URL:  "https://xxxxxxxxxxxxx.supabase.co",
  KEY:  "sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxx",
  AUTH_EMAIL: "you@example.com",
  AUTH_PASSWORD: "เปลี่ยนเป็นรหัสจริง",
  POS_URL: "",       /* URL เต็มของหน้าขาย ถ้า deploy แยกโดเมน — เว้นว่างถ้าโดเมนเดียวกัน */
  FINANCE_URL: ""    /* URL เต็มของแอปรายรับ-รายจ่าย ถ้า deploy แยกโดเมน — เว้นว่างถ้าโดเมนเดียวกัน */
};
