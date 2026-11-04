// Mobile viewport and IME interaction tests; no real keyboard, account, or memo data.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const url=process.env.BASE_URL||'http://127.0.0.1:8769';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,reducedMotion:'reduce',serviceWorkers:'block'});
  await c.addInitScript(()=>{
   const vv=new EventTarget();Object.assign(vv,{width:innerWidth,height:innerHeight,offsetTop:0,offsetLeft:0});
   Object.defineProperty(window,'visualViewport',{value:vv,configurable:true});
   window.setTestViewport=(width,height,offsetTop=0)=>{Object.assign(vv,{width,height,offsetTop});vv.dispatchEvent(new Event('resize'));vv.dispatchEvent(new Event('scroll'));};
  });
  await c.route('**/style.css?v=2.1.4',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replaceAll('env(safe-area-inset-top,0px)','47px')});});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url);await p.waitForFunction(()=>document.querySelector('#header-update').dataset.state);
  // Add only in-memory candidates to exercise an overflowing list.
  await p.evaluate(()=>{for(let i=0;i<30;i++)window.HORSES.push({...window.HORSES[0],id:`synthetic-${i}`,name:`ア架空馬${i}`,reading:`あかくうば${i}`});});
  await p.locator('#menu-button').click();await p.locator('#show-sample').click();await p.locator('#close-menu').click();
  const normalSpacing=await p.locator('.intro').evaluate(el=>getComputedStyle(el).paddingBottom);
  for(const width of [320,360,375,390,414,430]){
   await p.setViewportSize({width,height:844});await p.evaluate(w=>setTestViewport(w,844),width);
   await p.locator('#search').focus();
   await p.waitForFunction(()=>document.body.classList.contains('search-mode'));
   assert.equal(await p.locator('#horse-list').evaluate(el=>el.scrollTop),0);
   assert(await p.locator('.intro').isHidden());assert(await p.locator('footer').isHidden());
   await p.evaluate(w=>setTestViewport(w,420),width);
   await p.waitForFunction(()=>document.documentElement.style.getPropertyValue('--search-viewport-height')==='420px');
   const geometry=()=>p.evaluate(()=>{
    const header=document.querySelector('.app-header').getBoundingClientRect();
    const controls=document.querySelector('.search-controls').getBoundingClientRect();
    const list=document.querySelector('#horse-list').getBoundingClientRect();
    return {header:header.bottom,controlsTop:controls.top,controlsBottom:controls.bottom,listTop:list.top,listBottom:list.bottom,viewportBottom:visualViewport.offsetTop+visualViewport.height};
   });
   // iPhone kana preedit, IME Enter, then commit with no trailing input event.
   await p.locator('#search').evaluate(el=>{
    el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
    el.value='あ';el.dispatchEvent(new CompositionEvent('compositionupdate',{bubbles:true,data:'あ'}));
    el.dispatchEvent(new InputEvent('input',{bubbles:true,data:'あ',inputType:'insertCompositionText',isComposing:true}));
    el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter',keyCode:229,isComposing:true}));
   });
   const before=await geometry();
   await p.locator('#search').evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'あ'})));
   await p.locator('#search').press('Enter');
   assert.equal(await p.locator('.horse-card').count(),31);
   assert(await p.locator('#horse-list').isVisible());
   assert(await p.locator('#search').evaluate(el=>document.activeElement===el));
   assert(await p.locator('body').evaluate(el=>el.classList.contains('search-mode')));
   const after=await geometry();
   assert.equal(after.controlsTop,before.controlsTop);assert.equal(after.listTop,before.listTop);
   assert(after.controlsTop>=after.header && after.controlsTop-after.header<=12);
   assert(after.listTop-after.controlsBottom<=12);
   assert(after.listBottom<=after.viewportBottom);
   if(width===390 && process.env.UI_SCREENSHOT)await p.screenshot({path:process.env.UI_SCREENSHOT});
   const list=p.locator('#horse-list');
   assert(await list.evaluate(el=>el.scrollHeight>el.clientHeight));
   await list.evaluate(el=>el.scrollTop=el.scrollHeight);
   assert(await list.evaluate(el=>el.scrollTop>0));
   const finalCard=await p.locator('.horse-card').last().boundingBox();
   assert(finalCard.y>=after.listTop && finalCard.y+finalCard.height<=after.viewportBottom);
   const scrollBefore=await list.evaluate(el=>el.scrollTop);
   // Simulate iOS panning its visual viewport while composition is committed.
   await p.evaluate(w=>setTestViewport(w,360,32),width);
   await p.waitForFunction(()=>document.documentElement.style.getPropertyValue('--search-viewport-top')==='32px');
   const shifted=await geometry();assert(shifted.listBottom<=shifted.viewportBottom);
   assert(Math.abs((await p.locator('.app-header').boundingBox()).y-32)<1);
   assert(await list.evaluate(el=>el.scrollTop)>=scrollBefore);
   await p.locator('#close-search').click();
   assert(await p.locator('.intro').isVisible());assert(await p.locator('footer').isVisible());
   assert.equal(await p.locator('.intro').evaluate(el=>getComputedStyle(el).paddingBottom),normalSpacing);
   assert.equal(await p.locator('#search').inputValue(),'あ');
   await p.evaluate(w=>setTestViewport(w,844),width);
   // Select a lower candidate while the keyboard is visible.
   await p.locator('#search').focus();await p.evaluate(w=>setTestViewport(w,420),width);
   await p.locator('#horse-list').evaluate(el=>el.scrollTop=el.scrollHeight);
   await p.locator('.horse-card').last().tap();
   assert(!await p.locator('body').evaluate(el=>el.classList.contains('search-mode')));
   assert(!await p.locator('#search').evaluate(el=>document.activeElement===el));
   assert(await p.locator('#detail').isVisible());assert.match(await p.locator('#horse-name').innerText(),/ア架空馬29/);
   await p.evaluate(w=>setTestViewport(w,844),width);
   await p.waitForFunction(()=>document.documentElement.style.getPropertyValue('--search-viewport-height')==='844px');
   assert((await p.locator('#horse-name').boundingBox()).y>=(await p.locator('.app-header').boundingBox()).height);
   await p.locator('#search').focus();await p.keyboard.press('Escape');
   assert(!await p.locator('body').evaluate(el=>el.classList.contains('search-mode')));
  }
  await p.locator('#search').focus();
  await p.locator('#search').dispatchEvent('compositionstart');await p.keyboard.press('Escape');
  assert(await p.locator('body').evaluate(el=>el.classList.contains('search-mode')));
  await p.locator('#close-search').tap();
  assert(!await p.locator('body').evaluate(el=>el.classList.contains('search-mode')));
  // Close restores the normal page position; temporary blur/keyboard dismissal keeps search mode.
  await p.evaluate(()=>window.scrollTo(0,200));const originalScroll=await p.evaluate(()=>scrollY);
  await p.locator('#search').focus();await p.locator('#search').evaluate(el=>el.blur());
  assert(await p.locator('body').evaluate(el=>el.classList.contains('search-mode')));
  await p.locator('#close-search').click();assert(Math.abs(await p.evaluate(()=>scrollY)-originalScroll)<2);
  await p.locator('#search').focus();await p.locator('#menu-button').click();
  assert(await p.locator('#management-menu').evaluate(el=>el.open));assert(!await p.locator('body').evaluate(el=>el.classList.contains('search-mode')));
  assert.deepEqual(errors,[]);await c.close();
  // No visualViewport API: innerHeight is a usable fallback.
  const fallback=await browser.newContext({viewport:{width:375,height:667},isMobile:true,serviceWorkers:'block'});
  await fallback.addInitScript(()=>Object.defineProperty(window,'visualViewport',{value:undefined,configurable:true}));
  const fp=await fallback.newPage();await fp.goto(url);await fp.locator('#search').focus();
  assert(await fp.locator('#close-search').isVisible());await fp.locator('#close-search').click();await fallback.close();
  console.log('PASS: 320–430px search mode; あ composition/Enter/commit; viewport resize/pan; internal candidate scroll; keyboard-close selection/detail; close/Escape/position restore; menu access; viewport fallback; no JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
