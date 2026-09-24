'use client';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Share2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useGame } from './game-context';
import { Crown } from './crown';
import { PotNumber } from './pot-number';
import { DomeButton } from './dome-button';
import { Countdown } from './countdown';
import { Coronation } from './coronation';
import { useOnboarding } from './onboarding/context';
import type { DomeMode } from './dome-scene';
import { DURATION, holdFee, MIN_BLOCKS, money, nextTakePrice, playerName, ZERO } from '@/lib/game';
import { evictionLinks } from '@/lib/share';

// A settle is celebrated when it lands while you are watching; older ones loaded with the history are not replayed.
const FRESH_SETTLE_SECONDS = 30;

export function Throne() {
  const game = useGame(), { state, now, history, demo } = game;
  const onboarding = useOnboarding();
  const [taunt, setTaunt] = useState('');
  const [composing, setComposing] = useState(false);
  const [origin, setOrigin] = useState(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');
  const [crowned, setCrowned] = useState<(typeof game.claims)[number] | null>(null);
  const [toast, setToast] = useState(false);
  const reduced = useReducedMotion();
  const modalRef = useRef<HTMLDialogElement>(null);
  const latest = history.at(-1);
  const lastSettle = game.claims.at(-1);
  const seenEvent = useRef<string>();
  const seenSettle = useRef<string>();
  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => {
    if (!latest) return;
    if (seenEvent.current && latest.id !== seenEvent.current && latest.prevHolder.toLowerCase() === game.address?.toLowerCase()) setToast(true);
    seenEvent.current = latest.id;
  }, [latest, game.address]);
  // Every settle plays the coronation for everyone watching, then the page is already on the next round.
  useEffect(() => {
    if (!lastSettle || seenSettle.current === lastSettle.id) return;
    seenSettle.current = lastSettle.id;
    if (now - lastSettle.timestamp > FRESH_SETTLE_SECONDS) return;
    setCrowned(lastSettle);
    // long enough for the whole coronation: flash, rising gold, crown drop, slot-reel payout, coin fall
    const timeout = setTimeout(() => setCrowned(null), 4800); return () => clearTimeout(timeout);
  }, [lastSettle, now]);
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(false), 8000); return () => clearTimeout(timeout); }, [toast]);
  useEffect(() => { if (composing) modalRef.current?.showModal(); else modalRef.current?.close(); }, [composing]);
  // Esc closes the dialog natively; listen to the DOM close event so state follows it.
  useEffect(() => {
    const dialog = modalRef.current; if (!dialog) return;
    const closed = () => setComposing(false);
    dialog.addEventListener('close', closed); return () => dialog.removeEventListener('close', closed);
  }, []);
  const remaining = Math.max(0, state.deadline - now);
  const empty = state.holder === ZERO;
  const active = state.status === 'active';
  const expired = !empty && remaining === 0 && active;
  const finalMinute = !empty && remaining > 0 && remaining < 60 && active;
  const holder = playerName(state.holder, demo);
  const isHolder = !empty && state.holder.toLowerCase() === game.address?.toLowerCase();
  useEffect(() => { if (isHolder) setTaunt(''); }, [isHolder, latest?.id]);
  const bytes = Array.from(taunt).length;
  // A finished round can be settled once the 300-block gate is met; until then everyone waits a moment.
  const settleable = expired && game.block >= state.lastTakeoverBlock + MIN_BLOCKS;
  // Holding fees accrued by the current holder join the displayed pot in 5-second batches, so the pot rolls in steps.
  const accrualAt = state.holderSince + Math.floor(Math.max(0, now - state.holderSince) / 5) * 5;
  const displayPot = state.potBalance + holdFee(state, accrualAt);
  // An expired throne's next taker settles it and opens the next round, so they pay that round's start price.
  const nextPrice = nextTakePrice(state, now, game.startPrice);
  const price = money(nextPrice);
  const reigning = isHolder && active && !expired;
  const ready = !game.loading && !!game.address && !game.wrongNetwork && active;
  /** What the big button does right now. */
  const action: 'take' | 'settle' | 'none' =
    !ready || reigning ? 'none'
    : expired ? (!settleable ? 'none' : isHolder || game.paused ? 'settle' : 'take')
    : game.paused ? 'none' : 'take';
  // Live mode, connected, but not enough test usdc for this take: the big button mints it instead of opening the taunt.
  const needsUsdc = action === 'take' && !demo && game.balance !== undefined && game.balance < nextPrice;
  function open() {
    if (action === 'settle') { void game.settle(); return; }
    if (needsUsdc) { void game.mint(); return; }
    // Show the dialog directly too: its close event lands a task after Esc, so state alone can lag a fast reopen.
    const dialog = modalRef.current; if (dialog && !dialog.open) dialog.showModal();
    setComposing(true);
  }
  function confirm(event: FormEvent) {
    event.preventDefault();
    if (bytes > 140 || game.phase) return;
    setComposing(false);
    void game.take(taunt);
  }
  const label = game.phase || (game.loading ? 'finding the throne…'
    : !game.address ? 'connect a wallet'
    : game.wrongNetwork ? 'switch to monad testnet'
    : expired && !settleable ? 'the round is over. settling in a moment…'
    : expired && isHolder ? 'claim the pot'
    : expired && action === 'settle' ? 'start the next round'
    : game.paused ? 'the throne is paused'
    : reigning ? 'you hold the throne'
    : needsUsdc ? 'get 10,000 test usdc'
    : expired ? 'take the next throne'
    : 'take the throne');
  const showPrice = action === 'take' && !needsUsdc && !game.phase;
  const mode: DomeMode = game.phase ? 'pending' : action === 'none' ? 'disabled' : finalMinute ? remaining <= 10 ? 'critical' : 'urgent' : 'idle';
  // The dome bounces when someone else takes the throne, on the same beat as the crown jolt.
  const bounceKey = latest && latest.taker.toLowerCase() !== game.address?.toLowerCase() ? latest.id : undefined;
  // Phase-lock the page-edge pulse to the wall clock so the dome's inner light beats with it.
  const vignetteDelay = useMemo(() => (finalMinute ? Date.now() % 1000 : 0), [finalMinute]);
  return <>
    {finalMinute && <div className="deadline-vignette" style={{ animationDelay: `-${vignetteDelay}ms` }} aria-hidden="true"/>}
    <AnimatePresence>{crowned && <Coronation key={crowned.id} name={playerName(crowned.winner, demo)} payout={crowned.payout}/>}</AnimatePresence>
    <section className="throne" aria-label="the throne">
      <motion.div className="crown-stage" key={`${latest?.id}-${onboarding.welcome}`} animate={reduced ? {} : { rotate: [0, -10, 7, -3, 0], y: [0, -12, 3, 0] }} transition={{ duration: .75 }}><Crown/></motion.div>
      <div className="holder-line">
        <AnimatePresence mode="popLayout"><motion.h1 className="holder-name" key={state.holder + latest?.id} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 18, rotate: 6, color: '#8A8A93', backgroundImage: 'none', WebkitTextFillColor: '#8A8A93' }} transition={{ duration: .35 }}>{empty ? 'the throne sits empty' : expired ? `${holder} won` : holder}</motion.h1></AnimatePresence>
        <span className="holder-sep" aria-hidden="true">·</span>
        <p className="taunt" title={state.taunt || undefined}>{empty ? 'somebody has to go first' : `“${state.taunt || 'too important to leave a message.'}”`}</p>
        {!empty && active && !expired && <><span className="holder-sep" aria-hidden="true">·</span><span className="bleed-tag" tabIndex={0} aria-label={`holding fee: $${money(holdFee(state, now))} taken so far, $${money(state.previousPrice * 200n / 600000n)} per minute`} data-tip={`holding fee · $${money(state.previousPrice * 200n / 600000n)}/min out of their refund`}>−${money(holdFee(state, now))}</span></>}
      </div>
      <div className="pot-section" aria-label={`pot $${money(displayPot)} usdc`}><PotNumber value={displayPot} announceKey={lastSettle?.id ?? latest?.id}/></div>
      <div className={`timer-section ${finalMinute ? 'urgent' : ''}`}><Countdown seconds={empty ? DURATION : remaining} audible={!onboarding.open && !empty && active}/></div>
      <div className="take-panel">
        <DomeButton label={label} price={showPrice ? Number(nextPrice) / 1e6 : undefined} ariaLabel={showPrice ? `${expired ? 'take the next throne' : 'take the throne'} for $${price}` : label} mode={mode} bounceKey={bounceKey} onActivate={open} paused={onboarding.open}/>
        {/* nobody wants to take? anyone can still close out the finished round and pay the winner */}
        {expired && settleable && action === 'take' && <button className="text-button settle-link" onClick={() => void game.settle()} disabled={!!game.phase}>or just start the next round</button>}
        {game.error && <p className="error-message" role="alert">{game.error}</p>}
      </div>
    </section>
    <dialog ref={modalRef} className="take-modal" aria-label="leave a taunt" onClick={e => { if (e.target === e.currentTarget) setComposing(false); }}>
      <form onSubmit={confirm}>
        <label className="taunt-field"><input aria-label="your taunt" placeholder="say something regrettable" value={taunt} onChange={e => setTaunt(e.target.value)} maxLength={280} autoFocus autoComplete="off" spellCheck={false}/><span className={bytes > 140 ? 'taunt-count is-over' : bytes > 120 ? 'taunt-count is-near' : 'taunt-count'}>{bytes}/140</span></label>
        <button type="submit" className="confirm-button" disabled={bytes > 140 || !!game.phase}>take it for ${price}<ArrowRight size={20}/></button>
      </form>
    </dialog>
    <AnimatePresence>{toast && latest && <motion.div className="eviction-toast" role="status" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}><div><strong>you&apos;ve been usurped.</strong><p>${money(latest.refundPaid)} is back in your pocket.</p></div><a href={evictionLinks(latest, demo, origin).share} target="_blank" rel="noreferrer" aria-label="share your eviction"><Share2 size={18}/></a><button onClick={() => setToast(false)} aria-label="dismiss notification"><X size={18}/></button></motion.div>}</AnimatePresence>
  </>;
}
