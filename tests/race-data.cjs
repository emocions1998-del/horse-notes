// Header mapping and legacy persistence, using synthetic data only.
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const context=vm.createContext({window:{},TextEncoder});
for(const file of ['csv-import.js','google-sheets.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const CSV=context.window.HorseCSV,Sheets=context.window.HorseSheets;
const headers=Array.from(CSV.fields,field=>field[1]);
const row=['検証馬','2026-11-08','菊花賞','観察','仮説','確認','○','記録者','出典','レース総括','備考','本人','補足','2026-10-25'];
const converted=Sheets.convert([headers,row],CSV);
const note=converted.result.horses[0].notes[0];
assert.equal(note.raceDate,'2026-10-25');assert.equal(note.date,'2026-11-08T00:00:00');
for(const [key,value] of Object.entries({race:'菊花賞',observation:'観察',hypothesis:'仮説',checkpoint:'確認',watch:'○',recorder:'記録者',source:'出典',remarks:'備考'}))assert.equal(note[key],value);
assert.equal(note.views[0].body,'本人');assert.equal(note.views[1].body,'補足');
const order=[13,12,0,1,2,3,4,5,6,7,8,9,10,11];
const shuffled=Sheets.convert([order.map(i=>headers[i]),order.map(i=>row[i])],CSV).result.horses[0].notes[0];
assert.equal(shuffled.raceDate,note.raceDate);assert.equal(shuffled.race,note.race);assert.equal(shuffled.views[1].body,'補足');
const future=Sheets.convert([[...headers,'将来の列'],[...row,'原文']],CSV).result.horses[0].notes[0];
assert.equal(future.extras[0][1],'原文');
const short=Sheets.convert([headers,row.slice(0,13)],CSV).result.horses[0].notes[0];assert.equal(short.raceDate,'');
const legacy=Sheets.convert([headers.slice(0,13),row.slice(0,13)],CSV);
assert.equal(legacy.result.horses[0].notes[0].raceDate,'');
const oldMapping={...legacy.mapping};delete oldMapping.raceDate;
for(const csvText of [legacy.csvText,converted.csvText]){
 const saved={version:1,csvText,mapping:oldMapping,fileName:'検証.csv',active:'imported'};
 const before=JSON.stringify(saved);const restored=CSV.restore(before);
 assert.equal(JSON.stringify(restored.saved),before);
 assert.equal(restored.result.horses[0].notes[0].raceDate,csvText===legacy.csvText?'':'2026-10-25');
}
for(const raw of ['','要確認','2026-02-30']){
 const n=Sheets.convert([headers,[...row.slice(0,13),raw]],CSV).result.horses[0].notes[0];
 assert.equal(n.raceDate,'');assert.equal(n.rawRaceDate,raw);
}
assert.throws(()=>Sheets.convert([headers.filter(h=>h!=='馬名'),row.slice(1)],CSV));
assert.throws(()=>Sheets.convert([headers,[...row,'列名のない値']],CSV));
console.log('PASS: A–N/header reorder/future columns; D–M preserved; missing N/short rows/invalid dates; old mappings and saved text preserved; invalid input rejected');
