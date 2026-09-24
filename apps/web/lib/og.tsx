import { ImageResponse } from '@vercel/og';

const holo = 'linear-gradient(135deg, #8B5CF6, #22D3EE, #F472B6)';
const gold = '#F5B301';
function text(params: URLSearchParams, key: string, fallback: string, max = 32) {
  return (params.get(key)?.trim() || fallback).slice(0, max).toLowerCase();
}
function amount(params: URLSearchParams, key: string, fallback: number) {
  const raw = params.get(key);
  const parsed = raw === null ? fallback : Number(raw.replace(/,/g, ''));
  const value = Number.isFinite(parsed) ? Math.max(-1e12, Math.min(1e12, parsed)) : fallback;
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function OutlineCrown() {
  return <svg width="102" height="80" viewBox="0 0 120 90" fill="none"><defs><linearGradient id="og-crown" x1="0" y1="0" x2="120" y2="90" gradientUnits="userSpaceOnUse"><stop stopColor="#8B5CF6"/><stop offset=".5" stopColor="#22D3EE"/><stop offset="1" stopColor="#F472B6"/></linearGradient></defs><path d="M12 24L34 42L60 10L86 42L108 24L96 74H24L12 24ZM26 82H94" stroke="url(#og-crown)" strokeWidth="4" strokeLinejoin="round"/></svg>;
}
export function evictionCard(request: Request) {
  const params = new URL(request.url).searchParams;
  const victim = text(params, 'victim', 'exit_liquidity');
  const taker = text(params, 'taker', 'chair_enjoyer');
  const seconds = Math.max(0, Math.min(1e7, Number(params.get('reign')) || 154));
  const profit = amount(params, 'profit', 2.34);
  const negative = profit.startsWith('-');
  return new ImageResponse(<div style={{ width: '100%', height: '100%', background: '#FFFFFF', color: '#101014', display: 'flex', flexDirection: 'column', padding: '45px 65px', fontFamily: 'sans-serif', position: 'relative' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><OutlineCrown/><span style={{ fontSize: 20, color: '#8A8A93' }}>one throne. zero loyalty.</span></div>
    <div style={{ display: 'flex', position: 'absolute', top: 132, right: 60, border: '4px solid #FF3B5C', color: '#FF3B5C', fontSize: 33, fontWeight: 700, padding: '9px 17px', transform: 'rotate(9deg)' }}>DETHRONED</div>
    <span style={{ fontSize: victim.length > 21 ? 51 : 70, fontWeight: 700, textDecoration: 'line-through', marginTop: 31, maxWidth: 820 }}>{victim}</span>
    <span style={{ fontSize: 19, color: '#8A8A93', marginTop: 10 }}>you&apos;ve been usurped.</span>
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 31, width: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e8e8e3', padding: '12px 0', fontSize: 23 }}><span style={{ color: '#8A8A93' }}>reigned</span><span>{Math.floor(seconds / 60)}m {Math.floor(seconds % 60)}s</span></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e8e8e3', padding: '12px 0', fontSize: 23 }}><span style={{ color: '#8A8A93' }}>walked away</span><span style={{ color: negative ? '#101014' : '#00C875' }}>{negative ? '-$' : '+$'}{profit.replace('-', '')}</span></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 23 }}><span style={{ color: '#8A8A93' }}>taken by</span><span style={{ backgroundImage: holo, backgroundClip: 'text', color: 'transparent' }}>{taker}</span></div>
    </div>
    <span style={{ fontStyle: 'italic', color: '#8A8A93', fontSize: 20, marginTop: 22, maxWidth: 690 }}>“{text(params, 'taunt', 'please respect my brief authority.', 140)}”</span>
    <div style={{ display: 'flex', position: 'absolute', right: 65, bottom: 43, alignItems: 'flex-end', flexDirection: 'column' }}><span style={{ color: '#8A8A93', fontSize: 14 }}>the pot keeps growing</span><span style={{ color: gold, fontSize: 40, fontWeight: 700, marginTop: 6 }}>${amount(params, 'pot', 12842.69)}</span><span style={{ fontSize: 20, marginTop: 7 }}>usurp.fun</span></div>
  </div>, { width: 1200, height: 675, headers: { 'Cache-Control': 'public, max-age=3600' } });
}
export function winnerCard(request: Request) {
  const params = new URL(request.url).searchParams;
  const name = text(params, 'name', 'chair_enjoyer');
  return new ImageResponse(<div style={{ width: '100%', height: '100%', background: gold, color: '#101014', display: 'flex', flexDirection: 'column', padding: '45px 65px', alignItems: 'center', justifyContent: 'center', position: 'relative', fontFamily: 'sans-serif' }}>
    <span style={{ position: 'absolute', top: 45, left: 65, fontSize: 22 }}>usurp.</span><span style={{ position: 'absolute', top: 48, right: 65, fontSize: 16 }}>round {text(params, 'round', '1', 8)} · monad</span>
    <OutlineCrown/>
    <span style={{ marginTop: 25, fontSize: 22, letterSpacing: 6 }}>LONG LIVE</span><span style={{ fontSize: name.length > 20 ? 48 : 72, fontWeight: 700, marginTop: 9 }}>{name.toUpperCase()}</span>
    <span style={{ fontSize: 78, fontWeight: 700, marginTop: 27 }}>${amount(params, 'payout', 10531.01)}</span><span style={{ fontSize: 19, marginTop: 12 }}>the chair was worth it.</span>
    <span style={{ position: 'absolute', bottom: 43, fontSize: 20 }}>usurp.fun · one throne. zero loyalty.</span>
  </div>, { width: 1200, height: 675, headers: { 'Cache-Control': 'public, max-age=3600' } });
}
