# byoutoyou — bedside beauty care

**https://byoutoyou.com** — vetted beauty and grooming professionals who visit
patients in the hospital room, anywhere in the United States. The centre of the
site is a directory of every Medicare-certified hospital in the country,
browsable state by state.

## Layout

```
byoutoyou/
├── build.mjs                  ← Vercel build: assembles public/, renders state pages + sitemap
├── package.json
├── vercel.json                ← cleanUrls + cache headers for /data and /assets
└── public/                    ← what Vercel serves
    ├── index.html             ← the app shell (hash-routed SPA)
    ├── assets/styles.css
    ├── assets/app.js
    ├── manifest.webmanifest, sw.js, robots.txt
    ├── data/
    │   ├── index.json         ← one entry per state: counts, top cities, ER and rating tallies
    │   ├── search.json        ← compact tuples for ⌘K search and "near me"
    │   ├── states/<code>.json ← the hospitals of one state
    │   └── us-states.json     ← projected SVG paths for the map
    ├── state/<name>.html      ← generated at build time, not committed
    └── sitemap.xml            ← generated at build time, not committed
```

## The hospital data

`scripts/build-hospitals.js` (repo root) builds `public/data` from the public CMS
**Hospital General Information** dataset — 5,400+ facilities with address, phone,
type, ownership, emergency services and the CMS overall star rating. ZIP centroids
from the `zipcodes` package add coordinates, which is what "hospitals near me"
sorts on, so distances are approximate to the ZIP, not the front door.

`.github/workflows/build-hospitals.yml` reruns it monthly (CMS refreshes
quarterly) and commits the result. Run it by hand from the Actions tab, or
locally with `node scripts/build-hospitals.js`.

## Deploying

The Vercel project `byoutoyou` holds the domain. Its build step populates
`public/` when the files are not already on disk: it pulls the shell and the
directory from this repo at `DATA_REF`, and if that fails it rebuilds the data
straight from CMS. That is what lets a deployment be triggered without shipping
two megabytes of JSON.

**Worth doing once:** connect the Vercel project to this GitHub repository (root
directory `byoutoyou`). Then every push deploys, the build finds the files
already on disk and skips the download entirely, and the monthly data refresh
reaches the live site on its own. Until then, a data refresh only appears after
the next deployment.

Environment variables the build understands: `DATA_REPO`, `DATA_REF`,
`SITE_URL`, `HOSPITALS_OUT`.

## What the site does

- **Map** — clickable US choropleth shaded by hospital count, with territories listed beside it.
- **⌘K search** — every hospital in the country by name, city or ZIP, keyboard-navigable.
- **Near me** — geolocation ranks the closest hospitals; also a sort option inside a state.
- **State pages** — search, filter by city, type, ownership, ER and 4★+, sort four ways, paginated.
- **Hospital drawer** — full CMS record, phone, directions, and the request flow.
- **Compare** — up to three hospitals side by side.
- **Saved + requests** — kept in `localStorage`; nothing is uploaded.
- **Booking** — a three-step request that ends in a prefilled email; no backend, no accounts.
- **Crawlable state pages** — `/state/<name>` renders the hospital table as HTML with ItemList
  structured data, since search engines do not follow the app's hash routes.
- **PWA** — the shell is cached, and a state you have opened still works offline.

## Boundaries worth keeping

The site says plainly, in the footer and in every hospital drawer, that hospital
records come from CMS and that listing a hospital implies no affiliation with it.
byoutoyou performs personal care only — no clinical care, no advice — and every
visit depends on the unit's approval. Keep that language if the copy changes.
