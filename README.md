# Layered Beauty — www.layeredbeauty.com

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
wrangler.jsonc          Cloudflare config (custom domains: layeredbeauty.com, www.layeredbeauty.com)
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

The `routes` in `wrangler.jsonc` attach both `layeredbeauty.com` and `www.layeredbeauty.com` as Custom Domains;
the zone must be on the same Cloudflare account.

## Known next steps

- The intake form does **not** send submissions anywhere — clients download/print/copy a summary. Connect a secure form
  service (or a Worker + email/R2 storage) before advertising it as a submission form.
- Add a real contact method (email / Instagram) and real before-and-after photography once available.
