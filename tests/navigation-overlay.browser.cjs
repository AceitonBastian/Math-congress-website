// Requires Playwright (or NODE_PATH pointing to its installation).
// Run with `node tests/navigation-overlay.browser.cjs`; BROWSER=webkit selects WebKit.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'http://navigation.test';
const engine = process.env.BROWSER || 'chromium';
const frame = page => page.evaluate(() => new Promise(resolve =>
  requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function position(page, headingTop) {
  await page.evaluate(top => {
    const heading = document.querySelector('#supporters-heading');
    scrollTo({top: heading.getBoundingClientRect().top + scrollY - top, behavior: 'instant'});
  }, headingTop);
  await frame(page);
}

async function geometry(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return {top: box.top, bottom: box.bottom, height: box.height};
    };
    return {
      header: rect('.site-header'), surface: rect('.nav-dropdown-surface'),
      menu: rect('.nav-dropdown.is-open .nav-dropdown-menu, .nav-dropdown.is-closing .nav-dropdown-menu, .nav-dropdown-menu'),
      backdrop: rect('.nav-backdrop'), viewportHeight: innerHeight,
      offset: getComputedStyle(document.documentElement).getPropertyValue('--site-header-hide-offset'),
      open: document.body.classList.contains('has-nav-dropdown-open')
    };
  });
}

function assertJoined(state) {
  assert.ok(Math.abs(state.surface.top - (state.header.bottom - 1)) < 0.1,
    `Dropdown background separated from header: ${JSON.stringify(state)}`);
  assert.ok(Math.abs(state.menu.top - state.header.bottom) < 0.1,
    'Dropdown links must follow the same edge');
  assert.ok(Math.abs(state.backdrop.top - state.header.bottom) < 0.1,
    'Backdrop must follow the header');
  assert.ok(state.backdrop.bottom >= state.viewportHeight - 0.1,
    'The backdrop must still cover the bottom of the viewport');
}

(async () => {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({
    headless: true,
    ...(engine === 'chromium' && process.platform === 'win32' ? {channel: 'msedge'} : {})
  });
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1.25});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep)) return route.abort();
      try {
        const contentType = {'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript'}[path.extname(file)];
        await route.fulfill({body: await fs.readFile(file), ...(contentType ? {contentType} : {})});
      } catch { await route.fulfill({status: 404, body: ''}); }
    });
    await page.goto(origin, {waitUntil: 'networkidle'});

    // Begin exactly like the recording: hover a dropdown just above the hide threshold.
    await position(page, 130);
    await page.locator('.nav-dropdown-trigger').first().hover();
    await page.waitForTimeout(450);
    const initial = await geometry(page);
    assertJoined(initial);

    if (engine === 'chromium') {
      // Scroll on the compositor while JS cannot update the old shared offset.
      // This deterministically exposes the gap that otherwise lasts only a frame.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setScriptExecutionDisabled', {value: true});
      try {
        await cdp.send('Input.dispatchMouseEvent', {type: 'mouseWheel', x: 1000, y: 500, deltaX: 0, deltaY: 80});
        await page.waitForTimeout(350);
        const scrolled = await geometry(page);
        assert.equal(scrolled.offset, initial.offset, 'Page JS must remain inactive');
        assert.ok(scrolled.header.bottom < initial.header.bottom - 20, 'Header must actually move');
        assertJoined(scrolled);
        await cdp.send('Input.dispatchMouseEvent', {type: 'mouseWheel', x: 1000, y: 500, deltaX: 0, deltaY: -25});
        await page.waitForTimeout(350);
        assertJoined(await geometry(page));
      } finally {
        await cdp.send('Emulation.setScriptExecutionDisabled', {value: false});
      }
    }

    await page.mouse.move(1000, 500);
    await page.waitForTimeout(500);
    for (const index of [0, 1, 2]) {
      await position(page, 130);
      await page.locator('.nav-dropdown-trigger').nth(index).hover();
      await page.waitForTimeout(450);
      assertJoined(await geometry(page));
      // Cross the threshold and reverse while the menu is rolling up.
      for (const top of [85, 65, 45, 65, 85, 100]) {
        await position(page, top);
        const state = await geometry(page);
        assert.ok(state.surface.top <= state.header.bottom + 0.1, 'No white seam while closing/reversing');
      }
      await page.mouse.move(1000, 500);
      await page.waitForTimeout(500);
      const closed = await geometry(page);
      assert.equal(closed.open, false);
      assert.equal(closed.surface.height, 0, 'No leftover dropdown surface');
    }

    await page.setViewportSize({width: 412, height: 780});
    await position(page, 65);
    await page.locator('.nav-toggle').click();
    const mobile = await geometry(page);
    assert.equal(mobile.header.top, 0);
    assert.ok(Math.abs(mobile.backdrop.top - mobile.header.bottom) < 0.1);
    // innerHeight rounds to whole CSS pixels; WebKit can retain a fractional edge.
    assert.ok(Math.abs(mobile.backdrop.bottom - mobile.viewportHeight) < 1);
    await page.keyboard.press('Escape');
    await frame(page);
    await page.emulateMedia({reducedMotion: 'reduce'});
    await position(page, 10);
    const reduced = await geometry(page);
    assert.equal(reduced.header.top, 0);
    assert.ok(Math.abs(reduced.backdrop.top - reduced.header.bottom) < 0.1);
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine}: dropdown seams, scroll reversal, cleanup, mobile menu and reduced motion`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
