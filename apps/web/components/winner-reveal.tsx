'use client';
import { motion, useReducedMotion } from 'framer-motion';
import SlotCounter from 'react-slot-counter';
import { money } from '@/lib/game';

const FIGURE_SPACE = '\u2007'; // digit-width blank

// The one harsh slot-machine moment: every payout digit spins like a reel for ~1.4s, then the digits lock left to right,
// 80ms apart. Digits start as figure spaces (digit-width blanks) so no static zeros show while the stagger waits.
// Reduced motion gets a plain fade-in instead.
export function WinnerReveal({ payout }: { payout: bigint }) {
  const reduced = useReducedMotion();
  const text = `$${money(payout)}`;
  if (reduced) return <motion.span className="flood-payout" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .4 }}>{text}</motion.span>;
  return <span className="flood-payout" aria-label={text}>
    <SlotCounter value={text} startValue={text.replace(/\d/g, FIGURE_SPACE)} startValueOnce duration={1.4} delay={0.08} animateUnchanged dummyCharacterCount={14} useMonospaceWidth/>
  </span>;
}
