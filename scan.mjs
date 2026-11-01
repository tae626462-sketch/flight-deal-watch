// จับตั๋วถูก — ตัวสแกนราคาตั๋วเครื่องบิน (รันบน GitHub Actions)
// อ่าน routes.json → ดึงราคาจาก Travelpayouts (Aviasales Data API) → กรองตามช่วงวัน/เวลา
// → บันทึก data/prices.json → แจ้งเตือน Telegram เมื่อถึงราคาเป้า หรือราคาลดแรง
// By Thitipong Srisomwong

import fs from 'node:fs/promises';

const TP_TOKEN = process.env.TP_TOKEN || '';
const TG_TOKEN = process.env.TG_BOT_TOKEN || '';
const TG_CHAT = process.env.TG_CHAT_ID || '';
const MARKETS = (process.env.TP_MARKETS ?? 'th,').split(',').map(s => s.trim()); // '' = ตลาดค่าเริ่มต้น
const TEST_ALERT = process.env.TEST_ALERT === 'true';
const CURRENCY = 'thb';
const HISTORY_MAX = 240;
const ROUTES_FILE = 'routes.json';
const DATA_FILE = 'data/prices.json';
const API = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';

const AIRLINES = {
  TG: 'การบินไทย', FD: 'ไทยแอร์เอเชีย', XJ: 'ไทยแอร์เอเชีย X', SL: 'ไทยไลอ้อนแอร์', DD: 'นกแอร์',
  PG: 'บางกอกแอร์เวย์ส', VZ: 'ไทยเวียตเจ็ท', WE: 'ไทยสมายล์', JL: 'JAL', NH: 'ANA', MM: 'Peach',
  TR: 'Scoot', SQ: 'Singapore Airlines', CX: 'Cathay Pacific', KE: 'Korean Air', OZ: 'Asiana',
  '7C': 'Jeju Air', TW: "T'way", LJ: 'Jin Air', ZE: 'Eastar Jet', BR: 'EVA Air', CI: 'China Airlines',
  IT: 'Tigerair Taiwan', VJ: 'VietJet', VN: 'Vietnam Airlines', MH: 'Malaysia Airlines', AK: 'AirAsia',
  D7: 'AirAsia X', EK: 'Emirates', QR: 'Qatar Airways', TK: 'Turkish Airlines', EY: 'Etihad',
  MU: 'China Eastern', CZ: 'China Southern', CA: 'Air China', HX: 'Hong Kong Airlines', UO: 'HK Express',
  '5J': 'Cebu Pacific', PR: 'Philippine Airlines', QZ: 'Indonesia AirAsia', GA: 'Garuda', '6E': 'IndiGo', AI: 'Air India',
};

const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); // วันนี้ตามเวลาไทย

function monthsBetween(from, to) {
  const out = [];
  const d = new Date(from.slice(0, 7) + '-01T00:00:00Z');
  const end = new Date(to.slice(0, 7) + '-01T00:00:00Z');
  while (d <= end && out.length < 13) {
    out.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

const thDate = (ymd) => new Date(ymd + 'T00:00:00Z').toLocaleDateString('th-TH', {
  weekday: 'short', day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC',
});
const baht = (n) => '฿' + Math.round(n).toLocaleString('en-US');
const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function fetchJson(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'Accept-Encoding': 'gzip' } });
      clearTimeout(timer);
      const body = await res.text();
      if (res.status === 429) { await new Promise(r => setTimeout(r, 3000 * (i + 1))); lastErr = new Error('429 rate limit'); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 160)}`);
      return JSON.parse(body);
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

// ดึงราคาจาก API หนึ่งเดือน หนึ่งตลาด
async function fetchMonth(route, month, market) {
  const p = new URLSearchParams({
    origin: route.origin,
    destination: route.destination,
    departure_at: month,
    one_way: route.tripType === 'oneway' ? 'true' : 'false',
    direct: route.directOnly ? 'true' : 'false',
    sorting: 'price',
    unique: 'false',
    currency: CURRENCY,
    limit: '1000',
    page: '1',
    token: TP_TOKEN,
  });
  if (market) p.set('market', market);
  const json = await fetchJson(`${API}?${p}`);
  if (json.success === false) throw new Error(json.error || 'API error');
  return Array.isArray(json.data) ? json.data : [];
}

function normalize(t) {
  const dep = String(t.departure_at || '');
  const ret = String(t.return_at || '');
  return {
    price: Number(t.price),
    airline: t.airline || '',
    airlineName: AIRLINES[t.airline] || t.airline || '',
    flight: t.flight_number ? `${t.airline}${t.flight_number}` : '',
    from: t.origin_airport || t.origin,
    to: t.destination_airport || t.destination,
    depDate: dep.slice(0, 10),
    depTime: dep.slice(11, 16),
    retDate: ret ? ret.slice(0, 10) : '',
    retTime: ret ? ret.slice(11, 16) : '',
    stops: Number(t.transfers ?? 0),
    retStops: t.return_transfers != null ? Number(t.return_transfers) : null,
    duration: Number(t.duration_to || t.duration || 0),
    link: t.link ? 'https://www.aviasales.com' + t.link : '',
  };
}

function inTimeWindow(time, from, to) {
  if (!from && !to) return true;
  if (!time) return true; // ไม่มีข้อมูลเวลา → ไม่ตัดทิ้ง
  const f = from || '00:00', e = to || '23:59';
  return f <= e ? (time >= f && time <= e) : (time >= f || time <= e); // รองรับช่วงข้ามเที่ยงคืน
}

export function filterDeals(route, rawList, todayStr = today()) {
  const start = route.departFrom > todayStr ? route.departFrom : todayStr;
  const seen = new Map();
  for (const raw of rawList) {
    const d = normalize(raw);
    if (!d.price || !d.depDate) continue;
    if (d.depDate < start || d.depDate > route.departTo) continue;
    if (!inTimeWindow(d.depTime, route.timeFrom, route.timeTo)) continue;
    if (route.directOnly && d.stops > 0) continue;
    if (route.tripType !== 'oneway') {
      if (!d.retDate) continue;
      const stay = dayDiff(d.depDate, d.retDate);
      const min = Number(route.stayMin || 1), max = Number(route.stayMax || 30);
      if (stay < min || stay > max) continue;
      if (route.directOnly && d.retStops > 0) continue;
    }
    const key = `${d.depDate}|${d.depTime}|${d.retDate}|${d.flight}`;
    const prev = seen.get(key);
    if (!prev || d.price < prev.price) seen.set(key, d);
  }
  return [...seen.values()].sort((a, b) => a.price - b.price);
}

async function scanRoute(route) {
  const start = route.departFrom > today() ? route.departFrom : today();
  if (route.departTo < start) return { status: 'expired', deals: [] };
  const all = [];
  let errors = 0, calls = 0;
  for (const month of monthsBetween(start, route.departTo)) {
    for (const market of MARKETS) {
      calls++;
      try { all.push(...await fetchMonth(route, month, market)); }
      catch (e) { errors++; console.warn(`  ! ${route.origin}-${route.destination} ${month} [${market || 'default'}]: ${e.message}`); }
      await new Promise(r => setTimeout(r, 250));
    }
  }
  if (errors === calls) return { status: 'error', error: 'เรียก API ไม่สำเร็จ (ตรวจ TP_TOKEN)', deals: [] };
  const deals = filterDeals(route, all);
  return { status: deals.length ? 'ok' : 'empty', deals };
}

async function sendTelegram(html) {
  if (!TG_TOKEN || !TG_CHAT) { console.log('  (ไม่ได้ตั้ง Telegram — ข้ามการส่ง)'); return false; }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: html, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const j = await res.json();
    if (!j.ok) console.warn('  ! Telegram:', j.description);
    return !!j.ok;
  } catch (e) { console.warn('  ! Telegram:', e.message); return false; }
}

function gflightsLink(route, d) {
  const q = route.tripType === 'oneway'
    ? `Flights from ${route.origin} to ${route.destination} on ${d.depDate} one way`
    : `Flights from ${route.origin} to ${route.destination} on ${d.depDate} through ${d.retDate}`;
  return 'https://www.google.com/travel/flights?q=' + encodeURIComponent(q) + '&curr=THB&hl=th';
}

function alertMessage(route, d, reason) {
  const title = route.name ? `${esc(route.name)}\n` : '';
  const stops = (n) => n === 0 ? 'บินตรง' : `ต่อ ${n} ครั้ง`;
  const lines = [
    `✈️ <b>${reason}</b>`,
    `${title}<b>${route.origin} → ${route.destination}</b> ${route.tripType === 'oneway' ? '(เที่ยวเดียว)' : '(ไป-กลับ)'}`,
    `💰 <b>${baht(d.price)}</b>${route.targetPrice ? ` · เป้า ${baht(route.targetPrice)}` : ''}`,
    `🛫 ${thDate(d.depDate)}${d.depTime ? ' ' + d.depTime : ''} · ${esc(d.airlineName)} ${esc(d.flight)} · ${stops(d.stops)}`,
  ];
  if (d.retDate) lines.push(`🛬 ${thDate(d.retDate)}${d.retTime ? ' ' + d.retTime : ''} · พัก ${dayDiff(d.depDate, d.retDate)} วัน`);
  const links = [];
  if (d.link) links.push(`<a href="${d.link}">ดู/จองตั๋วนี้</a>`);
  links.push(`<a href="${gflightsLink(route, d)}">เทียบ Google Flights</a>`);
  lines.push('🔗 ' + links.join(' · '));
  lines.push('<i>ราคาจากแคชการค้นหาล่าสุด ควรเช็คราคาจริงก่อนจอง</i>');
  return lines.join('\n');
}

async function main() {
  if (TEST_ALERT) {
    const ok = await sendTelegram('✅ <b>จับตั๋วถูก</b> เชื่อมต่อ Telegram สำเร็จ\nระบบจะแจ้งเตือนที่นี่เมื่อเจอตั๋วถึงราคาเป้า');
    console.log('ส่งข้อความทดสอบ:', ok ? 'สำเร็จ' : 'ไม่สำเร็จ');
  }
  if (!TP_TOKEN) { console.error('ไม่พบ TP_TOKEN — ตั้งใน Settings › Secrets and variables › Actions'); process.exit(1); }

  const routes = JSON.parse(await fs.readFile(ROUTES_FILE, 'utf8')).routes || [];
  let data = { routes: {} };
  try { data = JSON.parse(await fs.readFile(DATA_FILE, 'utf8')); data.routes ||= {}; } catch { /* ไฟล์ใหม่ */ }

  const now = new Date().toISOString();
  const next = {};
  let alerts = 0;

  for (const route of routes) {
    const old = data.routes[route.id] || {};
    // ถ้าเงื่อนไขเส้นทางเปลี่ยน ให้เริ่มประวัติใหม่
    const sig = [route.origin, route.destination, route.tripType, route.departFrom, route.departTo,
      route.stayMin, route.stayMax, route.timeFrom, route.timeTo, route.directOnly].join('|');
    const rec = old.sig === sig ? { ...old } : { sig, history: [] };
    rec.sig = sig;

    if (route.active === false) { rec.status = 'paused'; next[route.id] = rec; continue; }

    console.log(`• ${route.origin} → ${route.destination} (${route.name || route.id})`);
    const res = await scanRoute(route);
    rec.scannedAt = now;
    rec.status = res.status;
    rec.error = res.error || '';
    const best = res.deals[0];

    if (best) {
      const prevPrice = rec.cheapest?.price ?? null;
      rec.prevPrice = prevPrice;
      rec.cheapest = best;
      rec.top = res.deals.slice(0, 8);
      rec.found = res.deals.length;
      rec.history = [...(rec.history || []), { t: now, p: best.price }].slice(-HISTORY_MAX);
      if (!rec.lowest || best.price < rec.lowest.price) rec.lowest = { price: best.price, at: now, deal: best };
      console.log(`  ถูกสุด ${baht(best.price)} วันที่ ${best.depDate} (${res.deals.length} ตัวเลือก)`);

      // --- เงื่อนไขแจ้งเตือน ---
      const target = Number(route.targetPrice || 0);
      const dropPct = Number(route.dropPct || 0);
      let reason = '';
      if (target && best.price <= target) {
        if (rec.lastAlertPrice == null || best.price < rec.lastAlertPrice) reason = 'ตั๋วถึงราคาเป้าแล้ว!';
      } else if (target && best.price > target) {
        rec.lastAlertPrice = null; // ราคากลับขึ้นเกินเป้า → รีเซ็ต จะเตือนใหม่เมื่อลงมาอีก
      }
      if (!reason && dropPct && prevPrice && best.price <= prevPrice * (1 - dropPct / 100)) {
        reason = `ราคาลด ${Math.round((1 - best.price / prevPrice) * 100)}% (จาก ${baht(prevPrice)})`;
      }
      if (reason) {
        const sent = await sendTelegram(alertMessage(route, best, reason));
        if (sent) { alerts++; if (target && best.price <= target) rec.lastAlertPrice = best.price; rec.lastAlertAt = now; }
      }
    } else {
      rec.found = 0;
      console.log(`  ${res.status === 'error' ? res.error : 'ยังไม่พบราคาในช่วงที่กำหนด'}`);
    }
    next[route.id] = rec;
  }

  await fs.mkdir('data', { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify({ updatedAt: now, currency: 'THB', routes: next }, null, 1));
  console.log(`เสร็จ: ${routes.length} เส้นทาง, แจ้งเตือน ${alerts} ครั้ง`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
