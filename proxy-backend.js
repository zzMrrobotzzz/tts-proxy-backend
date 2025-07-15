const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

app.post('/api/generate', async (req, res) => {
    const { apiKey, text, voiceId, model_id, voice_settings, proxies } = req.body;

    if (!apiKey || !text || !voiceId || !proxies || !Array.isArray(proxies) || proxies.length === 0) {
        return res.status(400).json({ message: 'Thiếu thông tin cần thiết: apiKey, text, voiceId, và danh sách proxies.' });
    }

    try {
        // Chọn ngẫu nhiên một proxy từ danh sách
        const randomProxy = proxies[Math.floor(Math.random() * proxies.length)];
        console.log(`Sử dụng proxy: ${randomProxy}`);
        const agent = new HttpsProxyAgent(randomProxy);

        const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
        const elevenLabsBody = {
            text,
            model_id: model_id || 'eleven_multilingual_v2',
            voice_settings: voice_settings || {
                stability: 0.75,
                similarity_boost: 0.75,
            },
        };

        const elevenLabsResponse = await fetch(elevenLabsUrl, {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg',
            },
            body: JSON.stringify(elevenLabsBody),
            agent: agent, // Sử dụng proxy agent
        });

        // Chuyển tiếp header từ ElevenLabs về client
        res.setHeader('Content-Type', elevenLabsResponse.headers.get('content-type'));
        res.setHeader('Content-Length', elevenLabsResponse.headers.get('content-length'));
        res.setHeader('Request-Id', elevenLabsResponse.headers.get('request-id'));

        if (!elevenLabsResponse.ok) {
             const errorData = await elevenLabsResponse.json().catch(() => ({ message: 'Lỗi không xác định từ ElevenLabs' }));
             console.error(`Lỗi từ ElevenLabs: ${elevenLabsResponse.status}`, errorData);
             return res.status(elevenLabsResponse.status).json(errorData);
        }

        // Stream audio trực tiếp về client
        elevenLabsResponse.body.pipe(res);

    } catch (error) {
        console.error('Lỗi proxy hoặc kết nối:', error);
        res.status(502).json({ message: 'Lỗi khi kết nối qua proxy.', error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Máy chủ proxy đang chạy tại cổng ${PORT}`);
});
