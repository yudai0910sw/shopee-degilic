/**
 * Shopee認証フロー管理
 *
 * アクセストークンの取得・更新を管理
 */

/**
 * 認証URL生成
 *
 * この関数を実行してログに表示されるURLをセラーに送信し、認証してもらいます。
 *
 * @param {string} redirectUrl - 認証後のリダイレクトURL（WebアプリのURL）
 * @return {string} 認証URL
 */
function generateAuthUrl(redirectUrl) {
  const config = getConfig();
  const partnerId = config.SHOPEE.PARTNER_ID;
  const partnerKey = config.SHOPEE.PARTNER_KEY;

  if (!partnerId || !partnerKey) {
    throw new Error('Partner IDとPartner Keyを設定してください');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const path = '/api/v2/shop/auth_partner';
  const baseString = `${partnerId}${path}${timestamp}`;

  // HMAC-SHA256署名を生成
  const signature = Utilities.computeHmacSha256Signature(baseString, partnerKey);
  const sign = signature
    .map(byte => {
      const hex = (byte < 0 ? byte + 256 : byte).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    })
    .join('');

  // 本番環境の認証URLを構築（シンガポール）
  const authUrl = `https://partner.shopeemobile.com/api/v2/shop/auth_partner?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirectUrl)}`;

  Logger.log('=== 認証URL ===');
  Logger.log(authUrl);
  Logger.log('');
  Logger.log('このURLをセラーに送信して認証してもらってください。');

  return authUrl;
}

/**
 * Webアプリとして公開するためのdoGet関数
 *
 * Shopeeの認証コールバックを受け取ります。
 *
 * デプロイ手順：
 * 1. GASエディタで「デプロイ」→「新しいデプロイ」
 * 2. 種類：「ウェブアプリ」
 * 3. 次のユーザーとして実行：「自分」
 * 4. アクセスできるユーザー：「全員」
 * 5. デプロイ → URLをコピー
 *
 * @param {Object} e - リクエストパラメータ
 * @return {HtmlOutput} HTMLレスポンス
 */
function doGet(e) {
  const params = e.parameter;

  // 認証コールバック
  if (params.code && params.shop_id) {
    try {
      // アクセストークンを取得
      const result = getAccessTokenFromCode(params.code, params.shop_id);

      // スクリプトプロパティに保存
      const props = PropertiesService.getScriptProperties();
      props.setProperty('SHOPEE_ACCESS_TOKEN', result.access_token);
      props.setProperty('SHOPEE_REFRESH_TOKEN', result.refresh_token);
      props.setProperty('SHOPEE_SHOP_ID', params.shop_id);
      props.setProperty('TOKEN_EXPIRE_TIME', String(Date.now() + (result.expire_in * 1000)));

      Logger.log('アクセストークンを取得しました');
      Logger.log(`Shop ID: ${params.shop_id}`);
      Logger.log(`Access Token: ${result.access_token}`);
      Logger.log(`Refresh Token: ${result.refresh_token}`);

      // 成功画面を表示
      return HtmlService.createHtmlOutput(`
        <html>
          <head>
            <meta charset="UTF-8">
            <title>認証成功</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                max-width: 600px;
                margin: 50px auto;
                padding: 20px;
                text-align: center;
              }
              .success {
                color: #4caf50;
                font-size: 24px;
                margin-bottom: 20px;
              }
              .info {
                background-color: #f5f5f5;
                padding: 20px;
                border-radius: 8px;
                text-align: left;
              }
              .info p {
                margin: 10px 0;
              }
            </style>
          </head>
          <body>
            <div class="success">✅ 認証成功！</div>
            <div class="info">
              <p><strong>Shop ID:</strong> ${params.shop_id}</p>
              <p><strong>Access Token:</strong> ${result.access_token.substring(0, 20)}...</p>
              <p><strong>有効期限:</strong> 4時間</p>
              <p style="margin-top: 20px; color: #666;">
                アクセストークンはスクリプトプロパティに自動保存されました。<br>
                このウィンドウを閉じて構いません。
              </p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      Logger.log(`認証エラー: ${error.message}`);

      return HtmlService.createHtmlOutput(`
        <html>
          <head>
            <meta charset="UTF-8">
            <title>認証エラー</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                max-width: 600px;
                margin: 50px auto;
                padding: 20px;
                text-align: center;
              }
              .error {
                color: #f44336;
                font-size: 24px;
                margin-bottom: 20px;
              }
              .info {
                background-color: #ffebee;
                padding: 20px;
                border-radius: 8px;
                text-align: left;
              }
            </style>
          </head>
          <body>
            <div class="error">❌ 認証エラー</div>
            <div class="info">
              <p><strong>エラー内容:</strong></p>
              <p>${error.message}</p>
            </div>
          </body>
        </html>
      `);
    }
  }

  // デフォルト画面
  return HtmlService.createHtmlOutput(`
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Shopee認証システム</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            text-align: center;
          }
          h1 {
            color: #ee4d2d;
          }
        </style>
      </head>
      <body>
        <h1>Shopee認証システム</h1>
        <p>このURLは認証コールバック用です。</p>
        <p>認証URLを生成してセラーに送信してください。</p>
      </body>
    </html>
  `);
}

/**
 * コードからアクセストークンを取得
 *
 * @param {string} code - 認証コード
 * @param {string} shopId - Shop ID
 * @return {Object} トークン情報
 */
function getAccessTokenFromCode(code, shopId) {
  const config = getConfig();
  const partnerId = config.SHOPEE.PARTNER_ID;
  const partnerKey = config.SHOPEE.PARTNER_KEY;

  const timestamp = Math.floor(Date.now() / 1000);
  const path = '/api/v2/auth/token/get';
  const baseString = `${partnerId}${path}${timestamp}`;

  // 署名生成
  const signature = Utilities.computeHmacSha256Signature(baseString, partnerKey);
  const sign = signature
    .map(byte => {
      const hex = (byte < 0 ? byte + 256 : byte).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    })
    .join('');

  // 本番環境のAPIリクエストURL
  const url = `https://partner.shopeemobile.com/api/v2/auth/token/get?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;

  const payload = {
    code: code,
    shop_id: parseInt(shopId),
    partner_id: parseInt(partnerId)
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  Logger.log(`トークン取得リクエスト: ${url}`);
  Logger.log(`ペイロード: ${JSON.stringify(payload)}`);

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseBody = response.getContentText();

  Logger.log(`レスポンスコード: ${responseCode}`);
  Logger.log(`レスポンスボディ: ${responseBody}`);

  if (responseCode !== 200) {
    throw new Error(`APIエラー: ${responseCode} - ${responseBody}`);
  }

  const data = JSON.parse(responseBody);

  if (data.error) {
    throw new Error(`Shopee APIエラー: ${data.error} - ${data.message}`);
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expire_in: data.expire_in
  };
}

/**
 * アクセストークンをリフレッシュ
 *
 * この関数は定期的に実行されるトリガーで呼び出されます。
 *
 * @return {Object} 新しいトークン情報
 */
function refreshAccessToken() {
  Logger.log('=== アクセストークンをリフレッシュ ===');

  const props = PropertiesService.getScriptProperties();
  const refreshToken = props.getProperty('SHOPEE_REFRESH_TOKEN');
  const shopId = props.getProperty('SHOPEE_SHOP_ID');

  if (!refreshToken || !shopId) {
    throw new Error('Refresh TokenまたはShop IDが設定されていません。先に認証を行ってください。');
  }

  const config = getConfig();
  const partnerId = config.SHOPEE.PARTNER_ID;
  const partnerKey = config.SHOPEE.PARTNER_KEY;

  const timestamp = Math.floor(Date.now() / 1000);
  const path = '/api/v2/auth/access_token/get';
  const baseString = `${partnerId}${path}${timestamp}`;

  // 署名生成
  const signature = Utilities.computeHmacSha256Signature(baseString, partnerKey);
  const sign = signature
    .map(byte => {
      const hex = (byte < 0 ? byte + 256 : byte).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    })
    .join('');

  // 本番環境のAPIリクエストURL
  const url = `https://partner.shopeemobile.com/api/v2/auth/access_token/get?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;

  const payload = {
    refresh_token: refreshToken,
    shop_id: parseInt(shopId),
    partner_id: parseInt(partnerId)
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  Logger.log(`トークンリフレッシュリクエスト: ${url}`);

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseBody = response.getContentText();

  Logger.log(`レスポンスコード: ${responseCode}`);
  Logger.log(`レスポンスボディ: ${responseBody}`);

  if (responseCode !== 200) {
    throw new Error(`APIエラー: ${responseCode} - ${responseBody}`);
  }

  const data = JSON.parse(responseBody);

  if (data.error) {
    throw new Error(`Shopee APIエラー: ${data.error} - ${data.message}`);
  }

  // 新しいトークンを保存
  props.setProperty('SHOPEE_ACCESS_TOKEN', data.access_token);
  props.setProperty('SHOPEE_REFRESH_TOKEN', data.refresh_token);
  props.setProperty('TOKEN_EXPIRE_TIME', String(Date.now() + (data.expire_in * 1000)));

  Logger.log('アクセストークンをリフレッシュしました');
  Logger.log(`新しいAccess Token: ${data.access_token}`);
  Logger.log(`新しいRefresh Token: ${data.refresh_token}`);

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expire_in: data.expire_in
  };
}

/**
 * アクセストークン自動リフレッシュのトリガーを設定
 *
 * 3時間ごとにアクセストークンをリフレッシュします（4時間の有効期限より前）
 */
function setupRefreshTokenTrigger() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'refreshAccessToken') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 新しいトリガーを作成（3時間ごと）
  ScriptApp.newTrigger('refreshAccessToken')
    .timeBased()
    .everyHours(3)
    .create();

  Logger.log('アクセストークン自動リフレッシュトリガーを設定しました（3時間ごと）');
}

/**
 * 完全セットアップウィザード
 *
 * 認証からトリガー設定まで一括で行います。
 *
 * 使用手順：
 * 1. この関数を実行
 * 2. ログに表示される手順に従う
 */
function setupWizard() {
  Logger.log('=== Shopee注文管理システム セットアップウィザード ===');
  Logger.log('');

  // Step 1: Webアプリをデプロイ
  Logger.log('【Step 1】Webアプリのデプロイ');
  Logger.log('1. GASエディタで「デプロイ」→「新しいデプロイ」をクリック');
  Logger.log('2. 種類の選択：「ウェブアプリ」');
  Logger.log('3. 次のユーザーとして実行：「自分」');
  Logger.log('4. アクセスできるユーザー：「全員」');
  Logger.log('5. 「デプロイ」をクリック');
  Logger.log('6. WebアプリのURLをコピー（例: https://script.google.com/macros/s/xxx/exec）');
  Logger.log('');

  // Step 2: 認証URL生成の準備
  Logger.log('【Step 2】認証URLの生成');
  Logger.log('次のコマンドを実行してください：');
  Logger.log('');
  Logger.log('generateAuthUrl("あなたのWebアプリURL")');
  Logger.log('');
  Logger.log('例：generateAuthUrl("https://script.google.com/macros/s/xxx/exec")');
  Logger.log('');

  // Step 3: 認証
  Logger.log('【Step 3】セラーによる認証');
  Logger.log('1. 生成された認証URLをブラウザで開く');
  Logger.log('2. Shopeeアカウントでログイン');
  Logger.log('3. 「Confirm Authorization」をクリック');
  Logger.log('4. WebアプリのURLにリダイレクトされ、トークンが自動保存されます');
  Logger.log('');

  // Step 4: トリガー設定
  Logger.log('【Step 4】トリガーの設定');
  Logger.log('次のコマンドを実行してください：');
  Logger.log('');
  Logger.log('setupAllTriggers()');
  Logger.log('');

  Logger.log('=== セットアップ完了 ===');
}

/**
 * すべてのトリガーを一括設定
 */
function setupAllTriggers() {
  Logger.log('=== すべてのトリガーを設定 ===');

  // メイン処理のトリガー（30分ごと）
  setupTrigger();

  // アクセストークンリフレッシュトリガー（3時間ごと）
  setupRefreshTokenTrigger();

  Logger.log('すべてのトリガーを設定しました');
}

/**
 * トークン情報を確認
 */
function checkTokenInfo() {
  const props = PropertiesService.getScriptProperties();

  const accessToken = props.getProperty('SHOPEE_ACCESS_TOKEN');
  const refreshToken = props.getProperty('SHOPEE_REFRESH_TOKEN');
  const shopId = props.getProperty('SHOPEE_SHOP_ID');
  const expireTime = props.getProperty('TOKEN_EXPIRE_TIME');

  Logger.log('=== トークン情報 ===');
  Logger.log(`Shop ID: ${shopId || '未設定'}`);
  Logger.log(`Access Token: ${accessToken ? accessToken.substring(0, 20) + '...' : '未設定'}`);
  Logger.log(`Refresh Token: ${refreshToken ? refreshToken.substring(0, 20) + '...' : '未設定'}`);

  if (expireTime) {
    const expireDate = new Date(parseInt(expireTime));
    const now = new Date();
    const remainingHours = Math.floor((expireDate - now) / (1000 * 60 * 60));
    const remainingMinutes = Math.floor(((expireDate - now) % (1000 * 60 * 60)) / (1000 * 60));

    Logger.log(`有効期限: ${expireDate.toLocaleString('ja-JP', { timeZone: 'Asia/Singapore' })}`);
    Logger.log(`残り時間: ${remainingHours}時間${remainingMinutes}分`);

    if (now > expireDate) {
      Logger.log('⚠️ アクセストークンの有効期限が切れています！refreshAccessToken()を実行してください。');
    } else if (remainingHours < 1) {
      Logger.log('⚠️ アクセストークンの有効期限が1時間未満です。まもなくリフレッシュされます。');
    }
  } else {
    Logger.log('有効期限: 不明');
  }
}
