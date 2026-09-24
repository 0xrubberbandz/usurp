import { describe, it, expect } from 'vitest';
import { settleRound, takeOrSettle, demoSnapshot, demoTake, pickChallenger, DEMO_ADDRESS, DEMO_MAX_TAKES, DEMO_OPENING_TAKES, DEMO_PLAYERS, EMPTY_ROUND, holdFee, takeRound, type Round, type TakeRecord } from './game';

describe('demo mirrors contract accounting', () => {
  it('conserves every token across 18 takeovers and a winning claim', () => {
    let round = { ...EMPTY_ROUND, status: 'active' as const, roundId: 1, currentPrice: 10000000n, potBalance: 1000000000n };
    let incoming = round.potBalance, outgoing = 0n;
    for (let i = 0; i < 18; i++) {
      const result = takeRound(round, DEMO_ADDRESS, '', 1000 + i * 30, BigInt(i + 1));
      incoming += result.event.pricePaid;
      outgoing += result.event.refundPaid + result.event.pricePaid * 250n / 10000n;
      round = result.round as typeof round;
    }
    const result = settleRound(round, round.deadline, round.lastTakeoverBlock + 300n, 10000000n);
    expect(incoming).toBe(outgoing + result.event.payout + result.event.rolledToNext);
  });
  it('enforces both settle gates, expiry and the taunt character limit', () => {
    const { round } = demoSnapshot(5000);
    expect(() => settleRound(round, round.deadline - 1, 100000n, 10000000n)).toThrow();
    expect(() => settleRound(round, round.deadline, round.lastTakeoverBlock + 299n, 10000000n)).toThrow();
    expect(() => takeRound(round, DEMO_ADDRESS, '', round.deadline, 100000n)).toThrow();
    expect(() => takeRound(round, DEMO_ADDRESS, 'é'.repeat(141), 5000, 100000n)).toThrow();
    expect(() => takeRound(round, DEMO_ADDRESS, 'é'.repeat(140), 5000, 100000n)).not.toThrow();
    expect(holdFee(round, round.holderSince + 999999)).toBe(round.previousPrice * 10200n / 10000n);
  });
  it('retains hold fees in rollover', () => {
    const { round } = demoSnapshot(5000);
    const { event } = settleRound(round, round.deadline, round.lastTakeoverBlock + 300n, 10000000n);
    expect(event.payout).toBe(round.potBalance * 8200n / 10000n - holdFee(round, round.deadline));
  });

});

describe('rounds chain without an operator', () => {
  it('settle pays the holder and opens the next round with the rollover and no clock', () => {
    const { round } = demoSnapshot(5000);
    const { round: next, event } = settleRound(round, round.deadline, round.lastTakeoverBlock + 300n, 10000000n);
    expect(next.roundId).toBe(round.roundId + 1);
    expect(next.status).toBe('active');
    expect(next.holder).toBe('0x0000000000000000000000000000000000000000');
    expect(next.deadline).toBe(0);
    expect(next.currentPrice).toBe(10000000n);
    expect(next.potBalance).toBe(event.rolledToNext);
    expect(event.winner).toBe(round.holder);
  });
  it('taking an expired throne settles it first and the taker opens the next round at the start price', () => {
    const { round } = demoSnapshot(5000);
    const result = takeOrSettle(round, DEMO_ADDRESS, 'mine now.', round.deadline, round.lastTakeoverBlock + 300n, 10000000n);
    expect(result.settled?.winner).toBe(round.holder);
    expect(result.round.roundId).toBe(round.roundId + 1);
    expect(result.round.holder).toBe(DEMO_ADDRESS);
    expect(result.event.pricePaid).toBe(10000000n);
    expect(result.event.prevHolder).toBe('0x0000000000000000000000000000000000000000');
  });
});

describe('demo engine', () => {
  it('never lets a player evict themselves across 50 simulated takeovers', () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let { round, history } = demoSnapshot(10_000);
    let t = 10_000, events: TakeRecord[] = [...history], pots: bigint[] = [];
    while (events.length < 50) {
      const count = history.filter(e => e.roundId === round.roundId).length;
      if (count >= DEMO_MAX_TAKES) {
        pots.push(round.potBalance);
        const next = demoSnapshot(t, round.roundId + 1); round = next.round; history = next.history; events.push(...next.history);
        continue;
      }
      t += 30;
      // The local user joins a third of the time, but only when they are not already holding.
      const taker = random() < .33 && round.holder !== DEMO_ADDRESS ? DEMO_ADDRESS : pickChallenger(round.holder, random);
      const result = demoTake(round, taker, 'hi', t, BigInt(t) * 3n);
      round = result.round as Round; history = [...history, result.event]; events.push(result.event);
    }
    for (const event of events) expect(event.taker.toLowerCase()).not.toBe(event.prevHolder.toLowerCase());
    expect(events.filter(e => e.taker === DEMO_ADDRESS).every(e => e.prevHolder !== DEMO_ADDRESS)).toBe(true);
    for (const pot of pots) { expect(pot).toBeGreaterThanOrEqual(3_000_000000n); expect(pot).toBeLessThanOrEqual(15_000_000000n); }
    expect(pots.length).toBeGreaterThan(0);
  });
  it('rejects self-takes and keeps bots off the holder and the local user', () => {
    const { round } = demoSnapshot(5000);
    expect(() => demoTake(round, round.holder, '', 5000, 1n)).toThrow();
    for (let i = 0; i < 200; i++) { const pick = pickChallenger(round.holder); expect(pick).not.toBe(round.holder); expect(pick).not.toBe(DEMO_ADDRESS); expect(DEMO_PLAYERS).toContain(pick); }
  });
  it('caps prices so a full demo round stays under $1,000 a take', () => {
    let { round } = demoSnapshot(5000);
    for (let i = DEMO_OPENING_TAKES; i < DEMO_MAX_TAKES; i++) round = demoTake(round, pickChallenger(round.holder), '', 5000 + i * 30, BigInt(i)).round;
    expect(round.currentPrice).toBeLessThan(1_000_000000n);
  });
});
