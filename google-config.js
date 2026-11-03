// 公開してよい設定だけを置きます。clientIdはGoogle Cloudの「クライアントID」です。
// クライアントシークレット、トークン、実際の馬メモは絶対に記入しないでください。
window.HORSE_SHEETS_CONFIG = Object.freeze({
  clientId: '', // ここに xxx.apps.googleusercontent.com を設定（設定画面でも入力できます）。
  spreadsheetId: '1bMOwzNbt8KXrrrO5IxA5haggIM8xmg3tkB9Zhead6T4',
  range: "'馬メモ一覧'!A1:M"
});
