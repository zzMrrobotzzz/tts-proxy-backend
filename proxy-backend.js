// Simple backend proxy for TTS APIs (ElevenLabs, Google Cloud, Amazon Polly)
// Deployable on Render
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json({limit: '2mb'}));

// Helper: get proxy config for axios
function getProxyConfig(proxyUrl) {
  if (!proxyUrl) return {};
  const { URL } = require('url');
  const HttpsProxyAgent = require('https-proxy-agent');
  const agent = new HttpsProxyAgent(proxyUrl);
  return { httpsAgent: agent, proxy: false };
}

// Proxy endpoint for ElevenLabs
app.post('/api/elevenlabs', async (req, res) => {
  const { apiKey, text, voiceId, modelId, voiceSettings, proxy } = req.body;
  if (!apiKey || !text || !voiceId) return res.status(400).json({error: 'Missing params'});
  try {
    const axiosConfig = {
      ...getProxyConfig(proxy),
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
    };
    const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const data = {
      text,
      model_id: modelId || 'eleven_multilingual_v2',
      voice_settings: voiceSettings || undefined,
    };
    const resp = await axios.post(apiUrl, data, axiosConfig);
    res.set('Content-Type', 'audio/mpeg');
    res.send(resp.data);
  } catch (err) {
    res.status(500).json({error: err.message || 'Proxy error'});
  }
});

// Proxy endpoint for Google Cloud TTS
app.post('/api/google', async (req, res) => {
  const { apiKey, input, voice, audioConfig, proxy } = req.body;
  if (!apiKey || !input || !voice || !audioConfig) return res.status(400).json({error: 'Missing params'});
  try {
    const axiosConfig = {
      ...getProxyConfig(proxy),
      headers: { 'Content-Type': 'application/json' },
    };
    const apiUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
    const data = { input, voice, audioConfig };
    const resp = await axios.post(apiUrl, data, axiosConfig);
    res.json(resp.data);
  } catch (err) {
    res.status(500).json({error: err.message || 'Proxy error'});
  }
});

// Proxy endpoint for Amazon Polly
app.post('/api/amazon', async (req, res) => {
  const { accessKeyId, secretAccessKey, region, text, voiceId, proxy } = req.body;
  if (!accessKeyId || !secretAccessKey || !region || !text || !voiceId) return res.status(400).json({error: 'Missing params'});
  try {
    // Use AWS SDK v3 for Polly
    const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
    const client = new PollyClient({ region, credentials: { accessKeyId, secretAccessKey } });
    const command = new SynthesizeSpeechCommand({
      OutputFormat: 'mp3',
      Text: text,
      VoiceId: voiceId,
    });
    const data = await client.send(command);
    res.set('Content-Type', 'audio/mpeg');
    data.AudioStream.pipe(res);
  } catch (err) {
    res.status(500).json({error: err.message || 'Proxy error'});
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log('Proxy backend listening on port', PORT);
}); 