# Banfa POS — Technical Audit & Development Roadmap

**ระบบ:** Point-of-Sale + Back Office สำหรับร้านบ้านฟ้ากาแฟสด
**Stack ปัจจุบัน:** Vanilla JS (ES5) / Cloudflare Workers (static) / Supabase (Postgres + PostgREST)
**ขอบเขตโค้ด:** `pos-sell.html` 1,577 บรรทัด · `admin.html` 1,019 บรรทัด · รวม ~202 KB
**ข้อจำกัดบังคับ:** เครื่องขายคือ Android 7.1.2 / **Chrome 56** — ไม่รองรับ CSS Grid, flex-gap, ES6+
**วันที่ตรวจ:** 29 สิงหาคม 2026

---

## 0. บทสรุปผู้บริหาร (อ่านหน้าเดียวจบ)

ระบบใช้งานได้จริงและครอบคลุมงานหน้าร้านครบแล้ว แต่มี **จุดบอดร้ายแรง 3 ข้อ** ที่ต้องแก้ก่อนใช้เชิงพาณิชย์เต็มรูปแบบ:

| # | ปัญหา | ความรุนแรง | ผลกระทบจริง |
|---|---|---|---|
| 1 | ฐานข้อมูลเปิดสาธารณะ (anon key + RLS `using(true)`) | 🔴 วิกฤต | ใครมี URL อ่าน/แก้/ลบยอดขายทั้งร้านได้ |
| 2 | `app_config` เขียนทับทั้งก้อน (last-write-wins) | 🔴 วิกฤต | 2 เครื่องขายพร้อมกัน = สต็อกเพี้ยน/เมนูหาย |
| 3 | บิลหายถาวรเมื่อเน็ตล่มตอนชำระ | 🟠 สูง | รับเงินแล้วแต่ไม่มีในระบบ |

**ข้อเสนอที่ตรงไปตรงมา:** ระบบนี้เป็นร้านกาแฟ 3 สาขา ไม่ใช่ fintech — คำแนะนำ "ระดับองค์กร" หลายข้อ (micro-frontend, Redux, E2E เต็มรูปแบบ, CI/CD หลายชั้น) **จะทำให้ต้นทุนบำรุงรักษาแพงกว่าประโยชน์** เอกสารนี้จึงแยกชัดว่าอะไร **ต้องทำ** อะไร **ควรทำ** และอะไร **อย่าเพิ่งทำ**

---

# 1. System Architecture & Performance

## 1.1 สถาปัตยกรรมปัจจุบัน

```
┌─────────────────────┐         ┌─────────────────────┐
│  pos-sell.html      │         │  admin.html         │
│  (แท็บเล็ต Chrome 56)│         │  (มือถือ/PC)        │
│  1,577 บรรทัด        │         │  1,019 บรรทัด        │
└──────────┬──────────┘         └──────────┬──────────┘
           │  โค้ดซ้ำกัน ~60%              │
           │  (menu/recipe/ingredient      │
           │   /options/staff CRUD)        │
           └──────────────┬────────────────┘
                          │ REST (PostgREST) + anon key
                 ┌────────▼─────────┐
                 │    Supabase      │
                 │ orders           │
                 │ app_config (jsonb blob) │
                 │ audit_log        │
                 │ shifts           │
                 └──────────────────┘
```

## 1.2 จุดบอดที่พบ (เรียงตามความรุนแรง)

### 🔴 A1 — `app_config` เป็น jsonb ก้อนเดียว เขียนทับทั้งหมด

**หลักฐาน:** `pos-sell.html:710`, `admin.html:404` ใช้ `POST /app_config?on_conflict=key` ส่ง `value` ทั้ง array

**สถานการณ์ที่พัง (เกิดจริงแน่นอนเมื่อมี 2 เครื่อง):**
```
09:00:00  เครื่อง A ขายลาเต้  → อ่าน ingredients (นม 6000ml) → เขียนกลับ 5850
09:00:01  เครื่อง B ขายมอคค่า → อ่าน ingredients (นม 6000ml) → เขียนกลับ 5880
ผลลัพธ์: นมเหลือ 5880 (ควรเป็น 5730) → หายไป 150ml จากบัญชี
```
เคสร้ายกว่า: เจ้าของแก้เมนูในหลังบ้านตอนพนักงานกำลังขาย → **เมนูที่แก้หายทั้งชุด**

**แนวทางแก้ (เลือก 1):**

| ทางเลือก | งาน | เหมาะเมื่อ |
|---|---|---|
| **A. แยกตารางจริง** (`products`, `ingredients`, `recipes`, `staff`) + `PATCH` เฉพาะแถว | 2–3 วัน | ✅ **แนะนำ** — แก้ที่ต้นเหตุ |
| B. ตัดสต็อกด้วย Postgres RPC (`stock_deduct(items jsonb)`) ทำ atomic ฝั่ง DB | 1 วัน | แก้เฉพาะเคสสต็อก (เร่งด่วนสุด) |
| C. เพิ่ม `version` column + optimistic lock | 1 วัน | แก้ชั่วคราว ยังชนกันอยู่ |

**สั่งงานได้ทันที — SQL ที่ต้องเขียน (ทางเลือก B, ทำก่อนได้เลย):**
```sql
create or replace function public.deduct_stock(p_items jsonb)
returns void language plpgsql security definer as $$
declare it jsonb;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    update public.ingredients
       set stock = greatest(0, stock - (it->>'qty')::numeric)
     where id = it->>'id';
  end loop;
end $$;
```
เรียกจาก client: `POST /rest/v1/rpc/deduct_stock` — atomic, ไม่มี race

---

### 🟠 A2 — Full re-render ทุก interaction

**หลักฐาน:** `innerHTML=` 32 จุดใน POS, 19 จุดใน admin

`renderGrid()` สร้าง HTML ของเมนู 65 รายการใหม่ทั้งหมดทุกครั้งที่:
- แตะเมนู 1 อัน
- พิมพ์ตัวอักษรในช่องค้นหา (ทุก keystroke)
- ปิด/เปิดขายเมนู

**ผลบน Chrome 56 / RAM ต่ำ:** ค้นหาเมนูจะกระตุก 100–300ms ต่อตัวอักษร

**แก้:**
1. **Debounce ช่องค้นหา** 200ms — 5 บรรทัด แก้ได้ 80% ของปัญหา
   ```js
   var searchT;
   $("#search").addEventListener("input",function(e){
     clearTimeout(searchT);
     searchT=setTimeout(function(){query=e.target.value;renderGrid()},200);
   });
   ```
2. **แยก render ตะกร้าออกจาก render เมนู** — แตะเมนูไม่ควร re-render grid เลย (ทำอยู่แล้วบางส่วน ตรวจซ้ำ)
3. **ใช้ CSS ซ่อนแทนการ re-render ตอนกรองหมวด** — `display:none` เร็วกว่าสร้าง DOM ใหม่ 10 เท่า

---

### 🟠 A3 — State อยู่ใน DOM ไม่ใช่ใน memory

**หลักฐาน:** `collectMenuRows()`, `collectIngRows()`, `collectOptRows()`, `collectStaffRows()` — อ่านค่ากลับจาก `<input>` ทุกครั้งก่อนบันทึก

**ความเสี่ยง:** ถ้า re-render เกิดก่อน `collect*()` ถูกเรียก → **ข้อมูลที่ผู้ใช้พิมพ์หายทันทีโดยไม่มีคำเตือน** (พบแล้วใน `pageRecipe()` ที่ต้องเรียก `collectRec()` ก่อน re-render ทุกจุด — เปราะมาก)

**แก้:** ผูก `onchange` ที่ input แต่ละตัวให้เขียนกลับ state object ทันที แล้วเลิกใช้ `collect*()`

---

### 🟡 A4 — โค้ดซ้ำระหว่าง 2 ไฟล์ ~60%

`CATS`, `DEFAULT_MENU`, `esc`, `baht`, `apiHeaders`, CRUD ของเมนู/สูตร/วัตถุดิบ/ตัวเลือก/พนักงาน — มีสองชุด

**ความเสี่ยง:** แก้ที่หนึ่งลืมอีกที่ → พฤติกรรมต่างกันระหว่างเครื่องขายกับหลังบ้าน (**เกิดแล้ว** ตอนแก้ Chrome 56: POS แก้แล้ว admin ยังใช้ Grid)

**แก้ (ไม่ต้องมี build tool):**
```
/shared/core.js     ← CATS, esc, baht, apiHeaders, api client
/shared/domain.js   ← menuCost, recipeOf, stockState, summarize
/pos-sell.html      ← <script src="/shared/core.js"></script>
/admin.html         ← เหมือนกัน
```
Cloudflare Workers เสิร์ฟไฟล์ static ได้ — ไม่ต้องมี bundler, ไม่ต้อง transpile, ยังเป็น ES5

**ผลพลอยได้:** ไฟล์เล็กลง โหลดเร็วขึ้น cache แยกกันได้

---

### 🟡 A5 — ดึงข้อมูลทั้งหมดมาคำนวณฝั่ง client

**หลักฐาน:** `admin.html:437` `limit=3000`, `pos-sell.html:1140` `limit=2000`

รายงาน 30 วัน @ 200 บิล/วัน = 6,000 แถว → **เกิน limit ข้อมูลหาย** และโหลดหนัก (~3–5 MB)

**แก้:** ย้ายการสรุปไปฝั่ง DB
```sql
create or replace view public.daily_sales as
select date_trunc('day', created_at) as day,
       count(*) filter (where status <> 'void')      as bills,
       sum(total) filter (where status <> 'void')    as revenue,
       sum(cost)  filter (where status <> 'void')    as cost,
       sum(total) filter (where status <> 'void' and payment_method='cash') as cash,
       sum(total) filter (where status <> 'void' and payment_method='pp')   as pp
from public.orders group by 1;
```
Dashboard query view นี้แทน → เร็วขึ้น ~50 เท่า, bandwidth ลด 95%

---

### 🟡 A6 — QR โหลดจาก CDN ภายนอก

**หลักฐาน:** `<script src="https://cdnjs.cloudflare.com/.../qrcode.min.js">`

CDN ล่ม/บล็อก = รับพร้อมเพย์ไม่ได้ทั้งร้าน

**แก้:** ดาวน์โหลดไฟล์มาวางที่ `/lib/qrcode.min.js` เสิร์ฟจาก Worker เดียวกัน (ไฟล์แค่ ~20KB)

---

### 🟢 A7 — Performance budget ที่ควรตั้ง

| Metric | เป้าหมาย | วิธีวัด |
|---|---|---|
| First paint (แท็บเล็ต) | < 1.5s | DevTools throttle "Slow 4G" + 4x CPU |
| เวลาแตะเมนู → เห็นในตะกร้า | < 100ms | Performance panel |
| เวลาโหลดรายงาน 30 วัน | < 2s | Network panel |
| ขนาดไฟล์ POS | < 150 KB | `wc -c` (ปัจจุบัน 119 KB ✓) |

---

# 2. UX/UI & Usability

## 2.1 Design System (ปัจจุบันมีบางส่วน ต้องทำให้เป็นระบบ)

### สีที่ใช้อยู่ — ต้องรวมศูนย์และตั้งชื่อตามหน้าที่

**ปัญหา:** ปัจจุบันใช้ CSS variables แล้ว (ดี) แต่ตั้งชื่อตาม **สี** ไม่ใช่ตาม **หน้าที่** → `--sky`, `--caramel` เปลี่ยนธีมทีต้องไล่แก้

**ที่ควรเป็น:**
```css
:root{
  /* Primitive (ค่าดิบ) */
  --blue-500:#1683e0;  --blue-600:#1069be;  --blue-50:#e7f2fd;
  --amber-500:#c9903f; --green-500:#129c63; --red-500:#d5492f;
  --gray-900:#141a22;  --gray-500:#6b7784;  --gray-200:#e6eaee;  --gray-50:#eef1f4;

  /* Semantic (หน้าที่) — ใช้ตัวนี้ในโค้ดเท่านั้น */
  --color-action:var(--blue-500);        /* ปุ่มหลัก */
  --color-action-hover:var(--blue-600);
  --color-success:var(--green-500);      /* ชำระสำเร็จ, เงินเกิน */
  --color-danger:var(--red-500);         /* ยกเลิก, เงินขาด */
  --color-warning:var(--amber-500);
  --text-primary:var(--gray-900);
  --text-secondary:var(--gray-500);
  --border-default:var(--gray-200);
  --surface-page:var(--gray-50);
  --surface-card:#fff;
}
```

### Typography Scale (ยังไม่มี — ตอนนี้ใส่ px มั่ว 10 ค่า)

```css
:root{
  --text-xs:11px;   --text-sm:13px;   --text-base:15px;
  --text-lg:17px;   --text-xl:21px;   --text-2xl:28px;  --text-3xl:40px;
  --font-normal:600; --font-bold:800;  --font-black:900;
}
```
**กติกา:** ห้ามใส่ `font-size` เป็นตัวเลขดิบในโค้ดใหม่ ต้องอ้าง variable เท่านั้น

### Spacing Scale (ยังไม่มี — พบค่า margin/padding 14 แบบ)

```css
--space-1:4px; --space-2:8px; --space-3:12px;
--space-4:16px; --space-5:20px; --space-6:24px; --space-8:32px;
```

### Component Inventory ที่ต้อง standardize

| Component | สถานะ | ปัญหาที่พบ |
|---|---|---|
| Button | ⚠️ ไม่สม่ำเสมอ | มี `.btn`, `.charge`, `.confirm`, `.addopt`, `.go`, `.chip-b`, `.shiftbtn` — 7 แบบ ทำงานคล้ายกัน |
| Input | ⚠️ | 4 ขนาด ไม่มี error state, ไม่มี disabled state ที่ชัด |
| Card | ✅ | สม่ำเสมอดี |
| Pill/Badge | ✅ | `.pill.cash/.pp/.void/.warn/.ok` ครบ |
| Modal/Sheet | ⚠️ | มี `.sheet`, `.dlg`, `.sv` — 3 กลไก ควรเหลือ 2 (sheet สำหรับ flow, dialog สำหรับ confirm) |
| Toast | ✅ | ดี |
| Empty state | ⚠️ | มีบางหน้า ขาดบางหน้า |
| Loading state | ❌ | มีแค่ข้อความ "กำลังโหลด…" ไม่มี skeleton |

**สั่งงาน:** รวม button เหลือ 1 component + modifier
```html
<button class="btn btn--primary btn--lg">ชำระเงิน</button>
<button class="btn btn--danger btn--sm">ยกเลิก</button>
<button class="btn btn--ghost">ล้าง</button>
```

## 2.2 Navigation & Information Architecture

### ปัญหาที่พบ

**P1 — เครื่องขายมีหลังบ้านซ้ำกับ `admin.html`**
พนักงานเห็นทางเข้าหลังบ้านที่ไม่ควรเห็น + โค้ดต้องดูแล 2 ที่
→ **ถอดแท็บ "หลังบ้าน" ออกจาก `pos-sell.html`** (ลดไฟล์ ~35 KB ด้วย)

**P2 — จำนวนคลิกในงานหลัก**

| งาน | คลิกปัจจุบัน | เป้าหมาย | แก้อย่างไร |
|---|---|---|---|
| ขาย 1 แก้ว (มีตัวเลือก) | 6 (เมนู→หวาน→แก้ว→เพิ่ม→ชำระ→ยืนยัน) | 5 | ตั้งค่าเริ่มต้นตัวเลือกให้ครบ กด "เพิ่ม" ได้ทันที ✅ ทำแล้ว |
| ขายซ้ำแก้วเดิม | 6 | **2** | เพิ่มปุ่ม "สั่งซ้ำ" ที่รายการในตะกร้า |
| ปิดขายเมนูชั่วคราว (86) | 5 (เข้าหลังบ้าน→เมนู→หา→ปิด→บันทึก) | **2** | **กดค้างที่ไทล์เมนู → เมนูลัด "ปิดขายวันนี้"** |
| ดูยอดวันนี้ | 3 | 1 | มีอยู่แล้วที่แถบกะ ✅ |

**P3 — ไม่มี breadcrumb / ไม่รู้ว่าอยู่หน้าไหนในหลังบ้าน**
→ ใส่ page title + active state ใน sidebar (มีแล้ว ✅) เพิ่ม breadcrumb เมื่อมีหน้าลูก

**P4 — ค้นหาได้เฉพาะชื่อเมนู**
→ เพิ่มค้นหาด้วย: หมวด, ราคา, รหัสเมนู (ถ้ามี), และ **ค้นหาแบบไม่สนวรรณยุกต์** (ลาเต้ = ลาเต, กาแฟ = กาเเฟ)

## 2.3 Responsive

| อุปกรณ์ | สถานะ | ต้องแก้ |
|---|---|---|
| แท็บเล็ต 1280×800 (เครื่องขาย) | ✅ | — |
| มือถือแนวตั้ง (admin) | ⚠️ | ตารางในหน้าเมนู/สูตร ล้นจอ ต้อง scroll แนวนอน |
| Desktop กว้าง (admin) | ⚠️ | `max-width:1240px` ทำให้จอ 27" มีที่ว่างมาก — เพิ่ม breakpoint 1600px |
| แท็บเล็ตแนวตั้ง | ❌ | ยังไม่ทดสอบ |

**Breakpoints ที่ควรกำหนดเป็นมาตรฐาน:**
```css
/* mobile-first */
@media(min-width:600px)  { /* tablet portrait */ }
@media(min-width:900px)  { /* tablet landscape / เครื่องขาย */ }
@media(min-width:1280px) { /* desktop */ }
@media(min-width:1600px) { /* wide */ }
```

## 2.4 Accessibility (ยังไม่ได้ทำเลย)

| ข้อ | สถานะ | แก้ |
|---|---|---|
| Touch target ≥ 44×44px | ⚠️ | ปุ่ม `.x` (ลบ) เล็กเกิน ~28px |
| Focus ring มองเห็นได้ | ❌ | มีแค่ input บางตัว — ปุ่มไม่มีเลย |
| Contrast ratio ≥ 4.5:1 | ⚠️ | `--faint:#9aa5b1` บนขาว = 2.6:1 **ตก** |
| `aria-label` ปุ่มไอคอน | ❌ | ปุ่ม logout, burger ไม่มี |
| ใช้ keyboard ได้ครบ | ⚠️ | modal ไม่ trap focus, Esc ปิดไม่ได้ |
| แจ้งเตือนด้วยสีอย่างเดียว | ⚠️ | เงินขาด/เกิน ใช้สี + ข้อความ ✅ แต่สต็อกใกล้หมดใช้สีอย่างเดียว |

---

# 3. Security & Exception Handling

## 3.1 🔴 ช่องโหว่วิกฤต

### S1 — ฐานข้อมูลเปิดสาธารณะ (ร้ายแรงที่สุด)

**สถานะปัจจุบัน:**
```sql
create policy "anon read orders" on public.orders
  for select to anon using (true);   -- ← ใครก็อ่านได้
```
+ `anon key` ฝังอยู่ใน HTML ที่เปิดดู source ได้

**สิ่งที่คนภายนอกทำได้ตอนนี้ (แค่มี URL เว็บ):**
- อ่านยอดขายทุกบิลย้อนหลังทั้งหมด
- อ่านรายชื่อพนักงาน **พร้อม PIN** (`app_config` key=`staff`)
- แก้ราคาสินค้า / ลบเมนู
- ยิงบิลปลอมเข้าระบบ
- แก้ยอดในกะ

**นี่ไม่ใช่ทฤษฎี** — ทดสอบได้ใน 10 วินาที:
```bash
curl "https://<project>.supabase.co/rest/v1/orders?select=*" \
  -H "apikey: <anon key ที่อยู่ใน HTML>"
```

**แผนแก้ (ต้องทำตามลำดับ ห้ามข้าม):**

| ขั้น | งาน | เวลา |
|---|---|---|
| 1 | สร้าง Supabase Auth user สำหรับเครื่อง POS (`pos@banfa.local`) | 10 นาที |
| 2 | ใส่ `AUTH_EMAIL`/`AUTH_PASSWORD` ใน CONFIG → ยืนยันหน้าตั้งค่าขึ้น "Auth: เปิดใช้งาน" | 10 นาที |
| 3 | รัน `schema-v4-lockdown.sql` (revoke anon ทั้งหมด) | 5 นาที |
| 4 | **ย้าย PIN พนักงานออกจาก `app_config`** → ตาราง `staff` + เก็บเป็น hash | 半วัน |
| 5 | แยก policy: cashier insert ได้อย่างเดียว / admin อ่านรายงานได้ | 1 วัน |

**ขั้นที่ 4 สำคัญ** — ตอนนี้ PIN เก็บเป็น plain text ใน JSON ที่ anon อ่านได้ เท่ากับไม่มีรหัสผ่านเลย

```sql
-- hash PIN ฝั่ง DB
create extension if not exists pgcrypto;
create table public.staff (
  id text primary key,
  name text not null,
  pin_hash text not null,          -- crypt(pin, gen_salt('bf'))
  role text not null check (role in ('cashier','admin')),
  active boolean default true
);
create or replace function public.verify_pin(p_pin text)
returns table(id text, name text, role text)
language sql security definer as $$
  select id, name, role from public.staff
  where active and pin_hash = crypt(p_pin, pin_hash) limit 1;
$$;
```

### S2 — ไม่มี Authorization Guard ฝั่ง Server

**หลักฐาน:** `showView('admin')` เช็ค `ME.role==='admin'` **ฝั่ง client เท่านั้น**

ใครเปิด DevTools พิมพ์ `ME={role:'admin'}` ก็เข้าหลังบ้านได้ทันที
→ แก้ได้ด้วย RLS ตาม role (ขั้นที่ 5 ข้างบน) — client guard เป็นแค่ UX ไม่ใช่ security

### S3 — XSS ผ่านข้อมูลจาก DB

**หลักฐาน:** `esc()` ใช้ 27 จุด แต่ยังมีช่องโหว่:
- `pos-sell.html:1205` CSV export ไม่ผ่าน `esc` (CSV injection ผ่าน `=cmd|...`)
- ค่า `o.void_reason` ใน admin แสดงผ่าน `esc` ✅ แต่ใน CSV ไม่ผ่าน

**Payload ทดสอบ:** ตั้งชื่อพนักงานเป็น `<img src=x onerror=alert(1)>` แล้วดูรายงาน

**แก้:**
1. ทุกจุดที่ต่อ string เข้า `innerHTML` **ต้อง** ผ่าน `esc()` — ไม่มีข้อยกเว้น
2. CSV: prefix `'` หน้าค่าที่ขึ้นต้นด้วย `= + - @`
   ```js
   function csvSafe(v){var s=String(v);return /^[=+\-@]/.test(s)?"'"+s:s}
   ```
3. ระยะยาว: ใช้ `textContent` + `createElement` แทน `innerHTML` ในจุดที่แสดงข้อมูลผู้ใช้

### S4 — ไม่มี Input Validation ฝั่ง Server

ตอนนี้ client ส่งอะไรมา DB รับหมด — ราคาติดลบ, qty เป็นล้าน, total ไม่ตรงกับ items

**แก้ด้วย DB constraint (ถูกและได้ผลทันที):**
```sql
alter table public.orders
  add constraint orders_total_positive  check (total >= 0),
  add constraint orders_discount_valid  check (discount >= 0 and discount <= subtotal),
  add constraint orders_method_valid    check (payment_method in ('cash','pp'));

alter table public.shifts
  add constraint shifts_cash_positive check (opening_cash >= 0);
```

## 3.2 Error Handling & Edge Cases

### สถานะปัจจุบัน

| กรณี | จัดการแล้ว? | หมายเหตุ |
|---|---|---|
| เน็ตล่มตอนชำระ | ⚠️ บางส่วน | แจ้งเตือนแดงชัด ✅ **แต่บิลหายถาวร** ❌ |
| เน็ตล่มตอนเปิดเครื่อง | ⚠️ | มี localStorage fallback แต่ไม่รับประกัน |
| API 401/403 | ✅ | มีแบนเนอร์บอกให้รัน fix-permissions.sql |
| API 500 | ⚠️ | แสดง raw error message ให้ผู้ใช้เห็น |
| ข้อมูลว่าง | ✅ | มี empty state |
| กดชำระซ้ำ (double-submit) | ✅ | ปุ่ม disable ระหว่างส่ง |
| บิลซ้ำจาก retry | ✅ | `local_id` unique |
| ตัวเลขล้น / ติดลบ | ❌ | ไม่ validate |
| localStorage เต็ม/ปิด | ⚠️ | มี `_mem` fallback ✅ แต่ไม่แจ้งผู้ใช้ |
| เวลาเครื่องผิด | ❌ | `created_at` มาจาก client — ควรใช้ `now()` ของ DB |

### 🟠 แก้ที่สำคัญที่สุด — บิลหายเมื่อเน็ตล่ม

ผู้ใช้ยอมรับความเสี่ยงนี้แล้ว **แต่มีทางออกที่ถูกมากและไม่กระทบ UX:**

```js
// เก็บบิลที่ส่งไม่สำเร็จไว้ใน localStorage (ไม่ retry อัตโนมัติ ไม่ทำให้ช้า)
function sendSale(sale,cb){
  fetch(...).then(...).catch(function(){
    var failed=lsGet("failed_sales")||[];
    failed.push(sale); lsSet("failed_sales",failed);   // ← 2 บรรทัด
    cb(false,"ไม่มีเน็ต");
  });
}
```
แล้วเพิ่มหน้า **"บิลที่ยังไม่เข้าระบบ (N)"** ในหลังบ้าน ให้กดส่งซ้ำทีหลังได้
→ ได้ความปลอดภัยของ offline queue โดยไม่มีความซับซ้อนของ auto-sync

### Error message ที่ควรแก้

**ห้ามแสดง raw error:**
```js
// ❌ ปัจจุบัน
'โหลดไม่สำเร็จ<br>'+esc(String(e.message))  // → "401 {"code":"42501"...}"

// ✅ ควรเป็น
var MSG={401:"ไม่มีสิทธิ์เข้าถึงข้อมูล — ติดต่อผู้ดูแลระบบ",
         403:"ไม่มีสิทธิ์เข้าถึงข้อมูล — ติดต่อผู้ดูแลระบบ",
         404:"ไม่พบข้อมูลที่ต้องการ",
         500:"ระบบขัดข้องชั่วคราว กรุณาลองใหม่",
         0:"เชื่อมต่ออินเทอร์เน็ตไม่ได้"};
function friendlyError(status){return MSG[status]||MSG[500]}
// เก็บ raw error ไว้ใน console.error สำหรับ dev เท่านั้น
```

---

# 4. Quality Assurance & Testing Checklist

## 4.1 ข้อจำกัด: ไม่มี test เลยในปัจจุบัน

**ข้อเสนอที่สมจริง:** อย่าเพิ่งลงทุนกับ Jest/Vitest/Playwright เต็มรูปแบบ — ระบบยังไม่มี build step และรันบน ES5

**ทำตามลำดับนี้แทน:**

### ระดับ 1 — Manual Test Script (ทำวันนี้ได้เลย, คุ้มที่สุด)
เขียนเป็น checklist กระดาษ ให้คนทดสอบก่อน deploy ทุกครั้ง (ดูข้อ 4.2)

### ระดับ 2 — Pure Function Unit Test (เมื่อแยก `/shared/domain.js` แล้ว)
ฟังก์ชันที่ทดสอบได้ทันทีเพราะไม่แตะ DOM:
```
menuCost(mid)        → ต้นทุนถูกต้องตามสูตร
recipeOf(mid)        → คืน [] เมื่อไม่มีสูตร
stockState(p)        → out=true เมื่อวัตถุดิบไม่พอ
discAmt()            → % และบาท, ไม่เกินยอดรวม
expectedCash()       → ตั้งต้น + เงินสด (ไม่รวมพร้อมเพย์)
ppPayload(id,amt)    → CRC16 ถูกต้อง (เทียบกับ QR จริง)
summarize(rows)      → ไม่นับบิล void
```
รันด้วย Node ธรรมดา ไม่ต้องมี framework:
```bash
node --test tests/domain.test.js
```

### ระดับ 3 — E2E (เมื่อมีเวลา)
Playwright 5 flow หลักเท่านั้น: ล็อกอิน → เปิดกะ → ขาย → ปิดกะ → ดูรายงาน

## 4.2 Pre-Release Checklist (ใช้ก่อน deploy ทุกครั้ง)

### A. Smoke Test บนแท็บเล็ตจริง (Chrome 56) — บังคับ
- [ ] แป้น PIN เรียง 3×4 ไม่ทับกัน
- [ ] ตารางเมนูเรียงเป็นแถว มีช่องไฟ
- [ ] เปิด Console — ไม่มี error สีแดง
- [ ] รันสคริปต์ตรวจ Grid/gap → ต้องขึ้น "สะอาด"

### B. Flow การขาย
- [ ] ล็อกอิน PIN พนักงาน → เข้าได้ ไม่เห็นแท็บหลังบ้าน
- [ ] ล็อกอิน PIN แอดมิน → เห็นหลังบ้าน
- [ ] ล็อกอิน PIN ผิด → ขึ้น "PIN ไม่ถูกต้อง" ไม่ค้าง
- [ ] เปิดกะ → กรอก 2000 → เริ่มขายได้
- [ ] **ยังไม่เปิดกะแล้วกดชำระ** → ต้องเตือน + พาไปเปิดกะ
- [ ] แตะเมนูเครื่องดื่ม → เด้งตัวเลือก
- [ ] เลือก "แก้วใหญ่" → ราคา +10 ถูกต้อง
- [ ] กลุ่มตัวเลือกที่ตั้งเป็น "ต้องเลือก" → ปุ่มเพิ่มยังกดไม่ได้จนกว่าจะเลือก
- [ ] กลุ่มที่ตั้ง "ไม่บังคับ" → ข้ามได้ / แตะซ้ำยกเลิกได้
- [ ] เพิ่มของเดิม+ตัวเลือกเดิม → รวมเป็นรายการเดียว qty เพิ่ม
- [ ] เพิ่มของเดิม+ตัวเลือกต่าง → แยกเป็น 2 รายการ
- [ ] ลด qty เหลือ 0 → รายการหายจากตะกร้า
- [ ] ส่วนลด % และบาท → คำนวณถูก, ไม่เกินยอดรวม
- [ ] เงินสด: รับเงินน้อยกว่ายอด → ปุ่มยืนยัน disabled
- [ ] เงินทอนคำนวณถูก
- [ ] พร้อมเพย์: QR ขึ้น + ยอดตรง → **สแกนจ่ายจริง 1 บาท ยืนยันเงินเข้า**
- [ ] ชำระสำเร็จ → วงกลมเขียว "บันทึกขึ้นระบบแล้ว"
- [ ] **ปิด WiFi แล้วชำระ** → วงกลมแดง "บิลนี้ไม่เข้าระบบ"

### C. สต็อก & สูตร
- [ ] ใส่สูตร 1 เมนู → ขาย 1 แก้ว → วัตถุดิบลดตามสูตร
- [ ] วัตถุดิบหมด → เมนูจาง กดไม่ได้ ขึ้น "วัตถุดิบหมด"
- [ ] วัตถุดิบต่ำกว่าจุดเตือน → toast เตือนหลังขาย
- [ ] รับของเข้า → สต็อกเพิ่ม + ต้นทุนอัปเดต
- [ ] กำไรต่อเมนู = ราคา − ต้นทุนสูตร (ตรวจด้วยเครื่องคิดเลข)

### D. กะ
- [ ] แถบบนอัปเดตยอดสดทุกบิล
- [ ] ปิดกะ: เงินที่ควรมี = ตั้งต้น + เงินสด (**ไม่รวมพร้อมเพย์**)
- [ ] กรอกเงินขาด 20 → กล่องแดง "เงินขาด ฿20"
- [ ] กรอกเงินเกิน 50 → กล่องเขียว "+฿50"
- [ ] กรอกตรงพอดี → เขียว "ตรงพอดี"
- [ ] ยืนยันปิดกะ → เด้งหน้าเปิดกะใหม่ ขายต่อได้
- [ ] หลังบ้าน → ประวัติกะ → เห็นกะที่เพิ่งปิด ผลต่างตรงกัน

### E. หลังบ้าน
- [ ] แก้ราคาเมนู → บันทึก → รีเฟรชเครื่องขาย → ราคาใหม่ขึ้น
- [ ] ปิดขายเมนู → หายจากหน้าขาย
- [ ] ลบเมนู → มีกล่องยืนยันก่อน
- [ ] เพิ่มพนักงาน PIN ซ้ำ → เตือน "PIN นี้ถูกใช้แล้ว"
- [ ] ลบแอดมินคนสุดท้าย → เตือน "ต้องมีแอดมินอย่างน้อย 1 คน"
- [ ] ยกเลิกบิล → บังคับใส่เหตุผล → ยอดหักออกจากรายงาน
- [ ] CSV เปิดใน Excel ได้ ภาษาไทยไม่เพี้ยน
- [ ] เปลี่ยนช่วงวันที่ → ข้อมูลอัปเดต

### F. Edge Cases ที่มักถูกมองข้าม
- [ ] ตะกร้าว่าง → ปุ่มชำระ disabled
- [ ] ยอด 0 บาท (ส่วนลด 100%) → ยืนยันไม่ได้
- [ ] ชื่อเมนูยาว 60 ตัวอักษร → ไม่ทำ layout แตก
- [ ] ราคา 0 / ติดลบ → ระบบไม่รับ
- [ ] จำนวน 999 แก้ว → ตัวเลขไม่ล้นกรอบ
- [ ] เมนู 200 รายการ → หน้ายังลื่น
- [ ] ตะกร้า 30 รายการ → scroll ได้ ยอดถูก
- [ ] กดปุ่มชำระรัวๆ 5 ครั้ง → ได้ 1 บิล
- [ ] เปิด 2 แท็บพร้อมกัน แก้เมนูทั้งคู่ → **ข้อมูลไม่หาย** (ปัจจุบัน ❌ ตกข้อนี้)
- [ ] ชื่อพนักงานมี `<script>` → ไม่รัน
- [ ] เปลี่ยนเวลาเครื่องเป็นปีหน้า → รายงานไม่พัง
- [ ] localStorage ปิด (โหมดส่วนตัว) → ยังขายได้
- [ ] หมุนจอ → layout ไม่แตก
- [ ] เว็บเปิดค้างไว้ 12 ชม. → ยังใช้งานได้ (token ไม่หมดอายุเงียบ)

---

# 5. Actionable Roadmap & Priority Matrix

## 5.1 Priority Matrix

```
ผลกระทบสูง │  [P0] ปิดช่องโหว่ DB        │ [P1] แยกตาราง products/
          │  [P0] PIN → hash            │      ingredients (แก้ race)
          │  [P0] เก็บบิลที่ส่งไม่สำเร็จ  │ [P1] แยก /shared/*.js
          │                             │ [P1] ย้ายสรุปไป DB view
          ├─────────────────────────────┼──────────────────────────
ผลกระทบต่ำ │  [P2] debounce ค้นหา        │ [P3] E2E testing
          │  [P2] friendly error msg    │ [P3] Design token เต็มระบบ
          │  [P2] ถอดหลังบ้านจาก POS     │ [P3] i18n EN ครบ
          │  [P2] host QR lib เอง       │ [P3] PWA / offline shell
          └─────────────────────────────┴──────────────────────────
             แรงน้อย                        แรงมาก
```

## 5.2 Sprint Plan

### 🔴 Sprint 0 — Security Hotfix (1 สัปดาห์) — **ห้ามข้าม**

| # | งาน | เวลา | Acceptance Criteria |
|---|---|---|---|
| 0.1 | สร้าง Supabase Auth user + ใส่ CONFIG | 0.5 วัน | หน้าตั้งค่าขึ้น "Auth: เปิดใช้งาน" |
| 0.2 | รัน lockdown SQL (revoke anon) | 0.5 วัน | `curl` ด้วย anon key → 401 |
| 0.3 | ย้าย staff PIN → ตาราง + bcrypt hash | 1.5 วัน | อ่าน `app_config` ไม่เจอ PIN อีก |
| 0.4 | RLS แยก role (cashier insert / admin select) | 1 วัน | cashier token query `orders` → 403 |
| 0.5 | DB constraints (total ≥ 0, discount ≤ subtotal) | 0.5 วัน | ส่งบิลติดลบ → DB reject |
| 0.6 | `created_at` ใช้ `now()` ของ DB | 0.5 วัน | ตั้งเวลาเครื่องผิด → บิลยังลงเวลาถูก |
| 0.7 | เก็บบิลที่ส่งไม่สำเร็จ + หน้าส่งซ้ำ | 1 วัน | ปิดเน็ตขาย → เปิดเน็ต → กดส่งซ้ำได้ |
| 0.8 | CSV injection fix + esc ทุกจุด | 0.5 วัน | ชื่อพนักงาน `=cmd()` ไม่รันใน Excel |

**Definition of Done:** ทดสอบเจาะด้วย `curl` ด้วย anon key แล้วเข้าถึงข้อมูลไม่ได้เลย

---

### 🟠 Sprint 1 — Data Integrity (1–2 สัปดาห์)

| # | งาน | เวลา | AC |
|---|---|---|---|
| 1.1 | แยก `app_config` → ตาราง `products`, `ingredients`, `recipes`, `option_groups` | 3 วัน | มี migration script + rollback |
| 1.2 | `deduct_stock()` RPC แบบ atomic | 1 วัน | 2 เครื่องขายพร้อมกัน สต็อกถูกต้อง |
| 1.3 | ย้าย state ออกจาก DOM (เลิกใช้ `collect*()`) | 2 วัน | พิมพ์แล้ว re-render ข้อมูลไม่หาย |
| 1.4 | DB view สำหรับรายงาน (`daily_sales`) | 1 วัน | รายงาน 30 วันโหลด < 2s |
| 1.5 | Pagination บิล (แทน limit 3000) | 1 วัน | ดูย้อนหลัง 90 วันได้ครบ |

---

### 🟡 Sprint 2 — Code Quality & UX (1–2 สัปดาห์)

| # | งาน | เวลา | AC |
|---|---|---|---|
| 2.1 | แยก `/shared/core.js` + `/shared/domain.js` | 2 วัน | โค้ดซ้ำ < 10%, ทั้ง 2 ไฟล์เล็กลง 30% |
| 2.2 | ถอดหลังบ้านออกจาก `pos-sell.html` | 0.5 วัน | POS < 80 KB |
| 2.3 | Design token (color/type/space) + รวม button | 2 วัน | ไม่มี hex/px ดิบในโค้ดใหม่ |
| 2.4 | Friendly error messages | 1 วัน | ไม่มี raw JSON แสดงให้ผู้ใช้เห็น |
| 2.5 | Debounce ค้นหา + optimize render | 1 วัน | พิมพ์ค้นหาไม่กระตุกบนแท็บเล็ต |
| 2.6 | 86 เมนูจากหน้าขาย (กดค้าง) | 1 วัน | ปิดขายเมนูได้ใน 2 คลิก |
| 2.7 | Host QR lib เอง | 0.5 วัน | ตัดเน็ตนอก → QR ยังสร้างได้ |
| 2.8 | Accessibility: focus ring, contrast, touch target | 1.5 วัน | ผ่าน Lighthouse a11y > 90 |

---

### 🟢 Sprint 3+ — Scale & Polish (ทำเมื่อพร้อมขยาย)

| # | งาน | เมื่อไร |
|---|---|---|
| 3.1 | Multi-branch (`branch_id` + RLS ตามสาขา) | เมื่อจะใช้ครบ 3 สาขา |
| 3.2 | คลังกลาง + โอนสต็อกระหว่างสาขา | หลัง 3.1 |
| 3.3 | Unit tests สำหรับ `domain.js` | หลัง Sprint 2.1 |
| 3.4 | E2E 5 flow หลัก | เมื่อมี 2+ คนแก้โค้ด |
| 3.5 | PWA + offline shell | ถ้าเน็ตร้านมีปัญหาบ่อย |
| 3.6 | CRM / แต้มสะสม | ตามความต้องการธุรกิจ |
| 3.7 | เชื่อม Grab/LINE MAN | เมื่อมีบัญชี merchant |

---

## 5.3 สิ่งที่ **แนะนำว่าอย่าทำ** (และเหตุผล)

| อย่าทำ | เหตุผล |
|---|---|
| ย้ายไป React/Vue | Chrome 56 ต้อง transpile + polyfill หนัก, bundle ใหญ่ขึ้น 3–5 เท่า, ได้ประโยชน์น้อยกับ 2 หน้าจอ |
| Redux / state management library | State ระบบนี้เล็กมาก (cart + config) — plain object พอ |
| Micro-frontend / monorepo | ทีม 1 คน ระบบ 2 หน้า — overhead ล้วนๆ |
| GraphQL | PostgREST พอแล้ว และเบากว่า |
| Docker / K8s | เป็น static site บน Cloudflare — ไม่ต้องมี runtime |
| E2E 100% coverage | ต้นทุนดูแลสูงกว่าประโยชน์ — เลือก 5 flow หลักพอ |
| Design system เป็น npm package | ใช้ 2 ไฟล์ — CSS variables ไฟล์เดียวพอ |

---

## 5.4 Definition of Ready / Done (ใช้กับทุก task)

**Ready:** มี AC ชัดเจน · รู้ว่าทดสอบยังไง · ไม่ block ด้วยงานอื่น
**Done:**
- [ ] ทดสอบบนแท็บเล็ต Chrome 56 จริง (ไม่ใช่แค่ DevTools)
- [ ] รันสคริปต์ตรวจ Grid/gap ผ่าน
- [ ] Console ไม่มี error
- [ ] Checklist ข้อ 4.2 หมวดที่เกี่ยวข้องผ่านครบ
- [ ] ไม่มี raw error แสดงให้ผู้ใช้
- [ ] มีทางย้อนกลับ (rollback) ถ้าพัง

---

## ภาคผนวก A — สคริปต์ตรวจ Chrome 56 compatibility

```javascript
// วางใน Console ทุกหน้าที่แก้
var bad=0;
document.querySelectorAll('*').forEach(function(el){
  var s=getComputedStyle(el);
  if(s.display.indexOf('grid')>=0){bad++;console.warn('GRID:',el.className||el.tagName)}
  if((s.columnGap&&s.columnGap!=='normal')||(s.rowGap&&s.rowGap!=='normal')){bad++;console.warn('GAP:',el.className||el.tagName)}
});
console.log(bad===0?'สะอาด — ใช้ได้กับ Chrome 56':'พบ '+bad+' จุดที่ต้องแก้');
```

## ภาคผนวก B — คำสั่งทดสอบเจาะความปลอดภัย

```bash
# ต้องได้ 401 หลัง Sprint 0 (ปัจจุบันได้ 200 = ช่องโหว่)
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<project>.supabase.co/rest/v1/orders?select=*&limit=1" \
  -H "apikey: <anon_key>"

# ต้องไม่เห็น PIN
curl -s "https://<project>.supabase.co/rest/v1/app_config?key=eq.staff" \
  -H "apikey: <anon_key>" | grep -i pin
```

## ภาคผนวก C — สรุปไฟล์ปัจจุบัน

| ไฟล์ | หน้าที่ | ขนาด | สถานะ |
|---|---|---|---|
| `pos-sell.html` | หน้าขาย + หลังบ้าน (ซ้ำ) | 119 KB | ⚠️ ควรถอดหลังบ้านออก |
| `admin.html` | Back office | 84 KB | ⚠️ ยังใช้ CSS Grid |
| `schema-v3.sql` | ตารางหลัก | — | ✅ |
| `schema-shifts.sql` | ตารางกะ | — | ✅ |
| `fix-permissions.sql` | คืนสิทธิ์ anon | — | ⚠️ ชั่วคราว — ต้องแทนด้วย lockdown |
| `schema-v4-lockdown.sql` | ปิดสิทธิ์ anon | — | 🔴 **ยังไม่ได้รัน** |
