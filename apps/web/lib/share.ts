import { money, playerName, type TakeRecord, type ClaimRecord } from './game';
export function evictionLinks(event: TakeRecord, demo: boolean, origin: string) {
  const victim = playerName(event.prevHolder, demo), taker = playerName(event.taker, demo);
  const params = new URLSearchParams({ victim, taker, reign: String(event.reignSeconds), profit: money(event.refundPaid - event.prevPaid), taunt: event.taunt, pot: money(event.potAfter) });
  const card = `${origin}/api/og/eviction?${params}`;
  return { card, share: `https://twitter.com/intent/tweet?${new URLSearchParams({ text: `${victim} has been usurped. ${taker} took the throne. one throne. zero loyalty.`, url: card })}` };
}
export function winnerLinks(event: ClaimRecord, demo: boolean, origin: string) {
  const name = playerName(event.winner, demo);
  const card = `${origin}/api/og/winner?${new URLSearchParams({ name, payout: money(event.payout), round: String(event.roundId) })}`;
  return { card, share: `https://twitter.com/intent/tweet?${new URLSearchParams({ text: `long live ${name}. walked away with $${money(event.payout)} on usurp.`, url: card })}` };
}
