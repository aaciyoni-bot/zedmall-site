const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors({ origin: '*' }));

// Set RAPIDAPI_KEY in Vercel: Project Settings -> Environment Variables.
// Never commit the key to the repository.
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_HOST = process.env.RAPIDAPI_HOST || 'aliexpress-api2.p.rapidapi.com';

app.get('/api/health', (req, res) => {
    res.json({ ok: true, keyConfigured: Boolean(RAPIDAPI_KEY) });
});

app.get('/api/products', async (req, res) => {
    const query = req.query.q || 'best sellers';

    if (!RAPIDAPI_KEY) {
        return res.status(500).json({ error: 'RAPIDAPI_KEY environment variable is not set' });
    }

    try {
        const response = await axios.get(`https://${API_HOST}/search`, {
            headers: {
                'x-rapidapi-host': API_HOST,
                'x-rapidapi-key': RAPIDAPI_KEY
            },
            params: { SearchText: query },
            timeout: 20000
        });
        res.json(response.data);
    } catch (error) {
        res.status(502).json({
            error: 'UPSTREAM_ERROR',
            message: error.message,
            response: error.response ? error.response.data : null
        });
    }
});

module.exports = app;
