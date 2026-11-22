/**
 * Layered Beauty — Cloudflare Worker
 * Serves static assets and a small booking API backed by D1.
 *
 * Public:
 *   GET  /api/config                         services + timezone
 *   GET  /api/availability?service=&month=   open slots per day for a month (YYYY-MM)
 *   POST /api/bookings                       create a booking request (status: pending)
 * Admin (Authorization: Bearer <ADMIN_TOKEN>):
 *   GET    /api/admin/bookings?from=&to=     list bookings (YYYY-MM-DD, studio time)
 *   PATCH  /api/admin/bookings/:id           { status: pending|confirmed|cancelled }
 *   GET    /api/admin/blocks                 list upcoming blocks
 *   POST   /api/admin/blocks                 { startDate, endDate?, startTime?, endTime?, reason? }
 *   DELETE /api/admin/blocks/:id
 *   GET    /api/admin/settings
 *   PUT    /api/admin/settings               { hours, slotMinutes, leadHours, horizonDays, services }
 */

const TZ = 'America/Toronto';
const MINUTE = 60_000;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/* Defaults — editable from /admin. Hours are placeholders until the studio sets its own. */
const DEFAULT_SETTINGS = {
  slotMinutes: 30,
  leadHours: 24,
  horizonDays: 60,
  hours: {
    sun: [], mon: [],
    tue: [['10:00', '18:00']], wed: [['10:00', '18:00']], thu: [['10:00', '18:00']],
    fri: [['10:00', '18:00']], sat: [['10:00', '16:00']],
  },
  services: [
    { id: 'consult', name: 'Consultation & wig drop-off', minutes: 30, price: null },
    { id: 'essential', name: 'The Essential Refresh', minutes: 75, price: 95 },
    { id: 'signature', name: 'The Signature Revamp', minutes: 120, price: 155 },
    { id: 'restoration', name: 'The Full Restoration', minutes: 180, price: 235 },
  ],
};

/* ---------------- helpers ---------------- */
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
const fail = (status, message) => json({ error: message }, status);

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const clean = (v, max) => String(v ?? '').trim().slice(0, max);

/** Offset (ms) of `tz` from UTC at instant `utcMs`. */
function tzOffset(utcMs, tz = TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}
/** Studio-local date + minutes-from-midnight → UTC epoch ms (DST safe). */
function zonedToUtc(date, minutes, tz = TZ) {
  const [y, mo, d] = date.split('-').map(Number);
  const naive = Date.UTC(y, mo - 1, d) + minutes * MINUTE;
  let utc = naive - tzOffset(naive, tz);
  utc = naive - tzOffset(utc, tz); // second pass settles DST edges
  return utc;
}
/** UTC epoch ms → { date: 'YYYY-MM-DD', time: 'HH:MM' } in studio time. */
function utcToZoned(ms, tz = TZ) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (date) => DAY_KEYS[new Date(date + 'T12:00:00Z').getUTCDay()];

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/* ---------------- settings ---------------- */
async function getSettings(env) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('booking').first();
  if (!row) return structuredClone(DEFAULT_SETTINGS);
  try { return { ...structuredClone(DEFAULT_SETTINGS), ...JSON.parse(row.value) }; }
  catch { return structuredClone(DEFAULT_SETTINGS); }
}

function validateSettings(input) {
  const s = {};
  const int = (v, lo, hi) => { const n = Math.round(Number(v)); if (!Number.isFinite(n) || n < lo || n > hi) throw new Error('Invalid number'); return n; };
  s.slotMinutes = int(input.slotMinutes, 10, 120);
  s.leadHours = int(input.leadHours, 0, 24 * 14);
  s.horizonDays = int(input.horizonDays, 1, 365);
  s.hours = {};
  for (const k of DAY_KEYS) {
    const ranges = Array.isArray(input.hours?.[k]) ? input.hours[k] : [];
    s.hours[k] = ranges.map((r) => {
      if (!Array.isArray(r) || !isTime(r[0]) || !isTime(r[1]) || toMin(r[0]) >= toMin(r[1])) throw new Error(`Invalid hours for ${k}`);
      return [r[0], r[1]];
    }).slice(0, 4);
  }
  if (!Array.isArray(input.services) || !input.services.length) throw new Error('At least one service is required');
  const ids = new Set();
  s.services = input.services.slice(0, 12).map((x) => {
    const id = clean(x.id, 40).toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!id || ids.has(id)) throw new Error('Each service needs a unique id');
    ids.add(id);
    const name = clean(x.name, 80); if (!name) throw new Error('Each service needs a name');
    const price = x.price === null || x.price === '' || x.price === undefined ? null : int(x.price, 0, 100000);
    return { id, name, minutes: int(x.minutes, 10, 600), price };
  });
  return s;
}

/* ---------------- availability ---------------- */
async function busyRanges(env, fromMs, toMs) {
  const { results: b } = await env.DB.prepare(
    "SELECT start_ts, end_ts FROM bookings WHERE status != 'cancelled' AND start_ts < ? AND end_ts > ?",
  ).bind(toMs, fromMs).all();
  const { results: k } = await env.DB.prepare('SELECT start_ts, end_ts FROM blocks WHERE start_ts < ? AND end_ts > ?')
    .bind(toMs, fromMs).all();
  return [...b, ...k];
}

function slotsForDay(date, service, settings, busy, now) {
  const out = [];
  const earliest = now + settings.leadHours * 3_600_000;
  const ranges = settings.hours[weekday(date)] || [];
  for (const [open, close] of ranges) {
    for (let m = toMin(open); m + service.minutes <= toMin(close); m += settings.slotMinutes) {
      const start = zonedToUtc(date, m), end = start + service.minutes * MINUTE;
      if (start < earliest) continue;
      if (busy.some((r) => r.start_ts < end && r.end_ts > start)) continue;
      out.push(fromMin(m));
    }
  }
  return out;
}

async function availability(env, url) {
  const settings = await getSettings(env);
  const service = settings.services.find((s) => s.id === url.searchParams.get('service'));
  if (!service) return fail(400, 'Unknown service');
  const month = url.searchParams.get('month') || '';
  if (!/^\d{4}-\d{2}$/.test(month)) return fail(400, 'month must be YYYY-MM');

  const now = Date.now();
  const today = utcToZoned(now).date;
  const lastDay = addDays(today, settings.horizonDays);
  const first = `${month}-01`;
  const days = {};
  const dates = [];
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) if (d >= today && d <= lastDay) dates.push(d);
  if (dates.length) {
    const busy = await busyRanges(env, zonedToUtc(dates[0], 0), zonedToUtc(addDays(dates.at(-1), 1), 0));
    for (const d of dates) { const s = slotsForDay(d, service, settings, busy, now); if (s.length) days[d] = s; }
  }
  return json({ month, timezone: TZ, service: service.id, minDate: today, maxDate: lastDay, days });
}

/* ---------------- bookings ---------------- */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function createBooking(env, request) {
  let body;
  try { body = await request.json(); } catch { return fail(400, 'Invalid request'); }
  if (body.website) return json({ ok: true, status: 'pending' }); // honeypot: silently accept bots

  const settings = await getSettings(env);
  const service = settings.services.find((s) => s.id === body.service);
  const name = clean(body.name, 100), email = clean(body.email, 160).toLowerCase();
  const phone = clean(body.phone, 40), notes = clean(body.notes, 1500);
  if (!service) return fail(400, 'Please choose a service.');
  if (!isDate(body.date) || !isTime(body.time)) return fail(400, 'Please choose a date and time.');
  if (!name) return fail(400, 'Please enter your name.');
  if (!EMAIL_RE.test(email)) return fail(400, 'Please enter a valid email address.');

  const now = Date.now();
  // Slot must be one we would actually offer (hours, lead time, horizon)
  const today = utcToZoned(now).date;
  if (body.date > addDays(today, settings.horizonDays)) return fail(400, 'That date is too far ahead.');
  const dayBusy = await busyRanges(env, zonedToUtc(body.date, 0), zonedToUtc(addDays(body.date, 1), 0));
  if (!slotsForDay(body.date, service, settings, dayBusy, now).includes(body.time)) {
    return fail(409, 'Sorry — that time was just taken or is no longer available. Please pick another.');
  }

  const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM bookings WHERE email = ? AND status != 'cancelled' AND start_ts > ?")
    .bind(email, now).first();
  if ((active?.n ?? 0) >= 3) return fail(429, 'You already have several upcoming requests. Please contact the studio to change them.');

  const id = crypto.randomUUID();
  const start = zonedToUtc(body.date, toMin(body.time));
  const end = start + service.minutes * MINUTE;
  // Atomic insert: only succeeds if nothing overlaps at write time (prevents double booking).
  const res = await env.DB.prepare(
    `INSERT INTO bookings (id, service, start_ts, end_ts, name, email, phone, notes, status, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9
     WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE status != 'cancelled' AND start_ts < ?4 AND end_ts > ?3)
       AND NOT EXISTS (SELECT 1 FROM blocks WHERE start_ts < ?4 AND end_ts > ?3)`,
  ).bind(id, service.id, start, end, name, email, phone || null, notes || null, now).run();
  if (!res.meta?.changes) return fail(409, 'Sorry — that time was just taken. Please pick another.');

  return json({ ok: true, id, status: 'pending', service: service.name, date: body.date, time: body.time, minutes: service.minutes }, 201);
}

/* ---------------- admin ---------------- */
function authorized(request, env) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return Boolean(env.ADMIN_TOKEN) && token.length > 0 && timingSafeEqual(token, env.ADMIN_TOKEN);
}

const shapeBooking = (b) => ({ ...b, ...(({ date, time }) => ({ date, time }))(utcToZoned(b.start_ts)), endTime: utcToZoned(b.end_ts).time });
const shapeBlock = (b) => {
  const s = utcToZoned(b.start_ts), e = utcToZoned(b.end_ts - 1);
  return { ...b, startDate: s.date, startTime: s.time, endDate: e.date, endTime: utcToZoned(b.end_ts).time };
};

async function admin(env, request, url, path) {
  if (!authorized(request, env)) return fail(401, 'Unauthorized');
  const method = request.method;

  if (path === 'bookings' && method === 'GET') {
    const today = utcToZoned(Date.now()).date;
    const from = isDate(url.searchParams.get('from')) ? url.searchParams.get('from') : addDays(today, -7);
    const to = isDate(url.searchParams.get('to')) ? url.searchParams.get('to') : addDays(today, 120);
    const { results } = await env.DB.prepare('SELECT * FROM bookings WHERE start_ts >= ? AND start_ts < ? ORDER BY start_ts')
      .bind(zonedToUtc(from, 0), zonedToUtc(addDays(to, 1), 0)).all();
    return json({ bookings: results.map(shapeBooking) });
  }

  const bookingMatch = path.match(/^bookings\/([0-9a-f-]{36})$/);
  if (bookingMatch && method === 'PATCH') {
    let body; try { body = await request.json(); } catch { return fail(400, 'Invalid request'); }
    if (!['pending', 'confirmed', 'cancelled'].includes(body.status)) return fail(400, 'Invalid status');
    const r = await env.DB.prepare('UPDATE bookings SET status = ? WHERE id = ?').bind(body.status, bookingMatch[1]).run();
    return r.meta?.changes ? json({ ok: true }) : fail(404, 'Booking not found');
  }

  if (path === 'blocks' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM blocks WHERE end_ts > ? ORDER BY start_ts')
      .bind(Date.now() - 86_400_000).all();
    return json({ blocks: results.map(shapeBlock) });
  }

  if (path === 'blocks' && method === 'POST') {
    let b; try { b = await request.json(); } catch { return fail(400, 'Invalid request'); }
    if (!isDate(b.startDate)) return fail(400, 'Choose a start date.');
    const endDate = b.endDate ? b.endDate : b.startDate;
    if (!isDate(endDate) || endDate < b.startDate) return fail(400, 'End date must be on or after the start date.');
    let start, end;
    if (b.startTime || b.endTime) {
      if (!isTime(b.startTime) || !isTime(b.endTime)) return fail(400, 'Enter both a start and end time.');
      start = zonedToUtc(b.startDate, toMin(b.startTime));
      end = zonedToUtc(endDate, toMin(b.endTime));
    } else {
      start = zonedToUtc(b.startDate, 0);
      end = zonedToUtc(addDays(endDate, 1), 0);
    }
    if (end <= start) return fail(400, 'The block must end after it starts.');
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO blocks (id, start_ts, end_ts, reason, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, start, end, clean(b.reason, 120) || null, Date.now()).run();
    const { results: clashes } = await env.DB.prepare(
      "SELECT * FROM bookings WHERE status != 'cancelled' AND start_ts < ? AND end_ts > ? ORDER BY start_ts",
    ).bind(end, start).all();
    return json({ ok: true, id, clashes: clashes.map(shapeBooking) }, 201);
  }

  const blockMatch = path.match(/^blocks\/([0-9a-f-]{36})$/);
  if (blockMatch && method === 'DELETE') {
    const r = await env.DB.prepare('DELETE FROM blocks WHERE id = ?').bind(blockMatch[1]).run();
    return r.meta?.changes ? json({ ok: true }) : fail(404, 'Block not found');
  }

  if (path === 'settings' && method === 'GET') return json({ settings: await getSettings(env), timezone: TZ });
  if (path === 'settings' && method === 'PUT') {
    let s; try { s = validateSettings(await request.json()); } catch (e) { return fail(400, e.message || 'Invalid settings'); }
    await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .bind('booking', JSON.stringify(s)).run();
    return json({ ok: true, settings: s });
  }

  return fail(404, 'Not found');
}

/* ---------------- router ---------------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Canonical host: apex → www
    if (url.hostname === 'layeredbeauty.com') {
      url.hostname = 'www.layeredbeauty.com';
      return Response.redirect(url.toString(), 301);
    }

    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    // Same-origin check for state-changing requests
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) return fail(403, 'Forbidden');
    }

    try {
      const path = url.pathname.slice(5).replace(/\/+$/, '');
      if (path === 'config' && request.method === 'GET') {
        const s = await getSettings(env);
        return json({ timezone: TZ, services: s.services, horizonDays: s.horizonDays });
      }
      if (path === 'availability' && request.method === 'GET') return await availability(env, url);
      if (path === 'bookings' && request.method === 'POST') return await createBooking(env, request);
      if (path.startsWith('admin/')) return await admin(env, request, url, path.slice(6));
      return fail(404, 'Not found');
    } catch (err) {
      console.error('API error', err);
      return fail(500, 'Something went wrong. Please try again.');
    }
  },
};
