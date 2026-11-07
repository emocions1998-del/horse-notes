/* CSVの解析・変換だけを行う。ネットワークやファイルの書き換えは行わない。 */
(() => {
  'use strict';
  const fields = [
    ['name', '馬名', ['馬名']],
    ['date', '記録日', ['記録日', '記録日時', '日付']],
    ['race', 'レース', ['レース', 'レース名']],
    ['observation', '観察・レース内容', ['観察・レース内容', '観察レース内容', '観察内容']],
    ['hypothesis', '当時の評価・仮説', ['当時の評価・仮説', '当時の評価仮説']],
    ['checkpoint', '次走チェックポイント', ['次走チェックポイント', '次走注目条件']],
    ['watch', '次走注目', ['次走注目']],
    ['recorder', '記録者', ['記録者']],
    ['source', '出典チャット', ['出典チャット', '出典']],
    ['kind', '記録種別', ['記録種別', '種別', 'メモ種別']],
    ['remarks', '備考', ['備考']],
    ['personal', '本人の見解', ['本人の見解']],
    ['chappy', 'チャッピーの見解', ['チャッピーの見解']],
    ['raceDate', 'レース開催日', ['レース開催日', '開催日']]
  ];
  const headerKey = text => text.normalize('NFKC').replace(/[\s\uFEFF]/g, '');
  function parse(text) {
    if (typeof text !== 'string') throw new Error('CSVを文字列として読み込めませんでした。');
    text = text.replace(/^\uFEFF/, '');
    const records = [];
    let row = [], field = '', state = 'start', line = 1, startLine = 1;
    const endField = () => { row.push(field); field = ''; state = 'start'; };
    const endRow = () => { endField(); if (row.some(v => v.trim())) records.push({cells: row, line: startLine}); row = []; startLine = line + 1; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (state === 'quoted') {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else state = 'closed';
        } else { field += c; if (c === '\n' || (c === '\r' && text[i + 1] !== '\n')) line++; }
        continue;
      }
      if (c === ',') { endField(); continue; }
      if (c === '\n' || c === '\r') {
        endRow(); if (c === '\r' && text[i + 1] === '\n') i++; line++; continue;
      }
      if (state === 'closed') { if (c === ' ' || c === '\t') continue; throw new Error(`${line}行目：引用符の後に余分な文字があります。CSV形式を確認してください。`); }
      if (c === '"') { if (state !== 'start') throw new Error(`${line}行目：引用符の位置が正しくありません。`); state = 'quoted'; }
      else { field += c; state = 'plain'; }
    }
    if (state === 'quoted') throw new Error(`${startLine}行目からの引用符が閉じられていません。`);
    endRow();
    if (records.length < 2) throw new Error('列名の行と、1件以上のデータが必要です。');
    const headers = records.shift().cells;
    const seen = new Set();
    headers.forEach(h => { const key = headerKey(h); if (key && seen.has(key)) throw new Error(`列名「${h}」が重複しています。列名を区別してください。`); if (key) seen.add(key); });
    if (records.length > 20000) throw new Error('一度に取り込めるのは20,000行までです。CSVを分けてください。');
    records.forEach(record => {
      if (record.cells.length > headers.length) throw new Error(`${record.line}行目：列名よりデータの列数が多くなっています。`);
      while (record.cells.length < headers.length) record.cells.push('');
    });
    return {headers, records};
  }
  function detect(headers) {
    return Object.fromEntries(fields.map(([key, , aliases]) => [key, headers.findIndex(h => aliases.some(a => headerKey(a) === headerKey(h)))]));
  }
  // 判定できない日付は空のソートキーにし、表示用の原文には触れない。
  function dateKey(raw) {
    const value = raw.normalize('NFKC').trim();
    const match = /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
    if (!match) return '';
    const [, y, m, d, hh = '00', mm = '00', ss = '00'] = match;
    const date = new Date(Date.UTC(+y, +m - 1, +d));
    if (date.getUTCFullYear() !== +y || date.getUTCMonth() !== +m - 1 || date.getUTCDate() !== +d || +hh > 23 || +mm > 59 || +ss > 59) return '';
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T${hh.padStart(2,'0')}:${mm}:${ss}`;
  }
  function kindOf(raw) {
    const label = raw.trim();
    if (['予想', '事前予想', 'レース前'].includes(label)) return {type:'before', typeLabel:label};
    if (['レース後', '回顧', 'レース回顧', 'レース後の見解'].includes(label)) return {type:'after', typeLabel:label};
    return {type:`custom:${label}`, typeLabel:label || '種別未記入'};
  }
  function compareNotes(a, b, order = 'new') {
    if (!a.date || !b.date) return a.date ? -1 : b.date ? 1 : (a.row || 0) - (b.row || 0);
    return (order === 'old' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) || (a.row || 0) - (b.row || 0);
  }
  function build(table, mapping) {
    // ver.2.2以前の保存マッピングには開催日がない。原文・保存設定を変更せず補う。
    mapping = {...mapping, raceDate:mapping.raceDate ?? detect(table.headers).raceDate};
    for (const [key] of fields) if (!Number.isInteger(mapping[key]) || mapping[key] < -1 || mapping[key] >= table.headers.length) throw new Error('列の対応を選び直してください。');
    if (mapping.name < 0) throw new Error('「馬名」に対応する列を選んでください。');
    const used = Object.values(mapping).filter(i => i >= 0);
    if (new Set(used).size !== used.length) throw new Error('同じCSV列を複数の項目に割り当てることはできません。');
    const horses = new Map();
    let undated = 0;
    for (const record of table.records) {
      const get = key => mapping[key] < 0 ? '' : record.cells[mapping[key]];
      const rawName = get('name');
      const name = rawName.trim();
      if (!name) throw new Error(`${record.line}行目に馬名がありません。取り込みは行っていません。`);
      const key = name.normalize('NFKC').replace(/\s/g, '');
      if (!horses.has(key)) horses.set(key, {id:`csv-${horses.size}`, name, reading:'', sex:'', age:'', coat:'', style:'', featured:false, summary:'', conditions:[], reason:'', imported:true, notes:[]});
      const h = horses.get(key);
      const rawDate = get('date');
      const date = dateKey(rawDate);
      if (!date) undated++;
      const extras = record.cells.flatMap((value, i) => value && !used.includes(i) ? [[table.headers[i] || `列${i + 1}`, value]] : []);
      const note = {
        id:`row-${record.line}`, row:record.line, date, rawDate, rawName,
        ...kindOf(get('kind')), race:get('race'), rawRaceDate:get('raceDate'), raceDate:dateKey(get('raceDate')).slice(0,10), observation:get('observation'), hypothesis:get('hypothesis'),
        checkpoint:get('checkpoint'), watch:get('watch'), recorder:get('recorder'), source:get('source'), remarks:get('remarks'),
        views: [{author:'本人の見解', body:get('personal')}, {author:'チャッピーの見解', body:get('chappy')}].filter(v => v.body.trim()),
        tags:[], extras
      };
      h.notes.push(note);
    }
    for (const h of horses.values()) {
      const ordered = [...h.notes].sort(compareNotes);
      const checkpoint = ordered.find(n => n.checkpoint.trim());
      const watch = ordered.find(n => n.watch.trim());
      h.reason = checkpoint?.checkpoint || '';
      h.conditionDate = checkpoint?.rawDate || '';
      h.conditionDateKnown = Boolean(checkpoint?.date);
      h.watch = watch?.watch || '';
      h.featured = /^(?:true|1|○|〇|◎|◯|はい|注目|あり|有|次走注目)$/i.test(h.watch.trim());
      h.summary = `${h.notes.length}件の記録`;
    }
    return {horses:[...horses.values()], count:table.records.length, undated};
  }
  function decode(buffer) {
    const bytes = new Uint8Array(buffer);
    try {
      if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le', {fatal:true}).decode(bytes);
      if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be', {fatal:true}).decode(bytes);
      try { return new TextDecoder('utf-8', {fatal:true}).decode(bytes); }
      catch { return new TextDecoder('shift_jis', {fatal:true}).decode(bytes); }
    } catch { throw new Error('文字コードを読み取れませんでした。UTF-8形式のCSVを選んでください。'); }
  }
  function restore(serialized) {
    const saved = JSON.parse(serialized);
    if (saved.version !== 1 || typeof saved.csvText !== 'string' || typeof saved.fileName !== 'string' || !saved.mapping || !['sample','imported'].includes(saved.active)) throw new Error('保存データの形式が異なります。');
    const result = build(parse(saved.csvText), saved.mapping);
    return {saved, result};
  }
  window.HorseCSV = {fields, parse, detect, dateKey, compareNotes, build, decode, restore};
})();
