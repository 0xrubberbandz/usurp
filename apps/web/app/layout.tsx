import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { Shell } from '@/components/shell';
import './globals.css';

const title = 'usurp';
const description = 'one throne. anyone can take it. get taken, make 2%. outlast everyone, take the pot.';
const ogImage = { url: '/og-default.png', width: 1200, height: 630, alt: 'usurp, one throne' };

export const metadata: Metadata = {
  metadataBase: new URL('https://usurp.fun'),
  title,
  description,
  openGraph: { title, description, images: [ogImage], type: 'website', siteName: 'usurp', url: 'https://usurp.fun' },
  twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
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
