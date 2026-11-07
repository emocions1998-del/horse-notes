// End-to-end race navigation, Sheets/CSV/offline, and mobile viewport tests.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const url=process.env.BASE_URL||'http://127.0.0.1:8770';
const headers=['馬名','記録日','レース','観察・レース内容','当時の評価・仮説','次走チェックポイント','次走注目','記録者','出典チャット','記録種別','備考','本人の見解','チャッピーの見解','レース開催日'];
const row=(name,race,date,recordDate='2026-11-08',kind='レース総括')=>[name,recordDate,race,'架空の観察。\n原文を保持。','仮説','確認','○','検証','検証',kind,'備考','架空の本人見解','補足',date];
const values=[headers,
 row('架空馬甲','菊花賞','2026-10-25'),row('架空馬甲','菊花賞','2026-10-25','2026-10-20','予想段階'),
 row('架空馬乙','菊花賞','2026-10-25'),row('架空馬丙','菊花賞','2026-10-25'),
 row('架空馬甲','菊花賞','2025-10-26'),row('架空馬乙','菊花賞','2026-10-24'),row('架空馬甲','菊花賞','','2030-01-01'),
 row('架空馬甲','JBCクラシック','2026-11-03','2026-11-09'),row('架空馬乙','JBCスプリント','2026-11-03'),row('架空馬丙','JBCレディスクラシック','2026-11-03'),
 row('架空馬甲','天皇賞（秋）','2026-11-01'),
 ...Array.from({length:35},(_,i)=>row(`多数架空馬${i}`,`検索候補レース${String(i).padStart(2,'0')}`,'2026-10-01')),
 ...Array.from({length:35},(_,i)=>row(`多数架空馬${i}`,'多数登録レース','2026-10-02')),
 row('長名検証馬'+'表示確認'.repeat(20),'長いレース名'.repeat(20)+'<em>原文</em>','2026-09-20')];
const csv=values.map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\n');
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await c.addInitScript(()=>{
   const vv=new EventTarget();Object.assign(vv,{width:innerWidth,height:innerHeight,offsetTop:0,offsetLeft:0});Object.defineProperty(window,'visualViewport',{value:vv});
   window.setTestViewport=(height,offsetTop=0)=>{Object.assign(vv,{width:innerWidth,height,offsetTop});vv.dispatchEvent(new Event('resize'));};
  });
  await c.route('**/style.css?v=2.4',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replaceAll('env(safe-area-inset-top,0px)','47px')});});
  await c.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'application/javascript',body:`window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:o=>({requestAccessToken:()=>o.callback({access_token:'synthetic-token',expires_in:3600})})}}};`}));
  let requestedRange='';
  await c.route('https://sheets.googleapis.com/**',r=>{requestedRange=decodeURIComponent(new URL(r.request().url()).pathname);return r.fulfill({contentType:'application/json',body:JSON.stringify({majorDimension:'ROWS',values})});});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.evaluate(()=>setTestViewport(844));
  assert.equal(await p.locator('#horse-search-tab').getAttribute('aria-selected'),'true');
  assert.equal(await p.locator('input[type="search"]').count(),1);
  await p.locator('#menu-button').click();await p.locator('#csv-file').setInputFiles({name:'synthetic-races.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await p.waitForFunction(()=>document.querySelector('#source-tag').textContent==='CSV');
  assert(!await p.locator('#mapping-dialog').evaluate(el=>el.open));await p.locator('#close-menu').click();
  const stored=await p.evaluate(()=>localStorage.getItem('horse-notes-data-v2'));
  await p.locator('#search').fill('架空馬');assert.equal(await p.locator('.horse-card').count(),3);
  await p.locator('#race-search-tab').click();assert.equal(await p.locator('#search').inputValue(),'');
  await p.locator('#search').fill('菊花賞');assert.equal(await p.locator('.race-card').count(),4);
  const dates=await p.locator('.race-card span').allTextContents();
  assert.deepEqual(dates,['2026年 · 2026/10/25','2026年 · 2026/10/24','2025年 · 2025/10/26','開催日未登録・不明']);
  assert.match(await p.locator('.race-card').first().innerText(),/登録馬 3頭/);
  if(process.env.RACE_SCREENSHOT)await p.screenshot({path:process.env.RACE_SCREENSHOT});
  await p.locator('.race-card').first().tap();assert.equal(await p.locator('.race-horse').count(),3);
  assert.match(await p.locator('#selected-race-name').innerText(),/2026年 菊花賞（2026\/10\/25）/);
  assert.match(await p.locator('.race-horse').first().innerText(),/該当メモ 2件/);
  assert(!await p.locator('#search').evaluate(el=>document.activeElement===el));
  await p.locator('.race-horse').first().tap();
  assert(await p.locator('#detail').isVisible());assert.equal(await p.locator('.note.race-match').count(),2);
  assert.equal(await p.locator('.note').count(),6); // Other races remain available.
  assert.equal(await p.evaluate(()=>document.activeElement.id),'memo-row-2');
  const target=await p.locator('#memo-row-2').boundingBox(),head=await p.locator('.app-header').boundingBox();assert(target.y>=head.y+head.height && target.y<head.y+head.height+20);
  await p.locator('[data-filter="after"]').click();assert.equal(await p.locator('.note.race-match').count(),1);
  await p.locator('[data-race-note]').click();assert.equal(await p.locator('.note.race-match').count(),2);
  await p.locator('#sort').selectOption('old');assert.equal(await p.locator('.note').count(),6);
  await p.locator('#search').fill('JBC');assert.equal(await p.locator('.race-card').count(),3);
  await p.locator('#search').fill('ｊｂｃ');assert.equal(await p.locator('.race-card').count(),3);
  await p.locator('#search').fill('天皇賞');assert.equal(await p.locator('.race-card strong').innerText(),'天皇賞（秋）');
  await p.locator('#search').fill('未登録の検索語');assert.match(await p.locator('.empty').innerText(),/レースが見つかりませんでした/);
  await p.locator('#reset-search').click();assert(await p.locator('#horse-list').isHidden());
  await p.locator('#horse-search-tab').click();assert.equal(await p.locator('#search').inputValue(),'架空馬');assert.equal(await p.locator('.horse-card').count(),3);
  // Accessible keyboard switching shares the same input.
  await p.locator('#horse-search-tab').press('ArrowRight');assert.equal(await p.locator('#race-search-tab').getAttribute('aria-selected'),'true');
  for(const width of [320,360,375,390,414,430]){
   await p.setViewportSize({width,height:844});await p.evaluate(()=>setTestViewport(844));
   if(await p.locator('#close-search').isVisible())await p.locator('#close-search').click();
   // A real touch cancels the prior selection's keyboard-alignment timer before focusing.
   await p.evaluate(()=>{document.dispatchEvent(new PointerEvent('pointerdown'));window.scrollTo(0,200);});const scrollBefore=await p.evaluate(()=>scrollY);
   await p.locator('#search').evaluate(el=>el.focus({preventScroll:true}));await p.evaluate(()=>setTestViewport(420,32));
   // Japanese conversion commit without a final input event.
   await p.locator('#search').evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='検索候補';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Enter',keyCode:229,isComposing:true}));el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:el.value}));});
   assert.equal(await p.locator('.race-card').count(),35);await p.locator('#search').press('Enter');
   await p.waitForFunction(()=>document.documentElement.style.getPropertyValue('--search-viewport-height')==='420px');
   const geometry=await p.evaluate(()=>{const list=document.querySelector('#horse-list'),tabs=document.querySelector('.search-tabs').getBoundingClientRect(),controls=document.querySelector('.search-controls').getBoundingClientRect(),header=document.querySelector('.app-header').getBoundingClientRect();return {listTop:list.getBoundingClientRect().top,listBottom:list.getBoundingClientRect().bottom,scrolls:list.scrollHeight>list.clientHeight,tabsTop:tabs.top,tabsBottom:tabs.bottom,controlsTop:controls.top,headerBottom:header.bottom};});
   assert(geometry.tabsTop>=geometry.headerBottom);assert(geometry.controlsTop>=geometry.tabsBottom);assert(geometry.listBottom<=452);assert(geometry.scrolls);
   await p.locator('#horse-list').evaluate(el=>el.scrollTop=el.scrollHeight);
   const last=await p.locator('.race-card').last().boundingBox();assert(last.y>=geometry.listTop && last.y+last.height<=452);
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await p.locator('#close-search').click();await p.evaluate(()=>setTestViewport(844));assert(Math.abs(await p.evaluate(()=>scrollY)-scrollBefore)<2,JSON.stringify({width,scrollBefore,after:await p.evaluate(()=>scrollY)}));
   await p.locator('#search').focus();await p.evaluate(()=>setTestViewport(420));await p.locator('#horse-list').evaluate(el=>el.scrollTop=0);
   await p.locator('.race-card').first().tap();assert(!await p.locator('#search').evaluate(el=>document.activeElement===el));assert(await p.locator('#close-search').isVisible());
   await p.locator('[data-race-back]').click();assert.equal(await p.locator('.race-card').count(),35);
   await p.locator('#search').fill('多数登録レース');await p.locator('.race-card').tap();assert.equal(await p.locator('.race-horse').count(),35);
   await p.locator('#horse-list').evaluate(el=>el.scrollTop=el.scrollHeight);await p.locator('.race-horse').last().tap();
   assert(await p.locator('#close-search').isHidden());assert.equal(await p.locator('#horse-name').innerText(),'多数架空馬34');
   await p.evaluate(()=>setTestViewport(844));await p.waitForFunction(()=>document.documentElement.style.getPropertyValue('--search-viewport-height')==='844px');
   assert(await p.evaluate(()=>document.activeElement.classList.contains('race-match')));
   const memo=await p.locator('.race-match').boundingBox(),h=await p.locator('.app-header').boundingBox();assert(memo.y>=h.y+h.height);
  }
  for(const width of [320,390,768,1280]){
   await p.setViewportSize({width,height:844});await p.evaluate(()=>setTestViewport(844));
   await p.locator('#search').fill('長いレース名');assert.equal(await p.locator('.race-card').count(),1);
   assert.equal(await p.locator('.race-card em').count(),0);assert.match(await p.locator('.race-card').innerText(),/<em>原文<\/em>/);
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await p.locator('.race-card').click();assert(await p.locator('#selected-race-name').evaluate(el=>el.scrollWidth<=el.clientWidth));
   await p.locator('.race-horse').click();assert.equal(await p.locator('.race-match').count(),1);
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await p.locator('[data-race-back]').click();
  }
  assert.equal(await p.evaluate(()=>localStorage.getItem('horse-notes-data-v2')),stored);
  // A–N fetch through the real app sync path, with synthetic OAuth and response.
  await p.locator('#menu-button').click();await p.locator('#google-settings').evaluate(el=>el.open=true);await p.locator('#google-client-id').fill('synthetic.apps.googleusercontent.com');await p.locator('#google-settings-save').click();await p.waitForFunction(()=>!document.querySelector('#google-update').disabled);await p.locator('#close-menu').click();
  await p.locator('#header-update').click();await p.waitForFunction(()=>document.querySelector('#header-update').dataset.state==='success');assert(requestedRange.endsWith("/values/'馬メモ一覧'!A1:N"));
  const sheetsStored=await p.evaluate(()=>localStorage.getItem('horse-notes-data-v2'));
  await p.goto(url);await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await c.setOffline(true);await p.reload();await p.evaluate(()=>setTestViewport(844));assert.equal(await p.locator('#horse-search-tab').getAttribute('aria-selected'),'true');
  await p.locator('#race-search-tab').click();await p.locator('#search').fill('菊花賞');assert.equal(await p.locator('.race-card').count(),4);await p.locator('.race-card').first().tap();await p.locator('.race-horse').first().tap();assert.equal(await p.locator('.race-match').count(),2);
  assert.equal(await p.evaluate(()=>localStorage.getItem('horse-notes-data-v2')),sheetsStored);assert.deepEqual(errors,[]);
  await c.close();console.log('PASS: race partial search/Kikuka/JBC/years/days/undated; deduplicated races/horses/counts; exact memo jump/all other notes; filters/sort/tabs; CSV14/Sheets A–N/offline; 320–430px/safe-area/IME/viewport/list scroll/keyboard dismissal/close restore; persistence unchanged');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
