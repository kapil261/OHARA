import { env, features } from '../config/env.js';
import { AppError, unavailable } from '../utils/errors.js';

/**
 * Bhashini (ULCA) pipeline proxy for TTS / ASR / translation in Indian languages.
 * NOTE: request/response shapes follow the public ULCA docs but have NOT been tested
 * against live credentials yet. Treat as experimental.
 */
const CONFIG_URL = 'https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline';

export const LANG_CODES: Record<string, string> = {
  English: 'en', Hindi: 'hi', Assamese: 'as', Bengali: 'bn', Tamil: 'ta', Telugu: 'te',
  Kannada: 'kn', Malayalam: 'ml', Marathi: 'mr', Gujarati: 'gu', Odia: 'or', Punjabi: 'pa',
};
export const langCode = (language: string) => LANG_CODES[language] ?? (language.length <= 3 ? language : 'en');

type TaskType = 'tts' | 'asr' | 'translation';

interface Endpoint { url: string; authName: string; authValue: string; serviceId: string }
const cache = new Map<string, { at: number; ep: Endpoint }>();

async function resolve(task: TaskType, source: string, target?: string): Promise<Endpoint> {
  if (!features.bhashini) throw unavailable('VOICE_NOT_CONFIGURED', 'Indian-language voice is not set up on this server (Bhashini keys missing)');
  const key = `${task}:${source}:${target ?? ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.ep;

  const config = { language: { sourceLanguage: source, ...(target ? { targetLanguage: target } : {}) } };
  const res = await fetch(CONFIG_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', userID: env.BHASHINI_USER_ID!, ulcaApiKey: env.BHASHINI_API_KEY! },
    body: JSON.stringify({ pipelineTasks: [{ taskType: task, config }], pipelineRequestConfig: { pipelineId: env.BHASHINI_PIPELINE_ID } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new AppError(502, 'VOICE_UPSTREAM', `Bhashini config failed (${res.status})`);
  const json = (await res.json()) as {
    pipelineInferenceAPIEndPoint?: { callbackUrl: string; inferenceApiKey: { name: string; value: string } };
    pipelineResponseConfig?: { config: { serviceId: string }[] }[];
  };
  const ep = json.pipelineInferenceAPIEndPoint;
  const serviceId = json.pipelineResponseConfig?.[0]?.config?.[0]?.serviceId;
  if (!ep || !serviceId) throw new AppError(502, 'VOICE_UPSTREAM', 'Bhashini returned no service for this language');
  const out = { url: ep.callbackUrl, authName: ep.inferenceApiKey.name, authValue: ep.inferenceApiKey.value, serviceId };
  cache.set(key, { at: Date.now(), ep: out });
  return out;
}

async function infer(ep: Endpoint, task: TaskType, config: Record<string, unknown>, inputData: Record<string, unknown>) {
  const res = await fetch(ep.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [ep.authName]: ep.authValue },
    body: JSON.stringify({ pipelineTasks: [{ taskType: task, config: { ...config, serviceId: ep.serviceId } }], inputData }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new AppError(502, 'VOICE_UPSTREAM', `Bhashini ${task} failed (${res.status})`);
  return (await res.json()) as { pipelineResponse?: { output?: { source?: string; target?: string }[]; audio?: { audioContent?: string }[] }[] };
}

export async function tts(text: string, language: string, gender: 'female' | 'male' = 'female') {
  const lang = langCode(language);
  const ep = await resolve('tts', lang);
  const out = await infer(ep, 'tts', { language: { sourceLanguage: lang }, gender }, { input: [{ source: text }] });
  const audio = out.pipelineResponse?.[0]?.audio?.[0]?.audioContent;
  if (!audio) throw new AppError(502, 'VOICE_UPSTREAM', 'Bhashini returned no audio');
  return { audioBase64: audio, mimeType: 'audio/wav' };
}

export async function asr(audioBase64: string, language: string) {
  const lang = langCode(language);
  const ep = await resolve('asr', lang);
  const out = await infer(ep, 'asr', { language: { sourceLanguage: lang }, audioFormat: 'wav', samplingRate: 16000 }, { audio: [{ audioContent: audioBase64 }] });
  return { text: out.pipelineResponse?.[0]?.output?.[0]?.source ?? '' };
}

export async function translate(text: string, from: string, to: string) {
  const s = langCode(from);
  const t = langCode(to);
  const ep = await resolve('translation', s, t);
  const out = await infer(ep, 'translation', { language: { sourceLanguage: s, targetLanguage: t } }, { input: [{ source: text }] });
  return { text: out.pipelineResponse?.[0]?.output?.[0]?.target ?? '' };
}
