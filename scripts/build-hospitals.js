#!/usr/bin/env node
/*
 * Builds the byoutoyou hospital directory data from the public CMS
 * "Hospital General Information" dataset (every Medicare-certified hospital
 * in the United States, ~5,400 facilities).
 *
 * Output:
 *   byoutoyou/data/index.json        — one entry per state/territory + counts
 *   byoutoyou/data/states/<code>.json — the hospitals of that state
 *
 * Run from a machine with open internet (GitHub Actions does this on a
 * schedule); the site itself only ever reads the committed JSON.
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'byoutoyou', 'data');
const STATES_DIR = path.join(OUT_DIR, 'states');
const MIN_EXPECTED = 4000; // fail loudly rather than publish a half dataset

const STATE_NAMES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
    FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
    IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
    ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
    MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
    NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
    OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
    RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
    TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
    WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
    PR: 'Puerto Rico', VI: 'U.S. Virgin Islands', GU: 'Guam',
    AS: 'American Samoa', MP: 'Northern Mariana Islands'
};

const TERRITORIES = new Set(['PR', 'VI', 'GU', 'AS', 'MP']);

/* Optional: ZIP centroids power the "hospitals near me" sort. The site still
   works without them, so a missing package must not fail the build. */
let zipcodes = null;
try {
    zipcodes = require('zipcodes');
} catch {
    console.warn('zipcodes package not installed — hospitals will ship without coordinates.');
}

function coordsForZip(zip) {
    if (!zipcodes || !zip) return null;
    const rec = zipcodes.lookup(zip.slice(0, 5));
    if (!rec || !Number.isFinite(rec.latitude) || !Number.isFinite(rec.longitude)) return null;
    return [Number(rec.latitude.toFixed(3)), Number(rec.longitude.toFixed(3))];
}

async function getJSON(url) {
    const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'byoutoyou-directory/1.0' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
}

/* The provider-data API addresses a dataset by its distribution UUID, and that
   UUID changes with every quarterly refresh — so look it up by title. */
async function findDistributionId() {
    const items = await getJSON(
        'https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items?show-reference-ids=true'
    );
    const match = items.find(it => (it.title || '').trim().toLowerCase() === 'hospital general information');
    if (!match) throw new Error('Dataset "Hospital General Information" not found in the CMS metastore');
    const dist = (match.distribution || [])[0];
    const id = typeof dist === 'string' ? dist : dist && (dist.identifier || dist.data?.identifier);
    if (!id) throw new Error('No distribution id on the Hospital General Information dataset');
    return id;
}

async function fetchAllRows(distributionId) {
    const rows = [];
    const limit = 500;
    for (let offset = 0; ; offset += limit) {
        const url = `https://data.cms.gov/provider-data/api/1/datastore/query/${distributionId}/0`
            + `?limit=${limit}&offset=${offset}`;
        const page = await getJSON(url);
        const results = page.results || [];
        rows.push(...results);
        process.stdout.write(`\rfetched ${rows.length} rows`);
        if (results.length < limit) break;
        if (rows.length > 20000) break; // guard against a paging loop
    }
    process.stdout.write('\n');
    return rows;
}

/* Column names drift between refreshes (city vs citytown, phone_number vs
   telephone_number, ...), so match on a normalised key. */
function normalise(row) {
    const flat = {};
    for (const [k, v] of Object.entries(row)) flat[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = v;
    const pick = (...keys) => {
        for (const k of keys) {
            const v = flat[k];
            if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
        }
        return '';
    };
    return {
        id: pick('facilityid', 'providerid', 'provider_id'),
        name: pick('facilityname', 'hospitalname', 'providername'),
        address: pick('address', 'addressline1'),
        city: pick('citytown', 'city'),
        state: pick('state').toUpperCase(),
        zip: pick('zipcode', 'zip'),
        county: pick('countyparish', 'countyname', 'county'),
        phone: pick('telephonenumber', 'phonenumber'),
        type: pick('hospitaltype'),
        ownership: pick('hospitalownership'),
        emergency: /^y/i.test(pick('emergencyservices')),
        rating: pick('hospitaloverallrating')
    };
}

function titleCase(s) {
    return s.replace(/\w[\w'’-]*/g, w => {
        const lower = w.toLowerCase();
        if (['of', 'the', 'and', 'at', 'for', 'in', 'on'].includes(lower)) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
    }).replace(/\b(Llc|Lp|Inc)\b/g, m => m.toUpperCase());
}

function clean(h) {
    const name = titleCase(h.name)
        .replace(/^\s+|\s+$/g, '')
        .replace(/\bDba\b/gi, 'dba')
        .replace(/\bSt\b\.?/g, 'St.')
        .replace(/\bUniversity of\b/gi, 'University of');
    const rating = /^[1-5]$/.test(h.rating) ? Number(h.rating) : null;
    const loc = coordsForZip(h.zip);
    return {
        id: h.id,
        name,
        state: h.state,
        address: titleCase(h.address),
        city: titleCase(h.city),
        zip: h.zip,
        county: h.county ? titleCase(h.county) : '',
        phone: h.phone.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1'),
        type: h.type,
        ownership: h.ownership,
        emergency: h.emergency,
        rating,
        ...(loc ? { lat: loc[0], lon: loc[1] } : {})
    };
}

function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
    const distributionId = await findDistributionId();
    console.log('CMS distribution:', distributionId);

    const raw = await fetchAllRows(distributionId);
    const hospitals = raw
        .map(normalise)
        .filter(h => h.name && h.state && STATE_NAMES[h.state])
        .map(clean);

    // One row per facility id (a few facilities appear twice across refreshes).
    const byId = new Map();
    for (const h of hospitals) byId.set(h.id || `${h.name}|${h.city}|${h.zip}`, h);
    const unique = [...byId.values()];

    if (unique.length < MIN_EXPECTED) {
        throw new Error(`Only ${unique.length} hospitals parsed — expected at least ${MIN_EXPECTED}. Refusing to write a partial dataset.`);
    }

    const byState = new Map();
    for (const h of unique) {
        if (!byState.has(h.state)) byState.set(h.state, []);
        byState.get(h.state).push(h);
    }

    fs.rmSync(STATES_DIR, { recursive: true, force: true });
    fs.mkdirSync(STATES_DIR, { recursive: true });

    const generated = new Date().toISOString().slice(0, 10);
    const states = [];

    for (const [code, list] of [...byState.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        list.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
        const name = STATE_NAMES[code];
        const cityCounts = new Map();
        for (const h of list) cityCounts.set(h.city, (cityCounts.get(h.city) || 0) + 1);
        const topCities = [...cityCounts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 6)
            .map(([city, n]) => ({ city, n }));
        const rated = list.filter(h => h.rating);
        states.push({
            code,
            name,
            slug: slugify(name),
            count: list.length,
            cities: cityCounts.size,
            emergency: list.filter(h => h.emergency).length,
            topRated: rated.filter(h => h.rating >= 4).length,
            topCities,
            territory: TERRITORIES.has(code)
        });
        fs.writeFileSync(
            path.join(STATES_DIR, `${code.toLowerCase()}.json`),
            JSON.stringify({ code, name, generated, count: list.length, hospitals: list })
        );
    }

    states.sort((a, b) => a.name.localeCompare(b.name));

    /* Compact global index for the ⌘K search: tuples keep it a third of the
       size of objects, which matters when it is fetched on first keystroke. */
    const search = unique
        .map(h => [h.id, h.name, h.city, h.state, h.rating || 0, h.emergency ? 1 : 0, h.lat ?? null, h.lon ?? null])
        .sort((a, b) => a[1].localeCompare(b[1]));
    fs.writeFileSync(path.join(OUT_DIR, 'search.json'), JSON.stringify({
        generated,
        fields: ['id', 'name', 'city', 'state', 'rating', 'emergency', 'lat', 'lon'],
        rows: search
    }));

    fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify({
        generated,
        source: 'Centers for Medicare & Medicaid Services — Hospital General Information',
        sourceUrl: 'https://data.cms.gov/provider-data/dataset/xubh-q36u',
        total: unique.length,
        stateCount: states.filter(s => !s.territory).length,
        states
    }, null, 1));

    console.log(`Wrote ${unique.length} hospitals across ${states.length} states and territories.`);
}

main().catch(err => {
    console.error('build-hospitals failed:', err.message);
    process.exit(1);
});
