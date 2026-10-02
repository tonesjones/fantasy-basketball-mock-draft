// Optional browser check: NODE_PATH must include Playwright. Uses bundled Chromium (MOBILE_BROWSER_CHANNEL=msedge for Edge).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

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
      const page = await browser.newPage({viewport});
      const errors = [], averageFetches = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('request', r => { if (r.url().includes('player-averages.js')) averageFetches.push(r.url()); });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      assert.equal(await page.locator('#mdstart').innerText(), 'Start draft', 'Phone setup wording');
      await page.locator('#mdstart').click();
      await page.locator('.mobile-nav').waitFor();
      assert.equal(await page.locator('.mobile-nav button').count(), 4);
      assert.equal(await page.locator('.turnbar').getByText('More',{exact:true}).count(),0);
      const restart = page.locator('.turnbar #mdnew');
      assert.equal(await restart.isVisible(), true, 'Restart visible in phone header');
      const restartBox = await restart.boundingBox(), pickBox = await page.locator('.pickhead').boundingBox();
      assert.ok(restartBox.y < pickBox.y + pickBox.height, 'Restart sits on the Pick N row');
      if (viewport.width === 390) {
        await page.locator('.prow[data-pi]').first().locator('.prank').click();
        await page.locator('.pc-draft').click();
        const logLen = () => page.evaluate(() => JSON.parse(localStorage.getItem('fantasy-basketball-mock-draft.v2')).state.log.length);
        const drafted = await logLen();
        assert.ok(drafted > 0);
        await restart.click();
        assert.equal(await restart.innerText(), 'Tap again to restart');
        assert.equal(await logLen(), drafted, 'One tap does not restart');
        await page.waitForTimeout(3300);
        assert.equal(await restart.innerText(), 'Restart', 'Restart disarms after 3s');
        await restart.click();
        await restart.click();
        await page.locator('#mdstart').waitFor();
        await page.locator('#mdstart').click();
        await page.locator('.mobile-nav').waitFor();
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fantasy-basketball-mock-draft.v2')).state.userTurns.length), 0, 'Second tap restarts');
      }
      assert.equal(await page.locator('.cols > .side').isVisible(), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const bounds = await page.locator('.mobile-nav').boundingBox();
      assert.ok(bounds.y + bounds.height <= viewport.height + 1, 'Navigation fits viewport');
      const playerScroll = await page.locator('#mdplist').evaluate(n => {
        n.scrollTop = 350; return n.scrollTop;
      });
      assert.ok(playerScroll > 0, 'Player list can scroll');
      await page.getByRole('button', {name:'My team',exact:true}).click();
      assert.equal(await page.locator('.cols > .avail').isVisible(), false);
      assert.equal(await page.locator('.cols > .side').isVisible(), true);
      await page.getByRole('button', {name:'Players',exact:true}).click();
      assert.equal(await page.locator('#mdplist').evaluate(n=>n.scrollTop), playerScroll);
      const row = page.locator('.prow[data-pi]').nth(8);
      const pi = await row.getAttribute('data-pi');
      await row.locator('.prank').click();
      await page.locator('#mdplayersheet[open]').waitFor();
      assert.ok((await page.locator('.mobile-player-info h3').innerText()).length > 0);
      await page.locator('#mdplayersheet .m-per-game, #mdplayersheet .m-player-profile p.muted:not(.m-avg-wait)').first().waitFor();
      assert.equal(await page.locator('#mdplayersheet .m-avg-wait').count(), 0, 'Per-game averages finish loading in the sheet');
      assert.equal(averageFetches.length, 1, 'Averages are fetched once, on the first sheet open');
      const keptScroll = await page.locator('#mdplist').evaluate(n=>n.scrollTop);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#mdplayersheet').evaluate(n=>n.open), false);
      assert.equal(await page.locator('#mdplist').evaluate(n=>n.scrollTop), keptScroll);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.pi), pi);
      await page.locator('#mdfilters summary').click();
      await page.locator('[data-f="PG"]').click();
      await page.getByRole('button',{name:'Done',exact:true}).click();
      assert.equal(await page.locator('#mdfilters').evaluate(n=>n.open), false);
      await page.getByRole('button',{name:'My team',exact:true}).click();
      await page.locator('[data-mobile-roster="board"]').click();
      await page.locator('table.board').waitFor();
      const youBox = await page.locator('table.board th', {hasText:'Your team'}).boundingBox();
      assert.ok(youBox && youBox.x >= 0 && youBox.x + youBox.width <= viewport.width + 1, 'Board opens on your column');
      assert.equal(await page.locator('.mobile-nav button[aria-current="page"]').innerText(), 'My team', 'Board lives under My team');
      await page.getByRole('button',{name:'Back to roster',exact:true}).click();
      await page.locator('.m-roster-toggle').waitFor();
      await page.getByRole('button',{name:'Analysis',exact:true}).click();
      assert.equal(await page.locator('.m-match-empty').isVisible(), true, 'No matchup cards before your first pick');
      assert.equal(await page.locator('.m-matchup').count(), 0);
      assert.equal(await page.locator('#mdscarcity').count(), 0, 'Scarcity is desktop-only');
      await page.getByRole('button',{name:'Punts',exact:true}).click();
      const commit = page.locator('#mdmobilepuntcommit');
      assert.equal(await commit.isDisabled(), true);
      assert.ok(Number(await commit.evaluate(n=>getComputedStyle(n).opacity)) < 1, 'Disabled commit looks disabled');
      await page.locator('[data-mobile-punt="FT%"]').click();
      assert.equal(await commit.isDisabled(), false);
      await commit.click();
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('fantasy-basketball-mock-draft.v2')).state.puntCats), ['FT%']);
      await page.locator('#mdmobilepuntclear').click();
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('fantasy-basketball-mock-draft.v2')).state.puntCats), []);
      await page.getByRole('button',{name:'Players',exact:true}).click();
      assert.equal(await page.locator('[data-f="PG"]').getAttribute('class'), 'fchip sel');
      await page.locator('#mdq').fill('Curry');
      await page.locator('.prow[data-pi]').first().locator('.prank').click();
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
      await page.locator('.pc-draft').click();
      assert.equal(await page.locator('#mdplayersheet').evaluate(n=>n.open), false);
      const toast = page.locator('#mdpickmoment');
      assert.ok(!/Times/.test(await toast.evaluate(n=>getComputedStyle(n).fontFamily)), 'Pick toast uses the app font');
      const toastBox = await toast.boundingBox(), undoBox = await page.locator('#mdundo').boundingBox();
      assert.ok(toastBox.y > undoBox.y + undoBox.height, 'Pick toast leaves the header Undo visible');
      assert.equal(await page.locator('#mdq').inputValue(), 'Curry');
      const after = await page.evaluate(() => JSON.parse(localStorage.getItem('fantasy-basketball-mock-draft.v2')).state.log.length);
      assert.ok(after > before, 'Draft button executes the pick');
      await page.getByRole('button',{name:'Analysis',exact:true}).click();
      assert.equal(await page.locator('.m-matchup').count(), 11, 'Analysis lists every opponent after a pick');
      await page.locator('#mdundo').click();
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fantasy-basketball-mock-draft.v2')).state.log.length),before);
      await page.getByRole('button',{name:'Players',exact:true}).click();
      assert.deepEqual(errors, []);
      if (process.env.MOBILE_SCREENSHOT && viewport.width===390) {
        await page.locator('#mdq').fill('');
        await page.screenshot({path:process.env.MOBILE_SCREENSHOT});
      }
      await page.setViewportSize({width:1280,height:900});
      await page.locator('.mobile-nav').waitFor({state:'detached'});
      assert.equal(await page.locator('.mobile-nav').count(), 0);
      assert.equal(await page.locator('.viewtabs').isVisible(), true);
      assert.equal(await page.locator('#mdscarcity').isVisible(), true, 'Desktop keeps scarcity');
      assert.equal(await page.locator('.avail').isVisible(), true);
      assert.equal(await page.locator('.side').isVisible(), true);
      if(viewport.width===390){
        await page.setViewportSize(viewport);
        await page.locator('.mobile-nav').waitFor();
        await page.locator('#mdq').fill('');
        assert.equal(await page.locator('#mdq').inputValue(), '');
        await page.locator('#mdfilters summary').click();
        await page.locator('[data-f="All"]').click();
        await page.getByRole('button',{name:'Done',exact:true}).click();
        let pastAdpChecked=false;
        for(let turn=0;turn<13;turn++){
          if(!pastAdpChecked && await page.locator('#mdpastadp').count()){
            await page.locator('#mdpastadp summary').click();
            const item = page.locator('#mdpastadp [data-past-adp-pi]').first();
            const name = await item.locator('b').innerText();
            await item.click();
            await page.locator('#mdplayersheet[open]').waitFor();
            assert.equal(await page.locator('.mobile-sheet-name').innerText(), name, 'Past ADP opens the player sheet');
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#mdpastadp').evaluate(n=>n.open), false, 'Past ADP closes once you choose a player');
            pastAdpChecked=true;
          }
          await page.locator('.prow[data-pi]').first().locator('.prank').click();
          await page.locator('.pc-draft:not([disabled])').waitFor();
          await page.locator('.pc-draft').click();
        }
        assert.ok(pastAdpChecked, 'Past ADP row appeared during the draft');
        assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('fantasy-basketball-mock-draft.v2')).state.phase),'done');
        assert.equal(await page.locator('#mdpastadp').count(), 0, 'No Past ADP on a finished draft');
        assert.equal(await page.evaluate(()=>document.body.classList.contains('mobile-drafting')),true,'Finished draft keeps the phone layout');
        assert.equal(await page.locator('#md').getAttribute('data-mobile-view'),'team','Finished draft lands on My team');
        assert.equal(await page.locator('dialog[open]').count(),0);
        assert.equal(await page.locator('.m-grade-card .gradebadge').isVisible(),true,'Finished draft shows your grade');
        await page.locator('#mdmobilerunback').click();
        await page.locator('#mdstart').waitFor();
      }
      await page.close();
      console.log(`PASS mobile ${viewport.width}×${viewport.height}, draft, undo, navigation, scroll, desktop resize`);
    }
    {
      const page = await browser.newPage({viewport:{width:1280,height:900}});
      const fetched = [], errors = [];
      page.on('request', r => { if (r.url().includes('player-averages.js')) fetched.push(r.url()); });
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      assert.equal(await page.locator('#mdstart').innerText(), 'Start Mock Draft', 'Desktop setup wording unchanged');
      await page.locator('#mdstart').click();
      await page.locator('.viewtabs').waitFor();
      await page.locator('.prow[data-pi]').first().locator('.draftbtn').click();
      await page.waitForTimeout(500);
      assert.equal(await page.locator('#mdpickmoment').evaluate(n=>/Times/.test(getComputedStyle(n).fontFamily)), false, 'Desktop pick toast uses the app font');
      assert.equal(await page.locator('#mdscarcity').isVisible(), true, 'Desktop keeps scarcity');
      assert.deepEqual(fetched, [], 'Desktop never downloads player-averages.js');
      assert.deepEqual(errors, []);
      await page.close();
      console.log('PASS desktop 1280×900, no per-game averages download, scarcity, toast font');
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
