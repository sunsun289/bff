/* แม่แบบไฟล์ตั้งค่า — ก็อปไฟล์นี้เป็น "config-pos.js" แล้วใส่ค่าจริงแทนของปลอมด้านล่าง
   ค่าต้องตรงกับ config-admin.js เพราะเชื่อม Supabase โปรเจกต์เดียวกัน */
var CONFIG={
  SUPABASE_URL:"https://xxxxxxxxxxxxx.supabase.co",
  SUPABASE_ANON:"sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxx",
  AUTH_EMAIL:"you@example.com",
  AUTH_PASSWORD:"เปลี่ยนเป็นรหัสจริง",
  FALLBACK_ADMIN_PIN:"9999",
  ADMIN_URL:""   /* deploy admin แยกโดเมน/โปรเจกต์กับ pos ใส่ URL เต็มของหลังบ้านตรงนี้ เช่น
                    "https://admin.banfa-pos.pages.dev/admin.html" — deploy อยู่ที่เดียวกันเว้นว่างไว้ ใช้ "/admin.html" อัตโนมัติ */
};
