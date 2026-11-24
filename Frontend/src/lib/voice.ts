import { useUiStore, type Lang } from '../store/uiStore';

/**
 * Speech through the browser's built-in voice (Web Speech API).
 * Placeholder for Bhashini TTS via the backend; same call sites later.
 */
const LANG_CODE: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN', as: 'as-IN' };

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

const pickVoice = (code: string) => {
  const voices = window.speechSynthesis.getVoices();
  const base = code.split('-')[0];
  return voices.find((v) => v.lang === code) ?? voices.find((v) => v.lang.startsWith(base)) ?? voices.find((v) => v.lang.startsWith('en')) ?? null;
};

/** Speak text using the patient's settings. Cancels anything already speaking. Returns false if muted/unsupported. */
export function speak(text: string, opts: { lang?: Lang; force?: boolean } = {}): boolean {
  if (!canSpeak()) return false;
  const { settings } = useUiStore.getState();
  if (!settings.voiceOn && !opts.force) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const code = LANG_CODE[opts.lang ?? settings.lang];
  const u = new SpeechSynthesisUtterance(text);
  u.lang = code;
  const v = pickVoice(code);
  if (v) u.voice = v;
  u.rate = settings.voiceRate === 'slow' ? 0.82 : 1;
  u.pitch = 1;
  synth.speak(u);
  return true;
}

export const stopSpeaking = () => canSpeak() && window.speechSynthesis.cancel();
