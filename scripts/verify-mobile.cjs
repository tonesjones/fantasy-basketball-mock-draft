// Optional browser check: NODE_PATH must include Playwright. Uses bundled Chromium;
// set MOBILE_BROWSER_CHANNEL=msedge to use installed Edge instead.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const entry = process.env.MOBILE_ENTRYPOINT || '/';

async function main() {
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0]);
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
      res.writeHead(404); res.end(); return;
    }
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[path.extname(file)];
    res.setHeader('Content-Type', type || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch(process.env.MOBILE_BROWSER_CHANNEL ? { channel: process.env.MOBILE_BROWSER_CHANNEL, headless: true } : { headless: true });
  try {
    for (const viewport of [{width:390,height:844},{width:320,height:568},{width:430,height:932},{width:667,height:375}]) {
      const page = await browser.newPage({viewport,hasTouch:true});
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}${entry}`);
      await page.locator('#mdstart').tap();
      await page.locator('.mobile-nav').waitFor();
      assert.equal(await page.locator('.mobile-nav button').count(), 4);
      assert.equal(await page.locator('.turnbar').getByText('More',{exact:true}).count(),0);
      assert.equal(await page.locator('.cols > .side').isVisible(), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const bounds = await page.locator('.mobile-nav').boundingBox();
      assert.ok(bounds.y + bounds.height <= viewport.height + 1, 'Navigation fits viewport');
      const playerScroll = await page.locator('#mdplist').evaluate(n => {
        n.scrollTop = 350; return n.scrollTop;
      });
      assert.ok(playerScroll > 0, 'Player list can scroll');
      await page.getByRole('button', {name:'My team',exact:true}).tap();
      assert.equal(await page.locator('.cols > .avail').isVisible(), false);
      assert.equal(await page.locator('.cols > .side').isVisible(), true);
      await page.getByRole('button', {name:'Players',exact:true}).tap();
      assert.equal(await page.locator('#mdplist').evaluate(n=>n.scrollTop), playerScroll);
      const row = page.locator('.prow[data-pi]').nth(8);
      const pi = await row.getAttribute('data-pi');
      await row.locator('.prank').tap();
      await page.locator('#mdplayersheet[open]').waitFor();
      assert.ok((await page.locator('.mobile-player-info h3').innerText()).length > 0);
      if(entry==='/framework7.html'){
        const expand=page.locator('.f7-preview-expand');
        await page.waitForTimeout(450);
        const partial=await page.locator('#mdplayersheet').boundingBox();
        await expand.tap();
        await page.waitForTimeout(450);
        const full=await page.locator('#mdplayersheet').boundingBox();
        assert.ok(full.y<partial.y-20,'Framework7 expands the sheet');
        assert.equal(await expand.getAttribute('aria-expanded'),'true');
        await expand.tap();
        await page.waitForTimeout(450);
        const grip=await page.locator('.draft-preview-grip').boundingBox();
        const session=await page.context().newCDPSession(page);
        const x=grip.x+grip.width/2,y=grip.y+grip.height/2;
        await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
        const end=Math.min(viewport.height-5,y+260);
        for(let step=1;step<=8;step++){
          await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+(end-y)*step/8}]});
          await page.waitForTimeout(15);
        }
        await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await session.detach();
        await page.locator('#mdplayersheet[open]').waitFor({state:'hidden'});
        assert.equal(await page.locator('.mobile-nav').evaluate(n=>n.inert),false);
        await row.locator('.prank').tap();
        await page.locator('#mdplayersheet[open]').waitFor();
      }
      const keptScroll = await page.locator('#mdplist').evaluate(n=>n.scrollTop);
      await page.keyboard.press('Escape');
      await page.locator('#mdplayersheet[open]').waitFor({state:'hidden'});
      assert.equal(await page.locator('#mdplayersheet').evaluate(n=>n.hasAttribute('open')), false);
      assert.equal(await page.locator('#mdplist').evaluate(n=>n.scrollTop), keptScroll);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.pi), pi);
      await page.locator('#mdfilters summary').tap();
      await page.locator('[data-f="PG"]').tap();
      await page.getByRole('button',{name:'Done',exact:true}).tap();
      assert.equal(await page.locator('#mdfilters').evaluate(n=>n.open), false);
      await page.getByRole('button',{name:'Board',exact:true}).tap();
      await page.locator('table.board').waitFor();
      await page.getByRole('button',{name:'Analysis',exact:true}).tap();
      assert.equal(await page.locator('#mdscarcity').isVisible(), true);
      await page.getByRole('button',{name:'Players',exact:true}).tap();
      assert.equal(await page.locator('[data-f="PG"]').getAttribute('class'), 'fchip sel');
      await page.locator('#mdq').fill('Curry');
      await page.locator('.prow[data-pi]').first().locator('.prank').tap();
      const before = await page.evaluate(() => JSON.parse(localStorage.getItem('fantasy-basketball-mock-draft.v2')).state.log.length);
      await page.locator('.pc-draft:not([disabled])').waitFor();
      await page.locator('#mdplayersheet .side').evaluate(n=>{n.scrollTop=n.scrollHeight;});
      const draftBox=await page.locator('.pc-draft').boundingBox();
      const closeBox=await page.locator('.mobile-sheet-close').boundingBox();
      assert.ok(draftBox.y>=0&&draftBox.y+draftBox.height<=viewport.height,'Draft stays reachable after scrolling advice');
      assert.ok(closeBox.y>=0&&closeBox.y+closeBox.height<=viewport.height,'Close stays reachable after scrolling advice');
      await page.locator('#mdplayersheet .side').evaluate(n=>{n.scrollTop=0;});
      if(process.env.MOBILE_SCREENSHOT && viewport.width===390){
        await page.screenshot({path:process.env.MOBILE_SCREENSHOT.replace('.png','-details.png')});
      }
      await page.locator('.pc-draft').tap();
      assert.equal(await page.locator('#mdplayersheet').evaluate(n=>n.hasAttribute('open')), false);
      assert.equal(await page.locator('#mdq').inputValue(), 'Curry');
      const after = await page.evaluate(() => JSON.parse(localStorage.getItem('fantasy-basketball-mock-draft.v2')).state.log.length);
      assert.ok(after > before, 'Draft button executes the pick');
      await page.getByRole('button',{name:'Analysis',exact:true}).tap();
      await page.locator('#mdundo').tap();
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fantasy-basketball-mock-draft.v2')).state.log.length),before);
      await page.getByRole('button',{name:'Players',exact:true}).tap();
      assert.deepEqual(errors, []);
      if (process.env.MOBILE_SCREENSHOT && viewport.width===390) {
        await page.locator('#mdq').fill('');
        await page.screenshot({path:process.env.MOBILE_SCREENSHOT});
      }
      await page.setViewportSize({width:1280,height:900});
      await page.locator('.mobile-nav').waitFor({state:'detached'});
      assert.equal(await page.locator('.mobile-nav').count(), 0);
      assert.equal(await page.locator('.viewtabs').isVisible(), true);
      assert.equal(await page.locator('.avail').isVisible(), true);
      assert.equal(await page.locator('.side').isVisible(), true);
      if(viewport.width===390){
        await page.setViewportSize(viewport);
        await page.locator('.mobile-nav').waitFor();
        await page.locator('#mdq').fill('');
        await page.locator('#mdfilters summary').tap();
        await page.locator('[data-f="All"]').tap();
        await page.getByRole('button',{name:'Done',exact:true}).tap();
        for(let turn=0;turn<13;turn++){
          await page.locator('.prow[data-pi]').first().locator('.prank').tap();
          await page.locator('.pc-draft:not([disabled])').waitFor();
          await page.locator('.pc-draft').tap();
          assert.ok(await page.locator('.sheet-backdrop').count()<=1,'Sheet backdrops do not accumulate across renders');
        }
        assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('fantasy-basketball-mock-draft.v2')).state.phase),'done');
        assert.equal(await page.evaluate(()=>document.body.classList.contains('mobile-drafting')),false);
        assert.equal(await page.locator('#mdplayersheet[open]').count(),0);
        assert.equal(await page.locator('[inert]').count(),0);
        assert.equal(await page.locator('.sheet-backdrop').count(),0);
      }
      await page.close();
      console.log(`PASS mobile ${viewport.width}×${viewport.height}, draft, undo, navigation, scroll, desktop resize`);
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
