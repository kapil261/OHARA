import { Router } from 'express';
import { z } from 'zod';
import { asr, translate, tts } from '../../integrations/bhashini.js';
import { parse } from '../../lib/validate.js';
import { requireAuth } from '../../middleware/auth.js';

/** Bhashini proxy (free govt API). Without keys every route returns 503 VOICE_NOT_CONFIGURED and the app uses browser speech. */
export const voiceRouter = Router();

const language = z.string().trim().min(2).max(20).default('English');

voiceRouter.post('/voice/tts', requireAuth, async (req, res) => {
  const b = parse(z.object({ text: z.string().trim().min(1).max(500), language, gender: z.enum(['female', 'male']).default('female') }), req.body);
  res.json(await tts(b.text, b.language, b.gender));
});

voiceRouter.post('/voice/asr', requireAuth, async (req, res) => {
  // ~2 MB of base64 ≈ 60s of 16 kHz mono WAV.
  const b = parse(z.object({ audioBase64: z.string().min(16).max(2_800_000), language }), req.body);
  res.json(await asr(b.audioBase64, b.language));
});

voiceRouter.post('/voice/translate', requireAuth, async (req, res) => {
  const b = parse(z.object({ text: z.string().trim().min(1).max(1000), from: z.string().min(2).max(20), to: z.string().min(2).max(20) }), req.body);
  res.json(await translate(b.text, b.from, b.to));
});
