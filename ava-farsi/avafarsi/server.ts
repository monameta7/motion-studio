import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { Mp3Encoder } from '@breezystack/lamejs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Middleware
app.use(express.json({ limit: '15mb' }));

// Initialize Google GenAI client
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: apiKey || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Persian tone mapping for speech synthesis
const TONE_STYLE_MAP: Record<string, string> = {
  formal:
    'Fluent, articulate, and clear Persian (Farsi) newsreader. Formal diction, precise Persian pronunciation, and professional cadence.',
  narrative:
    'Warm, expressive, and captivating Persian (Farsi) audiobook narrator. Natural emotional cadence, gentle pauses, and engaging storytelling.',
  friendly:
    'Conversational, warm, natural and friendly Persian (Farsi) speaker. Soft, inviting tone with relaxed rhythm.',
  meditative:
    'Calm, soothing, slow-paced, and meditative Persian (Farsi) speaker. Peaceful breathing room and serene voice.',
  energetic:
    'Dynamic, enthusiastic, bright, and confident Persian (Farsi) speaker with positive energy and crisp rhythm.',
};

const VALID_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'] as const;
type VoiceName = typeof VALID_VOICES[number];

// Helper to convert WAV buffer to MP3
function encodeWavBufferToMp3(wavBuffer: Buffer, kbps = 128): Buffer {
  let channels = 1;
  let sampleRate = 24000;
  let pcmOffset = 44;

  if (wavBuffer.length > 44 && wavBuffer.toString('ascii', 0, 4) === 'RIFF') {
    channels = wavBuffer.readUInt16LE(22) || 1;
    sampleRate = wavBuffer.readUInt32LE(24) || 24000;
    for (let i = 12; i < wavBuffer.length - 8; i++) {
      if (wavBuffer.toString('ascii', i, i + 4) === 'data') {
        pcmOffset = i + 8;
        break;
      }
    }
  }

  const pcmBytesLength = wavBuffer.length - pcmOffset;
  const sampleCount = Math.floor(pcmBytesLength / 2);
  const samples = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = wavBuffer.readInt16LE(pcmOffset + i * 2);
  }

  const encoder = new Mp3Encoder(channels, sampleRate, kbps);
  const mp3Chunks: Buffer[] = [];
  const blockSize = 1152;
  for (let i = 0; i < samples.length; i += blockSize) {
    const chunk = samples.subarray(i, i + blockSize);
    const buf = encoder.encodeBuffer(chunk);
    if (buf.length > 0) mp3Chunks.push(Buffer.from(buf));
  }
  const flushBuf = encoder.flush();
  if (flushBuf.length > 0) mp3Chunks.push(Buffer.from(flushBuf));
  return Buffer.concat(mp3Chunks);
}

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(apiKey),
    supportedVoices: VALID_VOICES,
  });
});

// Persian Text-to-Speech endpoint
app.post('/api/tts', async (req: Request, res: Response) => {
  try {
    const { text, voice = 'Kore', tone = 'formal' } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'لطفاً متن مورد نظر برای تبدیل به گفتار را وارد کنید.' });
    }

    if (text.length > 3000) {
      return res.status(400).json({ error: 'حداکثر طول مجاز متن ۳۰۰۰ کاراکتر است.' });
    }

    if (!apiKey) {
      return res.status(500).json({
        error: 'کلید وب‌سرویس هوش مصنوعی (GEMINI_API_KEY) در سرور تنظیم نشده است.',
      });
    }

    const selectedVoice: VoiceName = VALID_VOICES.includes(voice) ? voice : 'Kore';
    const baseToneInstruction = TONE_STYLE_MAP[tone] || TONE_STYLE_MAP.formal;

    // Combine tone instruction with explicit Persian pronunciation guidance
    const styleInstruction = `${baseToneInstruction} Pronounce the following Persian (Farsi) text accurately, respecting all Persian vowels, grammatical markers, and natural sentence intonation.`;

    // Call Gemini 3.8 Flash Lite TTS
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text.trim(),
              speechMetadata: {
                style: styleInstruction,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: selectedVoice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      console.error('Gemini TTS response missing audio data:', JSON.stringify(response));
      return res.status(502).json({
        error: 'متأسفانه صدایی از سمت مدل هوش مصنوعی دریافت نشد. لطفاً دوباره تلاش فرمایید.',
      });
    }

    return res.json({
      audioBase64: base64Audio,
      mimeType: 'audio/wav',
      voice: selectedVoice,
      tone,
    });
  } catch (error: any) {
    console.error('Error generating Persian TTS:', error);
    const errorMessage = error?.message || 'خطایی در پردازش گفتار رخ داد.';
    return res.status(500).json({
      error: `خطا در برقراری ارتباط با سرویس صوتی: ${errorMessage}`,
    });
  }
});

// Direct file download endpoint supporting both MP3 and WAV
app.post('/api/download-audio', (req: Request, res: Response) => {
  try {
    const { audioBase64, filename = 'AvaFarsi_speech', format = 'mp3' } = req.body;
    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).send('اطلاعات صوتی نامعتبر است.');
    }
    const wavBuffer = Buffer.from(audioBase64, 'base64');
    const baseName = filename.replace(/\.(wav|mp3)$/i, '');

    if (format === 'wav') {
      const safeFilename = `${baseName}.wav`;
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Content-Length', wavBuffer.length.toString());
      return res.send(wavBuffer);
    } else {
      // Default to MP3
      const mp3Buffer = encodeWavBufferToMp3(wavBuffer, 128);
      const safeFilename = `${baseName}.mp3`;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Content-Length', mp3Buffer.length.toString());
      return res.send(mp3Buffer);
    }
  } catch (err: any) {
    console.error('Download error:', err);
    return res.status(500).send('خطا در دانلود فایل صوتی');
  }
});

// Development or Production routing
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(__dirname, 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

  if (!isProd || !hasDist) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AvaFarsi server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
