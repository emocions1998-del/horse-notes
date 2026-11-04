const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const headers='馬名,記録日,レース,観察・レース内容,当時の評価・仮説,次走チェックポイント,次走注目,記録者,出典チャット,記録種別,備考,本人の見解,チャッピーの見解';
const csv=headers+'\n検証用の架空馬,2026-11-04,架空レース,観察,仮説,確認,○,検証,検証,レース総括,備考,架空の本人見解,架空の補足';
const url=process.env.BASE_URL || 'http://127.0.0.1:8769';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:2,reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const ready=()=>page.waitForFunction(()=>document.querySelector('#header-update').dataset.state);
  const search=async text=>{await page.locator('#search').fill(text);};
  const select=async()=>{await page.locator('.horse-card').first().click();assert(await page.locator('#detail').isVisible());};
  await page.goto(url);await ready();
  assert.equal(await page.locator('.horse-card').count(),0);assert(await page.locator('#detail').isHidden());
  await search('ツキノ');assert.equal(await page.locator('.horse-card').count(),0); // No implicit sample search.
  await page.locator('#menu-button').click();await page.locator('#show-sample').click();await page.locator('#close-menu').click();
  for(const width of [320,375,390,430,768,844,1280]) {
   await page.setViewportSize({width,height:width===844?390:900});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
   assert(await page.locator('h1').evaluate(el=>el.scrollWidth<=el.clientWidth),`title ${width}`);
   const boxes=await page.locator('.brand,.local-badge,#header-update,#menu-button').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right}}));
   for(let i=1;i<boxes.length;i++)assert(boxes[i].left>=boxes[i-1].right,`header overlap ${width}`);
   await search('つ');assert.equal(await page.locator('.horse-card').count(),1);assert(await page.locator('#detail').isHidden());
   assert((await page.locator('.horse-card').boundingBox()).height<90);
   await select();
   await page.evaluate(()=>window.scrollTo(0,400));
   assert.equal(Math.round((await page.locator('.app-header').boundingBox()).y),0);
   await search('');assert.equal(await page.locator('.horse-card').count(),0);assert(await page.locator('#detail').isHidden());
   if(await page.locator('#close-search').isVisible())await page.locator('#close-search').click();
  }
  await page.setViewportSize({width:390,height:844});
  await search('つきの');await select();
  const headerBottom=await page.locator('.app-header').evaluate(el=>el.getBoundingClientRect().bottom);
  assert((await page.locator('#horse-name').boundingBox()).y>=headerBottom);
  await page.locator('[data-filter="all"]').click();assert.equal(await page.locator('.note').count(),4);await page.locator('#sort').selectOption('old');
  await search('存在しない架空の検索語');assert.equal(await page.locator('.horse-card').count(),0);assert(await page.locator('#detail').isHidden());
  await page.locator('#reset-search').click();assert.equal(await page.locator('#search').inputValue(),'');assert(await page.locator('#horse-list').isHidden());
  await page.locator('#header-update').click();assert(await page.locator('#management-menu').evaluate(el=>el.open));assert(await page.locator('#google-settings').evaluate(el=>el.open));
  await page.keyboard.press('Escape');assert.equal(await page.locator('#menu-button').getAttribute('aria-expanded'),'false');
  await page.locator('#menu-button').click();
  await page.locator('#csv-file').setInputFiles({name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await page.waitForFunction(()=>document.querySelector('#source-tag').textContent==='CSV');await page.locator('#close-menu').click();
  await search('検');assert.equal(await page.locator('.horse-card').count(),1);await select();assert.match(await page.locator('#detail').innerText(),/架空の本人見解/);
  const saved=await page.evaluate(()=>localStorage.getItem('horse-notes-data-v2'));
  await page.reload();await ready();assert.equal(await page.evaluate(()=>localStorage.getItem('horse-notes-data-v2')),saved);assert.equal(await page.locator('.horse-card').count(),0);
  await search('ツキノ');assert.equal(await page.locator('.horse-card').count(),0); // Never mix demo with imported data.
  await page.locator('#menu-button').click();await page.locator('#data-source').selectOption('sample');await page.locator('#close-menu').click();await search('ツ');assert.equal(await page.locator('.horse-card').count(),1);
  await page.locator('#menu-button').click();await page.locator('#data-source').selectOption('imported');await page.locator('#close-menu').click();
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);await page.reload();await ready();await search('検');await select();assert.match(await page.locator('#detail').innerText(),/架空の本人見解/);await context.setOffline(false);
  // Synthetic Google responses only; no real credentials or memo data.
  await context.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'application/javascript',body:`window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:opts=>({requestAccessToken:()=>opts.callback({access_token:'synthetic-test-token',expires_in:3600})}),revoke:(t,cb)=>cb({successful:true})}}};`}));
  let fail=false,release;
  await context.route('https://sheets.googleapis.com/**',async r=>{if(release)await new Promise(resolve=>release.resolve=resolve);await r.fulfill({status:fail?403:200,contentType:'application/json',body:JSON.stringify({majorDimension:'ROWS',values:[headers.split(','),csv.split('\n')[1].split(',')]})});});
  await page.locator('#menu-button').click();await page.locator('#google-settings').evaluate(el=>el.open=true);await page.locator('#google-client-id').fill('synthetic-test.apps.googleusercontent.com');await page.locator('#google-settings-save').click();await page.waitForFunction(()=>!document.querySelector('#google-update').disabled);await page.locator('#close-menu').click();
  release={};await page.locator('#header-update').click();await page.waitForFunction(()=>document.querySelector('#header-update').dataset.state==='loading');assert(await page.locator('#header-update').isDisabled());while(!release.resolve)await page.waitForTimeout(25);release.resolve();release=null;
  await page.waitForFunction(()=>document.querySelector('#header-update').dataset.state==='success');assert.match(await page.locator('#header-sync-status').innerText(),/取得し/);
  const sheetsSaved=await page.evaluate(()=>localStorage.getItem('horse-notes-data-v2'));
  fail=true;await page.locator('#header-update').click();await page.waitForFunction(()=>document.querySelector('#header-update').dataset.state==='error');assert.equal(await page.evaluate(()=>localStorage.getItem('horse-notes-data-v2')),sheetsSaved);
  assert(!await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('synthetic-test-token'))));
  await page.evaluate(s=>{localStorage.removeItem('horse-notes-data-v2');localStorage.setItem('horse-notes-csv-v1',s)},saved);
  await page.reload();await ready();await search('検');await select();assert.equal(await page.evaluate(()=>localStorage.getItem('horse-notes-csv-v1')),saved);assert.equal(await page.locator('#google-client-id').inputValue(),'synthetic-test.apps.googleusercontent.com');
  assert.deepEqual(errors,[]);
  // Simulate nonzero safe-area in the stylesheet; this does not emulate iOS system UI.
  const insetContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:2,serviceWorkers:'block'});
  await insetContext.route('**/style.css?v=2.1.4',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replaceAll('env(safe-area-inset-top,0px)','47px')});});
  const insetPage=await insetContext.newPage();await insetPage.goto(url);await insetPage.waitForSelector('#search');
  assert.equal((await insetPage.locator('.status-bar-space').boundingBox()).height,47);
  assert.equal(await insetPage.locator('.status-bar-space').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)');
  assert.equal((await insetPage.locator('.topbar').boundingBox()).y,47);
  const toolbar=await insetPage.locator('.topbar').evaluate(el=>{
   const s=getComputedStyle(el);return {radius:s.borderTopLeftRadius,otherRadius:s.borderTopRightRadius,top:s.paddingTop,bottom:s.paddingBottom,border:s.borderTopStyle};
  });
  assert.deepEqual(toolbar,{radius:'0px',otherRadius:'0px',top:'4px',bottom:'4px',border:'solid'});
  const insetSpacing=await insetPage.locator('.status-bar-space').evaluate(el=>{const s=getComputedStyle(el);return [s.paddingTop,s.paddingBottom,s.marginTop,s.marginBottom]});
  assert.deepEqual(insetSpacing,['0px','0px','0px','0px']);
  await insetPage.locator('#menu-button').click();await insetPage.locator('#show-sample').click();await insetPage.locator('#close-menu').click();await insetPage.locator('#search').fill('ツ');
  if(process.env.UI_SCREENSHOT)await insetPage.screenshot({path:process.env.UI_SCREENSHOT});
  await insetPage.evaluate(()=>window.scrollTo(0,300));assert.equal(Math.round((await insetPage.locator('.app-header').boundingBox()).y),0);
  await insetContext.close();await context.close();
  console.log('PASS: 320–1280px/landscape layout; sticky header and simulated 47px inset; blank/one-character/clear search; explicit demo; saved-only results; card selection/scroll; menu/filter/sort; CSV; v1/v2/config restoration; offline; mocked Sheets loading/success/403 preservation; no token persistence or JS errors');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
