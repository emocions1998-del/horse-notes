(() => {
  'use strict';
  const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
  const LIBRARY_URL = 'https://accounts.google.com/gsi/client';
  const validClientId = value => /^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(value);
  // APIの表示値をCSVと同じ経路で検証する。空欄・改行・不完全な日付も保持する。
  function convert(values, CSV) {
    if (!Array.isArray(values) || values.length < 2 || values.length > 20001 || values.some(row => !Array.isArray(row) || row.some(cell => cell !== null && !['string','number','boolean'].includes(typeof cell)))) {
      throw new Error('行単位のデータを確認できませんでした。保存データは変更していません。');
    }
    const csvText = values.map(row => row.map(cell => `"${String(cell ?? '').replaceAll('"','""')}"`).join(',')).join('\r\n');
    if (new TextEncoder().encode(csvText).length > 5 * 1024 * 1024) throw new Error('データが5MBを超えています。保存データは変更していません。');
    const table = CSV.parse(csvText), mapping = CSV.detect(table.headers);
    if (CSV.fields.some(([key]) => key !== 'raceDate' && mapping[key] < 0)) throw new Error('シートの1行目に必要な13列の列名がありません。保存データは変更していません。');
    return {csvText,mapping,result:CSV.build(table,mapping)};
  }
  function create({config,CSV,onData,onState,loadLibrary,fetchData = (...args) => window.fetch(...args),now = () => Date.now()}) {
    let clientId = config.clientId.trim(), ready = false, busy = false;
    let accessToken = '', expiresAt = 0, epoch = 0, controller = null;
    let authTimer = null, expiryTimer = null;
    let message = clientId ? 'Google認証の準備をしています…' : 'OAuthクライアントIDを設定してください。保存済みデータはそのまま使えます。';
    let error = false;
    const hasToken = () => Boolean(accessToken && now() < expiresAt);
    function emit() {onState({ready,busy,connected:hasToken(),canDisconnect:Boolean(accessToken || busy),configured:validClientId(clientId),message,error});}
    function say(text,isError = false) {message=text;error=isError;emit();}
    function cancelPending() {
      const wasBusy=busy;
      epoch++;controller?.abort();controller=null;
      clearTimeout(authTimer);authTimer=null;busy=false;
      if(wasBusy){message='進行中のGoogle操作を中止しました。保存済みデータは変更していません。';error=false;}
      emit();
    }
    function forgetToken() {accessToken='';expiresAt=0;clearTimeout(expiryTimer);expiryTimer=null;}
    async function prepare() {
      if (!validClientId(clientId)) {ready=false;say('OAuthクライアントIDを設定してください。保存済みデータはそのまま使えます。');return;}
      const attempt=epoch;
      try {
        await loadLibrary();
        if (attempt!==epoch) return;
        if (!window.google?.accounts?.oauth2) throw new Error();
        ready=true;say(hasToken()?'Googleに接続しています。「最新データを取得」で更新できます。':'未接続です。「接続」または「最新データを取得」からGoogleの認可画面を開けます。');
      } catch {
        if (attempt!==epoch) return;
        ready=false;say('Google認証を準備できませんでした。通信を確認し「認証の準備を再試行」を押してください。保存済みデータは利用できます。',true);
      }
    }
    async function acquireData() {
      if (busy) return;
      if (!hasToken()) {authorize(true);return;}
      busy=true;const attempt=++epoch;
      controller=new AbortController();const currentController=controller;
      const timeout=setTimeout(()=>currentController.abort(),25000);
      say('Googleスプレッドシートから最新データを取得しています…');
      try {
        const endpoint=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/values/${encodeURIComponent(config.range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
        const response=await fetchData(endpoint,{method:'GET',headers:{Authorization:`Bearer ${accessToken}`},credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',signal:currentController.signal});
        if (attempt!==epoch) return;
        if (!response.ok) {
          if (response.status===401) {forgetToken();throw new Error('Googleの認可期限が切れたか、許可が取り消されました。もう一度「接続」してください。');}
          if (response.status===403) throw new Error('読み取り権限を確認してください。使用中のGoogleアカウントに表の閲覧権限があるか、Sheets APIが有効かを確認します。');
          if (response.status===404) throw new Error('対象の表が見つかりません。閲覧権限とスプレッドシートIDを確認してください。');
          if (response.status===429) throw new Error('取得回数の上限に達しました。時間をおいて再試行してください。');
          if (response.status===400) throw new Error('シート名または範囲を確認してください。対象は「馬メモ一覧」のA〜N列です。');
          throw new Error('Googleから正常な応答を受け取れませんでした。時間をおいて再試行してください。');
        }
        const payload=await response.json();
        if (attempt!==epoch) return;
        if (payload.majorDimension && payload.majorDimension!=='ROWS') throw new Error('行単位のデータを確認できませんでした。');
        const converted=convert(payload.values,CSV);
        const fetchedAt=new Date(now()).toISOString();
        const candidate={version:1,csvText:converted.csvText,mapping:converted.mapping,fileName:'Google Sheets · 馬メモ一覧',importedAt:fetchedAt,fetchedAt,sourceType:'google-sheets',source:{spreadsheetId:config.spreadsheetId,range:config.range},active:'imported'};
        // onData側で保存を先に確定する。失敗・キャンセル時は既存の表示を変えない。
        onData(candidate,converted.result);
        if (attempt!==epoch) return;
        say(`${converted.result.horses.length}頭・${converted.result.count}件を取得し、端末内に保存しました。`);
      } catch (cause) {
        if (attempt!==epoch) return;
        const safeMessage=cause instanceof SyntaxError ? 'Googleの応答を読み取れませんでした。' : cause.name==='AbortError' ? '通信が時間内に完了しませんでした。' : cause instanceof TypeError ? '通信できませんでした。インターネット接続を確認してください。' : cause.message;
        say(`${safeMessage} 保存済みデータはそのまま利用できます。`,true);
      } finally {
        clearTimeout(timeout);
        if (attempt===epoch) {busy=false;controller=null;emit();}
      }
    }
    function authorize(fetchAfter) {
      if (busy) return;
      if (!ready || !validClientId(clientId)) {say('先にクライアントIDを設定し、認証の準備が完了してから操作してください。',true);return;}
      busy=true;const attempt=++epoch;
      say('Googleの画面でアカウントと読み取り許可を確認してください。');
      const fail=text=>{if(attempt!==epoch)return;clearTimeout(authTimer);busy=false;say(text+' 保存済みデータは変更していません。',true);};
      authTimer=setTimeout(()=>{if(attempt===epoch){epoch++;busy=false;say('Google認証が完了しませんでした。もう一度ボタンから操作してください。保存済みデータは利用できます。',true);}},120000);
      try {
        const oauth=window.google.accounts.oauth2;
        const client=oauth.initTokenClient({client_id:clientId,scope:SCOPE,include_granted_scopes:false,
          callback:response=>{
            if(attempt!==epoch)return;
            clearTimeout(authTimer);authTimer=null;
            if(!response || response.error || typeof response.access_token!=='string' || !response.access_token || !oauth.hasGrantedAllScopes(response,SCOPE)) {fail('Googleの読み取り許可を取得できませんでした。');return;}
            const lifetime=Number(response.expires_in);
            if(!Number.isFinite(lifetime)||lifetime<=60) {fail('有効な認可期限を確認できませんでした。');return;}
            accessToken=response.access_token;expiresAt=now()+(lifetime-30)*1000;busy=false;
            clearTimeout(expiryTimer);
            expiryTimer=setTimeout(()=>{forgetToken();if(!busy)say('Googleの認可期限が切れました。更新時にもう一度認可してください。保存済みデータは利用できます。');},Math.min((lifetime-30)*1000,2147483647));
            say('Googleへの読み取り接続ができました。「最新データを取得」で更新できます。');
            if(fetchAfter) void acquireData();
          },
          error_callback:response=>fail(response.type==='popup_failed_to_open'?'Googleの認証画面を開けませんでした。Safariの通常タブでもお試しください。':response.type==='popup_closed'?'Googleの認証画面が閉じられました。':'Google認証を完了できませんでした。')
        });
        // iPhoneのポップアップ制限に備え、クリック中に同期的に呼ぶ。awaitを挟まない。
        client.requestAccessToken({prompt:'select_account'});
      } catch {fail('Google認証を開始できませんでした。認証の準備を再試行してください。');}
    }
    function disconnect() {
      const token=accessToken;
      cancelPending();forgetToken();ready=Boolean(window.google?.accounts?.oauth2);
      const attempt=epoch;
      say('この端末の接続を解除しました。保存済みデータは残っています。');
      if(!token) return;
      busy=true;emit();
      let finished=false;
      const finish=successful=>{
        if(finished)return;finished=true;clearTimeout(timer);
        if(attempt!==epoch)return;
        busy=false;say(successful?'接続を解除し、Google側の許可も取り消しました。保存済みデータは残っています。':'端末の接続は解除しましたが、Google側の許可取消は確認できませんでした。必要ならGoogleアカウントの接続管理から削除してください。保存データは残っています。',!successful);
      };
      const timer=setTimeout(()=>finish(false),10000);
      try {window.google.accounts.oauth2.revoke(token,response=>finish(response?.successful===true));} catch {finish(false);}
    }
    function setClientId(value) {
      cancelPending();forgetToken();clientId=value.trim();ready=false;
      void prepare();
    }
    emit();void prepare();
    return {connect:()=>authorize(false),update:acquireData,disconnect,cancelPending,setClientId,retry:()=>{cancelPending();return prepare();}};
  }
  let libraryPromise=null;
  function loadLibrary() {
    if(window.google?.accounts?.oauth2) return Promise.resolve();
    if(libraryPromise)return libraryPromise;
    libraryPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=LIBRARY_URL;script.async=true;
      let settled=false;
      const timer=setTimeout(()=>finish(false),15000);
      function finish(ok) {
        if(settled)return;settled=true;clearTimeout(timer);
        script.onload=null;script.onerror=null;
        if(ok && window.google?.accounts?.oauth2) resolve();
        else {script.remove();libraryPromise=null;reject(new Error('Google認証ライブラリーを読み込めませんでした。'));}
      }
      script.onload=()=>finish(true);script.onerror=()=>finish(false);document.head.append(script);
    });
    return libraryPromise;
  }
  window.HorseSheets={create,convert,validClientId,loadLibrary};
})();
