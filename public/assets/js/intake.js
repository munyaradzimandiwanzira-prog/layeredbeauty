/* Layered Beauty — client intake (runs entirely in the browser; nothing is uploaded). */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const form = $('intakeForm');
  if (!form) return;

  const FIELDS = [
    ['fullName', 'Client'], ['email', 'Email'], ['contactMethod', 'Contact via'], ['contactDetail', 'Phone / IG'],
    ['returnMethod', 'Return method'], ['hairType', 'Hair type'], ['laceType', 'Construction'], ['length', 'Length'],
    ['density', 'Density'], ['colored', 'Previously coloured / bleached'], ['adhesive', 'Adhesive use'],
    ['mainConcern', 'Main concern'], ['service', 'Service interest'], ['finish', 'Preferred finish'],
    ['date', 'Requested date'], ['specialWork', 'Extra work'], ['result', 'Ideal outcome'],
    ['photoLink', 'Photo folder / inspiration link'], ['additional', 'Other notes'],
  ];
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const DRAFT_KEY = 'layeredBeautyIntakeDraft_v1';

  /* Prefill service from ?service=essential|signature|restoration */
  const wanted = new URLSearchParams(location.search).get('service');
  if (wanted) {
    const opt = [...$('service').options].find((o) => o.dataset.key === wanted);
    if (opt) $('service').value = opt.value;
  }

  /* Draft autosave (text fields only, this device only) */
  const storage = (() => { try { const k = '__t'; localStorage.setItem(k, k); localStorage.removeItem(k); return localStorage; } catch { return null; } })();
  if (storage) {
    try {
      const draft = JSON.parse(storage.getItem(DRAFT_KEY) || '{}');
      FIELDS.forEach(([id]) => { if (draft[id] && !$(id).value) $(id).value = draft[id]; });
      (draft.issues || []).forEach((v) => { const el = form.querySelector(`input[name=issues][value="${CSS.escape(v)}"]`); if (el) el.checked = true; });
    } catch { /* ignore corrupt draft */ }
    let t;
    form.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const d = Object.fromEntries(FIELDS.map(([id]) => [id, $(id).value]));
        d.issues = [...form.querySelectorAll('input[name=issues]:checked')].map((x) => x.value);
        try { storage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* quota */ }
      }, 400);
    });
  }

  /* Toast */
  let toastTimer;
  const toast = (msg) => {
    const el = $('toast');
    el.querySelector('[data-toast-text]').textContent = msg;
    el.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-shown'), 3400);
  };

  /* Validation */
  const alertBox = $('formAlert');
  const showError = (msg, el) => {
    alertBox.hidden = !msg;
    alertBox.querySelector('span:last-child').textContent = msg || '';
    if (el) { el.setAttribute('aria-invalid', 'true'); el.focus({ preventScroll: false }); }
  };
  form.addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));
  form.addEventListener('change', (e) => e.target.removeAttribute?.('aria-invalid'));

  const validate = () => {
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    const invalid = [...form.querySelectorAll('[required]')].find((x) => (x.type === 'checkbox' ? !x.checked : !x.value.trim()));
    if (invalid) { showError('Please complete all required questions and consent checkboxes.', invalid); return false; }
    if (!EMAIL_RE.test($('email').value.trim())) { showError('Please enter a valid email address.', $('email')); return false; }
    if (!form.querySelector('input[name=issues]:checked')) { showError('Please select at least one current wig concern.', form.querySelector('input[name=issues]')); return false; }
    showError('');
    return true;
  };

  /* Data + summary */
  const collect = () => {
    const d = {};
    FIELDS.forEach(([id, label]) => { d[label] = $(id).value.trim(); });
    d['Current issues'] = [...form.querySelectorAll('input[name=issues]:checked')].map((x) => x.value).join(', ');
    d['Wig photo filenames'] = [...$('photos').files].map((x) => x.name).join(', ');
    d['Marketing photo consent'] = $('photoConsent').checked ? 'Yes (separate specific approval still needed)' : 'No';
    d['Quote assessment acknowledgment'] = $('acceptAssessment').checked ? 'Accepted' : 'Not accepted';
    d['Condition limitations acknowledgment'] = $('acceptLimits').checked ? 'Accepted' : 'Not accepted';
    d['Extra work approval acknowledgment'] = $('acceptExtra').checked ? 'Accepted' : 'Not accepted';
    return d;
  };
  const summary = () =>
    `LAYERED BEAUTY — WIG REVAMP INTAKE\n${new Date().toLocaleString('en-CA')}\n\n` +
    Object.entries(collect()).map(([k, v]) => `${k}: ${v || '—'}`).join('\n') +
    '\n\nNote: photo files are not included in this summary — please send them alongside it.';

  const download = (name, content, mime) => {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* Photo previews */
  let urls = [];
  $('photos').addEventListener('change', () => {
    urls.forEach(URL.revokeObjectURL); urls = [];
    const all = [...$('photos').files];
    const files = all.filter((f) => f.type.startsWith('image/')).slice(0, 5);
    $('photoStatus').textContent = `${all.length} file(s) selected${all.length > 5 ? ' — the first 5 are previewed' : ''}. Photos stay on your device.`;
    const wrap = $('photoPreview'); wrap.replaceChildren();
    files.forEach((f) => {
      const url = URL.createObjectURL(f); urls.push(url);
      const fig = document.createElement('figure');
      const img = Object.assign(document.createElement('img'), { src: url, alt: f.name, loading: 'lazy' });
      const cap = Object.assign(document.createElement('figcaption'), { textContent: f.name });
      fig.append(img, cap); wrap.append(fig);
    });
  });

  /* Actions */
  $('downloadIntake').addEventListener('click', () => {
    if (!validate()) return;
    const who = $('fullName').value.trim().replace(/[^\w-]+/g, '_') || 'client';
    download(`Layered_Beauty_Intake_${who}.txt`, summary(), 'text/plain;charset=utf-8');
    toast('Summary downloaded');
  });
  $('printIntake').addEventListener('click', () => { if (validate()) window.print(); });
  $('copyIntake').addEventListener('click', async () => {
    if (!validate()) return;
    try { await navigator.clipboard.writeText(summary()); toast('Responses copied'); }
    catch { window.prompt('Copy your responses:', summary()); }
  });
})();
