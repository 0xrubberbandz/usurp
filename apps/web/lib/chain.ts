import { defineChain } from 'viem';

// Canonical network: https://docs.monad.xyz/developer-essentials/testnet
export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'Monadscan', url: 'https://testnet.monadscan.com' } },
  testnet: true
});
export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || monadTestnet.rpcUrls.default.http[0];
