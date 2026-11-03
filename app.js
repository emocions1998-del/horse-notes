(() => {
  'use strict';
  const CSV = window.HorseCSV;
  const STORAGE_KEY = 'horse-notes-csv-v1';
  const $ = selector => document.querySelector(selector);
  const search = $('#search'), list = $('#horse-list'), detail = $('#detail');
  const fileInput = $('#csv-file'), sourceSelect = $('#data-source');
  const mobileLayout = window.matchMedia('(max-width: 760px)');
  let horses = window.HORSES;
  let selectedId = horses[0].id, filter = 'all', order = 'new';
  let saved = null, imported = null, pending = null;
  const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/\s/g, '');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const latest = horse => [...horse.notes].sort(CSV.compareNotes)[0];
  const dateLabel = note => note.rawDate !== undefined ? note.rawDate || '日付未記入' : note.date.slice(0,10).replaceAll('-', '.');
  const typeLabel = note => note.typeLabel || (note.type === 'before' ? '予想' : 'レース後');
  // 表示上の分類だけをまとめる。CSVの記録種別と保存内容は原文のまま保持する。
  const filterKey = note => {
    const label = (note.typeLabel || '').normalize('NFKC').trim();
    if (label === 'レース総括' || note.type === 'after') return 'after';
    if (label === '予想段階' || note.type === 'before') return 'before';
    return 'other';
  };
  const initialFilter = horse => horse?.notes.some(n => filterKey(n) === 'after') ? 'after' : 'all';
  function status(message, error = false) {
    $('#import-status').textContent = message;
    $('#import-status').classList.toggle('error', error);
  }
  function renderList() {
    const query = normalize(search.value);
    const hideList = mobileLayout.matches && !query;
    const matches = horses.filter(h => normalize(h.name).includes(query) || normalize(h.reading).includes(query));
    $('#total-count').textContent = `${horses.length}頭`;
    $('#result-count').textContent = hideList ? '' : `${matches.length}頭`;
    list.hidden = hideList;
    $('.list-caption').hidden = hideList;
    $('.panel-foot').textContent = hideList ? '馬名・よみがなを入力すると、検索結果を表示します。' : '名前を選ぶと、過去のメモを確認できます。';
    detail.hidden = !matches.length;
    if (matches.length && !matches.some(h => h.id === selectedId)) {
      selectedId = matches[0].id; filter = initialFilter(matches[0]); renderDetail();
    }
    if (hideList) { list.innerHTML = ''; return; }
    list.innerHTML = matches.length ? matches.map(h => {
      const metadata = h.imported ? 'CSVから取り込み' : `${h.sex}${h.age}歳 · ${h.coat} · ${h.style}`;
      return `<button class="horse-card ${selectedId === h.id ? 'selected' : ''}" data-horse="${escape(h.id)}" aria-pressed="${selectedId === h.id}"><span class="horse-monogram" aria-hidden="true">${escape(h.name[0])}</span><span class="horse-info"><strong>${escape(h.name)}</strong><span>${escape(metadata)}</span><small>${h.notes.length}件のメモ <b>·</b> ${escape(dateLabel(latest(h)))}</small></span><span class="card-arrow" aria-hidden="true">›</span></button>`;
    }).join('') : '<div class="empty"><span aria-hidden="true">⌕</span><h3>馬が見つかりませんでした</h3><p>馬名の一部や、ひらがなでも<br>検索できます。</p><button id="reset-search" class="secondary-button">検索をクリア</button></div>';
  }
  function renderDetail() {
    const h = horses.find(h => h.id === selectedId);
    if (!h) { detail.innerHTML = ''; return; }
    const meta = h.imported ? `${h.notes.length}件の記録 · CSVから取り込み` : `${h.sex}${h.age}歳 ／ ${h.coat} ／ ${h.style}`;
    const filters = new Map([['after','レース総括'],['before','予想段階'],['all','すべて']]);
    if (!filters.has(filter)) filter = 'all';
    detail.innerHTML = `<div class="horse-header"><div><p class="eyebrow">HORSE PROFILE</p><h2 id="horse-name" tabindex="-1">${escape(h.name)}</h2><p class="horse-meta">${escape(meta)}</p></div><span class="profile-mark" aria-hidden="true">♞</span></div>${h.imported ? '' : `<p class="horse-summary">${escape(h.summary)}</p>`}
      <section class="next-race ${h.imported ? 'imported-next' : ''}" aria-labelledby="next-title"><div class="next-heading"><h3 id="next-title"><span aria-hidden="true">↗</span> 次走の注目条件</h3>${h.featured ? '<span class="watch-label">注目馬</span>' : ''}</div>${h.conditions.length ? `<div class="condition-tags">${h.conditions.map(c => `<span>${escape(c)}</span>`).join('')}</div>` : ''}<p class="checkpoint-body">${escape(h.reason || '次走チェックポイントは未記入です。')}</p>${h.imported ? `<p class="condition-source">${h.reason ? `${h.conditionDate ? `記録日：${escape(h.conditionDate)} · ` : ''}${h.conditionDateKnown ? '日付順で最も新しい、空欄でないチェックポイント' : '日付未確定の記録から表示（原文を保持）'}` : ''}${h.watch ? `<br>次走注目：${escape(h.watch)}` : ''}</p>` : ''}</section>
      <section class="notes-section" aria-labelledby="notes-title"><div class="section-heading"><h3 id="notes-title">過去のメモ <span>${h.notes.length}</span></h3><label class="sort-label">表示順<select id="sort" aria-label="メモの表示順"><option value="new" ${order === 'new' ? 'selected' : ''}>新しい順</option><option value="old" ${order === 'old' ? 'selected' : ''}>古い順</option></select></label></div><div class="filters" role="group" aria-label="メモの種類">${[...filters].map(([key,label]) => `<button data-filter="${escape(key)}" aria-pressed="${filter === key}" class="filter ${filter === key ? 'active' : ''}">${escape(label)}</button>`).join('')}</div><p class="timeline-caption" id="notes-status" role="status" aria-live="polite"></p><div id="timeline" class="timeline"></div></section>`;
    renderNotes();
  }
  function section(label, body, className = '') {
    return body?.trim() ? `<section class="memo-section ${className}"><h5>${escape(label)}</h5><p class="note-body">${escape(body)}</p></section>` : '';
  }
  function noteContent(n, isImported) {
    if (!isImported) return `<div class="race-row"><h4>${escape(n.race)}</h4>${n.result ? `<span class="result">${escape(n.result)}</span>` : ''}</div><p class="course">${escape(n.course)}</p><h5>${escape(n.title)}</h5><p class="note-body">${escape(n.body)}</p><div class="note-tags">${n.tags.map(t => `<span># ${escape(t)}</span>`).join('')}</div>`;
    const metadata = [['記録者',n.recorder],['出典チャット',n.source],['備考',n.remarks],['CSVの馬名',n.rawName],...n.extras].filter(([,value]) => value.trim());
    return `${n.race.trim() ? `<div class="race-row"><h4>${escape(n.race)}</h4></div>` : ''}${section('観察・レース内容',n.observation)}${section('当時の評価・仮説',n.hypothesis)}${n.views.map(view => section(view.author,view.body,view.author === '本人の見解' ? 'personal-view' : 'chappy-view')).join('')}${section('次走チェックポイント',n.checkpoint)}${section('次走注目',n.watch)}${metadata.length ? `<details class="record-details"><summary>記録の詳細</summary><dl>${metadata.map(([label,value]) => `<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`).join('')}</dl></details>` : ''}`;
  }
  function renderNotes() {
    const h = horses.find(h => h.id === selectedId);
    const notes = h.notes.filter(n => filter === 'all' || filterKey(n) === filter).sort((a,b) => CSV.compareNotes(a,b,order));
    $('#notes-status').textContent = `${notes.length}件のメモ · ${order === 'new' ? '新しい記録から表示' : '古い記録から表示'}${h.imported && notes.some(n => !n.date) ? ' · 日付未確定は末尾' : ''}`;
    $('#timeline').innerHTML = notes.length ? notes.map(n => `<article class="note ${n.type === 'before' ? 'before' : n.type === 'after' ? 'after' : 'other'}"><div class="note-top"><span class="type-badge">${escape(typeLabel(n))}</span><span class="note-date">${n.date ? `<time datetime="${escape(n.date)}">${escape(dateLabel(n))}${!h.imported ? ` <span>${escape(n.date.slice(11))}</span>` : ''}</time>` : `<span class="uncertain-date">${escape(dateLabel(n))}</span>`}</span></div>${noteContent(n,h.imported)}</article>`).join('') : '<div class="empty"><h4>この種類のメモはまだありません</h4><p>「すべて」を選ぶと、ほかのメモを確認できます。</p></div>';
  }
  function renderSource() {
    const active = saved?.active === 'imported';
    sourceSelect.value = active ? 'imported' : 'sample';
    sourceSelect.querySelector('option[value="imported"]').disabled = !imported;
    $('#source-title').textContent = active ? '取り込んだ馬メモを表示中' : 'サンプルデータでお試し中';
    $('#source-description').textContent = active ? `${saved.fileName} · ${imported.horses.length}頭 / ${imported.count}件 · このブラウザーに保存済み` : '馬名・レース・見解はすべて架空です。';
    $('#source-tag').textContent = active ? 'LOCAL' : 'DEMO';
    horses = active ? imported.horses : window.HORSES;
    selectedId = horses[0]?.id; filter = initialFilter(horses[0]); search.value = '';
    renderList(); renderDetail();
  }
  function persist(value) {
    try { window.localStorage.setItem(STORAGE_KEY,JSON.stringify(value)); }
    catch { throw new Error('このブラウザーに保存できませんでした。容量不足やサイトの保存制限を確認してください。元の保存データと表示は変更していません。'); }
  }
  function commitImport(mapping) {
    const result = CSV.build(pending.table,mapping);
    const candidate = {version:1, csvText:pending.csvText, mapping, fileName:pending.fileName, importedAt:new Date().toISOString(), active:'imported'};
    persist(candidate); // 保存が成功するまでは、表示や以前のデータを変更しない。
    saved = candidate; imported = result; pending = null;
    renderSource();
    status(`${result.horses.length}頭・${result.count}件を取り込み、このブラウザーに保存しました。${result.undated ? ` 日付未記入・未確定の${result.undated}件は、原文のまま末尾に表示します。` : ''}`);
  }
  function showMapping() {
    $('#mapping-file').textContent = `${pending.fileName} · ${pending.table.records.length}件`;
    $('#mapping-fields').innerHTML = CSV.fields.map(([key,label]) => `<label>${escape(label)}${key === 'name' ? '（必須）' : ''}<select data-mapping="${key}" aria-label="${escape(label)}のCSV列"><option value="-1">対応なし（空欄）</option>${pending.table.headers.map((h,i) => `<option value="${i}" ${pending.mapping[key] === i ? 'selected' : ''}>${i + 1}. ${escape(h || '列名なし')}</option>`).join('')}</select></label>`).join('');
    $('#mapping-error').textContent = '';
    $('#mapping-dialog').showModal();
  }
  $('#import-button').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    $('#import-button').disabled = true;
    status('CSVを読み込んでいます…');
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('CSVは5MB以下のファイルを選んでください。');
      const csvText = CSV.decode(await file.arrayBuffer());
      const table = CSV.parse(csvText);
      const mapping = CSV.detect(table.headers);
      pending = {csvText,table,mapping,fileName:file.name};
      if (CSV.fields.some(([key]) => mapping[key] < 0)) { showMapping(); status('列の対応を確認してください。まだ保存していません。'); }
      else commitImport(mapping);
    } catch (error) { status(`取り込めませんでした。${error.message}`,true); pending = null; }
    finally { fileInput.value = ''; $('#import-button').disabled = false; }
  });
  $('#confirm-mapping').addEventListener('click', () => {
    if (!pending) return;
    try {
      const mapping = Object.fromEntries([...$('#mapping-fields').querySelectorAll('[data-mapping]')].map(select => [select.dataset.mapping,Number(select.value)]));
      commitImport(mapping); $('#mapping-dialog').close();
    } catch (error) { $('#mapping-error').textContent = error.message; }
  });
  $('#cancel-mapping').addEventListener('click', () => $('#mapping-dialog').close());
  $('#mapping-dialog').addEventListener('close', () => { if (pending) { pending = null; status('取り込みをキャンセルしました。保存データは変更していません。'); } });
  sourceSelect.addEventListener('change', () => {
    if (!saved || !imported) { sourceSelect.value = 'sample'; return; }
    try { const candidate = {...saved,active:sourceSelect.value}; persist(candidate); saved = candidate; renderSource(); status('表示データを切り替えました。取り込んだデータは保存されています。'); }
    catch (error) { sourceSelect.value = saved.active; status(error.message,true); }
  });
  list.addEventListener('click', event => {
    if (event.target.closest('#reset-search')) { search.value = ''; renderList(); search.focus(); return; }
    const button = event.target.closest('[data-horse]');
    if (!button) return;
    selectedId = button.dataset.horse; filter = initialFilter(horses.find(h => h.id === selectedId)); renderList(); renderDetail();
    if (window.matchMedia('(max-width: 760px)').matches) {
      $('#horse-name').focus({preventScroll:true});
      detail.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'start'});
    }
  });
  search.addEventListener('input',renderList);
  mobileLayout.addEventListener('change',renderList);
  detail.addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    filter = button.dataset.filter;
    detail.querySelectorAll('[data-filter]').forEach(b => { b.classList.toggle('active',b.dataset.filter === filter); b.setAttribute('aria-pressed',String(b.dataset.filter === filter)); });
    renderNotes();
  });
  detail.addEventListener('change', event => { if (event.target.id === 'sort') { order = event.target.value; renderNotes(); } });
  $('#help-button').addEventListener('click', () => $('#help').showModal());
  $('#close-help').addEventListener('click', () => $('#help').close());
  try {
    const serialized = window.localStorage.getItem(STORAGE_KEY);
    if (serialized) {
      const restored = CSV.restore(serialized); saved = restored.saved; imported = restored.result;
    }
  } catch { status('保存データを復元できませんでした。サンプルを表示します。保存データは削除していません。元のCSVから再取り込みしてください。',true); }
  renderSource();
  if ('serviceWorker' in navigator && window.location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
