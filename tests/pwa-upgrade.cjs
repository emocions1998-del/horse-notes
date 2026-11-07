// Real ver.2.2 worker fixture -> ver.2.3 worker lifecycle, on an isolated local origin.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');let legacy=true;
// waitForFunction treats a Promise as truthy; evaluate must await async predicates.
async function waitUntil(page,predicate){
 const deadline=Date.now()+20000;
 while(!await page.evaluate(predicate)){
  assert(Date.now()<deadline,'Worker transition timed out');
  await new Promise(resolve=>setTimeout(resolve,25));
 }
}
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');const name=u.pathname==='/'?'index.html':u.pathname.slice(1),file=path.resolve(root,name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'text/plain');
 let content=fs.readFileSync(name==='sw.js'&&legacy?path.join(__dirname,'fixtures/sw-v2.2.js'):file);
 if(name==='index.html'&&legacy)content=Buffer.from(content.toString().replaceAll('2.3','2.2'));
 res.end(content);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
 const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const c=await b.newContext();await c.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'application/javascript',body:'window.google={accounts:{oauth2:{}}};'}));const p=await c.newPage();await p.goto(url);await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const saved=await p.evaluate(async()=>{
   const csvText='馬名,記録日,レース,観察・レース内容,当時の評価・仮説,次走チェックポイント,次走注目,記録者,出典チャット,記録種別,備考,本人の見解,チャッピーの見解\n検証馬,2025-10-26,菊花賞,観察,仮説,確認,○,検証,検証,レース総括,備考,本人,補足';
   const t=HorseCSV.parse(csvText),mapping=HorseCSV.detect(t.headers);delete mapping.raceDate;
   const value=JSON.stringify({version:1,csvText,mapping,fileName:'legacy.csv',active:'imported'});
   localStorage.setItem('horse-notes-data-v2',value);localStorage.setItem('horse-notes-google-client-id-v1','synthetic.apps.googleusercontent.com');
   await caches.open('unrelated-application');return value;
  });
  assert(await p.evaluate(async()=>(await caches.keys()).some(k=>k.endsWith('ver2-2-detail'))));
  legacy=false;
  await p.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
  await waitUntil(p,async()=>Boolean((await navigator.serviceWorker.getRegistration()).waiting));
  assert(await p.evaluate(async()=>(await caches.keys()).some(k=>k.endsWith('ver2-3-race'))));
  // Waiting preserves the open client's offline assets until the old clients close.
  assert(await p.evaluate(async()=>(await caches.keys()).some(k=>k.endsWith('ver2-2-detail'))));
  const workers=c.serviceWorkers();
  const newest=workers[workers.length-1];
  const activated=newest.evaluate(()=>new Promise(resolve=>{
   const check=()=>{if(!self.registration.waiting && self.registration.active?.state==='activated')resolve();else setTimeout(check,10);};check();
  }));
  await p.close();await activated;
  const next=await c.newPage();await next.goto(url);
  await waitUntil(next,async()=>{const keys=await caches.keys();return keys.some(k=>k.endsWith('ver2-3-race'))&&!keys.some(k=>k.endsWith('ver2-2-detail'));});
  assert(await next.evaluate(async()=>(await caches.keys()).includes('unrelated-application')));
  assert.equal(await next.evaluate(()=>localStorage.getItem('horse-notes-data-v2')),saved);
  assert.equal(await next.locator('#google-client-id').inputValue(),'synthetic.apps.googleusercontent.com');
  await waitUntil(next,async()=>{const r=await navigator.serviceWorker.getRegistration();return r.active?.state==='activated' && navigator.serviceWorker.controller===r.active && !r.waiting;});
  await c.setOffline(true);await next.reload();
  assert.match(await next.locator('.local-badge').innerText(),/ver.2.3/);
  await next.locator('#race-search-tab').click();await next.locator('#search').fill('菊花賞');assert.equal(await next.locator('.race-card').count(),1);assert.match(await next.locator('.race-card').innerText(),/開催日未登録/);
  await next.locator('.race-card').click();await next.locator('.race-horse').click();assert.equal(await next.locator('.race-match').count(),1);
  assert.equal(await next.evaluate(()=>localStorage.getItem('horse-notes-data-v2')),saved);
  await c.close();console.log('PASS: ver.2.2 worker installs ver.2.3; waiting retains old assets; closing/reopening activates and cleans only own old cache; legacy data/settings unchanged; new release offline race navigation');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
