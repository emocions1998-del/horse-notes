// Real CSV date ordering + independent attention storage, with synthetic records only.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const context=vm.createContext({window:{},TextEncoder});
for(const file of ['csv-import.js','attention.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const CSV=context.window.HorseCSV,A=context.window.HorseAttention;
const headers=Array.from(CSV.fields,f=>f[1]);
function horse(rows,name='検証馬'){
 const cells=[headers,...rows.map(([date,watch])=>[name,date,'架空レース','','','',watch,'','','レース総括','','','',''])];
 const csv=cells.map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\n');
 const t=CSV.parse(csv);return CSV.build(t,CSV.detect(t.headers)).horses[0];
}
for(const [value,color] of [['最優先','red'],['注目','green'],['通常','blue'],['未確認','blue'],['','blue'],['その他','blue'],['絶対買う！','blue'],['虹','blue']]){
 assert.equal(A.automatic(horse([['2026-11-08',value]]),CSV.compareNotes),color);
}
assert.equal(A.automatic(horse([['2026-11-08',''],['2026-11-07','最優先'],['2026-11-01','注目']]),CSV.compareNotes),'red');
assert.equal(A.automatic(horse([['2026-11-08','未確認'],['2026-11-07','最優先']]),CSV.compareNotes),'blue');
assert.equal(A.automatic(horse([['2026-11-08','未知の評価'],['2026-11-07','最優先']]),CSV.compareNotes),'blue');
assert.equal(A.automatic(horse([['要確認','最優先'],['2026-11-07','注目']]),CSV.compareNotes),'green');
assert.equal(A.automatic(horse([['不明',''],['','注目'],['要確認','最優先']]),CSV.compareNotes),'green');
assert.equal(A.automatic(horse([['2026-11-07','注目'],['2026-11-07','最優先']]),CSV.compareNotes),'green');
assert.equal(A.automatic(horse([['2026-11-07',''],['2026-11-07','最優先']]),CSV.compareNotes),'red');
const memory=new Map([['horse-notes-data-v2','original memo'],['horse-notes-google-client-id-v1','original id']]);let writes=0,failWrite=false;
const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>{if(failWrite)throw Error('quota');writes++;memory.set(k,v)}};
let store=A.create({storage,compareNotes:CSV.compareNotes});
const h=horse([['2026-11-07','最優先']],'Ａ 架空馬');
assert.equal(store.state(h).mode,'auto');assert.equal(store.state(h).color,'red');assert.equal(writes,0);
for(const expected of ['blue','green','red','rainbow']){const r=store.cycle(h);assert(r.ok);assert.equal(store.state(h).mode,expected);}
assert.equal(store.state({...h,id:'csv-999',name:'A架空馬'}).color,'rainbow');
assert.equal(store.state(horse([['2026-11-07','通常']],'別の架空馬')).mode,'auto');
store=A.create({storage,compareNotes:CSV.compareNotes});assert.equal(store.state(h).mode,'rainbow');
const updated=horse([['2026-11-09','注目']],'A架空馬');assert.equal(store.state(updated).color,'rainbow');
assert(store.cycle(updated).ok);assert.equal(store.state(updated).mode,'auto');assert.equal(store.state(updated).color,'green');
assert.deepEqual(JSON.parse(memory.get(A.STORAGE_KEY)).overrides,{});
assert.equal(memory.get('horse-notes-data-v2'),'original memo');assert.equal(memory.get('horse-notes-google-client-id-v1'),'original id');
store.cycle(h);const old=memory.get(A.STORAGE_KEY);failWrite=true;
assert.equal(store.cycle(h).ok,false);assert.equal(store.state(h).mode,'blue');assert.equal(memory.get(A.STORAGE_KEY),old);failWrite=false;
for(const broken of ['{broken','null','{"version":2,"overrides":{}}','{"version":1,"overrides":{"架空馬":"invalid"}}','{"version":1,"overrides":[]}']){
 memory.set(A.STORAGE_KEY,broken);const bad=A.create({storage,compareNotes:CSV.compareNotes});
 assert(bad.loadIssue);assert.equal(bad.state(h).mode,'auto');assert.equal(bad.cycle(h).ok,false);assert.equal(memory.get(A.STORAGE_KEY),broken);
}
const denied=A.create({storage:{getItem:()=>{throw Error('denied')}},compareNotes:CSV.compareNotes});assert(denied.loadIssue);assert.equal(denied.state(h).color,'red');
assert.equal(A.LEVELS.rainbow.rank>A.LEVELS.red.rank && A.LEVELS.red.rank>A.LEVELS.green.rank && A.LEVELS.green.rank>A.LEVELS.blue.rank,true);
console.log('PASS: automatic labels; blank fallback; unknown/datetime/row order; manual cycle; stable normalized names; restart/refetch priority; per-horse auto release; independent storage; read/write failures preserve previous values');
