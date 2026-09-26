/* แม่แบบไฟล์ตั้งค่า — ก็อปไฟล์นี้เป็น "config-finance.js" แล้วใส่ค่าจริงแทนของปลอมด้านล่าง
   ค่า URL/KEY/AUTH_EMAIL/AUTH_PASSWORD ต้องเหมือนกับ config-admin.js ของ Banfa POS ทุกตัว
   เพราะแอปนี้ใช้ Supabase โปรเจกต์เดียวกัน (ล็อกอินเดียวกับหลังบ้าน POS) แค่แยกไฟล์ front-end
   หาค่า URL/KEY ได้จาก Supabase → Settings → API */
const CONFIG = {
  URL:  "https://xxxxxxxxxxxxx.supabase.co",
  KEY:  "sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxx",
  AUTH_EMAIL: "you@example.com",
  AUTH_PASSWORD: "เปลี่ยนเป็นรหัสจริง",
  ADMIN_URL: ""   /* ถ้า deploy แยกโดเมน/โปรเจกต์จาก Banfa POS ใส่ URL เต็มของหลังบ้าน POS ตรงนี้
                     เช่น "https://banfa-admin.pages.dev/" — เว้นว่างถ้าอยู่โดเมนเดียวกัน */
};
