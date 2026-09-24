'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { WagmiProvider, createConfig, http, useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createPublicClient, erc20Abi, isAddress, numberToHex, parseAbi, type Address, type EIP1193Provider } from 'viem';
import { monadTestnet, rpcUrl } from '@/lib/chain';
import { usurpAbi } from '@/lib/abi';
import { createIndexer, type Deployment } from '@/lib/indexer';
import { EMPTY_ROUND, nextTakePrice, type Round } from '@/lib/game';
import { GameContext } from './game-context';

// Injected wallets (MetaMask, Rabby, Phantom and others) are discovered through EIP-6963 with their real icons;
// the generic injected() connector covers wallets that do not announce themselves. WalletConnect needs a project id.
const walletConnectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const config = createConfig({
  chains: [monadTestnet], multiInjectedProviderDiscovery: true, ssr: true,
  connectors: [injected(), ...(walletConnectId ? [walletConnect({ projectId: walletConnectId, showQrModal: true, metadata: { name: 'usurp', description: 'one throne. zero loyalty.', url: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000', icons: [] } })] : [])],
  transports: { [monadTestnet.id]: http(rpcUrl) }
});
const client = createPublicClient({ chain: monadTestnet, transport: http(rpcUrl), pollingInterval: 3000 });
// Contract reverts arrive as raw selectors; translate the ones a player can hit into plain words.
const REVERTS: [RegExp, string][] = [
  [/0xe450d38c|ERC20InsufficientBalance/i, 'not enough test usdc for this take. use "get 10,000 test usdc" first.'],
  [/0xfb8f41b2|ERC20InsufficientAllowance/i, 'the usdc approval is lower than the price. take again to approve the new price.'],
  [/user rejected|denied transaction|rejected the request/i, 'you cancelled it in your wallet. nothing was sent.'],
  [/insufficient funds/i, 'not enough mon for gas. get test mon from faucet.monad.xyz.'],
  [/TooFewBlocks/i, 'the round just ended. it can be settled in a moment, once 300 blocks have passed.'],
  [/NothingToSettle/i, 'there is no finished round to settle right now.'],
  [/DeadlineNotPassed/i, 'the clock has not run out yet.']
];
function friendlyError(e: unknown) {
  const raw = e as { shortMessage?: string; message?: string; details?: string };
  const text = [raw.shortMessage, raw.details, raw.message].filter(Boolean).join(' ');
  const known = REVERTS.find(([pattern]) => pattern.test(text));
  return known ? known[1] : (raw.shortMessage || raw.message || 'the transaction did not go through.').toLowerCase();
}

export default function LiveProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <WagmiProvider config={config}><QueryClientProvider client={queryClient}><LiveGame>{children}</LiveGame></QueryClientProvider></WagmiProvider>;
}
function LiveGame({ children }: { children: ReactNode }) {
  const { address, chainId, connector } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  // Everyone counts down against chain time: the offset between the latest block's timestamp and this device's clock
  // is measured on every state poll, so a device clock that is off by seconds (or minutes) still shows the true timer.
  const chainOffset = useRef(0);
  const chainNow = () => Math.floor(Date.now() / 1000) + chainOffset.current;
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [phase, setPhase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  useEffect(() => { const interval = setInterval(() => setNow(chainNow()), 250); return () => clearInterval(interval); }, []);
  const deploymentQuery = useQuery({ queryKey: ['deployment'], retry: false, queryFn: async () => {
    const response = await fetch(process.env.NEXT_PUBLIC_DEPLOYMENT_URL || '/deployments/monad-testnet.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('deployment manifest could not be loaded.');
    const json = await response.json();
    if (json.chainId !== 10143 || !isAddress(json.usurp ?? '') || !isAddress(json.usdc ?? '') || !/^\d+$/.test(json.deploymentBlock)) throw new Error('the throne is not deployed yet. run the monad testnet deployment first.');
    return json as Deployment;
  } });
  const deployment = deploymentQuery.data;
  const stateQuery = useQuery({ queryKey: ['round', deployment?.usurp], enabled: !!deployment, refetchInterval: 3000, queryFn: async () => {
    const block = await client.getBlock();
    // Blocks land every ~0.4s on Monad, so the newest block's timestamp is chain time to within a second.
    chainOffset.current = Number(block.timestamp) - Math.floor(Date.now() / 1000);
    const [s, paused, startPrice] = await Promise.all([
      client.readContract({ address: deployment!.usurp, abi: usurpAbi, functionName: 'getState', blockNumber: block.number }),
      client.readContract({ address: deployment!.usurp, abi: usurpAbi, functionName: 'paused', blockNumber: block.number }),
      client.readContract({ address: deployment!.usurp, abi: usurpAbi, functionName: 'startPrice', blockNumber: block.number })
    ]);
    const state: Round = { ...s, roundId: Number(s.roundId), deadline: Number(s.deadline), holderSince: Number(s.holderSince), status: (['pending', 'active', 'ended'] as const)[s.status] };
    return { state, paused, startPrice, block: block.number };
  } });
  const index = useMemo(() => createIndexer(), [deployment?.usurp]);
  const historyQuery = useQuery({ queryKey: ['history', deployment?.usurp], enabled: !!deployment, refetchInterval: 3000, queryFn: async () => index(client, deployment!, await client.getBlockNumber({ cacheTime: 0 })) });
  const balanceQuery = useQuery({ queryKey: ['balance', deployment?.usdc, address], enabled: !!deployment && !!address, refetchInterval: 6000, queryFn: () => client.readContract({ address: deployment!.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [address!] }) });
  const allowanceQuery = useQuery({ queryKey: ['allowance', deployment?.usdc, address], enabled: !!deployment && !!address, refetchInterval: 6000, queryFn: () => client.readContract({ address: deployment!.usdc, abi: erc20Abi, functionName: 'allowance', args: [address!, deployment!.usurp] }) });
  const refetchState = stateQuery.refetch, refetchHistory = historyQuery.refetch, refetchBalance = balanceQuery.refetch, refetchAllowance = allowanceQuery.refetch;
  useEffect(() => {
    if (!deployment) return;
    return client.watchContractEvent({ address: deployment.usurp, abi: usurpAbi, pollingInterval: 3000, onLogs: logs => {
      if (logs.some(l => ['Taken', 'Claimed', 'Seeded', 'RoundStarted', 'Paused', 'Unpaused'].includes(l.eventName))) { void refetchState(); void refetchHistory(); }
    } });
  }, [deployment, refetchState, refetchHistory]);

  async function transact(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true; setError(null);
    try {
      if (!deployment) throw new Error('the contract has not been deployed.');
      if (!address) throw new Error('connect a wallet first.');
      if (chainId !== monadTestnet.id) { setPhase('switching to monad…'); await switchChainAsync({ chainId: monadTestnet.id }); }
      await action();
      await Promise.all([refetchState(), refetchHistory(), refetchBalance(), refetchAllowance()]);
    } catch (e) {
      setError(friendlyError(e));
    } finally { busy.current = false; setPhase(''); }
  }
  async function readNextTake() {
    const block = await client.getBlock();
    const [s, start] = await Promise.all([
      client.readContract({ address: deployment!.usurp, abi: usurpAbi, functionName: 'getState', blockNumber: block.number }),
      client.readContract({ address: deployment!.usurp, abi: usurpAbi, functionName: 'startPrice', blockNumber: block.number })
    ]);
    const expired = s.holder !== '0x0000000000000000000000000000000000000000' && block.timestamp >= s.deadline;
    return { price: expired ? start : s.currentPrice, roundId: s.roundId, expired };
  }
  async function confirm(hash: `0x${string}`) {
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('the transaction reverted. no throne changed hands.');
  }
  // Switch to monad testnet; if the wallet does not know the chain yet, add it with the canonical config first.
  async function switchNetwork() {
    try { setError(null); await switchChainAsync({ chainId: monadTestnet.id }); }
    catch {
      try {
        const provider = await connector?.getProvider() as EIP1193Provider | undefined;
        if (!provider) throw new Error('no provider');
        await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: numberToHex(monadTestnet.id), chainName: monadTestnet.name, nativeCurrency: monadTestnet.nativeCurrency, rpcUrls: [rpcUrl], blockExplorerUrls: [monadTestnet.blockExplorers.default.url] }] });
        await switchChainAsync({ chainId: monadTestnet.id });
      } catch { setError('could not switch to monad testnet. switch networks in your wallet and try again.'); }
    }
  }
  return <GameContext.Provider value={{
    state: stateQuery.data?.state ?? EMPTY_ROUND, history: historyQuery.data?.history ?? [], claims: historyQuery.data?.claims ?? [], now,
    block: stateQuery.data?.block ?? 0n, startPrice: stateQuery.data?.startPrice ?? 0n, demo: false, loading: deploymentQuery.isLoading || (!!deployment && stateQuery.isLoading),
    paused: stateQuery.data?.paused ?? false, address, phase, wrongNetwork: !!address && chainId !== monadTestnet.id, balance: balanceQuery.data, allowance: allowanceQuery.data, switchNetwork,
    error: error || deploymentQuery.error?.message || stateQuery.error?.message?.toLowerCase() || (historyQuery.error ? 'the event history is temporarily unavailable.' : null),
    wallets: connectors.map(c => ({ id: c.uid, name: c.name.toLowerCase(), icon: c.icon })),
    connect: async id => {
      // Connect first, then offer the network switch as its own clear step.
      try { setError(null); const target = connectors.find(c => c.uid === id); if (!target) return false; await connectAsync({ connector: target }); return true; }
      catch { setError('wallet connection declined or unavailable.'); return false; }
    }, disconnect,
    take: taunt => transact(async () => {
      if (Array.from(taunt).length > 140) throw new Error('keep the taunt under 140 characters.');
      const shown = stateQuery.data;
      const fresh = await readNextTake();
      const funds = await client.readContract({ address: deployment!.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [address!] });
      if (funds < fresh.price) throw new Error(`you need $${(Number(fresh.price) / 1e6).toFixed(2)} in test usdc to take the throne. use "get 10,000 test usdc" first.`);
      const shownPrice = shown ? nextTakePrice(shown.state, chainNow(), shown.startPrice) : undefined;
      if (fresh.price !== shownPrice) { await refetchState(); throw new Error('the price moved. review the new price and try again.'); }
      const allowance = await client.readContract({ address: deployment!.usdc, abi: erc20Abi, functionName: 'allowance', args: [address!, deployment!.usurp] });
      // Exact allowance bounds spend if somebody takes during wallet confirmation.
      if (allowance !== fresh.price) {
        if (allowance > 0n) {
          setPhase('resetting approval…');
          await confirm(await writeContractAsync({ address: deployment!.usdc, abi: erc20Abi, functionName: 'approve', args: [deployment!.usurp, 0n], chainId: monadTestnet.id }));
        }
        setPhase('approving usdc…');
        await confirm(await writeContractAsync({ address: deployment!.usdc, abi: erc20Abi, functionName: 'approve', args: [deployment!.usurp, fresh.price], chainId: monadTestnet.id }));
      }
      const latest = await readNextTake();
      if (latest.price !== fresh.price || latest.roundId !== fresh.roundId) { await refetchState(); throw new Error('someone got there first. review the new price and try again.'); }
      setPhase(fresh.expired ? 'settling and taking the throne…' : 'taking the throne…');
      await client.simulateContract({ account: address!, address: deployment!.usurp, abi: usurpAbi, functionName: 'take', args: [taunt] });
      await confirm(await writeContractAsync({ address: deployment!.usurp, abi: usurpAbi, functionName: 'take', args: [taunt], chainId: monadTestnet.id }));
    }),
    // Anyone can settle a finished round: the holder is paid and the next round opens.
    settle: () => transact(async () => {
      setPhase('starting the next round…');
      await client.simulateContract({ account: address!, address: deployment!.usurp, abi: usurpAbi, functionName: 'settle' });
      await confirm(await writeContractAsync({ address: deployment!.usurp, abi: usurpAbi, functionName: 'settle', chainId: monadTestnet.id }));
    }),
    approve: () => transact(async () => {
      const fresh = await readNextTake();
      const current = await client.readContract({ address: deployment!.usdc, abi: erc20Abi, functionName: 'allowance', args: [address!, deployment!.usurp] });
      if (current === fresh.price) return;
      if (current > 0n) {
        setPhase('resetting approval…');
        await confirm(await writeContractAsync({ address: deployment!.usdc, abi: erc20Abi, functionName: 'approve', args: [deployment!.usurp, 0n], chainId: monadTestnet.id }));
      }
      setPhase('approving usdc…');
      await confirm(await writeContractAsync({ address: deployment!.usdc, abi: erc20Abi, functionName: 'approve', args: [deployment!.usurp, fresh.price], chainId: monadTestnet.id }));
    }),
    mint: () => transact(async () => {
      setPhase('minting test usdc…');
      await confirm(await writeContractAsync({ address: deployment!.usdc as Address, abi: parseAbi(['function mint(address to, uint256 amount)']), functionName: 'mint', args: [address!, 10000_000000n], chainId: monadTestnet.id }));
    })
  }}>{children}</GameContext.Provider>;
}
