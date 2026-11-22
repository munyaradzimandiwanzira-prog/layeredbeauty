/* Layered Beauty — shared site behaviour (no dependencies). */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body = document.body;

  /* ---------- Page enter / leave veil ---------- */
  if (!reduceMotion) {
    body.classList.add('is-entering');
    requestAnimationFrame(() => requestAnimationFrame(() => body.classList.remove('is-entering')));

    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (!link || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.target && link.target !== '_self') return;
      if (link.hasAttribute('download')) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.hash) return; // in-page anchor
      event.preventDefault();
      body.classList.add('is-leaving');
      setTimeout(() => { location.href = url.href; }, 420);
    });
    // Restore when navigating back via bfcache
    window.addEventListener('pageshow', (e) => { if (e.persisted) body.classList.remove('is-leaving'); });
  }

  /* ---------- Header: solid on scroll, hide on scroll down ---------- */
  const header = document.querySelector('[data-header]');
  if (header) {
    let lastY = window.scrollY;
    let ticking = false;
    const update = () => {
      const y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 24);
      const navOpen = body.classList.contains('nav-open');
      header.classList.toggle('is-hidden', !navOpen && y > 480 && y > lastY + 4);
      if (y < lastY - 4 || y < 480) header.classList.remove('is-hidden');
      lastY = y;
      ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(update); ticking = true; } }, { passive: true });
    update();
    // Keep header visible while keyboard focus is inside it
    header.addEventListener('focusin', () => header.classList.remove('is-hidden'));
  }

  /* ---------- Mobile navigation ---------- */
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  if (toggle && nav) {
    const icon = toggle.querySelector('.material-symbols-outlined');
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      icon.textContent = open ? 'close' : 'menu';
      nav.classList.toggle('is-open', open);
      body.classList.toggle('nav-open', open);
      header?.classList.toggle('nav-is-open', open);
      if (open) nav.querySelector('a')?.focus();
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
    });
    window.matchMedia('(min-width: 881px)').addEventListener('change', (m) => { if (m.matches) setOpen(false); });
  }

  /* ---------- Scroll reveals ---------- */
  const revealables = document.querySelectorAll('.reveal, .reveal-arch');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealables.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealables.forEach((el) => io.observe(el));
  }

  /* ---------- Section tracker (intake side nav) ---------- */
  const trackLinks = document.querySelectorAll('[data-track] a[href^="#"]');
  if (trackLinks.length && 'IntersectionObserver' in window) {
    const map = new Map([...trackLinks].map((a) => [a.getAttribute('href').slice(1), a]));
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        trackLinks.forEach((a) => a.classList.remove('is-active'));
        map.get(entry.target.id)?.classList.add('is-active');
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    map.forEach((_, id) => { const el = document.getElementById(id); if (el) spy.observe(el); });
  }

  /* ---------- Footer year ---------- */
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
})();
