'use client';
import dynamic from 'next/dynamic';
import { DemoProvider } from './demo-provider';
import type { ReactNode } from 'react';
const LiveProvider = dynamic(() => import('./live-provider'), { ssr: false, loading: () => <div className="loading-screen">finding the throne…</div> });
export function Providers({ children }: { children: ReactNode }) {
  return process.env.NEXT_PUBLIC_DEMO === '1' ? <DemoProvider>{children}</DemoProvider> : <LiveProvider>{children}</LiveProvider>;
}
