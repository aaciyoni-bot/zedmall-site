const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors({ origin: '*' }));

// Set RAPIDAPI_KEY in Vercel: Project Settings -> Environment Variables.
// Never commit the key to the repository.
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_HOST = process.env.RAPIDAPI_HOST || 'aliexpress-datahub.p.rapidapi.com';

app.get('/api/health', (req, res) => {
    res.json({ ok: true, keyConfigured: Boolean(RAPIDAPI_KEY), apiHost: API_HOST });
});

// Flattens an Aliexpress DataHub search result into the simple shape the
// storefront expects: { products: [{ id, title, price, image, orders, rating }] }
function mapDataHubResponse(data) {
    const list = data && data.result && data.result.resultList;
    if (!Array.isArray(list)) return null;
    const products = list.map(entry => {
        const it = entry.item || {};
        const sku = (it.sku && it.sku.def) || {};
        return {
            id: String(it.itemId || ''),
            title: it.title || '',
            price: sku.promotionPrice || sku.price || 0,
            original_price: sku.price || 0,
            image: it.image || '',
            orders: parseInt(it.sales) || 0,
            rating: parseFloat(it.averageStarRate) || 0
        };
    }).filter(p => p.id && p.title);
    return { products };
}

app.get('/api/products', async (req, res) => {
    const query = req.query.q || 'best sellers';

    if (!RAPIDAPI_KEY) {
        return res.status(500).json({ error: 'RAPIDAPI_KEY environment variable is not set' });
    }

    const isDataHub = API_HOST.includes('datahub');
    const url = isDataHub
        ? `https://${API_HOST}/item_search_2`
        : `https://${API_HOST}/search`;
    const params = isDataHub
        ? { q: query, page: '1' }
        : { SearchText: query };

    try {
        const response = await axios.get(url, {
            headers: {
                'x-rapidapi-host': API_HOST,
                'x-rapidapi-key': RAPIDAPI_KEY
            },
            params,
            timeout: 25000
        });

        const mapped = mapDataHubResponse(response.data);
        res.json(mapped || response.data);
    } catch (error) {
        res.status(502).json({
            error: 'UPSTREAM_ERROR',
            message: error.message,
            response: error.response ? error.response.data : null
        });
    }
});

module.exports = app;
