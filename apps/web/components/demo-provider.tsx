'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GameContext } from './game-context';
import { canSettle, demoSnapshot, demoTake, nextTakePrice, pickChallenger, settleRound, DEMO_ADDRESS, DEMO_MAX_TAKES, DEMO_START_PRICE, TAUNTS, type ClaimRecord, type Round } from '@/lib/game';

// The demo "owner" tops up every new round (the contract's optional seed), so demo pots stay believable
// instead of shrinking to the 18% rollover each time.
const DEMO_TOPUP = 4_000_000000n;
const topUp = (round: Round): Round => ({ ...round, potBalance: round.potBalance + DEMO_TOPUP });

export function DemoProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(0);
  const [snapshot, setSnapshot] = useState(() => demoSnapshot(0));
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Simulated USDC approval: approving covers exactly one take at the next take's price; a take uses it up.
  const [allowance, setAllowance] = useState(0n);
  const [phase, setPhase] = useState('');
  // "enter demo" simulates a connected wallet; remembered so a returning visitor stays connected.
  const [connected, setConnected] = useState(false);
  useEffect(() => { try { setConnected(localStorage.getItem('usurp.demo-wallet') === '1'); } catch {} }, []);
  const remember = (on: boolean) => { try { if (on) localStorage.setItem('usurp.demo-wallet', '1'); else localStorage.removeItem('usurp.demo-wallet'); } catch {} setConnected(on); };
  const offset = useRef(0);
  const simNow = useCallback(() => Math.floor(Date.now() / 1000) + offset.current, []);
  const current = useRef(snapshot); current.current = snapshot;
  useEffect(() => {
    const t = simNow(); setNow(t); setSnapshot(demoSnapshot(t)); setReady(true);
    const tick = setInterval(() => setNow(simNow()), 250);
    return () => clearInterval(tick);
  }, [simNow]);

  // A take mirrors the contract: an expired throne is settled first and the taker opens the next round.
  const performTake = useCallback((player: typeof DEMO_ADDRESS, taunt: string) => {
    const t = simNow();
    try {
      const result = demoTake(current.current.round, player, taunt, t, BigInt(t) * 3n, DEMO_START_PRICE);
      let round = result.round, event = result.event;
      if (result.settled) { round = topUp(round); event = { ...event, potAfter: event.potAfter + DEMO_TOPUP }; setClaims(c => [...c, result.settled!]); }
      const value = { round, history: [...current.current.history, event] };
      current.current = value; setSnapshot(value); setNow(t); setError(null);
      if (player === DEMO_ADDRESS) setAllowance(0n);
    } catch (e) { setError((e as Error).message); }
  }, [simNow]);

  // Anyone can settle a finished round: the holder is paid and the next round opens right away.
  const settleNow = useCallback(() => {
    const t = simNow(), round = current.current.round;
    try {
      const next = settleRound(round, t, BigInt(t) * 3n, DEMO_START_PRICE);
      const value = { ...current.current, round: topUp(next.round) };
      current.current = value; setSnapshot(value); setClaims(c => [...c, next.event]); setNow(t); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [simNow]);

  // "preview a winner": jump the simulation clock past the deadline (and the block gate), then settle.
  const finish = useCallback(() => {
    const round = current.current.round;
    if (round.status !== 'active' || round.holder === '0x0000000000000000000000000000000000000000') return;
    offset.current += Math.max(0, round.deadline - simNow());
    settleNow();
  }, [simNow, settleNow]);

  // Bots take over every 20–60s; a finished round gets settled; after 14 takeovers the round is played out.
  useEffect(() => {
    if (!ready) return;
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timeout = setTimeout(() => {
        const { round, history } = current.current, t = simNow();
        if (canSettle(round, t, BigInt(t) * 3n)) settleNow();
        else if (history.filter(e => e.roundId === round.roundId).length >= DEMO_MAX_TAKES) finish();
        else performTake(pickChallenger(round.holder), TAUNTS[Math.floor(Math.random() * TAUNTS.length)]);
        schedule();
      }, 20000 + Math.random() * 40000);
    };
    schedule(); return () => clearTimeout(timeout);
  }, [performTake, finish, settleNow, simNow, ready]);

  // Simulated 10,000 test USDC, less what you paid, plus refunds and winnings.
  const balance = useMemo(() => {
    let b = 10_000_000000n;
    for (const e of snapshot.history) { if (e.taker === DEMO_ADDRESS) b -= e.pricePaid; if (e.prevHolder === DEMO_ADDRESS) b += e.refundPaid; }
    for (const c of claims) if (c.winner === DEMO_ADDRESS) b += c.payout;
    return b;
  }, [snapshot.history, claims]);
  return <GameContext.Provider value={{
    state: snapshot.round, history: snapshot.history, claims, now, block: BigInt(now) * 3n, startPrice: DEMO_START_PRICE,
    demo: true, loading: !ready, paused: false, address: connected ? DEMO_ADDRESS : undefined, wrongNetwork: false, balance: connected ? balance : undefined, allowance: connected ? allowance : undefined, phase, error, wallets: [],
    take: async taunt => performTake(DEMO_ADDRESS, taunt), settle: async () => settleNow(),
    connect: async () => { remember(true); return true; }, disconnect: () => { remember(false); setAllowance(0n); }, switchNetwork: async () => {}, mint: async () => {}, finishDemo: finish,
    approve: async () => { setPhase('approving usdc…'); await new Promise(r => setTimeout(r, 900)); setAllowance(nextTakePrice(current.current.round, simNow(), DEMO_START_PRICE)); setPhase(''); },
    resetDemo: () => {
      offset.current = 0; const t = simNow(); const next = demoSnapshot(t);
      current.current = next; setSnapshot(next); setNow(t); setClaims([]); setError(null);
    }
  }}>{children}</GameContext.Provider>;
}
