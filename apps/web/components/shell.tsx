'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useGame } from './game-context';
import { Ticker } from './ticker';
import { useOnboarding } from './onboarding/context';
import { money, playerName } from '@/lib/game';
import { SoundToggle } from './sound-toggle';

// Connected: truncated address and test USDC balance; the menu copies the address or disconnects (demo mode adds the
// round controls). Not connected: "connect" reopens only the connect step of onboarding.
function WalletChip() {
  const game = useGame();
  const { start } = useOnboarding();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', away); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc); };
  }, [open]);
  if (!game.address) return <button className="wallet-chip" onClick={() => start('connect')}>connect</button>;
  const act = (fn?: () => void) => () => { fn?.(); setOpen(false); };
  return <div className="wallet-menu-wrap" ref={menu}>
    <button className="wallet-chip" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
      <span>{playerName(game.address)}</span>{game.balance !== undefined && <span className="wallet-balance"><img src="/tokens/usdc.svg" alt="usdc" width={16} height={16}/>{money(game.balance)}</span>}
    </button>
    {open && <div className="wallet-menu" role="menu">
      <button role="menuitem" onClick={() => { void navigator.clipboard?.writeText(game.address!); setCopied(true); setTimeout(() => { setCopied(false); setOpen(false); }, 700); }}>{copied ? 'copied' : 'copy address'}</button>
      {game.demo && <><button role="menuitem" onClick={act(game.finishDemo)}>preview a winner</button><button role="menuitem" onClick={act(game.resetDemo)}>restart demo</button></>}
      {!game.demo && <button role="menuitem" onClick={act(() => void game.mint())} disabled={!!game.phase}>get 10,000 test usdc</button>}
      <button role="menuitem" className="menu-danger" onClick={act(game.disconnect)}>disconnect</button>
    </div>}
  </div>;
}

// Hands the onboarding overlay (which sits above the game provider) every fresh game value.
function GameMirror() {
  const game = useGame();
  const { mirror } = useOnboarding();
  useEffect(() => mirror(game), [game, mirror]);
  return null;
}

export function Shell({ children }: { children: ReactNode }) {
  const { open, start } = useOnboarding();
  // While onboarding is open the live page stays mounted underneath, inert and set back slightly; it scales up on close.
  // React 18 does not know the inert attribute, so it is set on the element directly.
  const app = useRef<HTMLDivElement>(null);
  useEffect(() => { if (app.current) app.current.inert = open; }, [open]);
  return <>
    <GameMirror/>
    <div className={open ? 'app app-behind' : 'app'} ref={app} aria-hidden={open || undefined}>
      <header className="site-header">
        <Link href="/" className="wordmark" aria-label="usurp home"><img className="wordmark-crown" src="/brand/crown.svg" alt="" width={30} height={30}/>usurp.</Link>
        <div className="header-actions">
          <button className="text-link" onClick={() => start('full')}>how it works</button>
          <SoundToggle/>
          <WalletChip/>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <Ticker/>
    </div>
  </>;
}
