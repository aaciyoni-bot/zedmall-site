#!/usr/bin/env node
/*
 * Builds catalog.json by querying the live ZedMall backend a handful of
 * times (home + each category + the budget list). Committed by a scheduled
 * GitHub Action a couple of times a day, so the storefront renders home,
 * categories and the budget strip with ZERO per-visitor API calls — which
 * keeps browsing fast and preserves the RapidAPI quota for real searches.
 *
 * No secrets needed: it calls the public backend, which holds the key.
 */

const fs = require('fs');
const path = require('path');

const BACKEND = (process.env.BACKEND_URL || 'https://zedmall-site.vercel.app').replace(/\/$/, '');
const OUT = path.join(__dirname, '..', 'catalog.json');

// Must match the category chips + budget query in index.html
const HOME_QUERY = 'best sellers';
const CATEGORIES = [
    'phone accessories',
    'women fashion dress',
    'home kitchen gadgets',
    'men watches',
    'kids toys',
    'hair wigs beauty',
    'solar lights electronics',
    'football jersey sports'
];
const UNDER100_QUERY = 'jewelry accessories stickers gadgets';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function extractList(data) {
    if (Array.isArray(data)) return data;
    const c = [data.products, data.items, data.data, data.result,
        data.result && data.result.resultList].filter(Boolean);
    for (const x of c) if (Array.isArray(x) && x.length) return x;
    return [];
}

async function fetchProducts(query, extra) {
    const url = `${BACKEND}/api/products?q=${encodeURIComponent(query)}${extra || ''}`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) { console.warn(`  ! ${query}: HTTP ${res.status}`); return []; }
        const list = extractList(await res.json());
        console.log(`  ✓ ${query}: ${list.length} products`);
        return list.slice(0, 40);
    } catch (e) {
        console.warn(`  ! ${query}: ${e.message}`);
        return [];
    }
}

(async () => {
    console.log('Building catalog from', BACKEND);

    const home = await fetchProducts(HOME_QUERY);
    await sleep(1200);

    const categories = {};
    for (const cat of CATEGORIES) {
        categories[cat] = await fetchProducts(cat);
        await sleep(1200);
    }

    const under100 = await fetchProducts(UNDER100_QUERY, '&sort=priceAsc');

    const totalCat = Object.values(categories).reduce((n, a) => n + a.length, 0);
    if (!home.length && !totalCat && !under100.length) {
        console.error('No products fetched (API quota or backend down). Keeping the existing catalog.json.');
        process.exit(0); // don't overwrite a good catalog with an empty one
    }

    const catalog = { generatedAt: new Date().toISOString(), home, categories, under100 };
    fs.writeFileSync(OUT, JSON.stringify(catalog, null, 1));
    console.log(`Wrote catalog.json — home ${home.length}, categories ${totalCat}, under100 ${under100.length}`);
})();
