'use client';
import type React from 'react';
import NumberFlow from '@number-flow/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { money } from '@/lib/game';

export const USD = { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;
export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const SPIN = { duration: 900, easing: EASE };
const TRANSFORM = { duration: 600, easing: EASE };

// Fit-to-width: the whole number, dollar sign and cents included, always fits the viewport with 16px sides.
function useFit(ref: React.RefObject<HTMLDivElement>, text: string) {
  const [fit, setFit] = useState(1);
  const current = useRef(1);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => {
      const available = Math.min(window.innerWidth - 32, (el.closest('.throne') as HTMLElement | null)?.clientWidth ?? Infinity);
      const natural = el.getBoundingClientRect().width / current.current;
      const next = natural > 0 ? Math.min(1, available / natural) : 1;
      if (Math.abs(next - current.current) > 0.005) { current.current = next; setFit(next); }
    };
    measure();
    // re-measure once the roll (and any width transform) lands and once the display font has loaded
    const settle = setTimeout(measure, 950);
    void document.fonts.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(settle); window.removeEventListener('resize', measure); };
  }, [ref, text]);
  return fit;
}

// Glyph-level gradients. Each rolling digit lives in a transformed element inside NumberFlow's shadow root, and the
// browser leaves transformed descendants out of an ancestor's background-clip: text, so the gradient has to sit on the
// glyph elements themselves. None of NumberFlow's ::part()s reach that level, so a stylesheet is adopted into each
// layer's open shadow root. Class names are from the pinned number-flow 0.6.2.
const GLYPHS = '.digit__num, .symbol__value';
const FACE_CSS = `${GLYPHS} { background-image: linear-gradient(180deg, #FFE082 0%, #F5B301 52%, #C98F00 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }`;
const SHEEN_CSS = `${GLYPHS} { background-image: linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,.55) 22%, rgba(255,255,255,0) 42%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }`;
const sheets = new Map<string, CSSStyleSheet>();
function adopt(host: HTMLElement | null, css: string) {
  const root = host?.shadowRoot; if (!root || typeof CSSStyleSheet === 'undefined') return false;
  let sheet = sheets.get(css);
  if (!sheet) { sheet = new CSSStyleSheet(); sheet.replaceSync(css); sheets.set(css, sheet); }
  if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  return true;
}
function useGlyphStyles(face: React.RefObject<HTMLElement>, sheen: React.RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    let frame = 0;
    const apply = () => { const done = adopt(face.current, FACE_CSS) && adopt(sheen.current, SHEEN_CSS); if (!done) frame = requestAnimationFrame(apply); };
    apply(); return () => cancelAnimationFrame(frame);
  }, [face, sheen]);
}

// Layered glass-gold rolling number, no raster. Three NumberFlow instances get the same value, format and timing in the
// same render, so their rolls start on the same frame: a shadow-only depth layer, the gold-gradient face, and a white
// specular sheen clipped to the top 40%, all in a soft radial halo. Screen readers get one announcement per takeover.
export function PotNumber({ value, announceKey }: { value: bigint; announceKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const fit = useFit(ref, money(value));
  const usd = Number(value) / 1e6;
  const [announced, setAnnounced] = useState({ key: announceKey, text: `pot $${money(value)}` });
  if (announced.key !== announceKey) setAnnounced({ key: announceKey, text: `pot $${money(value)}` });
  const face = useRef<HTMLElement>(null), sheen = useRef<HTMLElement>(null);
  useGlyphStyles(face, sheen);
  const layer = (className: string, ref?: React.RefObject<HTMLElement>) => <NumberFlow ref={ref as never} className={className} value={usd} format={USD} locales="en-US" trend={1} spinTiming={SPIN} transformTiming={TRANSFORM} aria-hidden="true"/>;
  return <div className="pot-number" ref={ref} style={{ '--pot-fit': fit } as React.CSSProperties}>
    <span className="pot-glow" aria-hidden="true"/>
    {layer('pot-layer pot-depth')}
    {layer('pot-layer pot-face', face)}
    {layer('pot-layer pot-sheen', sheen)}
    <span className="sr-only" aria-live="polite">{announced.text}</span>
  </div>;
}
