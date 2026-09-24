'use client';
import dynamic from 'next/dynamic';
import { Component, useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import type { DomeMode } from './dome-scene';
import NumberFlow from '@number-flow/react';
import { playPress, playRelease } from '@/lib/sound';
import { EASE, USD } from './pot-number';

const PRICE_SPIN = { duration: 700, easing: EASE };

const DomeScene = dynamic(() => import('./dome-scene'), { ssr: false });

// If WebGL cannot start, the slot stays reserved and empty; the real button and its label keep working.
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

// Focus ring only when focus arrived by keyboard (Tab), never after a click or a dialog handing focus back.
let tabbing = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', e => { if (e.key === 'Tab') tabbing = true; }, true);
  window.addEventListener('pointerdown', () => { tabbing = false; }, true);
}

type Props = { label: string; price?: number; ariaLabel: string; mode: DomeMode; bounceKey?: string; onActivate: () => void;
  /** 'mini' is the onboarding practice dome */ size?: 'full' | 'mini';
  /** stop rendering entirely (frameloop "never"), e.g. while the onboarding overlay owns the only active WebGL context */ paused?: boolean };

// A real <button> owns every interaction and all accessibility; the 3D canvas inside is only a picture of it.
export function DomeButton({ label, price, ariaLabel, mode, bounceKey, onActivate, size = 'full', paused = false }: Props) {
  const [pressed, setPressed] = useState(false);
  const [ready, setReady] = useState(false);
  const [compact, setCompact] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [ring, setRing] = useState(false);
  const keyHeld = useRef(false);
  const lastKeyRelease = useRef(0);
  const pressedRef = useRef(false);
  const blocked = mode === 'disabled';
  const busy = mode === 'pending';
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const small = window.matchMedia('(max-width: 720px)');
    const update = () => { setReduced(motion.matches); setCompact(small.matches); };
    update();
    motion.addEventListener('change', update); small.addEventListener('change', update);
    return () => { motion.removeEventListener('change', update); small.removeEventListener('change', update); };
  }, []);
  const onReady = useCallback(() => setReady(true), []);
  const shake = useCallback(() => { setShaking(false); requestAnimationFrame(() => setShaking(true)); }, []);
  const press = useCallback(() => {
    if (pressedRef.current) return;
    pressedRef.current = true; setPressed(true); playPress();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(12);
  }, []);
  const release = useCallback(() => {
    if (!pressedRef.current) return false;
    pressedRef.current = false; setPressed(false); playRelease();
    return true;
  }, []);
  const cancel = () => { if (pressedRef.current) { pressedRef.current = false; setPressed(false); } };

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    setRing(false);
    if (e.button !== 0 || busy) return;
    if (blocked) { shake(); return; }
    press();
  }
  // Pointer activation arrives as the click after pointerup, i.e. on release.
  function onClick(e: MouseEvent<HTMLButtonElement>) {
    if (e.detail === 0 && performance.now() - lastKeyRelease.current < 100) return; // already handled on keyup
    if (busy) return;
    if (blocked) { if (e.detail === 0) shake(); return; }
    if (e.detail === 0) { press(); setTimeout(() => { release(); onActivate(); }, 140); return; } // assistive-tech click
    onActivate();
  }
  // Space and Enter press on keydown and release-plus-activate on keyup; the native key click is suppressed.
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat || keyHeld.current) return;
    keyHeld.current = true;
    if (busy) return;
    if (blocked) { shake(); return; }
    press();
  }
  function onKeyUp(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (!keyHeld.current) return;
    keyHeld.current = false; lastKeyRelease.current = performance.now();
    if (release()) onActivate();
  }

  return <button type="button" className={size === 'mini' ? 'dome-button dome-mini' : 'dome-button'} data-mode={mode} data-ring={ring || undefined} aria-label={ariaLabel} aria-disabled={blocked || busy || undefined} aria-busy={busy || undefined}
    onPointerDown={onPointerDown} onPointerUp={() => release()} onPointerLeave={cancel}
    onClick={onClick} onKeyDown={onKeyDown} onKeyUp={onKeyUp} onFocus={() => setRing(tabbing)} onBlur={() => { setRing(false); keyHeld.current = false; cancel(); }}>
    <span className={`dome-slot${shaking ? ' is-shaking' : ''}`} onAnimationEnd={() => setShaking(false)} aria-hidden="true">
      <span className="dome-canvas" style={{ opacity: ready ? 1 : 0 }}>
        <SceneBoundary><DomeScene pressed={pressed} mode={mode} bounceKey={bounceKey} compact={compact} reduced={reduced} paused={paused} onReady={onReady}/></SceneBoundary>
      </span>
    </span>
    <span className="dome-label">{label}</span>
    {price !== undefined && <NumberFlow className="dome-price" value={price} format={USD} locales="en-US" trend={1} spinTiming={PRICE_SPIN} transformTiming={PRICE_SPIN} aria-hidden="true"/>}
  </button>;
}
