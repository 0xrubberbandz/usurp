'use client';
import dynamic from 'next/dynamic';
import { useEffect, type ReactNode } from 'react';
import { DemoProvider } from './demo-provider';
import { OnboardingProvider } from './onboarding/context';
import { OnboardingOverlay } from './onboarding/overlay';
import { listenForSoundGestures } from '@/lib/sound';
import { LoadingScreen } from './loading-screen';
const LiveProvider = dynamic(() => import('./live-provider'), { ssr: false, loading: LoadingScreen });
// Onboarding wraps the game provider rather than living inside it, so a first visit gets the walkthrough right away
// instead of waiting for the wallet stack to load.
export function Providers({ children }: { children: ReactNode }) {
  useEffect(listenForSoundGestures, []);
  return <OnboardingProvider>
    {process.env.NEXT_PUBLIC_DEMO === '1' ? <DemoProvider>{children}</DemoProvider> : <LiveProvider>{children}</LiveProvider>}
    <OnboardingOverlay/>
  </OnboardingProvider>;
}
