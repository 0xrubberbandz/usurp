'use client';
// Button sounds are synthesized with Web Audio; no audio files. Off by default, stored in a cookie.
const COOKIE = 'usurp_sound';
const listeners = new Set<() => void>();
let enabled: boolean | null = null;
let context: AudioContext | null = null;

export function soundEnabled() {
  if (enabled === null) enabled = typeof document !== 'undefined' && document.cookie.split('; ').includes(`${COOKIE}=on`);
  return enabled;
}
export function setSoundEnabled(on: boolean) {
  enabled = on;
  document.cookie = `${COOKIE}=${on ? 'on' : 'off'}; path=/; max-age=31536000; samesite=lax`;
  listeners.forEach(listener => listener());
}
export function subscribeSound(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

function audio() {
  if (!soundEnabled()) return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  if (context.state === 'suspended') void context.resume();
  return context;
}
function noise(ctx: AudioContext, at: number, seconds: number, type: BiquadFilterType, frequency: number, level: number) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = ctx.createBufferSource(); source.buffer = buffer;
  const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency; filter.Q.value = 0.9;
  const gain = ctx.createGain(); gain.gain.setValueAtTime(level, at); gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  source.connect(filter).connect(gain).connect(ctx.destination); source.start(at); source.stop(at + seconds);
}
function tone(ctx: AudioContext, at: number, from: number, to: number, seconds: number, level: number) {
  const osc = ctx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(from, at); osc.frequency.exponentialRampToValueAtTime(to, at + seconds);
  const gain = ctx.createGain(); gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(level, at + 0.004); gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(gain).connect(ctx.destination); osc.start(at); osc.stop(at + seconds + 0.01);
}
// Press: ~30ms filtered noise burst plus a short ~120Hz thump.
export function playPress() {
  const ctx = audio(); if (!ctx) return;
  const at = ctx.currentTime;
  noise(ctx, at, 0.03, 'bandpass', 1800, 0.35);
  tone(ctx, at, 120, 70, 0.09, 0.5);
}
// Release: a softer, higher click.
export function playRelease() {
  const ctx = audio(); if (!ctx) return;
  const at = ctx.currentTime;
  noise(ctx, at, 0.018, 'highpass', 3800, 0.16);
  tone(ctx, at, 900, 600, 0.03, 0.08);
}
