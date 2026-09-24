import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { Shell } from '@/components/shell';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: { default: 'usurp. one throne. zero loyalty.', template: '%s · usurp.' },
  description: 'an onchain king-of-the-hill game on monad. take the throne. survive the clock. claim the pot.',
  openGraph: { title: 'usurp. one throne. zero loyalty.', description: 'an onchain king-of-the-hill game. built on monad.', images: ['/api/og/eviction'] },
  twitter: { card: 'summary_large_image' },
  icons: { icon: '/brand/crown.svg', apple: '/brand/crown.png' }
};

// FONT SWAP POINT. ABC Monument Grotesk is the intended family. No files exist under
// apps/web/public/fonts yet, so Schibsted Grotesk (Google Fonts, same weights 400–900)
// stands in. To swap: drop the Monument woff2 files into public/fonts, add matching
// @font-face rules at the top of globals.css, and delete the Schibsted Grotesk family
// from the stylesheet link below. The --sans variable already lists Monument first.
const fonts = 'https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap';

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/><link href={fonts} rel="stylesheet"/></head><body><a href="#main-content" className="skip-link">skip to the throne</a><Providers><Shell>{children}</Shell></Providers></body></html>;
}
