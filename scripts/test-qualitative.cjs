const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'pruneground-qualitative-'));
const expected = {
  chair: { original: 'This is a brown chair against the wall under the board, close to the table.', purple: 3,
    lines: ['The chair is against the wall.', 'The chair is under the board.', 'The chair is close to the table.', 'The chair has a bookshelf on its left.'] },
  desk: { original: 'Of the two desk, choose the bigger one.', purple: 0,
    lines: ['The desk is long and yellow.', 'The desk is near a chair.', 'The desk has two monitors on it.'] },
  cabinet: { original: 'Find the kitchen cabinets that are over the refrigerator.', purple: 1,
    lines: ['The kitchen cabinet is above the refrigerator.', 'The kitchen cabinet is wooden.', 'The kitchen cabinet has another one on the right.'] }
};
(async () => {
  const browser = await chromium.launch({headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1600}, reducedMotion: 'reduce'});
    // Isolate this DOM-only presentation from costly software WebGL rendering.
    // Run test-explorer.cjs separately for the full Explorer integration check.
    await page.route('**/3d-explorer.js*', route => route.fulfill({contentType: 'application/javascript', body: ''}));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().includes('/qualitative') && response.status() >= 400) errors.push(response.url()); });
    await page.goto(process.env.QUALITATIVE_URL || 'http://127.0.0.1:8765/#qualitative');
    await page.locator('#qualitative').scrollIntoViewIfNeeded();
    const ready = async (key, stage) => {
      await page.waitForFunction(([key, stage]) => {
        const root = document.querySelector('#qualitative');
        return root.dataset.case === key && root.dataset.stage === String(stage);
      }, [key, stage]);
      await page.waitForFunction(() => [...document.querySelectorAll('#qual-stage img')].every(img => img.complete && img.naturalWidth > 0));
      assert.equal(await page.locator('[data-qual-case][aria-pressed="true"]').getAttribute('data-qual-case'), key);
      assert.equal(await page.locator('[data-qual-stage][aria-current="step"]').getAttribute('data-qual-stage'), String(stage));
    };
    const checkFit = async () => {
      const fit = await page.locator('#qual-stage').evaluate(el => {
        const root = document.querySelector('#qualitative');
        const rect = root.getBoundingClientRect();
        return {height: el.clientHeight, scroll: el.scrollHeight,
          overflow: root.scrollWidth > root.clientWidth + 1 || rect.right > innerWidth + 1 || rect.left < -1};
      });
      assert.equal(fit.overflow, false, 'No showcase horizontal overflow');
      assert.ok(fit.scroll <= fit.height + 1, `Stage content must fit: ${JSON.stringify(fit)}`);
    };
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({width, height: 1600});
      const heights = [];
      for (const [key, data] of Object.entries(expected)) {
        await page.click(`[data-qual-case="${key}"]`);
        await ready(key, 0);
        for (let index = 0; index < 4; index++) {
          await page.click(`[data-qual-stage="${index}"]`);
          await ready(key, index);
          await checkFit();
          heights.push((await page.locator('#qual-stage').boundingBox()).height);
          if (index < 3) assert.equal(await page.locator('#qual-stage blockquote').textContent(), `“${data.original}”`);
          if (index === 2) {
            assert.deepEqual(await page.locator('.qual-statements li').allTextContents(), data.lines);
            assert.equal(await page.locator('.qual-statements .qual-preserved').count(), data.purple);
            assert.equal(await page.locator('.qual-statements .qual-added').count(), data.lines.length - data.purple);
            if (key === 'desk') assert.match(await page.locator('.qual-comparison-note').textContent(), /does not explicitly restate “the bigger one”/);
            assert.ok(await page.locator('.qual-statements li').evaluateAll(items => items.every(item => getComputedStyle(item).opacity === '1')));
          }
          if (index === 3) {
            assert.equal(await page.locator('#qual-stage img').count(), 2);
            assert.ok((await page.locator('#qual-stage img').first().getAttribute('src')).endsWith(`${key}-prediction.png`));
            assert.ok((await page.locator('#qual-stage img').last().getAttribute('src')).endsWith(`${key}-ground-truth.png`));
          }
          if ((width === 1440 && ((key === 'chair' && index === 0) || (key === 'desk' && index === 2) || (key === 'cabinet' && index === 3))) || (width === 390 && key === 'chair' && index === 2)) {
            await page.locator('#qualitative').screenshot({path: `${shots}/${width}-${key}-${index}.png`, timeout: 60000, animations: 'disabled'});
          }
        }
      }
      assert.equal(new Set(heights).size, 1, 'Stage height must stay stable across cases and stages');
      console.log(`All 12 slides passed at ${width}px.`);
    }
    await page.setViewportSize({width: 1440, height: 1100});
    await page.click('[data-qual-case="chair"]');
    await ready('chair', 0);
    assert.equal(await page.locator('#qual-prev').isDisabled(), true);
    await page.click('#qual-next');
    await ready('chair', 1);
    await page.click('#qual-prev');
    await ready('chair', 0);
    await page.locator('#qualitative').focus();
    await page.keyboard.press('ArrowRight');
    await ready('chair', 1);
    await page.keyboard.press('End');
    await ready('chair', 3);
    await page.keyboard.press('ArrowRight');
    await ready('desk', 0);
    await page.keyboard.press('End');
    await page.click('[data-qual-case="desk"]');
    await ready('desk', 0);
    await page.locator('#qual-stage .qual-image-button').click();
    assert.equal(await page.locator('#lightbox').isVisible(), true);
    await page.keyboard.press('Escape');
    await page.click('.qual-source');
    assert.match(await page.locator('#lightbox-image').getAttribute('src'), /assets\/images\/qualitative.png$/);
    await page.keyboard.press('ArrowRight');
    await ready('desk', 0); // Modal key events must not navigate the showcase.
    await page.keyboard.press('Escape');
    await page.locator('.site-nav .brand').focus();
    await page.keyboard.press('ArrowRight');
    await ready('desk', 0); // Keyboard navigation stays scoped to the showcase.
    await page.emulateMedia({reducedMotion: 'no-preference'});
    await page.click('[data-qual-stage="1"]');
    await ready('desk', 1);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.qual-before-image')).opacity === '0');
    assert.equal(await page.locator('#qualitative').getAttribute('data-stage'), '1');
    await page.evaluate(() => {
      document.querySelector('[data-qual-case="chair"]').click();
      document.querySelector('[data-qual-case="cabinet"]').click();
      document.querySelector('[data-qual-stage="2"]').click();
    });
    await ready('cabinet', 2);
    await page.waitForFunction(() => [...document.querySelectorAll('.qual-statements li')].every(el => getComputedStyle(el).opacity === '1'));
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.click('[data-qual-stage="1"]');
    await ready('cabinet', 1);
    assert.equal(await page.locator('.qual-before-image').evaluate(el => getComputedStyle(el).opacity), '0');
    assert.equal(await page.locator('#qualitative canvas').count(), 0);
    assert.equal(await page.locator('canvas').count(), 0, 'The presentation creates no canvas');
    assert.equal(await page.locator('#pg-canvas-wrap').count(), 1, 'The existing Explorer is still present');
    assert.deepEqual(errors, []);
    console.log('Passed: exact figure text, 12 case/stage combinations at four viewport widths, stable layout, keyboard scope, rapid switching, image enlargement, reduced motion and no new canvas.');
    console.log('Screenshots:', shots);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
