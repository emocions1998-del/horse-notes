// Cache-upgrade and Japanese composition regression, using synthetic data only.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const headers=['馬名','記録日','レース','観察・レース内容','当時の評価・仮説','次走チェックポイント','次走注目','記録者','出典チャット','記録種別','備考','本人の見解','チャッピーの見解'];
const values=[headers];
for(let i=0;i<35;i++)for(let n=0;n<(i<9?2:1);n++)values.push([i===0?'セラフィック検証馬':i===1?'テストセラフィック':`検証架空馬${String(i).padStart(2,'0')}`,'2026-11-04','架空レース','架空の観察','架空の仮説','確認','○','検証','検証','レース総括','架空の備考','架空の本人見解','架空の補足']);
const csvText=values.map(row=>row.join(',')).join('\n');
const mapping=Object.fromEntries(['name','date','race','observation','hypothesis','checkpoint','watch','recorder','source','kind','remarks','personal','chappy'].map((key,i)=>[key,i]));
const saved={version:1,csvText,mapping,fileName:'Google Sheets · 馬メモ一覧',sourceType:'google-sheets',source:{spreadsheetId:'synthetic-test-sheet',range:"'馬メモ一覧'!A1:M"},importedAt:'2026-11-04T00:00:00Z',fetchedAt:'2026-11-04T00:00:00Z',active:'imported'};
// This is the removed heading access from ver.2.1, reduced to its failure trigger.
const staleApp=`const s=document.querySelector('#search');function draw(){document.querySelector('#total-count').textContent='35頭';}s.addEventListener('input',draw);draw();`;
let legacy=true,unversionedRequests=0,versionedRequests=0;
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 const name=u.pathname==='/'?'index.html':u.pathname.slice(1);
 if(name==='app.js'){
  res.setHeader('Cache-Control','public, max-age=3600');
  if(!u.search){unversionedRequests++;res.setHeader('Content-Type','application/javascript');res.end(staleApp);return;}
  versionedRequests++;
 }
 const file=path.resolve(root,name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
 res.setHeader('Content-Type',mime[path.extname(file)]||'text/plain');
 let content=fs.readFileSync(file);
 if(name==='index.html'){
  res.setHeader('Cache-Control','no-store');
  if(legacy)content=Buffer.from(content.toString().replaceAll('?v=2.1.3','').replaceAll('ver.2.1.3','ver.2.1.1'));
 }
 res.end(content);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/`;
 const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,reducedMotion:'reduce'});
  await c.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'application/javascript',body:`window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:o=>({requestAccessToken:()=>o.callback({access_token:'synthetic-token',expires_in:3600})})}}};`}));
  await c.route('https://sheets.googleapis.com/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({majorDimension:'ROWS',values})}));
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url);await p.locator('#search').fill('セラフィック');
  assert.equal(await p.locator('.horse-card').count(),0);assert(errors.some(e=>e.includes('textContent')));
  assert.equal(unversionedRequests,1);
  await p.evaluate(s=>{
   localStorage.setItem('horse-notes-data-v2',JSON.stringify(s));
   localStorage.setItem('horse-notes-google-client-id-v1','synthetic.apps.googleusercontent.com');
  },saved);
  errors.length=0;legacy=false;
  await p.goto(url+'?upgrade=2.1.3');
  await p.waitForFunction(()=>document.querySelector('#header-update').dataset.state);
  assert.equal(versionedRequests,1);assert.equal(unversionedRequests,1);
  assert.equal(await p.locator('.horse-card').count(),0);
  assert.equal(await p.evaluate(()=>localStorage.getItem('horse-notes-data-v2')),JSON.stringify(saved));
  assert.equal(await p.locator('#google-client-id').inputValue(),'synthetic.apps.googleusercontent.com');
  assert.equal(await p.evaluate(()=>{const s=window.HorseCSV.restore(localStorage.getItem('horse-notes-data-v2'));return s.result.horses.length}),35);
  assert.equal(await p.evaluate(()=>window.HorseCSV.restore(localStorage.getItem('horse-notes-data-v2')).result.count),44);
  await p.locator('#search').fill('フィック');assert.equal(await p.locator('.horse-card').count(),0);
  await p.locator('#search').fill('セ');assert.equal(await p.locator('.horse-card').count(),1);
  await p.locator('#search').fill('セラフィック');assert.equal(await p.locator('.horse-card').count(),1);
  await p.locator('.horse-card').click();assert(await p.locator('#detail').isVisible());
  const compose=async(finalEvent)=>p.locator('#search').evaluate((el,event)=>{
   el.focus();el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
   el.value='せら';el.dispatchEvent(new CompositionEvent('compositionupdate',{bubbles:true,data:'せら'}));
   el.dispatchEvent(new InputEvent('input',{bubbles:true,data:'せら',inputType:'insertCompositionText',isComposing:true}));
   el.value='セラフィック';
   el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:el.value}));
   if(event)el.dispatchEvent(new InputEvent('input',{bubbles:true,data:el.value,inputType:'insertText',isComposing:false}));
  },finalEvent);
  for(const extraInput of [false,true]){
   await compose(extraInput);assert.equal(await p.locator('.horse-card').count(),1);assert(await p.locator('#horse-list').isVisible());
   await p.locator('.horse-card').click();assert(await p.locator('#detail').isVisible());
   await p.locator('#search').dispatchEvent('change');assert(await p.locator('#detail').isVisible());
  }
  await p.locator('#search').evaluate(el=>{el.value='';el.dispatchEvent(new Event('search',{bubbles:true}));});
  assert(await p.locator('#horse-list').isHidden());assert(await p.locator('#detail').isHidden());
  await p.locator('#header-update').click();await p.waitForFunction(()=>document.querySelector('#header-update').dataset.state==='success');
  await p.locator('#search').fill('セラフィック');assert.equal(await p.locator('.horse-card').count(),1);
  await p.locator('#menu-button').click();await p.locator('#data-source').selectOption('sample');await p.locator('#close-menu').click();
  for(const text of ['ア','ｱ','あ']){
   await p.locator('#search').fill(text);
   assert.deepEqual(await p.locator('.horse-info strong').allTextContents(),['アオバノキセキ']);
   assert(await p.locator('#horse-list').isVisible());
  }
  await p.locator('#search').fill('キセキ');assert.equal(await p.locator('.horse-card').count(),0);
  // An in-memory fixture proves reading-only matches without editing shipped sample data.
  await p.evaluate(()=>window.HORSES.push({...window.HORSES[0],id:'reading-only-fixture',name:'漢字架空馬',reading:'あかつき'}));
  await p.locator('#search').fill('ア');
  assert.deepEqual(await p.locator('.horse-info strong').allTextContents(),['アオバノキセキ','漢字架空馬']);
  for(const text of ['あか','アカ','ｱｶ']){await p.locator('#search').fill(text);assert.deepEqual(await p.locator('.horse-info strong').allTextContents(),['漢字架空馬']);}
  await p.locator('#search').fill('かつ');assert.equal(await p.locator('.horse-card').count(),0);
  await p.locator('#search').fill('ア');
  await p.locator('.horse-card').first().click();assert(await p.locator('#detail').isVisible());
  await p.locator('#search').fill('');assert(await p.locator('#horse-list').isHidden());
  // Return to the app's canonical start_url before checking offline navigation.
  await p.goto(url);await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const cached=await p.evaluate(async()=>{const key=(await caches.keys()).find(k=>k.endsWith('ver2-1-3-prefix'));return (await (await caches.open(key)).keys()).map(r=>new URL(r.url).pathname+new URL(r.url).search)});
  for(const asset of ['app.js','style.css','csv-import.js','google-sheets.js'])assert(cached.some(p=>p.endsWith('/'+asset+'?v=2.1.3')));
  await p.locator('#menu-button').click();await p.locator('#data-source').selectOption('imported');await p.locator('#close-menu').click();
  await c.setOffline(true);await p.reload();await p.locator('#search').fill('セラフィック');assert.equal(await p.locator('.horse-card').count(),1);await p.locator('.horse-card').click();assert(await p.locator('#detail').isVisible());
  assert.deepEqual(errors,[]);await c.close();
  console.log('PASS: mixed-version failure reproduced; old cached URL bypassed; 35 horses/44 notes restored and fetched through mocked Sheets; prefix matches exclude mid-name/reading; sample ア/ｱ/あ; reading-only matches; IME intermediate/commit with and without final input; duplicate change/card tap; native clear; versioned precache/offline; saved data and Google ID preserved');
 } finally {await b.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);server.close();process.exit(1)});
