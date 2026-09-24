'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Game } from '../game-context';

// Also read by the inline script in app/layout.tsx, which hides the page before first paint on a first visit.
export const ONBOARDED_KEY = 'usurp.onboarded';
export type OnboardingMode = 'full' | 'connect';
type Onboarding = {
  open: boolean; mode: OnboardingMode;
  /** true when the walkthrough opened by itself on a first visit, so it appears without a fade */
  auto: boolean;
  /** replay the walkthrough ('full') or show only the connect step ('connect') */
  start: (mode: OnboardingMode) => void;
  /** close; completing or skipping the full flow persists usurp.onboarded=1 */
  finish: (completed: boolean) => void;
  /** increments when the overlay closes after the full flow, so the live crown gives one welcome jolt */
  welcome: number;
  /** called from inside the game provider to hand the overlay the latest game */
  mirror: (game: Game) => void;
};
const OnboardingContext = createContext<Onboarding | null>(null);
// The overlay sits above the game provider so a first visit sees it before the wallet stack loads; until the game
// mounts and mirrors itself up, this is null.
const OnboardingGame = createContext<Game | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<OnboardingMode>('full');
  const [auto, setAuto] = useState(false);
  const [welcome, setWelcome] = useState(0);
  const [game, mirror] = useState<Game | null>(null);
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(ONBOARDED_KEY) === '1'; } catch {}
    if (!seen) { setMode('full'); setAuto(true); setOpen(true); }
  }, []);
  // The overlay now covers the page, so the pre-paint hide from app/layout.tsx can lift.
  useEffect(() => { if (open) delete document.documentElement.dataset.intro; }, [open]);
  const start = useCallback((next: OnboardingMode) => { setMode(next); setAuto(false); setOpen(true); }, []);
  const finish = useCallback((completed: boolean) => {
    if (completed) { try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch {} }
    setOpen(false);
    if (completed) setWelcome(w => w + 1);
  }, []);
  const value = useMemo(() => ({ open, mode, auto, start, finish, welcome, mirror }), [open, mode, auto, start, finish, welcome]);
  return <OnboardingContext.Provider value={value}><OnboardingGame.Provider value={game}>{children}</OnboardingGame.Provider></OnboardingContext.Provider>;
}
export function useOnboarding() {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error('Onboarding provider is missing');
  return value;
}
export function useOnboardingGame() {
  return useContext(OnboardingGame);
}
