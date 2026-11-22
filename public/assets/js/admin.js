/* Layered Beauty — studio admin: bookings, blocked time, hours & services. */
(() => {
  'use strict';
  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => [...r.querySelectorAll(s)];
  const KEY = 'lbAdminToken';
  const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
  let token = (() => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } })();
  let bookings = [], services = [], filter = 'upcoming';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const fmtTime = (t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`; };
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());

  let toastTimer;
  const toast = (msg) => { const t = q('#toast'); q('[data-toast-text]', t).textContent = msg; t.classList.add('is-shown'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('is-shown'), 3000); };
  const setErr = (sel, msg) => { const b = q(sel); b.hidden = !msg; q('span:last-child', b).textContent = msg || ''; };

  async function api(path, opts = {}) {
    const res = await fetch('/api/admin/' + path, { ...opts, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { signOut(); throw new Error('Your session has ended. Please sign in again.'); }
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  /* ---------- Auth ---------- */
  function showApp(on) { q('[data-signin]').hidden = on; q('[data-app]').hidden = !on; q('[data-logout]').hidden = !on; }
  function signOut() { token = ''; try { sessionStorage.removeItem(KEY); } catch { /* noop */ } showApp(false); }
  q('[data-logout]').addEventListener('click', signOut);
  q('[data-signin]').addEventListener('submit', async (e) => {
    e.preventDefault();
    token = q('#adminToken').value.trim();
    if (!token) return setErr('[data-signin-error]', 'Enter your access key.');
    try {
      await api('settings');
      try { sessionStorage.setItem(KEY, token); } catch { /* noop */ }
      setErr('[data-signin-error]', ''); q('#adminToken').value = '';
      showApp(true); loadAll();
    } catch { setErr('[data-signin-error]', 'That key wasn’t accepted.'); token = ''; }
  });

  /* ---------- Tabs (WAI-ARIA) ---------- */
  const tabs = qa('[data-tab]');
  const activate = (tab) => {
    tabs.forEach((t) => { const on = t === tab; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; q('#' + t.getAttribute('aria-controls')).hidden = !on; });
    tab.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => activate(t));
    t.addEventListener('keydown', (e) => {
      const n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (n) { e.preventDefault(); activate(tabs[(i + n + tabs.length) % tabs.length]); }
    });
  });

  /* ---------- Bookings ---------- */
  async function loadBookings() {
    try { ({ bookings } = await api('bookings')); renderBookings(); }
    catch (e) { q('[data-bookings]').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  }
  function renderBookings() {
    const t = today();
    let list = bookings;
    if (filter === 'upcoming') list = list.filter((b) => b.date >= t && b.status !== 'cancelled');
    if (filter === 'pending') list = list.filter((b) => b.status === 'pending' && b.date >= t);
    const wrap = q('[data-bookings]');
    if (!list.length) { wrap.innerHTML = '<p class="empty"><span class="material-symbols-outlined" aria-hidden="true">event_available</span>Nothing here right now.</p>'; return; }
    const svcName = (id) => services.find((s) => s.id === id)?.name || id;
    const groups = list.reduce((m, b) => ((m[b.date] ||= []).push(b), m), {});
    wrap.innerHTML = Object.entries(groups).map(([date, items]) => `
      <h3 class="day-head">${esc(fmtDate(date))}</h3>
      <ul class="bk-list">${items.map((b) => `
        <li class="bk bk--${b.status}">
          <div class="bk__time">${esc(fmtTime(b.time))}<small>until ${esc(fmtTime(b.endTime))}</small></div>
          <div class="bk__who">
            <strong>${esc(b.name)}</strong> <span class="badge badge--${b.status}">${b.status === 'pending' ? 'Needs confirming' : esc(b.status[0].toUpperCase() + b.status.slice(1))}</span>
            <div>${esc(svcName(b.service))}</div>
            <div class="muted"><a href="mailto:${esc(b.email)}">${esc(b.email)}</a>${b.phone ? ` · <a href="tel:${esc(b.phone)}">${esc(b.phone)}</a>` : ''}</div>
            ${b.notes ? `<p class="bk__notes">${esc(b.notes)}</p>` : ''}
          </div>
          <div class="bk__actions">
            ${b.status !== 'confirmed' && b.status !== 'cancelled' ? `<button class="btn btn--dark btn--sm" data-set="confirmed" data-id="${b.id}">Confirm</button>` : ''}
            ${b.status !== 'cancelled' ? `<button class="btn btn--outline btn--sm" data-set="cancelled" data-id="${b.id}">Cancel</button>` : `<button class="btn btn--outline btn--sm" data-set="pending" data-id="${b.id}">Restore</button>`}
          </div>
        </li>`).join('')}</ul>`).join('');
  }
  q('[data-bookings]').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-set]'); if (!btn) return;
    const status = btn.dataset.set;
    if (status === 'cancelled' && !confirmInline(btn)) return;
    btn.disabled = true;
    try { await api(`bookings/${btn.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); toast(status === 'confirmed' ? 'Booking confirmed' : status === 'cancelled' ? 'Booking cancelled — the time is open again' : 'Booking restored'); await loadBookings(); }
    catch (err) { toast(err.message); btn.disabled = false; }
  });
  // Two-step inline confirm instead of a blocking browser dialog
  function confirmInline(btn) {
    if (btn.dataset.armed) return true;
    btn.dataset.armed = '1'; const old = btn.textContent; btn.textContent = 'Tap again to cancel';
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = old; }, 3500);
    return false;
  }
  qa('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    qa('[data-filter]').forEach((x) => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    renderBookings();
  }));
  q('[data-refresh]').addEventListener('click', loadBookings);

  /* ---------- Blocks ---------- */
  const blockForm = q('[data-block-form]');
  qa('input[name=kind]', blockForm).forEach((r) => r.addEventListener('change', () => {
    const timed = r.value === 'time' && r.checked;
    if (!r.checked) return;
    qa('[data-time-only]', blockForm).forEach((el) => { el.hidden = !timed; });
    qa('input[name=kind]', blockForm).forEach((x) => x.closest('.seg__btn').classList.toggle('is-active', x.checked));
  }));
  q('#blkStart').min = today();
  blockForm.addEventListener('submit', async (e) => {
    e.preventDefault(); setErr('[data-block-error]', '');
    const timed = q('input[name=kind]:checked', blockForm).value === 'time';
    const body = { startDate: q('#blkStart').value, endDate: q('#blkEnd').value || undefined, reason: q('#blkReason').value };
    if (timed) Object.assign(body, { startTime: q('#blkFrom').value, endTime: q('#blkTo').value });
    try {
      const r = await api('blocks', { method: 'POST', body: JSON.stringify(body) });
      blockForm.reset(); qa('[data-time-only]', blockForm).forEach((el) => { el.hidden = true; });
      qa('.seg__btn', blockForm).forEach((x, i) => x.classList.toggle('is-active', i === 0));
      toast('Time blocked');
      if (r.clashes?.length) setErr('[data-block-error]', `Heads up: ${r.clashes.length} existing booking(s) fall inside this block — ${r.clashes.map((c) => `${c.name} (${fmtDate(c.date)} ${fmtTime(c.time)})`).join(', ')}. Contact them, then cancel from the Bookings tab.`);
      loadBlocks();
    } catch (err) { setErr('[data-block-error]', err.message); }
  });
  async function loadBlocks() {
    const wrap = q('[data-blocks]');
    try {
      const { blocks } = await api('blocks');
      if (!blocks.length) { wrap.innerHTML = '<p class="empty"><span class="material-symbols-outlined" aria-hidden="true">event_busy</span>No blocked time yet.</p>'; return; }
      wrap.innerHTML = `<ul class="blk-list">${blocks.map((b) => {
        const whole = b.startTime === '00:00' && b.endTime === '00:00';
        const when = whole
          ? (b.startDate === b.endDate ? fmtDate(b.startDate) : `${fmtDate(b.startDate)} – ${fmtDate(b.endDate)}`) + ' · all day'
          : `${fmtDate(b.startDate)} ${fmtTime(b.startTime)} – ${b.startDate === b.endDate ? '' : fmtDate(b.endDate) + ' '}${fmtTime(b.endTime)}`;
        return `<li><div><strong>${esc(when)}</strong>${b.reason ? `<div class="muted">${esc(b.reason)}</div>` : ''}</div>
          <button class="icon-btn" type="button" data-del="${b.id}" aria-label="Remove block: ${esc(when)}"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button></li>`;
      }).join('')}</ul>`;
    } catch (e) { wrap.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  }
  q('[data-blocks]').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    b.disabled = true;
    try { await api(`blocks/${b.dataset.del}`, { method: 'DELETE' }); toast('Block removed'); loadBlocks(); }
    catch (err) { toast(err.message); b.disabled = false; }
  });

  /* ---------- Hours & services ---------- */
  function renderSettings(s) {
    q('[data-hours]').innerHTML = DAYS.map(([k, label]) => {
      const r = s.hours[k]?.[0]; const open = Boolean(r);
      return `<div class="hours__row" data-day="${k}">
        <label class="check"><input type="checkbox" data-open ${open ? 'checked' : ''}>${label}</label>
        <label class="visually-hidden" for="o-${k}">${label} opens</label><input class="input" id="o-${k}" type="time" step="900" data-from value="${r?.[0] || '10:00'}" ${open ? '' : 'disabled'}>
        <span aria-hidden="true">–</span>
        <label class="visually-hidden" for="c-${k}">${label} closes</label><input class="input" id="c-${k}" type="time" step="900" data-to value="${r?.[1] || '18:00'}" ${open ? '' : 'disabled'}>
      </div>`;
    }).join('');
    qa('[data-open]').forEach((c) => c.addEventListener('change', () => qa('input[type=time]', c.closest('.hours__row')).forEach((i) => { i.disabled = !c.checked; })));
    q('#setSlot').value = String(s.slotMinutes); q('#setLead').value = s.leadHours; q('#setHorizon').value = s.horizonDays;
    q('[data-svcs]').replaceChildren(...s.services.map(svcRow));
  }
  function svcRow(s = { id: '', name: '', minutes: 60, price: '' }) {
    const row = document.createElement('div'); row.className = 'svc-row';
    row.innerHTML = `
      <div class="field"><label>Name</label><input class="input" data-k="name" maxlength="80" required></div>
      <div class="field"><label>Minutes</label><input class="input" data-k="minutes" type="number" min="10" max="600" step="5" required></div>
      <div class="field"><label>From $ (CAD)</label><input class="input" data-k="price" type="number" min="0" placeholder="—"></div>
      <button class="icon-btn" type="button" aria-label="Remove service"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>`;
    row.dataset.id = s.id;
    q('[data-k=name]', row).value = s.name; q('[data-k=minutes]', row).value = s.minutes; q('[data-k=price]', row).value = s.price ?? '';
    q('button', row).addEventListener('click', () => row.remove());
    return row;
  }
  q('[data-add-svc]').addEventListener('click', () => { const r = svcRow(); q('[data-svcs]').append(r); q('input', r).focus(); });
  q('[data-settings-form]').addEventListener('submit', async (e) => {
    e.preventDefault(); setErr('[data-settings-error]', '');
    const hours = {};
    qa('.hours__row').forEach((r) => { hours[r.dataset.day] = q('[data-open]', r).checked ? [[q('[data-from]', r).value, q('[data-to]', r).value]] : []; });
    const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const svcs = qa('.svc-row').map((r) => {
      const name = q('[data-k=name]', r).value.trim();
      return { id: r.dataset.id || slug(name), name, minutes: Number(q('[data-k=minutes]', r).value), price: q('[data-k=price]', r).value === '' ? null : Number(q('[data-k=price]', r).value) };
    });
    try {
      const r = await api('settings', { method: 'PUT', body: JSON.stringify({ hours, slotMinutes: +q('#setSlot').value, leadHours: +q('#setLead').value, horizonDays: +q('#setHorizon').value, services: svcs }) });
      services = r.settings.services; renderSettings(r.settings); toast('Hours & services saved');
    } catch (err) { setErr('[data-settings-error]', err.message); }
  });
  async function loadSettings() { const { settings } = await api('settings'); services = settings.services; renderSettings(settings); }

  async function loadAll() { try { await loadSettings(); } catch (e) { toast(e.message); } loadBookings(); loadBlocks(); }

  if (token) { showApp(true); loadAll(); } else { showApp(false); }
})();
