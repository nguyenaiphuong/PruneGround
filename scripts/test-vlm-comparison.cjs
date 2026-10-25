const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const data = require('../assets/table6-vlms.json');
const expected = {qwen3b:[15.1,94.7,1.4], chatgpt:[11.7,95.3,11.2], qwen72b:[16.3,95.1,12.6], gemini:[12.1,95.7,13.1]};
data.models.forEach(m => assert.deepEqual([m.area,m.recall,m.runtime],expected[m.id]));
assert.equal((13.1/1.4).toFixed(1), '9.4');
assert.equal((95.7-94.7).toFixed(1), '1.0');
const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'pruneground-vlm-'));
(async () => {
 const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1200},reducedMotion:'reduce'});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/3d-explorer.js*',r=>r.fulfill({body:''}));
  await page.goto(process.env.VLM_URL || 'http://127.0.0.1:8765/#vlm-comparison');
  await page.waitForSelector('.vlm-point');
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.vlm-point').count(),4,'Exactly one observation per model');
  assert.equal(await page.locator('.vlm-guide').count(),4);
  assert.equal(new Set(data.models.map(m=>m.color)).size,4);
  for (const width of [1440,768,390,320]) {
   await page.setViewportSize({width,height:1200});
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await page.waitForFunction(()=>Math.abs(document.querySelector('#vlm-plot svg').viewBox.baseVal.width-document.querySelector('#vlm-plot').clientWidth)<2);
   for (const m of data.models) {
    const point=page.locator(`.vlm-point[data-model="${m.id}"]`);
    assert.equal(await point.getAttribute('data-recall'),String(m.recall));
    assert.equal(await point.getAttribute('data-runtime'),String(m.runtime));
    assert.equal(await point.getAttribute('data-area'),String(m.area));
    await page.locator(`#vlm-models button[data-model="${m.id}"]`).click();
    assert.equal(await point.getAttribute('aria-pressed'),'true');
    assert.deepEqual(await page.locator('.vlm-detail dd').allTextContents(),[m.recall.toFixed(1)+'%',m.runtime.toFixed(1)+'s',m.area.toFixed(1)+'%']);
   }
   const overflow=await page.locator('#vlm-comparison').evaluate(e=>({x:e.scrollWidth>e.clientWidth+1,right:e.getBoundingClientRect().right>innerWidth+1,svg:[...e.querySelectorAll('svg text')].filter(t=>t.getBoundingClientRect().right>e.getBoundingClientRect().right+1).map(t=>t.textContent)}));
   assert.deepEqual(overflow,{x:false,right:false,svg:[]});
   await page.click('#vlm-models button[data-model="qwen3b"]');
   await page.locator('#vlm-comparison').screenshot({path:path.join(shots,`chart-${width}.png`),animations:'disabled'});
  }
  await page.locator('#vlm-models button').first().focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#vlm-comparison').getAttribute('data-selected'),'chatgpt');
  await page.keyboard.press('End');
  assert.equal(await page.locator('#vlm-comparison').getAttribute('data-selected'),'gemini');
  await page.locator('.vlm-point').first().focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#vlm-comparison').getAttribute('data-selected'),'chatgpt');
  await page.click('.vlm-values summary');
  const rows=await page.locator('.vlm-values tbody tr').evaluateAll(es=>es.map(e=>[...e.querySelectorAll('td')].map(td=>Number(td.textContent))));
  assert.deepEqual(rows,[expected.gemini,expected.chatgpt,expected.qwen72b,expected.qwen3b]);
  assert.deepEqual(errors,[]);
  // Failure leaves a complete readable source table rather than an empty figure.
  await page.route('**/table6-vlms.json',r=>r.fulfill({status:503,body:''}));
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('.vlm-values').open);
  assert.equal(await page.locator('.vlm-values tbody tr').count(),4);
  console.log('Passed: 12 exact Table 6 values, four measured points, distinct colors/icons, inspector, keyboard/touch, four viewport sizes and source-table fallback.');
  console.log('Screenshots:',shots);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
