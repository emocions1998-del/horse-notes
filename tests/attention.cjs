// Manual attention, shared surfaces, independent persistence, and the original glyph geometry.
const {chromium,webkit}=require('playwright');
const {PNG}=require('pngjs');
const assert=require('node:assert/strict');
const url=process.env.BASE_URL||'http://127.0.0.1:8770';
const headers=['馬名','記録日','レース','観察・レース内容','当時の評価・仮説','次走チェックポイント','次走注目','記録者','出典チャット','記録種別','備考','本人の見解','チャッピーの見解','レース開催日'];
const names=['カラーテスト甲','カラーテスト乙','カラーテスト丙','カラーテスト丁','カラーテスト戊'];
const row=(name,date,watch)=>[name,date,'架空注目レース','架空の観察','仮説','確認',watch,'検証','検証','レース総括','備考','本人の見解','補足','2026-11-03'];
let values=[headers,row(names[0],'2026-11-09',''),row(names[0],'2026-11-08','最優先'),row(names[0],'2026-11-01','注目'),row(names[0],'要確認','注目'),row(names[1],'2026-11-08','注目'),row(names[2],'2026-11-08','通常'),row(names[3],'2026-11-08','未確認'),row(names[4],'2026-11-08','未知の評価')];
const csv=()=>values.map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\n');
const ATT='horse-notes-attention-v1';
async function importData(p){await p.locator('#menu-button').click();await p.locator('#csv-file').setInputFiles({name:'synthetic-attention.csv',mimeType:'text/csv',buffer:Buffer.from(csv())});await p.waitForFunction(()=>document.querySelector('#source-tag').textContent==='CSV');await p.locator('#close-menu').click();}
async function select(p,name=names[0]){await p.locator('#horse-search-tab').click();await p.locator('#search').fill(name);await p.locator('.horse-card').filter({has:p.locator('strong',{hasText:name})}).first().click();}
const marker=p=>p.locator('[data-attention-cycle]');
async function cardShape(p){
 const mark=p.locator('.horse-monogram').first();
 await mark.evaluate(el=>{window.testCardGlyph=el.innerHTML;el.style.color='#000';el.firstElementChild.style.color='#000';el.firstElementChild.style.webkitTextFillColor='#000';});
 const a=PNG.sync.read(await mark.screenshot()),aBox=await mark.boundingBox();
 await mark.evaluate(el=>el.textContent='♞');
 const b=PNG.sync.read(await mark.screenshot()),bBox=await mark.boundingBox();
 assert.equal(a.width,b.width);assert.equal(a.height,b.height);assert(Math.abs(aBox.x-bBox.x)<.1&&Math.abs(aBox.y-bBox.y)<.1);
 let changed=0;for(let n=0;n<a.data.length;n+=4)if(Math.abs(a.data[n]-b.data[n])+Math.abs(a.data[n+1]-b.data[n+1])+Math.abs(a.data[n+2]-b.data[n+2])>30)changed++;
 assert(changed/(a.width*a.height)<.01,'card glyph shape');
 await mark.evaluate(el=>{el.innerHTML=window.testCardGlyph;el.removeAttribute('style');el.firstElementChild.removeAttribute('style');delete window.testCardGlyph;});
}
async function pixelShape(p,width){
 await p.setViewportSize({width,height:900});
 const current=p.locator('.profile-attention');
 await current.evaluate(el=>{window.testAttentionNode=el;const glyph=el.querySelector('.horse-silhouette');glyph.style.color='#000';glyph.style.webkitTextFillColor='#000';glyph.style.backgroundImage='none';});
 const actual=PNG.sync.read(await marker(p).screenshot());const actualBox=await marker(p).boundingBox();
 await current.evaluate(el=>{const span=document.createElement('span');span.className='profile-mark';span.textContent='♞';span.style.color='#000';el.replaceWith(span);});
 const old=p.locator('.profile-mark'),baseline=PNG.sync.read(await old.screenshot()),baselineBox=await old.boundingBox();
 assert.equal(actual.width,baseline.width,`glyph width ${width}`);assert.equal(actual.height,baseline.height,`glyph height ${width}`);
 assert(Math.abs(actualBox.x-baselineBox.x)<.1 && Math.abs(actualBox.y-baselineBox.y)<.1,`glyph position ${width}: ${JSON.stringify({actualBox,baselineBox})}`);
 let changed=0;for(let i=0;i<actual.data.length;i+=4)if(Math.abs(actual.data[i]-baseline.data[i])+Math.abs(actual.data[i+1]-baseline.data[i+1])+Math.abs(actual.data[i+2]-baseline.data[i+2])>30)changed++;
 assert(changed/(actual.width*actual.height)<.01,`glyph shape ${width}: ${changed}`);
 await old.evaluate(el=>{el.replaceWith(window.testAttentionNode);const glyph=window.testAttentionNode.querySelector('.horse-silhouette');glyph.removeAttribute('style');delete window.testAttentionNode;});
}
(async()=>{
 const engine=process.env.BROWSER==='webkit'?webkit:chromium;
 const b=await engine.launch(process.env.BROWSER==='webkit'?{headless:true}:{headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,reducedMotion:'reduce'});
  await c.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'application/javascript',body:`window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:o=>({requestAccessToken:()=>o.callback({access_token:'synthetic-token',expires_in:3600})})}}};`}));
  await c.route('https://sheets.googleapis.com/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({majorDimension:'ROWS',values})}));
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await importData(p);
  await p.locator('#search').fill('カラーテスト');
  assert.deepEqual(await p.locator('.horse-monogram').evaluateAll(els=>els.map(el=>el.dataset.attention)),['red','green','blue','blue','blue']);
  assert.equal(await p.locator('#horse-list [data-attention-cycle]').count(),0);
  await p.locator('.horse-card').first().click();
  assert.equal(await marker(p).getAttribute('data-attention'),'red');assert.match(await marker(p).getAttribute('aria-label'),/自動・最優先/);
  const memo=await p.evaluate(()=>localStorage.getItem('horse-notes-data-v2'));
  for(const width of [320,390,430,1280]){await pixelShape(p,width);await cardShape(p);}
  await p.setViewportSize({width:390,height:844});
  for(const [i,color] of ['blue','green','red','rainbow','red'].entries()){
   await marker(p).evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
   const before=await p.evaluate(()=>scrollY);await marker(p).tap();
   assert.equal(await marker(p).getAttribute('data-attention'),color);
   assert.equal(await p.locator('.horse-monogram').first().getAttribute('data-attention'),color);
   assert(await p.locator('#detail').isVisible());assert.equal(await p.locator('#horse-name').innerText(),names[0]);
   assert(Math.abs(await p.evaluate(()=>scrollY)-before)<2,'changing attention must not navigate or scroll');
   assert.equal(await p.locator('.attention-mode').innerText(),i===4?'自動':'手動');
   if(color==='rainbow'){
    assert.equal(await marker(p).innerText(),'♞');
    const style=await marker(p).locator('.horse-silhouette').evaluate(el=>{const s=getComputedStyle(el);return {image:s.backgroundImage,clip:s.webkitBackgroundClip||s.backgroundClip,fill:s.webkitTextFillColor}});
    assert.match(style.image,/linear-gradient/);assert.equal(style.clip,'text');assert.equal(style.fill,'rgba(0, 0, 0, 0)');
    const png=PNG.sync.read(await marker(p).screenshot());let red=0,green=0,blue=0;
    for(let n=0;n<png.data.length;n+=4){const [r,g,b]=png.data.slice(n,n+3);if(r>g*1.25&&r>b*1.15)red++;if(g>r*1.15&&g>b*1.1)green++;if(b>r*1.2&&b>g*1.1)blue++;}
    if(process.env.UI_SCREENSHOT)await marker(p).screenshot({path:process.env.UI_SCREENSHOT});
    assert(red>10&&green>10&&blue>10,`rainbow is actually painted inside the glyph: ${JSON.stringify({red,green,blue})}`);
    if(process.env.UI_SCREENSHOT)await marker(p).screenshot({path:process.env.UI_SCREENSHOT});
   }
  }
  assert.deepEqual(JSON.parse(await p.evaluate(k=>localStorage.getItem(k),ATT)).overrides,{});
  assert.equal(await p.evaluate(()=>localStorage.getItem('horse-notes-data-v2')),memo);
  // Enter/Space operate the same native button and keep focus and the selected memo.
  await marker(p).focus();await p.keyboard.press('Enter');assert.equal(await marker(p).getAttribute('data-attention'),'blue');
  await p.keyboard.press('Space');assert.equal(await marker(p).getAttribute('data-attention'),'green');
  await p.keyboard.press('Enter');await p.keyboard.press('Enter');assert.equal(await marker(p).getAttribute('data-attention'),'rainbow');
  await select(p,names[1]);assert.equal(await marker(p).getAttribute('data-attention'),'green');await marker(p).tap(); // B manual blue
  await select(p);assert.equal(await marker(p).getAttribute('data-attention'),'rainbow');
  const overrides=await p.evaluate(k=>localStorage.getItem(k),ATT);
  await p.reload();await select(p);assert.equal(await marker(p).getAttribute('data-attention'),'rainbow');
  const oldId=await p.locator('.horse-card').getAttribute('data-horse');
  await p.locator('#menu-button').click();await p.locator('#google-settings').evaluate(el=>el.open=true);await p.locator('#google-client-id').fill('synthetic.apps.googleusercontent.com');await p.locator('#google-settings-save').click();await p.waitForFunction(()=>!document.querySelector('#google-update').disabled);await p.locator('#close-menu').click();
  values=[headers,row(names[1],'2026-11-10','最優先'),row(names[0],'2026-11-11',''),row(names[0],'2026-11-10','注目'),...values.slice(2)];
  await p.locator('#header-update').click();await p.waitForFunction(()=>document.querySelector('#header-update').dataset.state==='success');await select(p);
  assert.notEqual(await p.locator('.horse-card').getAttribute('data-horse'),oldId);
  assert.equal(await marker(p).getAttribute('data-attention'),'rainbow');assert.equal(await p.evaluate(k=>localStorage.getItem(k),ATT),overrides);
  await marker(p).tap();assert.equal(await marker(p).getAttribute('data-attention'),'green');assert.match(await marker(p).getAttribute('aria-label'),/自動・注目/);
  const payload=JSON.parse(await p.evaluate(k=>localStorage.getItem(k),ATT));assert(!Object.hasOwn(payload.overrides,names[0]));assert.equal(payload.overrides[names[1]],'blue');
  await p.locator('#race-search-tab').click();await p.locator('#search').fill('架空注目');await p.locator('.race-card').click();
  assert.equal(await p.locator('.race-horse .horse-monogram').count(),5);
  assert.equal(await p.locator(`.race-horse [data-attention-name="${names[0]}"]`).getAttribute('data-attention'),'green');
  assert.equal(await p.locator(`.race-horse [data-attention-name="${names[1]}"]`).getAttribute('data-attention'),'blue');
  await p.locator('.race-horse').filter({hasText:names[0]}).click();assert.equal(await marker(p).getAttribute('data-attention'),'green');
  await marker(p).tap();assert.equal(await marker(p).getAttribute('data-attention'),'blue');assert.equal(await p.locator(`.race-horse [data-attention-name="${names[0]}"]`).getAttribute('data-attention'),'blue');
  assert(await p.locator('.race-match').count()>0);
  await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await c.setOffline(true);await p.reload();await select(p);assert.equal(await marker(p).getAttribute('data-attention'),'blue');await c.setOffline(false);
  assert.deepEqual(errors,[]);await c.close();
  // Corrupt or denied attention storage cannot stop reading memos or silently reset settings.
  for(const failure of ['corrupt','read','write']){
   const fc=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
   await fc.addInitScript(({failure,key})=>{
    if(failure==='corrupt')localStorage.setItem(key,'{bad-settings');
    if(failure==='read'){const get=Storage.prototype.getItem;Storage.prototype.getItem=function(k){if(k===key)throw Error('denied');return get.call(this,k)}}
    if(failure==='write'){const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw Error('quota');return set.call(this,k,v)}}
   },{failure,key:ATT});
   const fp=await fc.newPage(),fe=[];fp.on('pageerror',e=>fe.push(e.message));await fp.goto(url);await importData(fp);await select(fp);await marker(fp).tap();
   assert.match(await fp.locator('#attention-status').innerText(),/保存|読み込/);assert(await fp.locator('#attention-status').isVisible());assert(await fp.locator('#detail').isVisible());
   assert.match(await marker(fp).getAttribute('aria-label'),/自動/);
   if(failure==='corrupt')assert.equal(await fp.evaluate(k=>localStorage.getItem(k),ATT),'{bad-settings');
   assert.deepEqual(fe,[]);await fc.close();
  }
  console.log(`PASS (${process.env.BROWSER||'chromium'}): original ♞ raster/geometry at 320/390/430/1280px; auto colors; native tap/Enter/Space cycle; rainbow pixels; stable selection; separate persistence/restart/Sheets reorder; auto returns latest grade; horse/race consistency; offline; corrupt/denied/quota storage resilience`);
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
