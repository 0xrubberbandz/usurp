import { parseAbiItem, type Address, type PublicClient } from 'viem';
import { ZERO, type TakeRecord, type ClaimRecord, DURATION } from './game';

export type Deployment = { chainId: number; usurp: Address; usdc: Address; house: Address; deploymentBlock: string };
const taken = parseAbiItem('event Taken(uint256 indexed roundId, address indexed taker, uint256 pricePaid, address indexed prevHolder, uint256 refundPaid, uint256 holdFeeCharged, uint256 potAfter, uint256 deadline, string taunt)');
const claimed = parseAbiItem('event Claimed(uint256 indexed roundId, address indexed winner, uint256 payout, uint256 rolledToNext)');

// Browser index with adaptive RPC pagination and a 64-block reorg overlap.
// For a long-running production game, persist this index on a server instead.
export function createIndexer() {
  let cursor: bigint | undefined;
  // Monad's public RPC caps eth_getLogs at 100 blocks per request; start there and remember any smaller size that works.
  let chunkSize = 100n;
  let cache: Awaited<ReturnType<PublicClient['getLogs']>> = [];
  const timestamps = new Map<bigint, number>();
  return async (client: PublicClient, deployment: Deployment, to: bigint) => {
    const start = BigInt(deployment.deploymentBlock);
    const from = cursor === undefined || to < cursor ? start : (cursor > start + 64n ? cursor - 64n : start);
    let block = from, chunk = chunkSize;
    const added: typeof cache = [];
    while (block <= to) {
      const end = block + chunk - 1n < to ? block + chunk - 1n : to;
      try {
        const logs = await client.getLogs({ address: deployment.usurp, events: [taken, claimed], fromBlock: block, toBlock: end });
        added.push(...logs); block = end + 1n;
      } catch (error) {
        if (chunk <= 1n) throw error;
        chunk = chunk / 2n; chunkSize = chunk;
      }
    }
    const next = [...cache.filter(log => log.blockNumber !== null && log.blockNumber < from), ...added];
    const history: TakeRecord[] = [], claims: ClaimRecord[] = [];
    const rounds = new Map<number, TakeRecord>();
    // Decode against the event union again to retain strict event types.
    const { decodeEventLog } = await import('viem');
    for (const log of next) {
      const decoded = decodeEventLog({ abi: [taken, claimed], data: log.data, topics: log.topics });
      const id = `${log.transactionHash}-${log.logIndex}`;
      const a = decoded.args;
      const roundId = Number(a.roundId);
      if (decoded.eventName === 'Taken') {
        const args = decoded.args;
        const previous = rounds.get(roundId);
        const timestamp = Number(args.deadline) - DURATION; // every take sets deadline = take time + round duration
        const event: TakeRecord = { id, roundId, taker: args.taker, prevHolder: args.prevHolder, pricePaid: args.pricePaid,
          prevPaid: previous?.pricePaid ?? 0n, refundPaid: args.refundPaid, holdFeeCharged: args.holdFeeCharged,
          potAfter: args.potAfter, deadline: Number(args.deadline), timestamp,
          reignSeconds: args.prevHolder === ZERO || !previous ? 0 : timestamp - previous.timestamp,
          taunt: args.taunt, txHash: log.transactionHash ?? undefined };
        history.push(event); rounds.set(roundId, event);
      } else {
        const args = decoded.args;
        const height = log.blockNumber!;
        if (!timestamps.has(height) || height >= from) timestamps.set(height, Number((await client.getBlock({ blockNumber: height })).timestamp));
        claims.push({ id, roundId, winner: args.winner, payout: args.payout, rolledToNext: args.rolledToNext, timestamp: timestamps.get(height)! });
      }
    }
    cache = next; cursor = to;
    return { history, claims };
  };
}
