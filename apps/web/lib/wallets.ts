// Wallets offered in the connect step. Icons are the official marks (web3icons, MIT) saved under public/wallets.
// In live mode a row connects the matching EIP-6963 wallet when it is installed, or links to its download page.
export type KnownWallet = { key: string; name: string; icon: string; match: RegExp; install: string };
export const KNOWN_WALLETS: KnownWallet[] = [
  { key: 'rabby', name: 'Rabby', icon: '/wallets/rabby.svg', match: /rabby/i, install: 'https://rabby.io' },
  { key: 'phantom', name: 'Phantom', icon: '/wallets/phantom.svg', match: /phantom/i, install: 'https://phantom.com/download' },
  { key: 'metamask', name: 'MetaMask', icon: '/wallets/metamask.svg', match: /metamask/i, install: 'https://metamask.io/download' },
  { key: 'coinbase', name: 'Coinbase Wallet', icon: '/wallets/coinbase.svg', match: /coinbase/i, install: 'https://www.coinbase.com/wallet/downloads' },
  { key: 'rainbow', name: 'Rainbow', icon: '/wallets/rainbow.svg', match: /rainbow/i, install: 'https://rainbow.me/download' }
];
export const WALLETCONNECT = { key: 'walletconnect', name: 'WalletConnect', icon: '/wallets/walletconnect.svg', match: /walletconnect/i };

export type WalletRow = { key: string; name: string; icon: string; connectId?: string; install?: string; detected: boolean };
/** Detected wallets first (known ones with our icon, unknown ones with their own), then known wallets to install, then WalletConnect. */
export function walletRows(detected: { id: string; name: string; icon?: string }[], demo: boolean): WalletRow[] {
  if (demo) return [...KNOWN_WALLETS.map(w => ({ key: w.key, name: w.name, icon: w.icon, connectId: 'demo', detected: true })), { key: WALLETCONNECT.key, name: WALLETCONNECT.name, icon: WALLETCONNECT.icon, connectId: 'demo', detected: true }];
  const rows: WalletRow[] = [];
  const used = new Set<string>();
  const wc = detected.find(d => WALLETCONNECT.match.test(d.name));
  const browser = detected.filter(d => d !== wc);
  for (const known of KNOWN_WALLETS) {
    const hit = browser.find(d => known.match.test(d.name));
    if (hit) { used.add(hit.id); rows.push({ key: known.key, name: known.name, icon: known.icon, connectId: hit.id, detected: true }); }
  }
  const specific = browser.filter(d => !used.has(d.id) && !/^injected$/i.test(d.name));
  for (const d of specific) rows.push({ key: d.id, name: d.name, icon: d.icon ?? '', connectId: d.id, detected: true });
  // The generic injected connector is always registered; it only matters when a provider exists but did not announce itself.
  const generic = browser.find(d => /^injected$/i.test(d.name));
  const injectedPresent = typeof window !== 'undefined' && !!(window as unknown as { ethereum?: unknown }).ethereum;
  if (generic && !rows.length && injectedPresent) rows.push({ key: 'browser', name: 'browser wallet', icon: '', connectId: generic.id, detected: true });
  for (const known of KNOWN_WALLETS) if (!rows.some(r => r.key === known.key)) rows.push({ key: known.key, name: known.name, icon: known.icon, install: known.install, detected: false });
  if (wc) rows.push({ key: WALLETCONNECT.key, name: WALLETCONNECT.name, icon: WALLETCONNECT.icon, connectId: wc.id, detected: true });
  return rows;
}
