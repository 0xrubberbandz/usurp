'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export const ONBOARDED_KEY = 'usurp.onboarded';
export type OnboardingMode = 'full' | 'connect';
type Onboarding = {
  open: boolean; mode: OnboardingMode;
  /** replay the walkthrough ('full') or show only the connect step ('connect') */
  start: (mode: OnboardingMode) => void;
  /** close; completing or skipping the full flow persists usurp.onboarded=1 */
  finish: (completed: boolean) => void;
  /** increments when the overlay closes after the full flow, so the live crown gives one welcome jolt */
  welcome: number;
};
const OnboardingContext = createContext<Onboarding | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<OnboardingMode>('full');
  const [welcome, setWelcome] = useState(0);
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(ONBOARDED_KEY) === '1'; } catch {}
    if (!seen) { setMode('full'); setOpen(true); }
  }, []);
  const start = useCallback((next: OnboardingMode) => { setMode(next); setOpen(true); }, []);
  const finish = useCallback((completed: boolean) => {
    if (completed) { try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch {} }
    setOpen(false);
    if (completed) setWelcome(w => w + 1);
  }, []);
  const value = useMemo(() => ({ open, mode, start, finish, welcome }), [open, mode, start, finish, welcome]);
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}
export function useOnboarding() {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error('Onboarding provider is missing');
  return value;
}
