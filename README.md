# ✈️ จับตั๋วถูก

แอพสแกนราคาตั๋วเครื่องบินถูกสุดหลายเส้นทาง — ตั้งช่วงวัน/เวลาเดินทาง + ราคาเป้า แล้วระบบสแกนให้ทุก 4 ชั่วโมง เจอตั๋วถึงเป้าหรือราคาลดแรง แจ้งเตือนเข้า Telegram ทันที

By Thitipong Srisomwong

## ทำงานยังไง

```
หน้าแอพ (GitHub Pages)  ──บันทึกเส้นทาง──▶  routes.json ใน repo
                                                 │
GitHub Actions (ทุก 4 ชม. / ทันทีที่แก้เส้นทาง) ◀─┘
   └─ ดึงราคาจาก Aviasales Data API → กรองตามวัน/เวลา/จำนวนวันพัก
   └─ บันทึก data/prices.json  ──▶  หน้าแอพแสดงราคา + กราฟย้อนหลัง
   └─ ถึงราคาเป้า / ราคาลด  ──▶  แจ้งเตือน Telegram
```

ฟรีทั้งหมด (GitHub public repo + Travelpayouts + Telegram)

## ติดตั้ง (ครั้งเดียว ~15 นาที)

### 1) สร้าง repo และอัปไฟล์
1. GitHub → **New repository** ชื่อ `flight-deal-watch` แบบ **Public**
2. **Add file → Upload files** → ลากไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้นไป
3. ⚠️ โฟลเดอร์ `.github` มักถูกซ่อน ถ้าไม่ขึ้น ให้ทำเอง: **Add file → Create new file** พิมพ์ชื่อ `.github/workflows/scan.yml` แล้ววางเนื้อหาไฟล์ `scan.yml`

### 2) ขอ token ราคาตั๋ว (Travelpayouts)
1. สมัครที่ https://www.travelpayouts.com (ฟรี)
2. เข้า https://www.travelpayouts.com/programs/100/tools/api → คัดลอก **API token**

### 3) สร้างบอท Telegram
1. ใน Telegram คุยกับ **@BotFather** → `/newbot` → ตั้งชื่อ → ได้ **bot token**
2. ทักบอทที่สร้าง 1 ข้อความ (เช่น "hi")
3. เปิด `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates` ในเบราว์เซอร์ → หา `"chat":{"id":123456789` ตัวเลขนั้นคือ **chat id**
   (ถ้าจะให้แจ้งในกลุ่ม: เพิ่มบอทเข้ากลุ่ม แล้วทำข้อ 2–3 — id กลุ่มขึ้นต้นด้วย `-`)

### 4) ใส่ Secrets ใน repo
**Settings → Secrets and variables → Actions → New repository secret** สร้าง 3 ตัว:

| ชื่อ | ค่า |
|---|---|
| `TP_TOKEN` | token จาก Travelpayouts |
| `TG_BOT_TOKEN` | token บอท Telegram |
| `TG_CHAT_ID` | chat id |

### 5) เปิดสิทธิ์ + เปิดเว็บ
- **Settings → Actions → General → Workflow permissions** → เลือก **Read and write permissions** → Save
- **Settings → Pages** → Source: **Deploy from a branch** → `main` / `/ (root)` → Save
- เว็บจะอยู่ที่ `https://<username>.github.io/flight-deal-watch/`

### 6) ทดสอบ
**Actions → Scan flight prices → Run workflow** → ติ๊ก "ส่งข้อความทดสอบไป Telegram" → Run
ควรได้ข้อความ "✅ เชื่อมต่อ Telegram สำเร็จ" ในไม่กี่วินาที

### 7) เชื่อมหน้าแอพกับ repo (เพื่อเพิ่ม/แก้เส้นทางจากมือถือ)
1. GitHub → รูปโปรไฟล์ → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
2. Repository access: **Only select repositories** → เลือก `flight-deal-watch`
3. Permissions: **Contents = Read and write**, **Actions = Read and write**
4. เปิดหน้าแอพ → ⚙️ ตั้งค่า → วาง token → กด **ทดสอบ** → **บันทึก**

token เก็บในเครื่องคุณเท่านั้น ไม่ถูกส่งขึ้น repo

> ติดตั้งเป็นแอพบนมือถือ: เปิดเว็บใน Chrome → เมนู ⋮ → **เพิ่มลงในหน้าจอหลัก**

## ใช้งาน
- **+ เพิ่มเส้นทาง** → ต้นทาง/ปลายทาง (รหัส 3 ตัว เช่น BKK, CNX, TYO, SEL), ไป-กลับ/เที่ยวเดียว, ช่วงวันออกเดินทาง, จำนวนวันพัก, ช่วงเวลาบิน, บินตรง, ราคาเป้า, % ราคาลด
- บันทึกแล้วระบบสแกนรอบแรกทันที (1–2 นาที) กด ⟳ เพื่อดูผล
- ใช้รหัส **เมือง** ได้ เช่น `BKK` = สุวรรณภูมิ+ดอนเมือง, `TYO` = นาริตะ+ฮาเนดะ, `OSA` = คันไซ+อิตามิ
- กด **ท็อป** ดูตั๋วถูกสุดหลายตัวเลือก พร้อมลิงก์ไปจองและเทียบใน Google Flights

## กติกาแจ้งเตือน
- **ถึงราคาเป้า**: แจ้งครั้งแรกที่ราคา ≤ เป้า และแจ้งอีกเมื่อถูกลงกว่าที่เคยแจ้ง (ไม่สแปมราคาเดิม) ถ้าราคากลับขึ้นเกินเป้าแล้วลงมาใหม่ จะแจ้งอีกครั้ง
- **ราคาลด X%**: แจ้งเมื่อราคาถูกสุดลดลงจากรอบสแกนก่อนหน้าเกิน X%

## ข้อควรรู้
- ราคามาจาก **แคชการค้นหาจริงของผู้ใช้ Aviasales ช่วงไม่กี่วันล่าสุด** ไม่ใช่ราคาสดจากสายการบิน — ใช้จับจังหวะตั๋วถูกได้ดี แต่ควรเช็คราคาจริงก่อนจอง
- เส้นทางยอดนิยม (BKK–ญี่ปุ่น/เกาหลี/ในประเทศ) ข้อมูลเยอะ เส้นทางเล็กอาจขึ้น "ยังไม่พบราคา" บางรอบ
- ราคาต่อผู้ใหญ่ 1 คน ชั้นประหยัด ไม่รวมกระเป๋าโหลด (ขึ้นกับสายการบิน)
- เปลี่ยนความถี่สแกน: แก้ `cron` ใน `.github/workflows/scan.yml` (เช่น `'17 */2 * * *'` = ทุก 2 ชม.)
- ถ้า repo ไม่มีการเคลื่อนไหว 60 วัน GitHub อาจพักงานตั้งเวลา — เข้าไปกด Enable ใน Actions ได้

## ไฟล์
| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | หน้าแอพ (PWA) |
| `routes.json` | เส้นทางที่จับตา (แอพแก้ให้อัตโนมัติ) |
| `data/prices.json` | ผลสแกน + ประวัติราคา (บอทเขียนให้) |
| `scripts/scan.mjs` | ตัวสแกนราคา + ส่ง Telegram |
| `.github/workflows/scan.yml` | ตั้งเวลาสแกน |
| `manifest.webmanifest`, `sw.js`, `icon*` | ติดตั้งเป็นแอพบนมือถือ |
