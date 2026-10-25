const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const data = require('../assets/benchmark-tables.json');
const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'pruneground-layout-'));
(async () => {
  const browser = await chromium.launch({headless: true, args: ['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1100}, reducedMotion: 'reduce'});
    await page.route('**/3d-explorer.js*', r => r.fulfill({contentType: 'application/javascript', body: ''}));
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(process.env.LAYOUT_URL || 'http://127.0.0.1:8765/');
    await page.evaluate(() => document.fonts.ready);
    assert.deepEqual(await page.locator('main > section').evaluateAll(es => es.map(e => e.id)), ['overview','explorer','method','results','limitation','citation']);
    assert.equal(await page.locator('#overview #figure-1').count(), 1);
    assert.equal(await page.locator('#method .method-steps + #figure-2').count(), 1);
    assert.equal(await page.locator('img[src*="pipeline-detail"], #analysis').count(), 0);
    assert.equal(await page.locator('.metric-strip > article').count(), 4);
    assert.equal(await page.locator('#qual-title').textContent(), 'Qualitative Results');
    assert.match(await page.locator('.limitation-figure figcaption').textContent(), /Close to the TV/);
    const scholar = await page.locator('.authors a').evaluateAll(es => es.map(e => new URL(e.href).searchParams.get('user')));
    assert.deepEqual(scholar, ['4IAC5BMAAAAJ','DfAzEe0AAAAJ','_oARI30AAAAJ','JF4kESAAAAAJ','hFY4t8gAAAAJ','DZ-fHPgAAAAJ','Mdr6wjUAAAAJ']);
    const fonts = await page.evaluate(() => ({families: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family),
      heading: getComputedStyle(document.querySelector('h1')).fontFamily, body: getComputedStyle(document.body).fontFamily,
      mono: getComputedStyle(document.querySelector('.formula')).fontFamily}));
    assert.match(fonts.heading, /Space Grotesk/);
    assert.match(fonts.body, /Inter/);
    assert.match(fonts.mono, /JetBrains Mono/);
    assert.equal(fonts.families.length, 3);
    for (const [id, rows, offset, count] of [['scanrefer',data.scanrefer.rows,0,6], ['nr3d',data.referit3d.rows,0,5], ['sr3d',data.referit3d.rows,5,5]]) {
      await page.click(`[data-result-tab="${id}"]`);
      assert.equal(await page.locator(`#panel-${id}`).isVisible(), true);
      const actual = await page.locator(`#panel-${id} tbody tr`).evaluateAll(es => es.map(e => [...e.querySelectorAll('td')].slice(1).map(c => c.textContent)));
      assert.deepEqual(actual, rows.map(r => r.slice(3+offset,3+offset+count).map(v => v === null ? '—' : v.toFixed(1))));
    }
    await page.click('[data-result-tab="scanrefer"]');
    for (const width of [1440,1024,768,390,320]) {
      await page.setViewportSize({width,height:1100});
      // Wait for responsive media queries after viewport changes and full-section captures.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const overflow = await page.evaluate(() => [...document.querySelectorAll('main > section, .hero, .nav-shell, .metric, .method-card, .limitations, .qual-showcase')].filter(e => e.getBoundingClientRect().right > innerWidth+1 || (getComputedStyle(e).overflowX === 'visible' && e.scrollWidth > e.clientWidth+1)).map(e => e.id || e.className));
      if (overflow.length) console.log(await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => !e.closest('.table-scroll, .qual-cases, pre') && e.getBoundingClientRect().right > innerWidth+1).map(e => [e.tagName, e.className, e.getBoundingClientRect().width, getComputedStyle(e).fontSize, e.textContent.slice(0,70)])));
      assert.deepEqual(overflow, [], `No container overflow at ${width}px: ${overflow}`);
      if (width === 1440 || width === 390) {
        await page.evaluate(() => { document.querySelector('.site-nav').style.visibility='hidden'; });
        for (const selector of ['.hero','#overview','#method','.results-browser','#limitation']) {
          await page.locator(selector).scrollIntoViewIfNeeded();
          await page.locator(selector).screenshot({path:path.join(shots,`${width}-${selector.replace(/[.#]/g,'')}.png`),animations:'disabled'});
        }
        await page.evaluate(() => { document.querySelector('.site-nav').style.visibility=''; });
      }
    }
    await page.setViewportSize({width:1440,height:1100});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('.metric').first().hover();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.metric')).transform === 'matrix(1, 0, 0, 1, 0, -6)');
    assert.deepEqual(errors, []);
    console.log('Passed: layout, figure locations, all 204 accuracy cells, Scholar links, three loaded fonts, responsive containers and raised-card interaction.');
    console.log(`Screenshots: ${shots}`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
