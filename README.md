# Layered Beauty — www.layeredbeautystudio.com

Marketing site and client intake for **Layered Beauty**, wig revamp & restoration.
Static HTML/CSS/JS (no build step), served by **Cloudflare Workers static assets**.

## Structure

```
public/
  index.html            Home: hero, approach, service menu, add-ons, process, expectations, photo guide, FAQ
  intake.html           Client intake form (served at /intake) — runs fully in the browser
  404.html              Not-found page
  assets/css/site.css   Design tokens + all styles
  assets/js/site.js     Header, mobile nav, scroll reveals, page transitions
  assets/js/intake.js   Intake validation, draft autosave, photo previews, download / print / copy
  _headers              Security headers + CSP + asset caching
wrangler.jsonc          Cloudflare config (custom domains: layeredbeautystudio.com, www.layeredbeautystudio.com)
```

## Design system

| Token | Hex | Use |
|---|---|---|
| Espresso | `#1c1411` | Primary dark surfaces |
| Mocha | `#2a1f1a` | Secondary dark surfaces |
| Walnut | `#5b3f2c` | Accents on light surfaces |
| Soft gold | `#c9a46a` / `#e0c597` | CTAs, highlights, LED-glow details |
| Cream / Paper | `#f3ead9` / `#fbf7ef` | Light sections |
| Olive / Olive deep | `#55613f` / `#3c4630` | Wellness accents |
| Sage | `#b4bda3` | Tags, secondary accents |

- **Type:** Cormorant Garamond (display) + Source Sans 3 (body/UI).
- **Icons:** Google Material Symbols Outlined only, axes locked to `FILL 0, wght 100, GRAD 0, opsz 24`. The font is subset via `icon_names=` — add any new icon name (alphabetically) to the URL in each page `<head>`.
- **Signature details:** walnut slat-wall texture, arched LED mirror, olive branch, gold rule that draws in on hover.
- **Motion:** slow fade-up reveals, arch clip-path reveal, page veil transition — all disabled under `prefers-reduced-motion`.

## Editing prices

Prices live in `public/index.html` (service menu + add-ons), `public/intake.html` (service dropdown) and the JSON-LD block in `index.html`. Keep them in sync.

## Develop & deploy

```bash
npm install
npm run dev       # http://localhost:8787
npm run deploy    # wrangler deploy (needs `wrangler login` or CLOUDFLARE_API_TOKEN)
```

The `routes` in `wrangler.jsonc` attach both `layeredbeautystudio.com` and `www.layeredbeautystudio.com` as Custom Domains;
the zone must be on the same Cloudflare account.

## Booking system

- Clients book at **/book**: choose a service, an open day (calendar) and a time. Requests are saved as *pending* and the slot is held immediately; double-booking is prevented atomically in D1.
- The studio manages everything at **/admin** (sign in with the `ADMIN_TOKEN` secret):
  - **Bookings** — confirm, cancel (frees the slot) or restore.
  - **Block time** — block whole days / date ranges or a time range; blocked time vanishes from the client calendar instantly and any clashing bookings are flagged.
  - **Hours & services** — weekly opening hours, slot interval, minimum notice, how far ahead clients can book, and the bookable services (name, duration, from-price).
- All times are America/Toronto.

### First-time setup

```bash
npx wrangler d1 create layered-beauty            # copy the database_id into wrangler.jsonc
npx wrangler d1 migrations apply layered-beauty --remote
npx wrangler secret put ADMIN_TOKEN              # long random string = your admin sign-in key
npm run deploy
```

Local: put `ADMIN_TOKEN=...` in `.dev.vars`, run `npx wrangler d1 migrations apply layered-beauty --local`, then `npm run dev`.

## Known next steps

- The intake form does **not** send submissions anywhere — clients download/print/copy a summary. Connect a secure form
  service (or a Worker + email/R2 storage) before advertising it as a submission form.
- Booking emails are not sent yet — check /admin for new requests, or connect an email provider (e.g. Resend/Postmark) in `src/worker.js`.
- Add a real contact method (email / Instagram) and real before-and-after photography once available.
