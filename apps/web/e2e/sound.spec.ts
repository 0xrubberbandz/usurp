import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

type AudioProbe = { contexts: number; nodes: { id: number; cancelled: boolean; ended: boolean }[] };
async function probe(page: Page) {
  return page.evaluate(() => (window as unknown as { audioProbe: AudioProbe }).audioProbe);
}

test('intro audio: every slide, immediate mute, cancellation, and saved preference', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Observe real browser audio nodes: playback still uses the native Web Audio implementation.
  await page.addInitScript(() => {
    const state: AudioProbe = { contexts: 0, nodes: [] };
    (window as unknown as { audioProbe: AudioProbe }).audioProbe = state;
    const Native = window.AudioContext;
    function observe<T extends AudioScheduledSourceNode>(node: T): T {
      const entry = { id: state.nodes.length, cancelled: false, ended: false };
      state.nodes.push(entry);
      const stop = node.stop.bind(node);
      node.stop = (when?: number) => { if (when === undefined) entry.cancelled = true; stop(when); };
      node.addEventListener('ended', () => { entry.ended = true; });
      return node;
    }
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) { super(options); state.contexts++; }
      createOscillator() { return observe(super.createOscillator()); }
      createBufferSource() { return observe(super.createBufferSource()); }
    };
  });
  await page.goto('/');
  const overlay = page.getByRole('dialog', { name: 'how usurp works' });
  const toggle = overlay.getByRole('button', { name: 'sound effects' });
  await expect(overlay.locator('.ob-step-1')).toBeVisible();
  expect((await probe(page)).contexts).toBe(0); // no autoplay before interaction
  await toggle.click();
  await expect(toggle).toHaveText('sound on');
  await expect.poll(async () => (await probe(page)).nodes.length).toBeGreaterThan(0);
  expect((await probe(page)).contexts).toBe(1);
  for (let step = 2; step <= 8; step++) {
    const before = (await probe(page)).nodes.length;
    await overlay.getByRole('button', { name: 'next', exact: true }).click();
    await expect(overlay.locator(`.ob-step-${step}`)).toBeVisible();
    await expect.poll(async () => (await probe(page)).nodes.length).toBeGreaterThan(before);
    if (step === 5) {
      await toggle.click();
      await expect(toggle).toHaveText('sound off');
      expect((await probe(page)).nodes.every(node => node.cancelled || node.ended)).toBe(true);
      const muted = (await probe(page)).nodes.length;
      await page.waitForTimeout(300);
      expect((await probe(page)).nodes.length).toBe(muted);
      await toggle.click();
      await expect(toggle).toHaveText('sound on');
      await expect.poll(async () => (await probe(page)).nodes.length).toBeGreaterThan(muted);
      mkdirSync('../../artifacts', { recursive: true });
      await page.screenshot({ path: '../../artifacts/intro-clock-sound.png' });
    }
    // Navigating cancels all scheduled sounds from the previous slide, including future ticks.
    expect((await probe(page)).nodes.slice(0, before).every(node => node.cancelled || node.ended)).toBe(true);
  }
  const beforeWallet = (await probe(page)).nodes.length;
  await overlay.getByRole('button', { name: 'connect wallet', exact: true }).click();
  await expect(overlay.locator('.ob-step-9')).toBeVisible();
  await expect.poll(async () => (await probe(page)).nodes.length).toBeGreaterThan(beforeWallet);
  await overlay.getByRole('button', { name: 'Rabby', exact: true }).click();
  await expect(overlay.locator('.ob-step-10')).toBeVisible();
  const beforeApproval = (await probe(page)).nodes.length;
  await overlay.getByRole('button', { name: /^approve \$/ }).click();
  await expect(overlay.getByText(/approved for \$/)).toBeVisible();
  await expect.poll(async () => (await probe(page)).nodes.length).toBeGreaterThan(beforeApproval);
  await toggle.click();
  await overlay.getByRole('button', { name: 'take your seat', exact: true }).click();
  await expect(overlay).toHaveCount(0);
  expect((await probe(page)).nodes.every(node => node.cancelled || node.ended)).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'sound effects' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'how it works' }).click();
  await expect(overlay.locator('.ob-step-1')).toBeVisible();
  expect((await probe(page)).contexts).toBe(0);
  expect(errors).toEqual([]);
});

test('the intro still works when Web Audio is unavailable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', { value: undefined });
    Object.defineProperty(window, 'webkitAudioContext', { value: undefined });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const overlay = page.getByRole('dialog', { name: 'how usurp works' });
  await overlay.getByRole('button', { name: 'sound effects' }).click();
  await overlay.getByRole('button', { name: 'next', exact: true }).click();
  await overlay.getByRole('button', { name: 'next', exact: true }).click();
  await expect(overlay.locator('.ob-step-3')).toBeVisible();
  expect(errors).toEqual([]);
});
