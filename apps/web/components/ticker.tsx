'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from './game-context';
import { money, playerName, ZERO } from '@/lib/game';

// One line, fixed to the bottom edge: the most recent takeover slides in from the right.
export function Ticker() {
  const { history, claims, demo } = useGame();
  const latest = history.at(-1);
  // A settle newer than the latest takeover is the headline: the round was won and the next one opened.
  const settled = claims.at(-1);
  const showSettle = !!settled && (!latest || settled.timestamp >= latest.timestamp);
  const profit = latest ? latest.refundPaid - latest.prevPaid : 0n;
  return <aside className="ticker" aria-label="recent takeovers">
    <span className="status-dot" aria-hidden="true"/>
    <div className="ticker-track">
      <AnimatePresence mode="popLayout" initial={false}>
        {showSettle ? <motion.span className="ticker-line" key={settled!.id} initial={{ x: 56, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -32, opacity: 0 }} transition={{ duration: .45, ease: 'easeOut' }}>
          long live <strong>{playerName(settled!.winner, demo)}</strong><span className="ticker-sep">·</span>won <span className="numeric ticker-profit">${money(settled!.payout)}</span><span className="ticker-sep">·</span>round {settled!.roundId + 1} is open
        </motion.span> : latest ? <motion.span className="ticker-line" key={latest.id} initial={{ x: 56, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -32, opacity: 0 }} transition={{ duration: .45, ease: 'easeOut' }}>
          <strong>{playerName(latest.taker, demo)}</strong> took the throne for <span className="numeric">${money(latest.pricePaid)}</span>
          <span className="ticker-sep">·</span>
          {latest.prevHolder === ZERO ? 'first in' : <>{playerName(latest.prevHolder, demo)} <span className={`numeric ${profit < 0n ? 'ticker-loss' : 'ticker-profit'}`}>{profit < 0n ? '-' : '+'}${money(profit < 0n ? -profit : profit)}</span></>}
        </motion.span> : <span className="ticker-line" key="empty">no takeovers yet</span>}
      </AnimatePresence>
    </div>
  </aside>;
}
