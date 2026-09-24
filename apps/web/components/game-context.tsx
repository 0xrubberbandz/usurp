'use client';

import { createContext, useContext } from 'react';
import type { Address } from 'viem';
import type { Round, TakeRecord, ClaimRecord } from '@/lib/game';

export type Wallet = { id: string; name: string; icon?: string };
export type Game = {
  state: Round; history: TakeRecord[]; claims: ClaimRecord[]; now: number; block: bigint;
  demo: boolean; loading: boolean; paused: boolean; address?: Address;
  /** connected, but on a chain other than monad testnet */
  wrongNetwork: boolean;
  /** test USDC balance of the connected wallet, 6 decimals */
  balance?: bigint;
  /** USDC the game contract may spend from the connected wallet, 6 decimals */
  allowance?: bigint;
  phase: string; error: string | null;
  wallets: Wallet[];
  /** price of the first take in every new round (an expired throne's next taker pays this) */
  startPrice: bigint;
  take: (taunt: string) => Promise<void>;
  /** settle a finished round: pays the holder and opens the next round; anyone can call it */
  settle: () => Promise<void>;
  connect: (id: string) => Promise<boolean>; disconnect: () => void; switchNetwork: () => Promise<void>;
  mint: () => Promise<void>;
  /** approve exactly the current take price (every take re-approves its own exact price, so a raced price can never overspend) */
  approve: () => Promise<void>; finishDemo?: () => void; resetDemo?: () => void;
};
export const GameContext = createContext<Game | null>(null);
export function useGame() {
  const game = useContext(GameContext);
  if (!game) throw new Error('Game provider is missing');
  return game;
}
