// Light detail surface, long-form content, contrast, and keyboard focus regression.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const url=process.env.BASE_URL||'http://127.0.0.1:8770';
const header=['馬名','記録日','レース','観察・レース内容','当時の評価・仮説','次走チェックポイント','次走注目','記録者','出典チャット','記録種別','備考','本人の見解','チャッピーの見解'];
const shortName='検証用の架空馬';
const longName='長い馬名の表示確認用'+ '架空馬'.repeat(12);
const personal='架空の本人見解です。\n次走でも条件を確認したい。<em>原文として表示</em>';
const rows=[header,
 [shortName,'2026-11-03','架空ステークス','道中の位置取りと直線の伸びを観察。','相手関係を含めて再評価したい。','強い相手で再評価','注目','検証','検証用','レース総括','備考',personal,'架空の補足です。'],
 [shortName,'2026-11-02','長文確認レース','長文の観察です。\n'.repeat(60),'評価と仮説を保持します。'.repeat(40),'次走確認','','検証','','レース総括','https://example.invalid/'+ 'x'.repeat(200),'長い本人見解です。'.repeat(80),'補足'],
 [shortName,'2026-10-31','架空の事前予想','事前の観察','事前仮説','','','検証','','予想段階','','架空の予想見解',''],
 ...Array.from({length:6},(_,i)=>[longName,`2026-10-${String(20+i).padStart(2,'0')}`,'長いレース名'.repeat(12),'無改行長文'.repeat(200),'仮説'.repeat(120),'次走確認','','検証','','レース総括','','見解'.repeat(150),''])];
const csv=rows.map(row=>row.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\n');
const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
const luminance=c=>rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((v,n,i)=>v+n*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const c=await b.newContext({viewport:{width:390,height:1100},isMobile:true,hasTouch:true,deviceScaleFactor:2,reducedMotion:'reduce'});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url);
  await p.waitForFunction(()=>!!window.HorseCSV);
  await p.evaluate(csvText=>{
   const table=HorseCSV.parse(csvText),mapping=HorseCSV.detect(table.headers);
   localStorage.setItem('horse-notes-data-v2',JSON.stringify({version:1,csvText,mapping,fileName:'Google Sheets · 馬メモ一覧',sourceType:'google-sheets',source:{spreadsheetId:'synthetic-sheet',range:"'馬メモ一覧'!A1:M"},active:'imported',importedAt:'2026-11-04T00:00:00Z'}));
  },csv);
  const original=await p.evaluate(()=>localStorage.getItem('horse-notes-data-v2'));
  await p.reload();await p.waitForFunction(()=>document.querySelector('#header-update').dataset.state);
  assert(!await p.locator('body').evaluate(el=>el.classList.contains('has-detail')));
  await p.locator('#search').fill('検証');
  const darkCard=await p.locator('.horse-card').evaluate(el=>getComputedStyle(el).backgroundImage);
  await p.locator('.horse-card').tap();
  assert(await p.locator('body').evaluate(el=>el.classList.contains('has-detail')));
  assert.equal(await p.locator('#detail').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(250, 248, 242)');
  assert.equal(await p.locator('footer').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(250, 248, 242)');
  assert.equal(await p.locator('.note').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(251, 241, 224)');
  assert.equal(await p.locator('.horse-card').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(24, 41, 27)');
  assert.match(await p.locator('.horse-meta').innerText(),/Google Sheetsから取得/);
  assert.equal(await p.locator('.note').count(),2);
  assert.equal(await p.locator('.personal-view .note-body').first().textContent(),personal);
  assert.equal(await p.locator('.personal-view em').count(),0);
  const contrastSelectors=['.horse-header h2','.horse-meta','.next-heading h3','.next-race .checkpoint-body','.condition-source','.filter.active','.timeline-caption','.race-row h4','.note-date','.type-badge','.observation-view h5','.observation-view .note-body','.hypothesis-view h5','.hypothesis-view .note-body','.personal-view h5','.personal-view .note-body','.chappy-view h5','.chappy-view .note-body'];
  for(const selector of contrastSelectors){
   const colors=await p.locator('#detail '+selector).first().evaluate(el=>{
    const color=getComputedStyle(el).color;let node=el,bg;
    while(node){bg=getComputedStyle(node).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')break;node=node.parentElement;}
    return {color,bg};
   });
   assert(contrast(colors.color,colors.bg)>=4.5,`${selector}: ${contrast(colors.color,colors.bg)}`);
  }
  for(const width of [320,360,375,390,414,430,768,1280]){
   await p.setViewportSize({width,height:1100});
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`detail overflow ${width}`);
   assert(await p.locator('.personal-view .note-body').evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth)),`long body ${width}`);
   if(width<=430){assert.equal(Math.round((await p.locator('#detail').boundingBox()).x),0);}
  }
  await p.setViewportSize({width:390,height:1100});
  await p.locator('#sort').selectOption('old');assert.match(await p.locator('.note-date').first().innerText(),/2026-11-02/);
  await p.locator('[data-filter="before"]').click();assert.equal(await p.locator('.note').count(),1);
  await p.locator('[data-filter="all"]').click();assert.equal(await p.locator('.note').count(),3);
  await p.locator('[data-filter="after"]').click();await p.locator('#sort').selectOption('new');
  await p.locator('.record-details').first().locator('summary').click();assert.match(await p.locator('.record-details').first().innerText(),/検証用/);
  await p.locator('.record-details').first().locator('summary').click();
  assert.equal(await p.locator('#horse-name').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
  await p.keyboard.press('Tab');await p.locator('#horse-name').focus();
  assert.equal(await p.locator('#horse-name').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
  await p.locator('.horse-card').tap();
  assert.equal(await p.locator('#horse-name').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
  await p.locator('#detail').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
  if(process.env.UI_SCREENSHOT)await p.screenshot({path:process.env.UI_SCREENSHOT});
  await p.locator('#search').fill('長い');assert.equal(await p.locator('.horse-card').evaluate(el=>getComputedStyle(el).backgroundImage),darkCard);await p.locator('.horse-card').tap();
  assert.equal(await p.locator('.note').count(),6);assert.equal(await p.locator('#horse-name').innerText(),longName);
  for(const width of [320,375,430]){
   await p.setViewportSize({width,height:900});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`long name overflow ${width}`);
  }
  assert.equal(await p.evaluate(()=>localStorage.getItem('horse-notes-data-v2')),original);
  await p.locator('#search').fill('');await p.locator('#close-search').click();
  assert(!await p.locator('body').evaluate(el=>el.classList.contains('has-detail')));
  assert.equal(await p.locator('footer').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  assert.deepEqual(errors,[]);await c.close();
  console.log('PASS: ivory detail/warm card/three colored sections; text contrast >=4.5; 320–1280px; long names, long multiline/unbroken notes, 6 records; literal memo text preserved; filter/sort; touch vs keyboard focus; dark search retained; stored data unchanged');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
