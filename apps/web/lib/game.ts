import type { Address } from 'viem';

export const DURATION = 300; // 5 minutes, mirrors Usurp.ROUND_DURATION
export const MIN_BLOCKS = 300n;
export const DEMO_ADDRESS = '0x0000000000000000000000000000000000000001' as Address;
export const ZERO = '0x0000000000000000000000000000000000000000' as Address;
export type Round = {
  roundId: number; holder: Address; currentPrice: bigint; previousPrice: bigint;
  potBalance: bigint; deadline: number; lastTakeoverBlock: bigint; holderSince: number;
  taunt: string; status: 'pending' | 'active' | 'ended';
};
export type TakeRecord = {
  id: string; roundId: number; taker: Address; prevHolder: Address; pricePaid: bigint;
  prevPaid: bigint; refundPaid: bigint; holdFeeCharged: bigint; potAfter: bigint;
  deadline: number; timestamp: number; reignSeconds: number; taunt: string; txHash?: string;
};
export type ClaimRecord = { id: string; roundId: number; winner: Address; payout: bigint; rolledToNext: bigint; timestamp: number };
export const EMPTY_ROUND: Round = { roundId: 0, holder: ZERO, currentPrice: 0n, previousPrice: 0n, potBalance: 0n, deadline: 0, lastTakeoverBlock: 0n, holderSince: 0, taunt: '', status: 'pending' };
export function holdFee(round: Round, now: number): bigint {
  if (round.holder === ZERO || round.status !== 'active') return 0n;
  const elapsed = BigInt(Math.max(0, Math.min(183600, Math.floor(now - round.holderSince))));
  return round.previousPrice * 200n * elapsed / 36000000n;
}
/** The clock has run out on a held throne; it can be settled once the 300-block gate is met. */
export function isExpired(round: Round, now: number) { return round.status === 'active' && round.holder !== ZERO && now >= round.deadline; }
export function canSettle(round: Round, now: number, block: bigint) { return isExpired(round, now) && block >= round.lastTakeoverBlock + MIN_BLOCKS; }
/** What the next take costs: an expired throne is settled first, so its taker pays the next round's start price. */
export function nextTakePrice(round: Round, now: number, startPrice: bigint) { return isExpired(round, now) ? startPrice : round.currentPrice; }

export function takeRound(round: Round, taker: Address, taunt: string, now: number, block: bigint): { round: Round; event: TakeRecord } {
  if (round.status !== 'active' || (round.holder !== ZERO && now >= round.deadline)) throw new Error('the round has expired.');
  if (Array.from(taunt).length > 140) throw new Error('keep the taunt under 140 characters.');
  const paid = round.currentPrice;
  const fee = holdFee(round, now);
  const refund = round.holder === ZERO ? 0n : round.previousPrice * 10200n / 10000n - fee;
  const pot = round.potBalance + paid - paid * 250n / 10000n - refund;
  const next = { ...round, holder: taker, currentPrice: paid * 135n / 100n, previousPrice: paid, potBalance: pot, deadline: now + DURATION, holderSince: now, lastTakeoverBlock: block, taunt };
  return { round: next, event: { id: `${round.roundId}-${block}`, roundId: round.roundId, taker, prevHolder: round.holder, pricePaid: paid, prevPaid: round.previousPrice, refundPaid: refund, holdFeeCharged: fee, potAfter: pot, deadline: next.deadline, timestamp: now, reignSeconds: round.holder === ZERO ? 0 : now - round.holderSince, taunt } };
}
/** Mirrors Usurp.settle(): pays the holder, then opens the next round with the rollover as its pot and no clock. */
export function settleRound(round: Round, now: number, block: bigint, startPrice: bigint): { round: Round; event: ClaimRecord } {
  if (round.status !== 'active') throw new Error('the round is not active.');
  if (round.holder === ZERO) throw new Error('there is nothing to settle.');
  if (now < round.deadline) throw new Error('the reign is not over.');
  if (block < round.lastTakeoverBlock + MIN_BLOCKS) throw new Error('waiting for 300 blocks.');
  const gross = round.potBalance * 8200n / 10000n;
  const accrued = holdFee(round, now);
  const payout = gross - (accrued > gross ? gross : accrued);
  const rolledToNext = round.potBalance - payout;
  const next: Round = { ...EMPTY_ROUND, roundId: round.roundId + 1, status: 'active', currentPrice: startPrice, potBalance: rolledToNext };
  return { round: next, event: { id: `claim-${round.roundId}`, roundId: round.roundId, winner: round.holder, payout, rolledToNext, timestamp: now } };
}
/** Mirrors Usurp.take(): taking an expired throne settles it first, then the taker opens the next round. */
export function takeOrSettle(round: Round, taker: Address, taunt: string, now: number, block: bigint, startPrice: bigint): { round: Round; event: TakeRecord; settled?: ClaimRecord } {
  if (isExpired(round, now)) {
    const settled = settleRound(round, now, block, startPrice);
    return { ...takeRound(settled.round, taker, taunt, now, block), settled: settled.event };
  }
  return takeRound(round, taker, taunt, now, block);
}
export function money(value: bigint, digits = 2) {
  return (Number(value) / 1e6).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function timeLabel(seconds: number) {
  const n = Math.max(0, Math.floor(seconds));
  return `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`;
}
const demoNames = ['you', 'exit_liquidity', 'almost_royalty', 'last_buyer', 'tiny_emperor', 'sleepywhale', 'taxes_due', 'chair_enjoyer', 'no_refunds', 'your_ex', 'monad_monk', 'very_humble', 'probably_early', 'paper_crown', 'bad_decisions'];
export const DEMO_PLAYERS = demoNames.slice(1).map((_, index) => `0x${(index + 2).toString(16).padStart(40, '0')}` as Address);
export function playerName(address: string, demo = false) {
  if (address === ZERO) return 'nobody';
  if (demo) { const index = Number(BigInt(address)) - 1; if (demoNames[index]) return demoNames[index]; }
  return `${address.slice(0, 6)}…${address.slice(-4)}`.toLowerCase();
}
export const TAUNTS = ['this chair has excellent lumbar support.', 'generational wealth. temporary seating.', 'mom said it is my turn on the throne.', 'financial advice: nice chair.', 'i have nowhere else to be.', 'a perfectly reasonable use of money.', 'please respect my brief authority.'];
// Demo rounds stay believable: $10 start, a $5,000 seed, and at most 14 takeovers before the round ends,
// so pots land between roughly $3k and $15k instead of escalating into six figures.
export const DEMO_MAX_TAKES = 14;
export const DEMO_OPENING_TAKES = 8;
export const DEMO_SEED = 5_000_000000n;
export const DEMO_START_PRICE = 10_000000n;
// Bots never pick the current holder, and never the local user.
export function pickChallenger(holder: Address, random: () => number = Math.random) {
  const candidates = DEMO_PLAYERS.filter(p => p.toLowerCase() !== holder.toLowerCase());
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}
// The contract allows self-takes; the demo does not, so taker and victim are always distinct. Taking an expired
// throne you held yourself is fine: it settles your win and you open the next round.
export function demoTake(round: Round, taker: Address, taunt: string, now: number, block: bigint, startPrice = DEMO_START_PRICE) {
  if (!isExpired(round, now) && round.holder !== ZERO && taker.toLowerCase() === round.holder.toLowerCase()) throw new Error('you already hold the throne.');
  return takeOrSettle(round, taker, taunt, now, block, startPrice);
}
export function demoSnapshot(now: number, roundId = 1) {
  let round: Round = { ...EMPTY_ROUND, roundId, status: 'active', currentPrice: DEMO_START_PRICE, potBalance: DEMO_SEED };
  const history: TakeRecord[] = [];
  for (let i = 0; i < DEMO_OPENING_TAKES; i++) {
    const result = demoTake(round, DEMO_PLAYERS[(i + roundId * 3) % DEMO_PLAYERS.length], TAUNTS[i % TAUNTS.length], now - (DEMO_OPENING_TAKES - i) * 46, BigInt(1000 + i * 115));
    round = result.round; history.push(result.event);
  }
  return { round, history };
}

