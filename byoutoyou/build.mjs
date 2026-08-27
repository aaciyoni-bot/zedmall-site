/* Vercel build step.
 *
 * The site (shell + the 5,400-hospital directory, ~2 MB of JSON) lives in git
 * and is refreshed monthly by .github/workflows/build-hospitals.yml. All this
 * step does is make sure public/ is populated before Vercel serves it:
 *
 *   1. files already on disk (a git-linked deploy)  → nothing to do
 *   2. otherwise pull them from the public repo at DATA_REF
 *   3. and if the directory data is still missing, rebuild it from CMS
 *
 * so a deployment can be triggered without shipping the whole dataset, and a
 * git-linked project keeps working unchanged.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const PUBLIC = path.join(process.cwd(), 'public');
const DATA = path.join(PUBLIC, 'data');
const REPO = process.env.DATA_REPO || 'aaciyoni-bot/zedmall-site';
const REF = process.env.DATA_REF || 'claude/byoutoyou-website-64wkpp';
const RAW = `https://raw.githubusercontent.com/${REPO}/${REF}/byoutoyou/public`;

const SHELL = ['index.html', 'assets/styles.css', 'assets/app.js', 'manifest.webmanifest', 'sw.js', 'robots.txt'];

const present = p => fs.existsSync(p) && fs.statSync(p).size > 0;

async function pull(file) {
    const res = await fetch(`${RAW}/${file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
    const text = await res.text();
    const dest = path.join(PUBLIC, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, text);
    return text;
}

async function pullShell() {
    if (present(path.join(PUBLIC, 'index.html'))) {
        console.log('Site shell already present.');
        return;
    }
    for (const file of SHELL) await pull(file);
    console.log(`Pulled the site shell from ${REPO}@${REF}.`);
}

async function pullData() {
    if (present(path.join(DATA, 'index.json')) && present(path.join(DATA, 'search.json'))) {
        const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
        console.log(`Directory already present: ${idx.total} hospitals, generated ${idx.generated}.`);
        return;
    }
    const idx = JSON.parse(await pull('data/index.json'));
    await pull('data/search.json');
    await pull('data/us-states.json');
    for (const state of idx.states) await pull(`data/states/${state.code.toLowerCase()}.json`);
    console.log(`Pulled ${idx.total} hospitals across ${idx.states.length} states and territories.`);
}

function rebuildFromCms() {
    const script = ['scripts/build-hospitals.js', '../scripts/build-hospitals.js'].find(p => fs.existsSync(p));
    if (!script) throw new Error('No local copy of build-hospitals.js to rebuild from');
    execFileSync('node', [script], { stdio: 'inherit', env: { ...process.env, HOSPITALS_OUT: DATA } });
}

try {
    await pullShell();
} catch (err) {
    console.error('Could not assemble the site shell:', err.message);
    process.exit(1);
}

try {
    await pullData();
} catch (err) {
    console.warn(`Could not pull the committed directory (${err.message}) — rebuilding from CMS.`);
    rebuildFromCms();
}

/* The app itself is hash-routed, which search engines do not crawl. These
   static per-state pages give every state a real URL with its hospitals in
   the HTML, and hand the visitor over to the app from there. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SITE = process.env.SITE_URL || 'https://byoutoyou.com';

function statePage(state, hospitals, allStates) {
    const rows = hospitals.map(h => `<tr>
      <td><a href="/#/state/${state.code}">${esc(h.name)}</a></td>
      <td>${esc(h.city)}</td>
      <td>${h.emergency ? 'Yes' : '—'}</td>
      <td>${h.rating ? '★'.repeat(h.rating) : '—'}</td>
      <td>${esc(h.type || '')}</td></tr>`).join('\n');

    const others = allStates.filter(s => s.code !== state.code)
        .map(s => `<a href="/state/${s.slug}">${esc(s.name)}</a>`).join(' · ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hospitals in ${esc(state.name)} — all ${state.count} of them | byoutoyou</title>
<meta name="description" content="Every hospital in ${esc(state.name)}: ${state.count} facilities across ${state.cities} cities, with emergency services and CMS star ratings. Request a bedside beauty or grooming visit for a patient.">
<link rel="canonical" href="${SITE}/state/${state.slug}">
<link rel="stylesheet" href="/assets/styles.css">
<script type="application/ld+json">
${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `Hospitals in ${state.name}`,
        numberOfItems: state.count,
        itemListElement: hospitals.slice(0, 100).map((h, i) => ({
            '@type': 'ListItem', position: i + 1,
            item: {
                '@type': 'Hospital', name: h.name,
                address: { '@type': 'PostalAddress', streetAddress: h.address, addressLocality: h.city, addressRegion: state.code, postalCode: h.zip, addressCountry: 'US' }
            }
        }))
    })}
</script>
</head>
<body>
<header id="site-header"><div class="container header-in">
  <a class="logo" href="/"><span class="wordmark">by<b>ou</b>to<i>you</i></span><small>bedside beauty care</small></a>
  <div class="header-actions"><a class="btn btn-primary btn-sm" href="/#/state/${state.code}">Open the directory</a></div>
</div></header>
<main class="container">
  <nav class="crumbs"><a href="/">Home</a><span>/</span><a href="/#/states">States</a><span>/</span><b>${esc(state.name)}</b></nav>
  <header class="section-head left">
    <h1>Hospitals in ${esc(state.name)}</h1>
    <p>${state.count} Medicare-certified hospitals across ${state.cities} cities — ${state.emergency} with 24/7 emergency services.
       byoutoyou sends vetted beauty and grooming professionals to patients at any of them.</p>
  </header>
  <p><a class="btn btn-primary" href="/#/state/${state.code}">Search and filter these hospitals</a></p>
  <div class="table-scroll"><table class="compare-table">
    <thead><tr><th>Hospital</th><th>City</th><th>ER</th><th>CMS rating</th><th>Type</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <section class="section">
    <h2>Other states</h2>
    <p class="cities">${others}</p>
  </section>
</main>
<footer><div class="container footer-note">
  <p>Hospital records: U.S. Centers for Medicare &amp; Medicaid Services, Hospital General Information (${esc(state.generated || '')}).
     Listing a hospital does not imply affiliation with, or endorsement by, that hospital.</p>
</div></footer>
</body>
</html>`;
}

const index = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
const outDir = path.join(PUBLIC, 'state');
fs.mkdirSync(outDir, { recursive: true });
for (const state of index.states) {
    const file = path.join(DATA, 'states', `${state.code.toLowerCase()}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(path.join(outDir, `${state.slug}.html`),
        statePage({ ...state, generated: data.generated }, data.hospitals, index.states));
}

const urls = [`${SITE}/`, ...index.states.map(s => `${SITE}/state/${s.slug}`)];
fs.writeFileSync(path.join(PUBLIC, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    + urls.map(u => `  <url><loc>${u}</loc><lastmod>${index.generated}</lastmod></url>`).join('\n')
    + `\n</urlset>\n`);

console.log(`Rendered ${index.states.length} crawlable state pages and a sitemap.`);
