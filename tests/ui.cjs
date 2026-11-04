const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const headers='馬名,記録日,レース,観察・レース内容,当時の評価・仮説,次走チェックポイント,次走注目,記録者,出典チャット,記録種別,備考,本人の見解,チャッピーの見解';
const csv=headers+'\n検証用の架空馬,2026-11-04,架空レース,観察,仮説,確認,○,検証,検証,レース総括,備考,架空の本人見解,架空の補足';
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:2});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8765');await page.waitForSelector('.horse-card');
 for(const width of [320,375,390,430,768,1280]){
 await page.setViewportSize({width,height:900});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
 assert(await page.locator('h1').evaluate(el=>el.scrollWidth<=el.clientWidth),`title ${width}`);
 assert.equal(await page.locator('.horse-card').count(),6);
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('#search').fill('つきの');assert.equal(await page.locator('.horse-card').count(),1);
 await page.locator('#search').fill('');await page.locator('[data-filter="all"]').click();assert.equal(await page.locator('.note').count(),4);
 await page.locator('#sort').selectOption('old');
 await page.locator('#header-update').click();assert(await page.locator('#management-menu').evaluate(el=>el.open));assert(await page.locator('#google-settings').evaluate(el=>el.open));
 await page.keyboard.press('Escape');assert.equal(await page.locator('#menu-button').getAttribute('aria-expanded'),'false');
 await page.locator('#menu-button').click();
 await page.locator('#csv-file').setInputFiles({name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await page.waitForFunction(()=>document.querySelector('#source-tag').textContent==='CSV');
 await page.locator('#close-menu').click();assert.match(await page.locator('#detail').innerText(),/架空の本人見解/);
 const saved=await page.evaluate(()=>localStorage.getItem('horse-notes-data-v2'));
 await page.reload();await page.waitForSelector('.horse-card');assert.equal(await page.evaluate(()=>localStorage.getItem('horse-notes-data-v2')),saved);
 await page.locator('#menu-button').click();await page.locator('#data-source').selectOption('sample');assert.equal(await page.locator('.horse-card').count(),6);
 await page.locator('#data-source').selectOption('imported');await page.locator('#close-menu').click();
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await context.setOffline(true);await page.reload();await page.waitForSelector('.horse-card');assert.match(await page.locator('.horse-card').innerText(),/検証用の架空馬/);await context.setOffline(false);
 // Mock Google's official library and API; never use real credentials or spreadsheet data.
 await context.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'application/javascript',body:`window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:opts=>({requestAccessToken:()=>opts.callback({access_token:'synthetic-test-token',expires_in:3600})}),revoke:(t,cb)=>cb({successful:true})}}};`}));
 let fail=false;let release;
 await context.route('https://sheets.googleapis.com/**',async r=>{if(release)await new Promise(resolve=>release.resolve=resolve);await r.fulfill({status:fail?403:200,contentType:'application/json',body:JSON.stringify({majorDimension:'ROWS',values:[headers.split(','),csv.split('\n')[1].split(',')]})});});
 await page.locator('#menu-button').click();await page.locator('#google-settings').evaluate(el=>el.open=true);
 await page.locator('#google-client-id').fill('synthetic-test.apps.googleusercontent.com');await page.locator('#google-settings-save').click();await page.waitForFunction(()=>!document.querySelector('#google-update').disabled);await page.locator('#close-menu').click();
 release={};await page.locator('#header-update').click();await page.waitForFunction(()=>document.querySelector('#header-update').dataset.state==='loading');assert(await page.locator('#header-update').isDisabled());while(!release.resolve)await page.waitForTimeout(25);release.resolve();release=null;
 await page.waitForFunction(()=>document.querySelector('#header-update').dataset.state==='success');assert.match(await page.locator('#header-sync-status').innerText(),/取得し/);
 const sheetsSaved=await page.evaluate(()=>localStorage.getItem('horse-notes-data-v2'));
 fail=true;await page.locator('#header-update').click();await page.waitForFunction(()=>document.querySelector('#header-update').dataset.state==='error');assert.equal(await page.evaluate(()=>localStorage.getItem('horse-notes-data-v2')),sheetsSaved);
 assert(!await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('synthetic-test-token'))));
 // Legacy restore must not rewrite or delete the existing key.
 await page.evaluate(s=>{localStorage.removeItem('horse-notes-data-v2');localStorage.setItem('horse-notes-csv-v1',s)},saved);
 await page.reload();await page.waitForSelector('.horse-card');assert.match(await page.locator('.horse-card').innerText(),/検証用の架空馬/);assert.equal(await page.evaluate(()=>localStorage.getItem('horse-notes-csv-v1')),saved);
 assert.deepEqual(errors,[]);console.log('PASS: 320–1280px layout; menu/Escape; search/filter/sort; CSV; v2 and v1 restoration; data switching; offline; mocked Sheets loading/success/403 preservation; no token persistence; no JS errors');
 await context.close();
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
