/**
 * "Sounds of Home", made in the browser with the Web Audio API (no audio files needed).
 * Later these become recorded clips from the culture pack, cached for offline use.
 */
export type SoundId = 'rain' | 'bell' | 'birds' | 'clock';

let ctx: AudioContext | null = null;
const ac = () => {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
};

const out = (c: AudioContext, gain = 0.5) => {
  const g = c.createGain();
  g.gain.value = gain;
  g.connect(c.destination);
  return g;
};

function rain(c: AudioContext, t: number, dur = 2.6) {
  const len = c.sampleRate * dur;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.002 ? 1 : 0.35);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 2400;
  f.Q.value = 0.6;
  const g = out(c, 0);
  g.gain.linearRampToValueAtTime(0.55, t + 0.4);
  g.gain.setValueAtTime(0.55, t + dur - 0.5);
  g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(f).connect(g);
  src.start(t);
}

function bell(c: AudioContext, t: number) {
  // A temple bell: a few inharmonic partials with a long, soft decay — struck twice.
  [0, 1.2].forEach((off) => {
    [[523, 0.5], [1046, 0.22], [1410, 0.14], [2093, 0.08]].forEach(([freq, amp]) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = out(c, 0);
      g.gain.setValueAtTime(0, t + off);
      g.gain.linearRampToValueAtTime(amp, t + off + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + off + 2.2);
      o.connect(g);
      o.start(t + off);
      o.stop(t + off + 2.3);
    });
  });
}

function birds(c: AudioContext, t: number) {
  const chirps = [0, 0.18, 0.36, 0.9, 1.05, 1.6, 1.75, 1.9];
  chirps.forEach((off, i) => {
    const o = c.createOscillator();
    o.type = 'sine';
    const base = 2600 + (i % 3) * 400;
    o.frequency.setValueAtTime(base, t + off);
    o.frequency.exponentialRampToValueAtTime(base * 1.6, t + off + 0.08);
    o.frequency.exponentialRampToValueAtTime(base * 0.9, t + off + 0.14);
    const g = out(c, 0);
    g.gain.setValueAtTime(0, t + off);
    g.gain.linearRampToValueAtTime(0.18, t + off + 0.02);
    g.gain.linearRampToValueAtTime(0, t + off + 0.14);
    o.connect(g);
    o.start(t + off);
    o.stop(t + off + 0.16);
  });
}

function clock(c: AudioContext, t: number) {
  for (let i = 0; i < 6; i++) {
    const off = i * 0.5;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = i % 2 ? 1500 : 1900;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1000;
    const g = out(c, 0);
    g.gain.setValueAtTime(0.25, t + off);
    g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.04);
    o.connect(f).connect(g);
    o.start(t + off);
    o.stop(t + off + 0.05);
  }
}

export function playSound(id: SoundId) {
  const c = ac();
  const t = c.currentTime + 0.05;
  ({ rain, bell, birds, clock })[id](c, t);
}
