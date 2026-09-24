'use client';
import type React from 'react';
import NumberFlow from '@number-flow/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Countdown } from '../countdown';
import { DomeButton } from '../dome-button';
import { EASE, USD } from '../pot-number';
import { Coronation } from '../coronation';

// Intro illustrations use example amounts; nothing here can send a transaction.
export type VisualProps = { reduced: boolean };
const ease = [0.22, 1, 0.36, 1] as const;
const usd = (n: number) => `$${n.toFixed(2)}`;
const ROLL = { duration: 700, easing: EASE };

/** Advances through timed phases once on mount; reduced motion jumps straight to the end state. */
function usePhase(times: number[], reduced: boolean) {
  const [phase, setPhase] = useState(reduced ? times.length : 0);
  useEffect(() => {
    if (reduced) { setPhase(times.length); return; }
    const ids = times.map((t, i) => setTimeout(() => setPhase(i + 1), t));
    return () => ids.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);
  return phase;
}

/** The staggered entrance every visual uses. */
export const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
export const rise = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } };

export function MiniCrown({ jolt = 0, size = 88, reduced }: { jolt?: number; size?: number; reduced: boolean }) {
  return <motion.img key={jolt} className="ob-crown" src="/brand/crown.svg" alt="" width={size} height={size} style={{ width: size, height: size }}
    animate={reduced || !jolt ? {} : { rotate: [0, -10, 7, -3, 0], y: [0, -12, 3, 0] }} transition={{ duration: 0.75 }}/>;
}

/** Holder name slot: the old name falls away grey, the new one rises in holo. */
function NameSlot({ name, taunt, reduced }: { name: string; taunt?: string; reduced: boolean }) {
  return <div className="ob-name-slot">
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span key={name} className="holder-name ob-name" initial={reduced ? false : { opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 36, rotate: 8, color: '#8A8A93', backgroundImage: 'none', WebkitTextFillColor: '#8A8A93' }} transition={{ duration: 0.4, ease }}>{name}</motion.span>
    </AnimatePresence>
    {taunt && <span className="ob-taunt">“{taunt}”</span>}
  </div>;
}

function Shards({ burst }: { burst: number }) {
  if (!burst) return null;
  return <span className="ob-shards" key={burst} aria-hidden="true">
    {Array.from({ length: 12 }, (_, i) => {
      const angle = (i / 12) * Math.PI * 2 + (i % 2) * 0.3, distance = 56 + (i % 4) * 14;
      return <motion.span key={i} className="ob-shard" initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
        animate={{ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * 0.6, opacity: 0, rotate: 180 + i * 40, scale: 0.4 }} transition={{ duration: 0.75, ease }}/>;
    })}
  </span>;
}

// 1. welcome: the line of succession. Two names are on the list; six more take the throne faster and faster, each
// struck off as the next arrives. The list slides up under a fixed highlight card and the crown drops onto each new
// holder. The last arrival is you, and your reign starts counting. lib/sound.ts scores the same arrival times.
// (Plain y offsets rather than layout animations: layout projection inside the slide kept AnimatePresence from
// finishing the exit, so the next slide never mounted.)
const LINE = [
  { name: 'inkfeather', reign: '41m 08s' }, { name: 'exit_liquidity', reign: '12m 30s' }, { name: 'tiny_emperor', reign: '3m 12s' },
  { name: 'no_refunds', reign: '1m 05s' }, { name: 'monad_monk', reign: '47s' }, { name: 'paper_crown', reign: '19s' },
  { name: 'your_ex', reign: '6s' }, { name: 'gm_goblin', reign: '2s' }, { name: 'you', reign: '' }
];
const ARRIVALS = [600, 1150, 1600, 1950, 2250, 2500, 2950];
const ROW = 44, YOU_ROW = 64, GAP = 4; // must match .ob-line-row heights and the .ob-line-list gap
function Reign({ reduced }: VisualProps) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [reduced]);
  return <>reigning {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</>;
}
export function StepWelcome({ reduced }: VisualProps) {
  const current = 1 + usePhase(ARRIVALS, reduced);
  const you = current === LINE.length - 1;
  // push the list down by the rows that have not arrived yet, so the current holder always sits on the card
  const below = LINE.slice(current + 1).reduce((h, row) => h + (row.name === 'you' ? YOU_ROW : ROW) + GAP, 0);
  // the card sits outside the masked list so its shadow is not clipped
  return <div className="ob-line-wrap" aria-hidden="true">
    <motion.span className="ob-line-card" initial={false} animate={{ height: you ? YOU_ROW : ROW }} transition={{ duration: reduced ? 0 : 0.3, ease }}>
      <motion.img key={current} className="ob-line-crown" src="/brand/crown.svg" alt=""
        initial={reduced ? false : { y: -30, rotate: -12, opacity: 0 }} animate={{ y: 0, rotate: 12, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 17 }}/>
    </motion.span>
    <div className="ob-line"><motion.div className="ob-line-list" initial={false} animate={{ y: below }} transition={{ duration: reduced ? 0 : 0.32, ease }}>
      {LINE.map((row, i) => <motion.div key={row.name} className={`ob-line-row${i === current ? ' is-current' : ''}${row.name === 'you' ? ' is-you' : ''}`}
        initial={false} animate={{ opacity: i <= current ? 1 : 0 }} transition={{ duration: reduced ? 0 : 0.25 }}>
        <span/>
        <span className="ob-line-name">{row.name}{i < current && <motion.span className="ob-line-strike" initial={reduced ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.22, ease }}/>}</span>
        <span className="ob-line-reign">{i < current ? row.reign : i > current ? '' : row.name === 'you' ? <Reign reduced={reduced}/> : 'reigning'}</span>
      </motion.div>)}
    </motion.div></div>
  </div>;
}

// 2. one throne. A light falls on the glass throne as it settles onto a nameplate; faint spectators drift around it,
// because everyone can see who is sitting on it.
const WATCHERS = [
  { name: 'exit_liquidity', x: -230, y: -96, depth: 0.9, drift: 6.5 }, { name: 'tiny_emperor', x: 214, y: -118, depth: 0.55, drift: 7.5 },
  { name: 'no_refunds', x: -250, y: 58, depth: 0.5, drift: 8 }, { name: 'monad_monk', x: 236, y: 30, depth: 0.85, drift: 6 },
  { name: 'your_ex', x: -96, y: -160, depth: 0.4, drift: 9 }, { name: 'paper_crown', x: 118, y: 150, depth: 0.45, drift: 7 }
];
export function StepThrone({ reduced }: VisualProps) {
  const t = (delay: number) => ({ duration: 0.7, delay, ease });
  return <div className="ob-visual-inner ob-throne ob-spotlight">
    <motion.span className="ob-beam" aria-hidden="true" initial={reduced ? false : { opacity: 0, scaleY: 0.6 }} animate={{ opacity: 1, scaleY: 1 }} transition={t(0)}/>
    {WATCHERS.map((w, i) => <motion.span key={w.name} className="ob-watcher" aria-hidden="true"
      style={{ '--x': w.x, '--y': w.y, '--drift': `${w.drift}s`, '--blur': `${(1 - w.depth) * 2.4}px` } as React.CSSProperties}
      initial={reduced ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: 0.25 + w.depth * 0.4, scale: 0.8 + w.depth * 0.25 }} transition={t(0.9 + i * 0.12)}>
      <span className="ob-watcher-dot"/>{w.name}
    </motion.span>)}
    <span className="ob-floor" aria-hidden="true"/>
    <motion.div className="ob-seat" initial={reduced ? false : { opacity: 0, y: -40, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 150, damping: 15, delay: 0.25 }}>
      <span className="ob-seat-glow" aria-hidden="true"/>
      <img src="/brand/throne.png" alt=""/>
    </motion.div>
    <motion.div className="ob-plate" initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={t(0.55)}>
      <span className="ob-plate-label">on the throne</span>
      <span className="holder-name ob-name ob-shimmer">inkfeather</span>
      <span className="ob-taunt">“this chair has excellent lumbar support.”</span>
    </motion.div>
  </div>;
}

// 3. anyone can take it. Trying the mini dome is optional; nothing is sent anywhere.
export function StepTake({ reduced, taken, onTake }: VisualProps & { taken: boolean; onTake: () => void }) {
  return <motion.div className="ob-visual-inner" variants={stagger} initial={reduced ? 'show' : 'hidden'} animate="show">
    <motion.div variants={rise}><MiniCrown jolt={taken ? 1 : 0} size={64} reduced={reduced}/></motion.div>
    <motion.div variants={rise} className="ob-shard-anchor"><NameSlot name={taken ? 'you' : 'inkfeather'} reduced={reduced}/><Shards burst={taken && !reduced ? 1 : 0}/></motion.div>
    {/* the prompt sits between the name and the dome, pointing down at it */}
    {!taken && <motion.span variants={rise} className="ob-hint"><ArrowDown size={16} strokeWidth={2.5} aria-hidden="true"/>try it.</motion.span>}
    <motion.div variants={rise} className="ob-mini-dome">
      <DomeButton size="mini" label={taken ? 'you hold the throne' : 'take the throne'} price={taken ? undefined : 10} ariaLabel={taken ? 'you hold the example throne' : 'try taking the throne for $10.00'}
        mode={taken ? 'disabled' : 'idle'} onActivate={onTake}/>
    </motion.div>
  </motion.div>;
}

// 4. the price climbs. Bars grow one by one with their prices on top; a bold ×1.35 chip pops at every step
// and a dashed trend line traces the climb.
const PRICES = [10, 13.5, 18.23, 24.6, 33.21];
const SHADES = ['#DCDCD8', '#BDBDC2', '#8E8E97', '#4B4B53', '#101014'];
const BAR_MAX = 74; // % of the chart height the tallest bar reaches; the rest is room for its price
const barHeight = (price: number) => (price / PRICES[PRICES.length - 1]) * BAR_MAX;
export function StepPrice({ reduced }: VisualProps) {
  const at = (i: number) => (reduced ? 0 : 0.2 + i * 0.42);
  return <div className="ob-climb">
    {/* the dashed trend is revealed with a left-to-right clip; animating pathLength would overwrite the dash pattern */}
    <motion.svg className="ob-climb-trend" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
      initial={reduced ? false : { clipPath: 'inset(0 100% 0 0)' }} animate={{ clipPath: 'inset(0 0% 0 0)' }} transition={{ duration: 1.9, delay: at(0) + 0.3, ease: 'easeInOut' }}>
      <polyline points={PRICES.map((p, i) => `${10 + i * 20},${100 - barHeight(p) - 1}`).join(' ')} fill="none" stroke="var(--ink)" strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="4 5" vectorEffect="non-scaling-stroke"/>
    </motion.svg>
    {PRICES.map((price, i) => <div key={price} className="ob-climb-col">
      <motion.span className="ob-climb-price" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: at(i) + 0.3, ease }}>{usd(price)}</motion.span>
      <motion.span className="ob-climb-bar" style={{ height: `${barHeight(price)}%`, background: `linear-gradient(180deg, ${SHADES[i]}, ${SHADES[i]}E6)` }}
        initial={reduced ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.55, delay: at(i), ease }}/>
    </div>)}
    {PRICES.slice(1).map((_, k) => <motion.span key={k} className="ob-climb-mult" style={{ left: `${(k + 1) * 20}%`, bottom: `${barHeight(PRICES[k]) * 0.5}%` }}
      initial={reduced ? false : { opacity: 0, scale: 0.4, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 18, delay: at(k + 1) + 0.15 }}>×1.35</motion.span>)}
  </div>;
}

// 5. get booted, get paid.
export function StepRefund({ reduced }: VisualProps) {
  const phase = usePhase([900, 1500, 2100, 3000], reduced);
  return <div className="ob-visual-inner">
    <MiniCrown jolt={phase >= 1 ? 1 : 0} size={56} reduced={reduced}/>
    <NameSlot name={phase >= 1 ? 'inkfeather' : 'you'} reduced={reduced}/>
    <AnimatePresence>{phase >= 2 && <motion.div className="ob-card" initial={reduced ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease }}>
      <div className="ob-card-row"><span>you paid</span><span className="ob-num">{usd(10)}</span></div>
      <div className="ob-card-row"><span>you got back</span><NumberFlow className="ob-num" value={phase >= 3 ? 10.2 : 10} format={USD} locales="en-US" trend={1} spinTiming={ROLL} transformTiming={ROLL} animated={!reduced}/></div>
      {phase >= 4 && <motion.div className="ob-card-row ob-profit" initial={reduced ? false : { backgroundColor: 'rgba(0,200,117,.22)' }} animate={{ backgroundColor: 'rgba(0,200,117,0)' }} transition={{ duration: 0.9 }}>
        <span>profit</span><span className="ob-num">+{usd(0.2)}</span></motion.div>}
    </motion.div>}</AnimatePresence>
  </div>;
}

// 6. the clock. A watch face: 60 ticks and a ring that drains as the accelerated clock runs down. When someone takes the
// throne their name slides in, the ring springs back to full with a ripple, and the digits roll up to 05:00.
const TAKERS = [{ at: 15, name: 'tiny_emperor' }, { at: 33, name: 'monad_monk' }];
export function StepClock({ reduced }: VisualProps) {
  const [seconds, setSeconds] = useState(300);
  const [resets, setResets] = useState<string[]>([]);
  useEffect(() => {
    if (reduced) return;
    let tick = 0;
    const id = setInterval(() => {
      tick++;
      const taker = TAKERS.find(x => x.at === tick);
      if (taker) { setSeconds(300); setResets(r => [...r, taker.name]); }
      else if (tick > 48) clearInterval(id);
      else setSeconds(s => Math.max(0, s - 11));
    }, 110);
    return () => clearInterval(id);
  }, [reduced]);
  const progress = seconds / 300;
  const justReset = seconds === 300 && resets.length > 0;
  return <div className="ob-visual-inner ob-watch">
    <div className="ob-watch-face">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {Array.from({ length: 60 }, (_, i) => { const a = (i / 60) * Math.PI * 2, long = i % 5 === 0, r1 = long ? 40.5 : 42.2;
          return <line key={i} x1={50 + Math.sin(a) * r1} y1={50 - Math.cos(a) * r1} x2={50 + Math.sin(a) * 44} y2={50 - Math.cos(a) * 44} stroke="var(--ink)" strokeOpacity={long ? 0.45 : 0.18} strokeWidth={long ? 0.9 : 0.5} strokeLinecap="round"/>; })}
        <circle cx="50" cy="50" r="47.5" fill="none" stroke="#E6E6E2" strokeWidth="2.4"/>
        <motion.circle cx="50" cy="50" r="47.5" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" pathLength={100} strokeDasharray="100 100" transform="rotate(-90 50 50)"
          initial={false} animate={{ strokeDashoffset: 100 * (1 - progress) }} transition={justReset ? { type: 'spring', stiffness: 170, damping: 14 } : { duration: 0.11, ease: 'linear' }}/>
      </svg>
      {resets.map((_, i) => <motion.span key={i} className="ob-watch-ripple" aria-hidden="true" initial={{ scale: 0.92, opacity: 0.55 }} animate={{ scale: 1.32, opacity: 0 }} transition={{ duration: 0.9, ease: 'easeOut' }}/>)}
      <div className="ob-clock"><Countdown seconds={seconds}/></div>
    </div>
    <div className="ob-watch-feed" aria-hidden="true">
      <AnimatePresence initial={false}>{resets.map((name, i) => <motion.span key={name} className="ob-watch-event" initial={{ opacity: 0, x: 18, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 24 }}>
        <span className="holder-name ob-name-sm">{name}</span> took it<span className="ob-watch-tag">reset {i + 1}</span></motion.span>)}</AnimatePresence>
    </div>
  </div>;
}

// 7. the pot. One $13.50 payment flows out as three ribbons (moving light along each) into three cards; the pot card
// rolls upward. A three-column grid keeps the whole composition centred.
const STREAMS = [
  { label: 'previous holder', amount: 10.2, color: '#00C875', width: 16, cls: 'ob-green' },
  { label: 'the pot', amount: 2.96, color: '#F5B301', width: 7, cls: 'ob-gold' },
  { label: 'house', amount: 0.34, color: '#8A8A93', width: 2.5, cls: 'ob-muted' }
];
const RIBBON = (row: number) => `M0 50 C 45 50, 55 ${[16.7, 50, 83.3][row]}, 100 ${[16.7, 50, 83.3][row]}`;
export function StepPot({ reduced }: VisualProps) {
  const phase = usePhase([1500], reduced);
  const at = (i: number) => (reduced ? 0 : i);
  return <div className="ob-pot">
    <motion.div className="ob-pot-source" initial={reduced ? false : { opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, ease }}>
      <span className="ob-num">{usd(13.5)}</span><small>one takeover</small>
    </motion.div>
    {/* ribbons are revealed with a left-to-right clip (a pathLength draw fights the stretched coordinates); the gradients use
        user space because the straight pot ribbon has a zero-height bounding box */}
    <motion.svg className="ob-pot-ribbons" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
      initial={reduced ? false : { clipPath: 'inset(0 100% 0 0)' }} animate={{ clipPath: 'inset(0 0% 0 0)' }} transition={{ duration: 0.9, delay: at(0.35), ease }}>
      <defs>{STREAMS.map((s, i) => <linearGradient key={i} id={`ob-ribbon-${i}`} gradientUnits="userSpaceOnUse" x1="0" x2="100" y1="0" y2="0"><stop offset="0" stopColor="#101014" stopOpacity="0.9"/><stop offset="0.55" stopColor={s.color} stopOpacity="0.55"/><stop offset="1" stopColor={s.color} stopOpacity="0.9"/></linearGradient>)}</defs>
      {STREAMS.map((s, i) => <g key={s.label}>
        <path d={RIBBON(i)} fill="none" stroke={`url(#ob-ribbon-${i})`} strokeWidth={s.width} strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
        {!reduced && <path className="ob-flowlight" pathLength={100} d={RIBBON(i)} fill="none" stroke="#fff" strokeWidth={Math.max(1.2, s.width * 0.35)} strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ animationDelay: `${1.1 + i * 0.2}s` }}/>}
      </g>)}
    </motion.svg>
    <div className="ob-pot-targets">
      {STREAMS.map((s, i) => <motion.div key={s.label} className={s.label === 'the pot' ? 'ob-pot-card is-pot' : 'ob-pot-card'}
        initial={reduced ? false : { opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, delay: at(0.9 + i * 0.12), ease }}>
        {s.label === 'the pot'
          ? <><NumberFlow className="ob-num ob-gold ob-pot-total" value={phase >= 1 ? 124.77 : 121.81} format={USD} locales="en-US" trend={1} spinTiming={ROLL} transformTiming={ROLL} animated={!reduced}/><small>the pot <b className="ob-gold">+{usd(s.amount)}</b></small></>
          : <><span className={`ob-num ${s.cls}`}>{usd(s.amount)}</span><small>{s.label}</small></>}
      </motion.div>)}
    </div>
  </div>;
}

// 8. outlast everyone. The last seconds tick red, then the full coronation plays inside the stage, drains away, and the
// result settles with the 82/18 split.
export function StepWin({ reduced }: VisualProps) {
  const [seconds, setSeconds] = useState(reduced ? 0 : 5);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setSeconds(s => { if (s <= 1) clearInterval(id); return Math.max(0, s - 1); }), 320);
    return () => clearInterval(id);
  }, [reduced]);
  const phase = usePhase([1650, 5600, 5900], reduced); // coronation, settle, split
  return <div className="ob-visual-inner ob-win">
    {phase === 0 && <motion.div key={seconds} className="ob-clock is-final" initial={reduced ? false : { scale: 1.12 }} animate={{ scale: 1 }} transition={{ duration: 0.28, ease }}><Countdown seconds={seconds}/></motion.div>}
    <AnimatePresence>{phase === 1 && <Coronation stage name="you" payout={102_310000n}/>}</AnimatePresence>
    {phase >= 2 && <>
      <motion.span className="ob-long-live" initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}>long live you.</motion.span>
      <motion.span className="ob-payout-final" initial={reduced ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45, ease }}>{usd(102.31)}</motion.span>
    </>}
    {phase >= 3 && <motion.div className="ob-split" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}>
      <span className="ob-split-bar"><motion.span className="ob-split-win" initial={reduced ? false : { width: 0 }} animate={{ width: '82%' }} transition={{ duration: 0.8, ease }}/><span className="ob-split-next"/></span>
      <span className="ob-split-labels"><span className="ob-gold">82% to the winner</span><span>18% seeds the next round</span></span>
    </motion.div>}
  </div>;
}
