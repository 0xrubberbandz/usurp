import { test, expect } from '@playwright/test';

test('dome: pointer crossings preserve lighting and environment', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('usurp.onboarded', '1');
    localStorage.setItem('usurp.demo-wallet', '1');
    const counts = { cubeFaces: 0 };
    const lightLevels: number[] = [];
    Object.assign(window, { domeResources: counts, domeLightLevels: lightLevels });
    for (const Context of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const names = new WeakMap<WebGLUniformLocation, string>();
      const getLocation = Context.prototype.getUniformLocation;
      Context.prototype.getUniformLocation = function (program, name) {
        const location = getLocation.call(this, program, name);
        if (location) names.set(location, name);
        return location;
      };
      const uniform3f = Context.prototype.uniform3f;
      Context.prototype.uniform3f = function (location, x, y, z) {
        if (location && names.get(location) === 'directionalLights[0].color') lightLevels.push(x);
        return uniform3f.call(this, location, x, y, z);
      };
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
  // Passing through the button must not pulse the key light or its bloom.
  const lightLevels = await page.evaluate(() => (window as unknown as { domeLightLevels: number[] }).domeLightLevels);
  expect(lightLevels.length).toBeGreaterThan(0);
  expect(Math.max(...lightLevels) - Math.min(...lightLevels)).toBeLessThan(0.00001);
  await expect(page.locator('.ticker-line')).toHaveCSS('color', 'rgb(16, 16, 20)');
  await button.click();
  await expect(page.getByRole('dialog', { name: 'leave a taunt' })).toBeVisible();
  expect(errors).toEqual([]);
});
