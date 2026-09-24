'use client';
// Synthesized effects: no downloads, music loop, or audio before a user gesture.
const COOKIE = 'usurp_sound';
const listeners = new Set<() => void>();
const playing = new Set<() => void>();
let enabled: boolean | null = null;
let context: AudioContext | null = null;
const notify = () => listeners.forEach(listener => listener());
const silent = () => {};

export function soundEnabled() {
  if (typeof document === 'undefined') return false;
  if (enabled === null) enabled = !document.cookie.split('; ').includes(`${COOKIE}=off`);
  return enabled;
}
export function soundReady() {
  return soundEnabled() && !document.hidden && context?.state === 'running';
}
export function stopSounds() { for (const stop of [...playing]) stop(); }
export function setSoundEnabled(on: boolean) {
  enabled = on;
  document.cookie = `${COOKIE}=${on ? 'on' : 'off'}; path=/; max-age=31536000; samesite=lax`;
  if (on) unlockAudio(); else stopSounds();
  notify();
}
export function subscribeSound(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

export function unlockAudio() {
  if (!soundEnabled()) return;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!context || context.state === 'closed') {
      context = new Ctor();
      context.addEventListener('statechange', notify);
    }
    if (context.state === 'suspended') void context.resume().then(notify).catch(() => {});
    notify();
  } catch { /* Audio is optional, including on devices where no output is available. */ }
}

/** Mount once in the shell. Mobile Safari also needs a click gesture. */
export function listenForSoundGestures() {
  const visibility = () => { if (document.hidden) stopSounds(); notify(); };
  const gesture = (event: Event) => {
    if (event.target instanceof Element && event.target.closest('[data-sound-toggle]')) return;
    unlockAudio();
  };
  const key = (event: KeyboardEvent) => { if (!event.repeat) gesture(event); };
  window.addEventListener('pointerdown', gesture, true);
  window.addEventListener('click', gesture, true);
  window.addEventListener('keydown', key, true);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    window.removeEventListener('pointerdown', gesture, true);
    window.removeEventListener('click', gesture, true);
    window.removeEventListener('keydown', key, true);
    document.removeEventListener('visibilitychange', visibility);
    stopSounds();
  };
}

type Voice = { ctx: AudioContext; output: GainNode; sources: Set<AudioScheduledSourceNode>; stop: () => void };
function voice(): Voice | null {
  if (!soundReady() || !context) return null;
  const ctx = context;
  const output = ctx.createGain();
  output.gain.value = 0.45;
  output.connect(ctx.destination);
  const sources = new Set<AudioScheduledSourceNode>();
  const stop = () => {
    for (const source of sources) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); }
    sources.clear(); output.disconnect(); playing.delete(stop);
  };
  playing.add(stop);
  return { ctx, output, sources, stop };
}
function track(v: Voice, source: AudioScheduledSourceNode, nodes: AudioNode[]) {
  v.sources.add(source);
  source.onended = () => {
    source.disconnect(); nodes.forEach(node => node.disconnect()); v.sources.delete(source);
    if (!v.sources.size) v.stop();
  };
}
function tone(v: Voice, at: number, from: number, to: number, seconds: number, level: number, type: OscillatorType = 'sine') {
  const osc = v.ctx.createOscillator(); osc.type = type;
  osc.frequency.setValueAtTime(from, at); osc.frequency.exponentialRampToValueAtTime(to, at + seconds);
  const gain = v.ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(level, at + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(gain).connect(v.output); track(v, osc, [gain]); osc.start(at); osc.stop(at + seconds + 0.01);
}
function noise(v: Voice, at: number, seconds: number, frequency: number, level: number) {
  const buffer = v.ctx.createBuffer(1, Math.ceil(v.ctx.sampleRate * seconds), v.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = v.ctx.createBufferSource(); source.buffer = buffer;
  const filter = v.ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = 0.8;
  const gain = v.ctx.createGain(); gain.gain.setValueAtTime(level, at); gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  source.connect(filter).connect(gain).connect(v.output); track(v, source, [filter, gain]); source.start(at); source.stop(at + seconds);
}
function bell(v: Voice, at: number, pitch: number, level = 0.15) {
  tone(v, at, pitch, pitch * 0.999, 0.48, level);
  tone(v, at, pitch * 2.01, pitch * 2, 0.22, level * 0.22);
}

export type SoundCue = 'crown' | 'swoosh' | 'take' | 'rise' | 'coin' | 'tick' | 'urgent' | 'reset' | 'win' | 'honest' | 'wallet' | 'approve' | 'confirm' | 'press' | 'release';
function synth(v: Voice, cue: SoundCue, at: number, variation = 0) {
  switch (cue) {
    case 'crown':
      tone(v, at, 110, 55, 0.45, 0.3);
      [523.25, 783.99, 1046.5].forEach((pitch, i) => bell(v, at + 0.08 + i * 0.11, pitch, 0.12));
      break;
    case 'swoosh': noise(v, at, 0.22, 1300, 0.14); tone(v, at, 180, 650, 0.18, 0.07); break;
    case 'take':
      noise(v, at, 0.1, 1700, 0.2); tone(v, at, 150, 55, 0.2, 0.35);
      bell(v, at + 0.1, 659.25); bell(v, at + 0.19, 987.77); break;
    case 'rise': bell(v, at, [392, 493.88, 587.33, 783.99, 987.77][variation % 5], 0.13); break;
    case 'coin':
      bell(v, at, 1318.51 + variation * 65, 0.11); bell(v, at + 0.055, 1760 + variation * 65, 0.07);
      noise(v, at, 0.025, 3600, 0.07); break;
    case 'tick':
    case 'urgent':
      noise(v, at, 0.018, variation % 2 ? 2600 : 1800, 0.12);
      tone(v, at, cue === 'urgent' ? 1050 : variation % 2 ? 760 : 620, 520, 0.035, cue === 'urgent' ? 0.12 : 0.065); break;
    case 'reset':
      tone(v, at, 260, 1046, 0.19, 0.14); bell(v, at + 0.14, 1046.5, 0.11); break;
    case 'win':
      tone(v, at, 130, 45, 0.65, 0.38); noise(v, at, 0.45, 2000, 0.12);
      [261.63, 329.63, 392, 523.25].forEach((pitch, i) => tone(v, at + i * 0.07, pitch, pitch, 1.1, 0.1, 'triangle'));
      [1046.5, 1318.51, 1567.98].forEach((pitch, i) => bell(v, at + 0.3 + i * 0.15, pitch, 0.1)); break;
    case 'honest': noise(v, at, 0.09, 1100, 0.1); tone(v, at, 220, 196, 0.35, 0.12); break;
    case 'wallet': bell(v, at, 440, 0.1); bell(v, at + 0.14, 659.25, 0.12); break;
    case 'approve': noise(v, at, 0.04, 2400, 0.1); bell(v, at + 0.08, 880, 0.12); break;
    case 'confirm': bell(v, at, 659.25, 0.13); bell(v, at + 0.13, 987.77, 0.14); break;
    case 'press': noise(v, at, 0.03, 1800, 0.35); tone(v, at, 120, 70, 0.09, 0.5); break;
    case 'release': noise(v, at, 0.018, 3800, 0.16); tone(v, at, 900, 600, 0.03, 0.08); break;
  }
}
export function playSound(cue: SoundCue, variation = 0) {
  const v = voice(); if (!v) return silent;
  synth(v, cue, v.ctx.currentTime, variation);
  return v.stop;
}
export function playPress() { unlockAudio(); return playSound('press'); }
export function playRelease() { return playSound('release'); }

type Beat = readonly [seconds: number, cue: SoundCue, variation?: number];
// Timing follows onboarding/steps.tsx. Each slide owns and cancels its entire score.
function slideBeats(step: number, reduced: boolean): Beat[] {
  if (reduced) return [[0, (['crown', 'take', 'rise', 'coin', 'tick', 'coin', 'win', 'honest', 'wallet', 'approve'] as SoundCue[])[step - 1] ?? 'crown']];
  switch (step) {
    case 1: return [[0.25, 'crown'], [0.9, 'rise', 2]];
    case 2: return [[0.08, 'swoosh'], [0.3, 'wallet']];
    case 3: return Array.from({ length: 5 }, (_, i) => [0.2 + i * 0.42, 'rise', i]);
    case 4: return [[0.9, 'take'], [1.5, 'coin'], [2.1, 'coin', 1], [3, 'confirm']];
    case 5: return [[0, 'honest'], ...Array.from({ length: 48 }, (_, i): Beat => {
      const tick = i + 1;
      return [tick * 0.11, tick === 15 || tick === 33 ? 'reset' : 'tick', tick];
    }).filter((beat, i) => i % 2 === 0 || beat[1] === 'reset')];
    case 6: return [[0.35, 'swoosh'], [0.9, 'coin'], [1.02, 'coin', 1], [1.14, 'coin', 2], [1.5, 'confirm']];
    case 7: return [[0, 'urgent'], [0.32, 'urgent', 1], [0.64, 'urgent'], [0.96, 'urgent', 1], [1.28, 'urgent'], [1.65, 'win'], [2.85, 'crown'], [3.1, 'coin'], [3.3, 'coin', 1], [3.5, 'coin', 2], [5.6, 'confirm']];
    case 8: return [[0, 'honest'], [0.25, 'tick'], [1, 'honest']];
    case 9: return [[0.08, 'wallet']];
    case 10: return [[0.08, 'approve'], [0.3, 'coin']];
    default: return [];
  }
}
export function playSlideSound(step: number, reduced: boolean, elapsed = 0) {
  // No catch-up bursts if sound is enabled late or a background tab becomes visible again.
  const beats = slideBeats(step, reduced).filter(([at]) => at >= elapsed);
  if (!beats.length) return silent;
  const v = voice(); if (!v) return silent;
  const now = v.ctx.currentTime;
  for (const [at, cue, variation] of beats) synth(v, cue, now + at - elapsed, variation);
  return v.stop;
}
