import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const removedCopy = ["the world's least stable position", 'power is temporary', 'the receipts are forever', 'questionable decisions', 'currently insufferable', 'the pot. the whole point.', 'sitting pretty. for now.', 'until the crown pays out'];

// The core loop must sit inside one viewport: take button above the ticker, no page scroll in either axis.
async function expectSingleViewport(page: Page) {
  const fit = await page.evaluate(() => {
    const button = document.querySelector('.dome-button')!.getBoundingClientRect();
    const ticker = document.querySelector('.ticker')!.getBoundingClientRect();
    return { buttonBottom: button.bottom, tickerTop: ticker.top, tickerBottom: ticker.bottom, innerHeight, scrollHeight: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth, innerWidth };
  });
  expect(fit.buttonBottom).toBeLessThanOrEqual(fit.tickerTop);
  expect(fit.scrollHeight).toBeLessThanOrEqual(fit.innerHeight);
  expect(fit.scrollWidth).toBeLessThanOrEqual(fit.innerWidth);
  expect(Math.round(fit.tickerBottom)).toBe(fit.innerHeight);
}

// At rest the throne shows exactly: holder line, pot, timer, button label. The pot is the largest thing on screen,
// the timer is solid muted ink until the final minute, and the dome button's DOM label sits under its 3D canvas.
async function expectRestingThrone(page: Page) {
  const rest = await page.evaluate(() => {
    const allowed = ['holder-name', 'holder-sep', 'taunt', 'bleed-tag', 'pot-number', 'countdown', 'dome-label', 'dome-price'];
    const walker = document.createTreeWalker(document.querySelector('.throne')!, NodeFilter.SHOW_TEXT);
    const stray: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement!;
      if (!node.textContent!.trim() || !el.checkVisibility()) continue;
      if (!allowed.some(c => el.closest('.' + c))) stray.push(node.textContent!.trim());
    }
    const size = (sel: string) => parseFloat(getComputedStyle(document.querySelector(sel)!).fontSize);
    return { stray, pot: size('.pot-number'), timer: size('.countdown'), timerColor: getComputedStyle(document.querySelector('.countdown')!).color, labelColor: getComputedStyle(document.querySelector('.dome-label')!).color, canvases: document.querySelectorAll('.dome-slot canvas').length, inputs: [...document.querySelectorAll('input')].filter(i => i.checkVisibility()).length };
  });
  expect(rest.stray).toEqual([]);
  expect(rest.inputs).toBe(0);
  expect(rest.pot).toBeGreaterThan(rest.timer * 2);
  expect(rest.timerColor).toBe('rgb(86, 86, 88)'); // opaque muted ink
  expect(rest.labelColor).toBe('rgb(16, 16, 20)');
  expect(rest.canvases).toBe(1);
}

// Returning visitor: onboarding done, demo wallet connected.
async function asReturningPlayer(page: Page) {
  await page.addInitScript(() => { localStorage.setItem('usurp.onboarded', '1'); localStorage.setItem('usurp.demo-wallet', '1'); });
}

test('onboarding: walkthrough first, then connect a wallet and approve usdc; persistence, skip, replay, connect-only', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  for (const route of ['/leaderboard', '/money']) expect((await request.get(route)).status()).toBe(404);
  await page.goto('/');
  const overlay = page.getByRole('dialog', { name: 'how usurp works' });
  // a first visit opens straight onto the welcome slide; and the pre-paint hide has lifted
  await expect(overlay.locator('.ob-step-1')).toBeVisible();
  await expect(overlay.getByRole('heading', { name: 'long live the king. briefly.' })).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-intro');
  await expect(overlay).not.toContainText('practice round');
  await expect(overlay.getByRole('button', { name: 'sound effects' })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  const background = overlay.locator('.ob-background video');
  const originalVideo = await background.elementHandle();
  await expect.poll(() => background.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
  // Seek near the end to verify actual looping, then confirm navigation keeps the same playing video.
  await background.evaluate(node => { const video = node as HTMLVideoElement; video.currentTime = video.duration - 0.25; });
  await expect.poll(() => background.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeLessThan(1.5);
  await background.evaluate(node => { (node as HTMLVideoElement).currentTime = 3; });
  mkdirSync('../../artifacts', { recursive: true });
  await page.screenshot({ path: '../../artifacts/intro-background-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(background).toHaveCSS('object-fit', 'cover');
  await page.screenshot({ path: '../../artifacts/intro-background-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await overlay.getByRole('button', { name: 'show me' }).click();
  await expect(overlay.locator('.ob-step-2')).toBeVisible();
  expect(await originalVideo!.evaluate(node => node.isConnected)).toBe(true);
  await overlay.getByRole('button', { name: 'next' }).click();
  // Trying the example dome is optional; users can continue without a practice round.
  await expect(overlay.getByRole('button', { name: 'next' })).toBeEnabled();
  await overlay.getByRole('button', { name: 'next' }).click();
  await expect(overlay.locator('.ob-step-4')).toBeVisible();
  await overlay.getByRole('button', { name: 'back', exact: true }).click();
  await expect(overlay.getByText('try it.')).toBeVisible();
  await overlay.getByRole('button', { name: 'try taking the throne for $10.00' }).click();
  await expect(overlay.getByRole('button', { name: 'next' })).toBeEnabled();
  for (let step = 4; step <= 8; step++) { await overlay.getByRole('button', { name: 'next' }).click(); await expect(overlay.locator(`.ob-step-${step}`)).toBeVisible(); }
  await expect(overlay).toContainText('you take the pot.');
  // the wallet comes last: real wallet rows with icons, then an explicit usdc approval
  await overlay.getByRole('button', { name: 'connect wallet' }).click();
  await expect(overlay.locator('.ob-step-9')).toBeVisible();
  await expect(overlay).toContainText('a game of chance. not available where prohibited.');
  for (const name of ['Rabby', 'Phantom', 'MetaMask']) await expect(overlay.getByRole('button', { name })).toBeVisible();
  await overlay.getByRole('button', { name: 'Rabby' }).click();
  await expect(overlay.locator('.ob-step-10')).toBeVisible();
  expect(await originalVideo!.evaluate(node => node.isConnected && !(node as HTMLVideoElement).paused)).toBe(true);
  await expect(overlay.getByRole('button', { name: 'take your seat' })).toBeDisabled();
  await overlay.getByRole('button', { name: /^approve \$/ }).click();
  await expect(overlay.getByText(/approved for \$/)).toBeVisible();
  await overlay.getByRole('button', { name: 'take your seat' }).click();
  await expect(overlay).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('usurp.onboarded'))).toBe('1');
  await page.reload();
  await expect(page.getByRole('button', { name: /take the throne for/ })).toBeVisible();
  await expect(overlay).toHaveCount(0);
  // "how it works" replays from step 1; arrow keys move; skip jumps to the wallet steps
  await page.getByRole('button', { name: 'how it works' }).click();
  await expect(overlay.locator('.ob-step-1')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(overlay.locator('.ob-step-2')).toBeVisible();
  await overlay.getByRole('button', { name: 'skip' }).click();
  await expect(overlay.locator('.ob-step-9')).toBeVisible();
  await overlay.getByRole('button', { name: /^continue as/ }).click();
  await overlay.getByRole('button', { name: 'approve later' }).click();
  await expect(overlay).toHaveCount(0);
  // disconnected, the header chip reads "connect" and opens only the wallet steps
  await page.getByRole('button', { name: /^0x/ }).click();
  await expect(page.getByRole('menuitem', { name: 'disconnect' })).toHaveCSS('color', 'rgb(255, 59, 92)');
  await page.getByRole('menuitem', { name: 'disconnect' }).click();
  await page.getByRole('button', { name: 'connect', exact: true }).click();
  await expect(overlay.locator('.ob-step-9')).toBeVisible();
  await expect(overlay.locator('.ob-dot')).toHaveCount(2);
  await overlay.getByRole('button', { name: 'MetaMask' }).click();
  await overlay.getByRole('button', { name: /^approve \$/ }).click();
  await overlay.getByRole('button', { name: 'take your seat' }).click();
  await expect(overlay).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('demo: take, fake evictions, winner and single-viewport layout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // Reduced motion keeps the 3D dome static, so fake-clock stepping does not render thousands of frames.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await asReturningPlayer(page);
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByRole('button', { name: /take the throne for/ })).toBeEnabled();
  await expect(page.getByRole('img', { name: 'usurp iridescent glass crown' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(1000);
  await expect(page.locator('.holder-name:not([data-motion-pop-id])')).toHaveCSS('opacity', '1');
  await expectRestingThrone(page);
  for (const phrase of removedCopy) await expect(page.locator('body')).not.toContainText(phrase);
  await expect(page.locator('.ticker')).toContainText('took the throne for');
  await expectSingleViewport(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.clock.runFor(500);
  await expectSingleViewport(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.runFor(500);
  mkdirSync('../../artifacts', { recursive: true });
  await page.screenshot({ path: '../../artifacts/throne-desktop.png' });
  // The pot is layered text, not an image, and a tick must not move the layout.
  const potBefore = await page.locator('.pot-number').boundingBox();
  expect(await page.locator('.pot-number img').count()).toBe(0);
  // The taunt input lives only in the modal: esc closes it, enter submits it.
  await page.getByRole('button', { name: /take the throne for/ }).click();
  await expect(page.getByRole('textbox', { name: 'your taunt' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'your taunt' })).toHaveAttribute('placeholder', 'say something regrettable');
  await expect(page.getByRole('button', { name: /take it for \$/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'your taunt' })).toBeHidden();
  await page.getByRole('button', { name: /take the throne for/ }).click();
  await page.getByRole('textbox', { name: 'your taunt' }).fill('my excellent temporary chair.');
  await page.getByRole('textbox', { name: 'your taunt' }).press('Enter');
  await expect(page.getByRole('textbox', { name: 'your taunt' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'you', exact: true })).toBeVisible();
  await expect(page.getByText('“my excellent temporary chair.”')).toBeVisible();
  await page.clock.runFor(700);
  const potAfter = await page.locator('.pot-number').boundingBox();
  expect(Math.abs(potAfter!.height - potBefore!.height)).toBeLessThan(1);
  await expect(page.locator('.ticker')).toContainText('you took the throne for');
  // Step one second at a time until a bot evicts you, so the 8s eviction toast is still on screen.
  await expect(page.getByRole('button', { name: 'you hold the throne' })).toBeDisabled();
  for (let i = 0; i < 61 && await page.getByRole('button', { name: 'you hold the throne' }).isVisible(); i++) await page.clock.runFor(1000);
  await expect(page.getByText("you've been usurped.", { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^0x/ }).click();
  await page.getByRole('menuitem', { name: 'preview a winner' }).click();
  // settling plays the coronation and the next round opens by itself: no owner step, no "another round" button
  await expect(page.locator('.coro')).toBeVisible();
  await page.clock.runFor(2_100);
  await page.screenshot({ path: '../../artifacts/winner-desktop.png' });
  await expect(page.locator('.ticker')).toContainText('long live');
  await expect(page.locator('.ticker')).toContainText('is open');
  await expect(page.getByText('the throne sits empty')).toBeVisible();
  await expect(page.getByRole('button', { name: /take the throne for \$10\.00/ })).toBeVisible();
  expect(errors).toEqual([]);
});

// Real clock, full motion, the 3D dome live: the core loop fits one viewport on phones and short desktops,
// and a long taunt plus a nine-digit pot stay inside the screen.
test('single viewport and no horizontal overflow from 360px phones to 1280x720', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await asReturningPlayer(page);
  await page.goto('/');
  await expect(page.locator('.dome-canvas')).toHaveCSS('opacity', '1');
  await page.evaluate(() => document.fonts.ready);
  for (const [width, height] of [[1280, 720], [412, 915], [390, 844], [360, 740]]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('.holder-name:not([data-motion-pop-id])')).toHaveCSS('opacity', '1');
    await expectSingleViewport(page);
    if (width === 390) await page.screenshot({ path: '../../artifacts/throne-mobile.png' });
  }
  await page.getByRole('button', { name: /take the throne for/ }).click();
  await page.getByRole('textbox', { name: 'your taunt' }).fill('a very long taunt that runs well past the edge of any phone screen, just to prove the ellipsis holds up.');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'you', exact: true })).toBeVisible();
  const inside = await page.evaluate(() => {
    const within = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return r.left >= 16 && r.right <= innerWidth - 16; };
    return { line: within('.holder-line'), name: within('.holder-name:not([data-motion-pop-id])'), dot: within('.bleed-tag'), pot: within('.pot-number'), scroll: document.documentElement.scrollWidth <= innerWidth };
  });
  expect(inside).toEqual({ line: true, name: true, dot: true, pot: true, scroll: true });
  expect(errors).toEqual([]);
});

test('eviction and winner cards render as 1200x675 PNGs', async ({ request }) => {
  for (const kind of ['eviction', 'winner']) {
    const response = await request.get(`/api/og/${kind}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    const png = await response.body();
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(675);
    mkdirSync('../../artifacts', { recursive: true });
    writeFileSync(`../../artifacts/og-${kind}.png`, png);
  }
  const response = await request.get('/api/og/eviction?victim=%3Cscript%3E&taker=someone&reign=NaN&profit=-12.42&taunt=hello');
  expect(response.status()).toBe(200);
});
