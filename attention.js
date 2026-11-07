// Attention overrides are independent of imported CSV/Sheets records and OAuth settings.
(() => {
  'use strict';
  const STORAGE_KEY = 'horse-notes-attention-v1';
  const LEVELS = Object.freeze({
    blue:Object.freeze({label:'通常',rank:0}),
    green:Object.freeze({label:'注目',rank:1}),
    red:Object.freeze({label:'最優先',rank:2}),
    rainbow:Object.freeze({label:'絶対買う！',rank:3})
  });
  const MODES = Object.freeze(['auto','blue','green','red','rainbow']);
  // Match the CSV horse grouping rule; row IDs and file ordering are deliberately excluded.
  const nameKey = name => String(name ?? '').normalize('NFKC').replace(/\s/g,'');
  function automatic(horse,compareNotes) {
    const note = [...(horse.notes || [])].sort(compareNotes).find(n=>String(n.watch ?? '').trim());
    const value = String(note?.watch ?? '').normalize('NFKC').trim();
    return value === '最優先' ? 'red' : value === '注目' ? 'green' : 'blue';
  }
  function create({storage,compareNotes}) {
    let overrides = new Map(), loadIssue = '';
    try {
      if (!storage) throw new Error();
      const raw = storage.getItem(STORAGE_KEY);
      if (raw !== null) {
        const saved = JSON.parse(raw);
        if (saved?.version !== 1 || !saved.overrides || typeof saved.overrides !== 'object' || Array.isArray(saved.overrides)) throw new Error();
        const entries = Object.entries(saved.overrides);
        if (entries.some(([name,level])=>!name || nameKey(name)!==name || !Object.hasOwn(LEVELS,level))) throw new Error();
        overrides = new Map(entries);
      }
    } catch {
      loadIssue = '注目度設定を読み込めないため、自動判定を表示しています。保存内容は変更していません。';
    }
    function state(horse) {
      const mode = overrides.get(nameKey(horse.name)) || 'auto';
      const color = mode === 'auto' ? automatic(horse,compareNotes) : mode;
      return {mode,color,label:LEVELS[color].label,next:MODES[(MODES.indexOf(mode)+1)%MODES.length]};
    }
    function cycle(horse) {
      if (loadIssue) return {ok:false,message:loadIssue};
      const next = state(horse).next, candidate = new Map(overrides), key = nameKey(horse.name);
      if (next === 'auto') candidate.delete(key); else candidate.set(key,next);
      try {
        storage.setItem(STORAGE_KEY,JSON.stringify({version:1,overrides:Object.fromEntries(candidate)}));
      } catch {
        return {ok:false,message:'注目度を保存できませんでした。容量や端末の保存制限を確認してください。元の設定は維持しています。'};
      }
      overrides=candidate;
      return {ok:true,state:state(horse)};
    }
    return {state,cycle,loadIssue};
  }
  window.HorseAttention = Object.freeze({STORAGE_KEY,LEVELS,MODES,nameKey,automatic,create});
})();
