'use client';
import { useIsPresent } from 'framer-motion';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { playSlideSound, soundReady, subscribeSound } from '@/lib/sound';

export function SlideAudio({ step, reduced, active }: { step: number; reduced: boolean; active: boolean }) {
  const ready = useSyncExternalStore(subscribeSound, soundReady, () => false);
  const present = useIsPresent();
  const started = useRef<number | null>(null);
  const heard = useRef(false);
  useEffect(() => {
    started.current ??= performance.now();
    if (!active || !present || !ready) return;
    const elapsed = (performance.now() - started.current) / 1000;
    // First activation still gets a short introduction, even if the animation already finished.
    const stopIntro = !heard.current && elapsed >= 0.08 ? playSlideSound(step, true) : () => {};
    heard.current = true;
    const stopScore = playSlideSound(step, reduced, elapsed < 0.08 ? 0 : elapsed);
    return () => { stopIntro(); stopScore(); };
  }, [step, reduced, active, present, ready]);
  return null;
}
