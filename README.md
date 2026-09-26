# Banfa POS — บ้านฟ้ากาแฟสด

ระบบขายหน้าร้าน + หลังบ้าน · เวอร์ชัน **2026.09.01-a**

## ไฟล์ที่ deploy

| ไฟล์ | deploy เป็น | เปิดที่ |
|---|---|---|
| `pos-sell.html` | **เปลี่ยนชื่อเป็น `index.html`** | `/` (เครื่องขาย) |
| `admin.html` + `admin.css` + `admin-*.js` (6 ไฟล์) | ชื่อเดิม — **deploy ทั้งชุดด้วยกัน** | `/admin.html` (มือถือ/คอม) |

**`admin.html` แยกเป็นหลายไฟล์แล้ว** (ตั้งแต่ v2026.09.05) — ไม่ใช่ไฟล์เดียวอีกต่อไป ต้อง deploy คู่กันเสมอ:
```
admin.html          โครง HTML (~9KB)
admin.css           สไตล์ทั้งหมด
admin-core.js       CONFIG/API/router — โหลดก่อนเสมอ
admin-nav.js        พฤติกรรมเมนูซ้าย (พับ/กางกลุ่ม)
admin-reports.js    หน้ารายงานทั้งหมด (ภาพรวม, ยอดขาย 6 หน้า, กะ, ประวัติ)
admin-stock.js      หน้าสต็อกทั้ง 7 หน้า
admin-menu.js       เมนู, สูตร, ตัวเลือก
admin-staff.js      พนักงาน, ตั้งค่า
admin-init.js       login flow + เริ่มระบบ — ต้องโหลดหลังสุดเสมอ
```
แก้แค่หน้าไหน เปิดแค่ไฟล์นั้น เช่น แก้หน้ารายงาน → เปิด `admin-reports.js` อย่างเดียว ไม่ต้องโหลด/เลื่อนไฟล์ 168KB ทั้งก้อน
`wrangler deploy` วิธีเดิม อัปทั้งโฟลเดอร์เหมือนเดิม (อัปเฉพาะไฟล์ที่เปลี่ยนจริงอัตโนมัติ)

**`pos-sell.html` ยังเป็นไฟล์เดียวเหมือนเดิม** — ยังไม่ได้แยก (รอดูว่าพอใจกับ admin.html ก่อน)

```bash
wrangler deploy
```

## เริ่มต้นระบบใหม่ — รัน SQL ตามลำดับ

Supabase → SQL Editor → วางทีละไฟล์ → Run

```
1. sql/schema-v3.sql          orders, app_config, audit_log
2. sql/schema-shifts.sql      กะการขาย
3. sql/schema-security.sql    พนักงาน + PIN เข้ารหัส + RPC
4. sql/schema-stock.sql       คลัง วัตถุดิบ สต็อก
5. sql/fix-stock-view.sql     แก้ view
6. sql/schema-v5.sql          เงินลิ้นชัก + นับสต็อก
7. sql/fix-order-time.sql     เวลาบิลย้อนหลัง
8. sql/schema-reports.sql     สรุปยอดฝั่งเซิร์ฟเวอร์ (จำเป็น)
```

**ยังไม่ต้องรัน:** `sql/schema-lockdown.sql` — ปิดสิทธิ์สาธารณะ ต้องเปิด Supabase Auth ให้ผ่านก่อน (อ่านคำเตือนหัวไฟล์)
**ถ้า lockdown พัง:** รัน `sql/fix-permissions.sql` เพื่อกู้คืน

## เอกสาร

| ไฟล์ | ใช้เมื่อ |
|---|---|
| `docs/CLAUDE.md` | **อ่านก่อนแก้โค้ด** — ข้อจำกัด Chrome 56, หลักการที่ห้ามละเมิด, หนี้ทางเทคนิค |
| `docs/ownership-audit.md` | ตรวจบั๊กเชิงออกแบบ (สั่ง `ตรวจ ownership audit`) |
| `docs/banfa-pos-audit-roadmap.md` | audit เต็ม + roadmap + checklist ทดสอบ |
| `docs/banfa-stock-architecture.md` | ที่มาของโครงสร้างคลัง |

## ⚠️ ก่อนแก้ `pos-sell.html`

เครื่องขายใช้ **Chrome 56** — ห้ามใช้ CSS Grid, flex gap, arrow function, async/await, const/let

ตรวจก่อน deploy ทุกครั้ง:
```bash
grep -nE "display:grid|grid-template|gap:|=>|\?\.|async |await |\bconst |\blet " pos-sell.html
```
ต้องไม่เจออะไรเลย

## PIN เข้าระบบ

เก็บเป็น bcrypt hash บนเซิร์ฟเวอร์ — ดูย้อนหลังไม่ได้ ตั้งใหม่ได้ที่ หลังบ้าน → ระบบ → พนักงาน
