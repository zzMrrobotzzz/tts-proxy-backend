const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for larger requests if needed

const PORT = process.env.PORT || 3001;
const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

// Helper function to handle all proxied requests to ElevenLabs
const proxyRequest = async (req, res, targetPath, method = 'GET', body = null) => {
    const { apiKey, proxies } = req.body;

    if (!apiKey) {
        return res.status(400).json({ message: 'Thiếu API key.' });
    }
    if (!proxies || !Array.isArray(proxies) || proxies.length === 0) {
        return res.status(400).json({ message: 'Thiếu danh sách proxies.' });
    }

    try {
        const randomProxy = proxies[Math.floor(Math.random() * proxies.length)];
        console.log(`[${new Date().toISOString()}] Routing ${method} ${targetPath} via proxy: ${randomProxy.split('@')[1] || randomProxy}`);
        const agent = new HttpsProxyAgent(randomProxy);

        const targetUrl = `${ELEVENLABS_API_BASE}${targetPath}`;
        
        const options = {
            method,
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json', // Default accept
            },
            agent,
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        if (targetPath.startsWith('/text-to-speech')) {
            options.headers.Accept = 'audio/mpeg';
        }

        const elevenLabsResponse = await fetch(targetUrl, options);
        
        // Forward headers from ElevenLabs to the client
        for (const [key, value] of elevenLabsResponse.headers.entries()) {
            if (['content-type', 'content-length', 'request-id', 'retry-after'].includes(key.toLowerCase())) {
                 res.setHeader(key, value);
            }
        }

        res.status(elevenLabsResponse.status);

        // Stream audio directly to the client for speech generation
        if (elevenLabsResponse.ok && options.headers.Accept === 'audio/mpeg') {
            elevenLabsResponse.body.pipe(res);
        } else {
            // For JSON responses, parse and forward
            const responseData = await elevenLabsResponse.json();
            res.json(responseData);
        }

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Proxy or connection error for ${targetPath}:`, error);
        res.status(502).json({ message: 'Lỗi khi kết nối qua proxy.', error: error.message });
    }
};

// Endpoint for generating speech
app.post('/api/generate', (req, res) => {
    const { voiceId, text, model_id, voice_settings } = req.body;
    if (!voiceId) return res.status(400).json({ message: 'Thiếu voiceId.' });

    const targetPath = `/text-to-speech/${voiceId}`;
    const elevenLabsBody = {
        text,
        model_id,
        voice_settings,
    };
    proxyRequest(req, res, targetPath, 'POST', elevenLabsBody);
});

// Endpoint for fetching voices
app.post('/api/voices', (req, res) => {
    proxyRequest(req, res, '/voices', 'GET');
});

// Endpoint for checking user balance
app.post('/api/user/balance', (req, res) => {
    proxyRequest(req, res, '/user', 'GET');
});


app.listen(PORT, () => {
    console.log(`Máy chủ proxy đang chạy tại cổng ${PORT}`);
});
