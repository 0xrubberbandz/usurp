'use client';
import NumberFlow, { NumberFlowGroup } from '@number-flow/react';
import { useEffect, useRef } from 'react';
import { timeLabel } from '@/lib/game';
import { EASE } from './pot-number';

const SPIN = { duration: 350, easing: EASE };
const TWO = { minimumIntegerDigits: 2 } as const;
const SECONDS_DIGITS = { 1: { max: 5 } }; // tens of seconds wrap 0 -> 5

// mm:ss from two NumberFlow instances: only the digits that change roll. Counting down rolls downward;
// a takeover reset back up to 05:00 rolls upward for that one transition.
export function Countdown({ seconds }: { seconds: number }) {
  const previous = useRef(seconds);
  const trend = seconds > previous.current ? 1 : -1;
  useEffect(() => { previous.current = seconds; }, [seconds]);
  return <div className="countdown" role="timer" aria-label={`${timeLabel(seconds)} left`}>
    <NumberFlowGroup>
      <NumberFlow value={Math.floor(seconds / 60)} format={TWO} trend={trend} spinTiming={SPIN} transformTiming={SPIN} aria-hidden="true"/>
      <span className="countdown-colon" aria-hidden="true">:</span>
      <NumberFlow value={seconds % 60} format={TWO} digits={SECONDS_DIGITS} trend={trend} spinTiming={SPIN} transformTiming={SPIN} aria-hidden="true"/>
    </NumberFlowGroup>
  </div>;
}
