import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const css = readFileSync(new URL('../apps/web/app/globals.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => [selector.trim(), body]);
const selectorsWith = test => rules.filter(([selector, body]) => !selector.endsWith(':root') && test(body)).map(([selector]) => selector).sort();
// Holo in CSS: holder names only. The crown artwork and the 3D dome carry it in their own materials.
assert.deepEqual(selectorsWith(body => body.includes('var(--holo)')), ['.holder-name', '.ob-line-row.is-current .ob-line-name']);
// Gold, by variable or by literal gold hex: the pot's glass layers and winner surfaces. Nothing else.
const gold = /var\(--gold\)|#F5B301|#FFE082|#C98F00|245, ?179, ?1|138, ?98, ?0/i;
// Gold is money or a winner surface: the pot, winner card, onboarding amounts and splits, and the coronation's rings and coins.
assert.deepEqual(selectorsWith(body => gold.test(body)), ['.coro-coin-face', '.coro-rings > span', '.ob-gold', '.ob-payout-final', '.ob-pot-card.is-pot', '.ob-split-win', '.pot-depth', '.pot-face', '.pot-glow']);
// Radial gradients: the pot halo, the intro's throne glow, and its spotlight.
assert.deepEqual(selectorsWith(body => body.includes('radial-gradient')), ['.ob-seat-glow', '.ob-spotlight::before', '.pot-glow']);
// One sans family across the app, Space Grotesk only through --digits.
assert.ok(!/Inter|Clash Display/.test(css), 'Inter and Clash Display are retired');
const digitsUsers = selectorsWith(body => body.includes('var(--digits)'));
for (const selector of digitsUsers) assert.ok(!['.holder-name', '.pot-face', '.confirm-button', '.taunt-field input'].includes(selector), `${selector} must use the sans family`);
// Nothing below 13px anywhere.
for (const [selector, body] of rules) for (const [, px] of body.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) assert.ok(Number(px) >= 13, `${selector} has a ${px}px font-size`);
const crown = readFileSync(new URL('../apps/web/components/crown.tsx', import.meta.url), 'utf8');
assert.ok(crown.includes('/brand/crown.svg'), 'use the user-supplied iridescent crown');
// Decorative copy stays gone.
const sources = ['components/throne.tsx', 'components/shell.tsx', 'components/ticker.tsx', 'components/onboarding/overlay.tsx', 'components/onboarding/steps.tsx', 'app/layout.tsx'].map(file => readFileSync(new URL(`../apps/web/${file}`, import.meta.url), 'utf8')).join('\n');
for (const phrase of ["the world's least stable position", 'power is temporary', 'the receipts are forever', 'questionable decisions', 'currently insufferable', 'the pot. the whole point.', 'sitting pretty. for now.', 'until the crown pays out', 'small-cross', 'main character energy']) assert.ok(!sources.includes(phrase), `filler copy remains: ${phrase}`);
console.log('brand audit passed: holo on crown, dome, holder names; gold on the glass pot and winner surfaces; one sans family; no filler copy.');
