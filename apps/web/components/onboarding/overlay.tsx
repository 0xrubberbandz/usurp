'use client';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Check, Wallet, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useGame } from '../game-context';
import { money, nextTakePrice, playerName } from '@/lib/game';
import { isCountryBlocked } from '@/lib/geofence';
import { walletRows } from '@/lib/wallets';
import { useOnboarding } from './context';
import { MiniCrown, StepClock, StepHonest, StepPot, StepPrice, StepRefund, StepThrone, StepTake, StepWin } from './steps';

const EASE = [0.22, 1, 0.36, 1] as const;
type Step = { title: string; copy: ReactNode; visual: (reduced: boolean) => ReactNode };
// Steps 1-8 are the practice-round walkthrough; 9 connects a wallet; 10 approves USDC for the first take.
const WALKTHROUGH_END = 8, CONNECT = 9, APPROVE = 10;

// Step 9: connect. Real wallets in live mode (installed ones connect, missing ones link to their download page);
// in demo mode the same rows simulate a connection and nothing is signed.
function ConnectStep({ reduced, onConnected, onWatch, connectOnly }: { reduced: boolean; onConnected: () => void; onWatch: () => void; connectOnly: boolean }) {
  const game = useGame();
  const [busy, setBusy] = useState<string | null>(null);
  const [jolt, setJolt] = useState(0);
  const attempted = useRef(false);
  const blocked = isCountryBlocked();
  const ready = !!game.address && !game.wrongNetwork;
  const rows = walletRows(game.wallets, game.demo);
  // A short confirmation beat after connecting: address under the crown, one jolt, then onward after 800ms.
  useEffect(() => {
    if (!ready || !attempted.current) return;
    setJolt(j => j + 1);
    const id = setTimeout(onConnected, 800); return () => clearTimeout(id);
  }, [ready, onConnected]);
  async function connect(key: string, id: string) { attempted.current = true; setBusy(key); await game.connect(id); setBusy(null); }
  async function switchNetwork() { attempted.current = true; setBusy('switch'); await game.switchNetwork(); setBusy(null); }
  return <div className="ob-connect">
    <MiniCrown jolt={jolt} size={64} reduced={reduced}/>
    <h2 className="ob-hero">take your seat.</h2>
    {game.address ? <span className="ob-address numeric">{playerName(game.address)} connected</span> : <p className="ob-copy">connect a wallet to play.</p>}
    {blocked ? <p className="ob-copy" role="alert">this game is not available in your country.</p>
      : game.address && game.wrongNetwork ? <button className="ob-wallet ob-wallet-primary" onClick={() => void switchNetwork()} disabled={!!busy}><span className="ob-wallet-name ob-network"><img src="/tokens/monad.svg" alt="" width={24} height={24}/>{busy ? 'check your wallet…' : 'switch to monad testnet'}</span><ArrowRight size={18}/></button>
      : game.address ? (attempted.current ? null : <button className="ob-wallet ob-wallet-primary" onClick={onConnected}>continue as {playerName(game.address)}<ArrowRight size={18}/></button>)
      : <div className="ob-wallets">
        {rows.map(w => w.connectId
          ? <button key={w.key} className="ob-wallet" onClick={() => void connect(w.key, w.connectId!)} disabled={!!busy}>
            {w.icon ? <img src={w.icon} alt="" width={32} height={32}/> : <span className="ob-wallet-blank"><Wallet size={18}/></span>}
            <span className="ob-wallet-name">{busy === w.key ? 'check your wallet…' : w.name}</span>
            {w.detected && !game.demo && w.key !== 'walletconnect' && <span className="ob-wallet-tag">detected</span>}
          </button>
          : <a key={w.key} className="ob-wallet is-missing" href={w.install} target="_blank" rel="noreferrer">
            <img src={w.icon} alt="" width={32} height={32}/><span className="ob-wallet-name">{w.name}</span><span className="ob-wallet-tag">get it<ArrowUpRight size={13}/></span>
          </a>)}
      </div>}
    {game.error && <p className="ob-error" role="alert">{game.error}</p>}
    {!game.address && <button className="ob-link" onClick={onWatch}>{connectOnly ? 'not now' : 'just watching'}</button>}
    <span className="ob-fine">{game.demo && 'demo mode: nothing is signed. '}a game of chance. not available where prohibited.</span>
  </div>;
}

// Step 10: approve. The throne is paid in USDC, so the game contract needs permission to spend it. This approves
// exactly one take at the current price; every later take asks for its own exact price, so a price that jumps while
// the wallet is open can never spend more than you saw.
function ApproveStep({ onDone }: { onDone: () => void }) {
  const game = useGame();
  const price = nextTakePrice(game.state, game.now, game.startPrice);
  const approved = game.allowance !== undefined && price > 0n && game.allowance >= price;
  const balanceKnown = game.demo || game.balance !== undefined;
  const short = !game.demo && game.balance !== undefined && game.balance < price;
  return <div className="ob-connect ob-approve">
    <div className="ob-token">
      <img className="ob-token-mark" src="/tokens/usdc.svg" alt="usdc" width={46} height={46}/>
      <div className="ob-token-rows">
        <div><span>spending cap</span><span className="ob-num ob-amount"><img src="/tokens/usdc.svg" alt="" width={15} height={15}/>{money(price)}</span></div>
        <div><span>covers</span><span>your next take, exactly</span></div>
        <div><span>your balance</span><span className="ob-num ob-amount">{game.balance !== undefined ? <><img src="/tokens/usdc.svg" alt="" width={15} height={15}/>{money(game.balance)}</> : '—'}</span></div>
      </div>
    </div>
    <h2 className="ob-hero">approve usdc.</h2>
    <p className="ob-copy">the throne is paid in usdc. approve exactly one take. every take after asks again for its own price, so a price jump can never spend more than you saw.{game.demo && <span className="ob-demo-note"> demo mode: nothing is signed.</span>}</p>
    {approved
      ? <div className="ob-approved"><Check size={18}/>approved for ${money(price)}</div>
      : short
        ? <button className="ob-wallet ob-wallet-primary" onClick={() => void game.mint()} disabled={!!game.phase}>{game.phase || 'get 10,000 test usdc'}<ArrowRight size={18}/></button>
        : <button className="ob-wallet ob-wallet-primary" onClick={() => void game.approve()} disabled={!!game.phase || !game.address || !balanceKnown}>{game.phase || (balanceKnown ? `approve $${money(price)}` : 'checking your balance…')}<ArrowRight size={18}/></button>}
    {game.error && <p className="ob-error" role="alert">{game.error}</p>}
    {!approved && <button className="ob-link" onClick={onDone}>approve later</button>}
  </div>;
}

export function OnboardingOverlay() {
  const { open, mode, finish } = useOnboarding();
  const game = useGame();
  const reduced = !!useReducedMotion();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [taken, setTaken] = useState(false);
  const touch = useRef<number | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const hasWallet = !!game.address && !game.wrongNetwork;
  // The walkthrough always starts at the beginning; "connect" from the header opens only the wallet steps.
  useEffect(() => { if (open) { setStep(mode === 'connect' ? CONNECT : 1); setTaken(false); requestAnimationFrame(() => stage.current?.focus()); } }, [open, mode]);

  const steps: Step[] = [
    { title: 'one throne.', copy: 'one throne. one holder at a time. everyone can see who’s sitting on it.', visual: r => <StepThrone reduced={r}/> },
    { title: 'anyone can take it.', copy: 'pay the price and it’s yours. instantly. no auction, no permission.', visual: r => <StepTake reduced={r} taken={taken} onTake={() => setTaken(true)}/> },
    { title: 'the price climbs.', copy: 'every takeover makes the next one cost 1.35x more.', visual: r => <StepPrice reduced={r}/> },
    { title: 'get booted, get paid.', copy: 'if someone takes the throne from you, you get back what you paid plus 2%. getting kicked out is profitable.', visual: r => <StepRefund reduced={r}/> },
    { title: 'the clock.', copy: 'every takeover resets the clock to 5 minutes.', visual: r => <StepClock reduced={r}/> },
    { title: 'the pot.', copy: 'part of every takeover feeds the pot. the pot only grows.', visual: r => <StepPot reduced={r}/> },
    { title: 'outlast everyone.', copy: 'if the clock runs out while you hold the throne, you take the pot.', visual: r => <StepWin reduced={r}/> },
    { title: 'the honest part.', copy: <>the money comes from the next person. later takers fund earlier holders’ 2%, whoever holds the throne when the clock runs out takes the pot, and the house takes 2.5% of every takeover. there is no yield, and no guarantee anyone comes after you. while you sit on the throne, a small fee drains from your position into the pot every minute. sitting still costs you.</>, visual: r => <StepHonest reduced={r}/> }
  ];
  const first = mode === 'connect' ? CONNECT : 1;
  const walkthrough = step <= WALKTHROUGH_END;
  const canNext = walkthrough && !(step === 2 && !taken);
  const go = useCallback((to: number) => { setDirection(to > step ? 1 : -1); setStep(to); }, [step]);
  const done = useCallback(() => finish(mode === 'full'), [finish, mode]);
  const next = useCallback(() => { if (canNext) go(step + 1); }, [canNext, step, go]);
  const back = useCallback(() => { if (step > first) go(step - 1); }, [step, first, go]);
  const connected = useCallback(() => go(APPROVE), [go]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea') || (e.key === 'Enter' && target.closest('button, a'))) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [open, next, back]);

  const current = walkthrough ? steps[step - 1] : null;
  const nextPrice = nextTakePrice(game.state, game.now, game.startPrice);
  const approved = game.allowance !== undefined && nextPrice > 0n && game.allowance >= nextPrice;
  const slide = { enter: (d: number) => ({ opacity: 0, x: reduced ? 0 : 24 * d }), center: { opacity: 1, x: 0 }, exit: (d: number) => ({ opacity: 0, x: reduced ? 0 : -24 * d }) };
  const dots = mode === 'connect' ? [CONNECT, APPROVE] : Array.from({ length: APPROVE }, (_, i) => i + 1);
  return <AnimatePresence>{open && <motion.div className="ob" role="dialog" aria-modal="true" aria-label="how usurp works" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.5, ease: EASE }}
    onPointerDown={e => { if (e.pointerType !== 'mouse') touch.current = e.clientX; }}
    onPointerUp={e => { if (touch.current === null) return; const dx = e.clientX - touch.current; touch.current = null; if (Math.abs(dx) > 50) { if (dx < 0) next(); else back(); } }}>
    <div className="ob-top">
      {walkthrough ? <span className="ob-chip">practice round</span> : <span/>}
      {mode === 'connect' ? <button className="ob-link" onClick={() => finish(false)} aria-label="close"><X size={18}/></button>
        : walkthrough ? <button className="ob-link" onClick={() => go(CONNECT)}>skip</button> : <span/>}
    </div>
    <div className="ob-stage" ref={stage} tabIndex={-1}>
      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.section key={step} className={`ob-step ob-step-${step}`} custom={direction} variants={slide} initial="enter" animate="center" exit="exit" transition={{ duration: reduced ? 0 : 0.4, ease: EASE }}>
          {step === CONNECT ? <ConnectStep reduced={reduced} onConnected={connected} onWatch={done} connectOnly={mode === 'connect'}/>
            : step === APPROVE ? <ApproveStep onDone={done}/>
            : <>
              <div className="ob-visual"><div className="ob-visual-play">{current!.visual(reduced)}</div></div>
              <h2 className="ob-title">{current!.title}</h2>
              <p className={step === WALKTHROUGH_END ? 'ob-copy ob-copy-long' : 'ob-copy'}>{current!.copy}</p>
            </>}
        </motion.section>
      </AnimatePresence>
    </div>
    <div className="ob-nav">
      <span className="ob-nav-side">{step > first && step !== APPROVE && <button className="ob-link" onClick={back}>back</button>}</span>
      <span className="ob-dots" aria-hidden="true">{dots.map(i => <span key={i} className={i === step ? 'ob-dot is-on' : 'ob-dot'}/>)}</span>
      <span className="ob-nav-side ob-nav-right">
        {walkthrough && <button className="ob-next" onClick={next} disabled={!canNext}>{step === WALKTHROUGH_END ? (hasWallet ? 'continue' : 'connect wallet') : 'next'}<ArrowRight size={17}/></button>}
        {step === APPROVE && <button className="ob-next" onClick={done} disabled={!approved}>take your seat<ArrowRight size={17}/></button>}
      </span>
    </div>
  </motion.div>}</AnimatePresence>;
}
