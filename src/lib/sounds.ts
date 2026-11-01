// Synthesized sound effects (no audio assets). One sound at a time: a call
// made while another effect is still playing is dropped.

export type SoundName = "chaChing" | "coinPurse" | "kiss" | "pageFlip";

let ctx: AudioContext | null = null;
let busyUntil = 0;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
  const buffer = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * seconds)), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function ping(
  ac: AudioContext,
  freq: number,
  start: number,
  duration: number,
  peak = 0.22,
  type: OscillatorType = "triangle"
) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function chaChing(ac: AudioContext, t: number): number {
  ping(ac, 988, t, 0.09, 0.2, "square");
  ping(ac, 1319, t + 0.08, 0.28, 0.22, "square");
  ping(ac, 2637, t + 0.08, 0.12, 0.06);
  return 0.4;
}

function coinPurse(ac: AudioContext, t: number): number {
  // A handful of coins dumped: staggered clinks over a soft noise swish.
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.3);
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1200;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + 0.32);
  let at = t;
  for (let i = 0; i < 8; i++) {
    ping(ac, 1500 + Math.random() * 1900, at, 0.06, 0.16);
    at += 0.03 + Math.random() * 0.06;
  }
  return 0.7;
}

function kiss(ac: AudioContext, t: number): number {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(750, t);
  osc.frequency.exponentialRampToValueAtTime(240, t + 0.13);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.2);
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.03);
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2500;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.15, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  src.connect(hp).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + 0.04);
  return 0.22;
}

function pageFlip(ac: AudioContext, t: number): number {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.24);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(500, t);
  bp.frequency.exponentialRampToValueAtTime(1800, t + 0.1);
  bp.frequency.exponentialRampToValueAtTime(600, t + 0.22);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.3, t + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + 0.26);
  return 0.28;
}

const EFFECTS: Record<SoundName, (ac: AudioContext, t: number) => number> = {
  chaChing,
  coinPurse,
  kiss,
  pageFlip,
};

export function playSound(name: SoundName) {
  const ac = audio();
  if (!ac) return;
  const now = performance.now();
  if (now < busyUntil) return;
  const duration = EFFECTS[name](ac, ac.currentTime);
  busyUntil = now + duration * 1000;
}
