'use client';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { WinnerReveal } from './winner-reveal';
import { money } from '@/lib/game';

const ease = [0.22, 1, 0.36, 1] as const;
// A 2000-unit wave strip in a 1000-unit view: scrolling it by exactly 1000 units loops seamlessly.
const WAVE = 'M0 60 Q 125 18 250 60 T 500 60 T 750 60 T 1000 60 T 1250 60 T 1500 60 T 1750 60 T 2000 60 V 1300 H 0 Z';
const CREST = 'M0 60 Q 125 18 250 60 T 500 60 T 750 60 T 1000 60 T 1250 60 T 1500 60 T 1750 60 T 2000 60';
// Deterministic "random" coins so the fall looks natural but renders identically every time.
const COINS = Array.from({ length: 38 }, (_, i) => ({ x: (i * 37 + 11) % 100, delay: 1.05 + ((i * 0.61) % 1.6), fall: 1.3 + ((i * 0.37) % 1.0), size: 16 + ((i * 7) % 22), flip: 0.28 + ((i * 0.13) % 0.4), drift: ((i % 5) - 2) * 16 }));
// The impact burst: coins thrown out from under the crown when it lands, arcing up and falling away.
const BURST = Array.from({ length: 16 }, (_, i) => { const a = -Math.PI / 2 + ((i / 15) - 0.5) * 2.6; const power = 170 + ((i * 53) % 120); return { dx: Math.cos(a) * power * 1.5, up: Math.max(40, -Math.sin(a) * power), size: 14 + ((i * 5) % 14), spin: 360 + i * 47 }; });

const RINGS = 0, RISE = 0.2, CROWN = 0.7, LAND = CROWN + 0.5;

/**
 * The coronation: the clock hits zero with a white flash and shockwave rings, molten gold rises with a moving wave
 * surface, the glass crown drops and lands on the winner's name with a flare and a jolt, the payout spins in as a slot
 * reel, and gold coins tumble down. On exit the gold drains away. `stage` renders it inside a box (onboarding) instead
 * of over the whole screen. Reduced motion shows the final frame without movement.
 */
export function Coronation({ name, payout, stage = false }: { name: string; payout: bigint; stage?: boolean }) {
  const reduced = !!useReducedMotion();
  // Coins fall a real pixel distance (percentages would be relative to the coin itself): past the stage, or the viewport.
  const [floor, setFloor] = useState(stage ? 480 : 1000);
  useEffect(() => { if (!stage) setFloor(window.innerHeight + 90); }, [stage]);
  const [reveal, setReveal] = useState(reduced);
  useEffect(() => { if (reduced) return; const id = setTimeout(() => setReveal(true), (LAND + 0.25) * 1000); return () => clearTimeout(id); }, [reduced]);
  const t = (delay: number, duration = 0.6) => ({ duration: reduced ? 0 : duration, delay: reduced ? 0 : delay, ease });
  return <motion.div className={stage ? 'coro is-stage' : 'coro'} aria-live="assertive" initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.35, delay: 0.55 } }}>
    {!reduced && <motion.span className="coro-flash" initial={{ opacity: 0.95 }} animate={{ opacity: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }}/>}
    {!reduced && <span className="coro-rings" aria-hidden="true">{[0, 1, 2].map(i => <motion.span key={i} initial={{ scale: 0.15, opacity: 0.9 }} animate={{ scale: 3.2, opacity: 0 }} transition={{ duration: 1.1, delay: RINGS + i * 0.14, ease: 'easeOut' }}/>)}</span>}
    <motion.div className="coro-liquid" aria-hidden="true" initial={reduced ? false : { y: '104%' }} animate={{ y: '0%' }} exit={{ y: '104%', transition: { duration: 0.7, ease: [0.55, 0, 0.8, 0.4] } }} transition={t(RISE, 1.05)}>
      <svg viewBox="0 0 1000 1300" preserveAspectRatio="none">
        <defs>
          <linearGradient id="coro-molten" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FFE9A3"/><stop offset=".08" stopColor="#FFD24A"/><stop offset=".45" stopColor="#F5B301"/><stop offset="1" stopColor="#C98F00"/></linearGradient>
        </defs>
        <g className="coro-wave coro-wave-back"><path d={WAVE} fill="#FFD65A" transform="translate(0 -26)"/></g>
        <g className="coro-wave coro-wave-front"><path d={WAVE} fill="url(#coro-molten)"/><path d={CREST} fill="none" stroke="#FFF6D6" strokeWidth={3} strokeOpacity={0.8} vectorEffect="non-scaling-stroke"/></g>
      </svg>
    </motion.div>
    {!reduced && <span className="coro-coins" aria-hidden="true">{COINS.map((c, i) => <motion.span key={i} className="coro-coin" style={{ left: `${c.x}%`, width: c.size, height: c.size }}
      initial={{ y: -60, x: 0, rotate: 0, opacity: 0 }} animate={{ y: floor, x: c.drift, rotate: 90 + i * 17, opacity: [0, 1, 1, 0] }}
      transition={{ duration: c.fall, delay: c.delay, ease: [0.45, 0, 1, 1], opacity: { duration: c.fall, delay: c.delay, times: [0, 0.06, 0.88, 1] } }}>
      <motion.span className="coro-coin-face" animate={{ rotateX: [0, 360] }} transition={{ duration: c.flip * 2.2, repeat: Infinity, ease: 'linear' }}/>
    </motion.span>)}</span>}
    <motion.div className="coro-content" animate={reduced ? {} : { x: [0, 0, -7, 6, -3, 0] }} transition={{ duration: 0.4, delay: LAND - 0.02, times: [0, 0.01, 0.3, 0.55, 0.8, 1] }}>
      <span className="coro-crown-slot">
        <motion.img className="coro-crown" src="/brand/crown.svg" alt="" initial={reduced ? false : { y: stage ? -300 : -700, rotate: -24, scale: 1.2, opacity: 0 }} animate={{ y: [stage ? -300 : -700, 0, stage ? -14 : -26, 0], rotate: 0, scale: 1, opacity: 1 }}
          transition={reduced ? { duration: 0 } : { y: { duration: 0.8, delay: CROWN, times: [0, 0.62, 0.82, 1], ease: ['easeIn', 'easeOut', 'easeIn'] }, rotate: { duration: 0.8, delay: CROWN, ease }, scale: { duration: 0.5, delay: CROWN, ease }, opacity: { duration: 0.12, delay: CROWN } }}/>
        {!reduced && <span className="coro-burst" aria-hidden="true">{BURST.map((b, i) => <motion.span key={i} className="coro-coin" style={{ width: b.size, height: b.size }}
          initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }} animate={{ x: [0, b.dx * 0.5, b.dx], y: [0, -b.up, floor * 0.75], opacity: [0, 1, 1, 0], rotate: b.spin }}
          transition={{ duration: 1.5, delay: LAND, x: { duration: 1.5, delay: LAND, ease: 'linear' }, y: { duration: 1.5, delay: LAND, times: [0, 0.3, 1], ease: ['easeOut', 'easeIn'] }, opacity: { duration: 1.5, delay: LAND, times: [0, 0.05, 0.8, 1] }, rotate: { duration: 1.5, delay: LAND, ease: 'linear' } }}>
          <motion.span className="coro-coin-face" animate={{ rotateX: [0, 360] }} transition={{ duration: 0.5 + (i % 4) * 0.12, repeat: Infinity, ease: 'linear' }}/></motion.span>)}</span>}
        {!reduced && <motion.span className="coro-flare" aria-hidden="true" initial={{ scale: 0, opacity: 0, rotate: 0 }} animate={{ scale: [0, 1.25, 0], opacity: [0, 1, 0], rotate: 45 }} transition={{ duration: 0.7, delay: LAND, ease: 'easeOut' }}/>}
      </span>
      <motion.span className="coro-kicker" initial={reduced ? false : { opacity: 0, letterSpacing: '0.6em' }} animate={{ opacity: 1, letterSpacing: '0.24em' }} transition={t(LAND, 0.8)}>long live</motion.span>
      <motion.span className="coro-name" initial={reduced ? false : { clipPath: 'inset(0 0 100% 0)', y: 24 }} animate={{ clipPath: 'inset(0 0 0% 0)', y: 0 }} transition={t(LAND + 0.08, 0.7)}>{name}.</motion.span>
      <motion.span className="coro-payout" initial={reduced ? false : { opacity: 0, y: 10 }} animate={reveal ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }} transition={{ duration: 0.3, ease }}>
        {reveal ? <WinnerReveal payout={payout}/> : <span className="flood-payout" style={{ visibility: 'hidden' }}>${money(payout)}</span>}
      </motion.span>
    </motion.div>
  </motion.div>;
}
