/* Vercel build step.
 *
 * The hospital directory (5,400+ records, ~2 MB of JSON) lives in git and is
 * refreshed monthly by .github/workflows/build-hospitals.yml. A deployment
 * only needs to make sure public/data is populated:
 *
 *   1. already there (a git-linked deploy)     → nothing to do
 *   2. otherwise pull the committed JSON from the public repo
 *   3. and if that fails, rebuild it from CMS directly
 *
 * so a deploy never ships an empty directory.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const DATA = path.join(process.cwd(), 'public', 'data');
const REPO = process.env.DATA_REPO || 'aaciyoni-bot/zedmall-site';
const REF = process.env.DATA_REF || 'claude/byoutoyou-website-64wkpp';
const RAW = `https://raw.githubusercontent.com/${REPO}/${REF}/byoutoyou/public/data`;

const ok = p => fs.existsSync(p) && fs.statSync(p).size > 0;

if (ok(path.join(DATA, 'index.json')) && ok(path.join(DATA, 'search.json'))) {
    const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
    console.log(`Directory already in place: ${idx.total} hospitals, generated ${idx.generated}.`);
    process.exit(0);
}

async function download(file) {
    const res = await fetch(`${RAW}/${file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
    const text = await res.text();
    const dest = path.join(DATA, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, text);
    return JSON.parse(text);
}

try {
    fs.mkdirSync(DATA, { recursive: true });
    const idx = await download('index.json');
    await download('search.json');
    await download('us-states.json');
    let done = 0;
    for (const state of idx.states) {
        await download(`states/${state.code.toLowerCase()}.json`);
        done++;
    }
    console.log(`Pulled ${idx.total} hospitals across ${done} states from ${REPO}@${REF}.`);
} catch (err) {
    console.warn(`Could not pull the committed directory (${err.message}) — rebuilding from CMS.`);
    const script = ['scripts/build-hospitals.js', '../scripts/build-hospitals.js'].find(p => fs.existsSync(p));
    if (!script) throw err;
    execFileSync('node', [script], {
        stdio: 'inherit',
        env: { ...process.env, HOSPITALS_OUT: DATA }
    });
}
