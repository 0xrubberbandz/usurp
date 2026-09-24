import { test, expect } from '@playwright/test';

test('dome: crossing the button does not recapture its environment', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('usurp.onboarded', '1');
    localStorage.setItem('usurp.demo-wallet', '1');
    const counts = { cubeFaces: 0 };
    Object.assign(window, { domeResources: counts });
    for (const Context of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const attachTexture = Context.prototype.framebufferTexture2D;
      Context.prototype.framebufferTexture2D = function (target, attachment, textarget, texture, level) {
        if (textarget >= this.TEXTURE_CUBE_MAP_POSITIVE_X && textarget <= this.TEXTURE_CUBE_MAP_NEGATIVE_Z) counts.cubeFaces++;
        return attachTexture.call(this, target, attachment, textarget, texture, level);
      };
    }
  });
  await page.goto('/');
  const button = page.locator('.dome-button');
  await expect(button).toBeVisible();
  await expect(page.locator('.dome-canvas')).toHaveCSS('opacity', '1');
  // Let font loading and the initial shader/texture uploads finish.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const box = (await button.boundingBox())!;
  const cross = async () => {
    await page.mouse.move(box.x - 30, box.y + box.height / 2);
    // A few real mouse moves exercise both edges without spending hundreds of
    // frames traversing empty space on CI's software WebGL renderer.
    await page.mouse.move(box.x + box.width + 30, box.y + box.height / 2, { steps: 3 });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 2 });
    await page.mouse.move(box.x - 30, box.y + box.height / 2, { steps: 2 });
  };
  await cross();
  const resources = () => page.evaluate(() => ({ ...(window as unknown as { domeResources: { cubeFaces: number } }).domeResources }));
  const before = await resources();
  expect(before.cubeFaces).toBeGreaterThan(0);
  for (let i = 0; i < 4; i++) await cross();
  expect(await resources()).toEqual(before);
  await expect(page.locator('.ticker-line')).toHaveCSS('color', 'rgb(16, 16, 20)');
  await button.click();
  await expect(page.getByRole('dialog', { name: 'leave a taunt' })).toBeVisible();
  expect(errors).toEqual([]);
});
