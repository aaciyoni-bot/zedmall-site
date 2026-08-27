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
