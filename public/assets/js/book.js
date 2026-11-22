/* Layered Beauty — client booking calendar. */
(() => {
  'use strict';
  const root = document.querySelector('[data-booking]');
  if (!root) return;
  const q = (s) => document.querySelector(s);

  const state = { services: [], service: null, month: null, days: {}, minDate: null, maxDate: null, date: null, time: null, loading: false };
  const cache = new Map();
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const fmtTime = (t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`; };
  const fmtDur = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);
  const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

  const api = async (path, opts) => {
    const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { status: res.status });
    return data;
  };

  /* ---------- Services ---------- */
  function renderServices() {
    const wrap = q('[data-services]');
    wrap.replaceChildren(...state.services.map((s) => {
      const label = document.createElement('label');
      label.className = 'service-opt';
      label.innerHTML = `<input type="radio" name="service" value="${s.id}"><span class="service-opt__body"><span class="service-opt__name"></span><span class="service-opt__meta"></span></span><span class="material-symbols-outlined service-opt__tick" aria-hidden="true">check</span>`;
      label.querySelector('.service-opt__name').textContent = s.name;
      label.querySelector('.service-opt__meta').textContent = `${fmtDur(s.minutes)}${s.price != null ? ` · from $${s.price} CAD` : ''}`;
      const input = label.querySelector('input');
      input.checked = state.service?.id === s.id;
      input.addEventListener('change', () => selectService(s.id));
      return label;
    }));
  }

  function selectService(id) {
    state.service = state.services.find((s) => s.id === id) || null;
    state.date = null; state.time = null;
    renderSummary(); renderTimes();
    loadMonth(state.month);
  }

  /* ---------- Calendar ---------- */
  async function loadMonth(ym) {
    state.month = ym;
    if (!state.service) { state.days = {}; renderCalendar(); return; }
    const key = `${state.service.id}|${ym}`;
    state.loading = true; renderCalendar();
    try {
      const data = cache.get(key) || await api(`/api/availability?service=${encodeURIComponent(state.service.id)}&month=${ym}`);
      cache.set(key, data);
      if (state.month !== ym) return; // a newer request superseded this one
      Object.assign(state, { days: data.days, minDate: data.minDate, maxDate: data.maxDate });
    } catch (e) {
      state.days = {}; showError(e.message);
    } finally {
      state.loading = false; renderCalendar();
    }
  }

  function renderCalendar() {
    const [y, m] = state.month.split('-').map(Number);
    q('[data-cal-title]').textContent = `${MONTHS[m - 1]} ${y}`;
    const grid = q('[data-cal-grid]');
    grid.setAttribute('aria-busy', String(state.loading));
    const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(Object.assign(document.createElement('span'), { className: 'cal__pad' }));
    for (let d = 1; d <= daysIn; d++) {
      const iso = `${state.month}-${String(d).padStart(2, '0')}`;
      const open = Boolean(state.days[iso]?.length);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cal__day'; b.textContent = String(d);
      b.disabled = !open || state.loading;
      b.setAttribute('aria-label', `${fmtDate(iso)}${open ? `, ${state.days[iso].length} times available` : ', unavailable'}`);
      if (open) b.classList.add('is-open');
      if (iso === state.date) { b.classList.add('is-selected'); b.setAttribute('aria-pressed', 'true'); }
      b.addEventListener('click', () => { state.date = iso; state.time = null; renderCalendar(); renderTimes(); renderSummary(); q('[data-times]').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' }); });
      cells.push(b);
    }
    grid.replaceChildren(...cells);
    const thisMonth = (state.minDate || new Date().toISOString()).slice(0, 7);
    q('[data-cal-prev]').disabled = state.month <= thisMonth;
    q('[data-cal-next]').disabled = Boolean(state.maxDate) && state.month >= state.maxDate.slice(0, 7);
  }

  /* ---------- Times ---------- */
  function renderTimes() {
    const wrap = q('[data-times]');
    if (!state.service) { wrap.innerHTML = '<p class="muted">Choose a service first.</p>'; return; }
    if (!state.date) { wrap.innerHTML = '<p class="muted">Pick a day to see open times.</p>'; return; }
    const slots = state.days[state.date] || [];
    if (!slots.length) { wrap.innerHTML = '<p class="muted">No open times on this day. Please pick another.</p>'; return; }
    wrap.replaceChildren(...slots.map((t) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'time'; b.textContent = fmtTime(t);
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(t === state.time));
      if (t === state.time) b.classList.add('is-selected');
      b.addEventListener('click', () => { state.time = t; renderTimes(); renderSummary(); });
      return b;
    }));
  }

  /* ---------- Summary + submit ---------- */
  function renderSummary() {
    q('[data-sum-service]').textContent = state.service ? `${state.service.name} (${fmtDur(state.service.minutes)})` : 'Not chosen yet';
    q('[data-sum-date]').textContent = state.date ? fmtDate(state.date) : 'Not chosen yet';
    q('[data-sum-time]').textContent = state.time ? fmtTime(state.time) : 'Not chosen yet';
  }
  function showError(msg) {
    const box = q('[data-book-error]');
    box.hidden = !msg; box.querySelector('span:last-child').textContent = msg || '';
  }

  const submit = q('[data-book-submit]');
  submit.addEventListener('click', async () => {
    showError('');
    const form = q('[data-book-form]');
    const v = (id) => q('#' + id).value.trim();
    if (!state.service) return showError('Please choose a service.');
    if (!state.date || !state.time) return showError('Please choose a day and time.');
    const missing = [...form.querySelectorAll('[required]')].find((el) => (el.type === 'checkbox' ? !el.checked : !el.value.trim()));
    if (missing) { missing.setAttribute('aria-invalid', 'true'); missing.focus(); return showError('Please complete your details and tick the confirmation box.'); }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v('bEmail'))) { q('#bEmail').focus(); return showError('Please enter a valid email address.'); }

    submit.disabled = true; submit.setAttribute('aria-busy', 'true');
    const label = submit.innerHTML; submit.textContent = 'Sending your request…';
    try {
      const res = await api('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({ service: state.service.id, date: state.date, time: state.time, name: v('bName'), email: v('bEmail'), phone: v('bPhone'), notes: v('bNotes'), website: v('bWebsite') }),
      });
      root.hidden = true;
      const done = q('[data-booked]');
      done.hidden = false;
      q('[data-booked-name]').textContent = v('bName').split(' ')[0];
      q('[data-booked-detail]').textContent = `${res.service || state.service.name} on ${fmtDate(state.date)} at ${fmtTime(state.time)}.`;
      done.focus(); done.scrollIntoView({ block: 'start' });
    } catch (e) {
      showError(e.message);
      if (e.status === 409) { cache.clear(); state.time = null; await loadMonth(state.month); renderTimes(); renderSummary(); }
    } finally {
      submit.disabled = false; submit.removeAttribute('aria-busy'); submit.innerHTML = label;
    }
  });
  q('[data-book-form]').addEventListener('input', (e) => e.target.removeAttribute('aria-invalid'));

  q('[data-cal-prev]').addEventListener('click', () => loadMonth(shiftMonth(state.month, -1)));
  q('[data-cal-next]').addEventListener('click', () => loadMonth(shiftMonth(state.month, 1)));

  /* ---------- Init ---------- */
  (async () => {
    state.month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
    renderCalendar(); renderTimes();
    try {
      const cfg = await api('/api/config');
      state.services = cfg.services;
      q('[data-tz]').textContent = '· Times shown in Toronto time';
      const wanted = new URLSearchParams(location.search).get('service');
      renderServices();
      if (wanted && state.services.some((s) => s.id === wanted)) {
        q(`input[name=service][value="${CSS.escape(wanted)}"]`).checked = true;
        selectService(wanted);
      }
    } catch (e) {
      q('[data-services]').innerHTML = '<p class="muted">Booking is temporarily unavailable. Please try again shortly.</p>';
    }
  })();
})();
