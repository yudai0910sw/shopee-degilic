/**
 * ロジレス（LOGILESS）OAuth2.0認証管理
 *
 * ロジレスAPIへのアクセスに必要なOAuth2.0認証フローを管理します。
 * 設定はConfig.gsで一元管理されます。
 *
 * 認証フロー：
 * 1. generateLogilessAuthUrl() で認証URLを生成
 * 2. ユーザーが認証URLにアクセスして承認
 * 3. コールバックURLに認可コードが返される
 * 4. getLogilessAccessTokenFromCode() でアクセストークンを取得
 * 5. refreshLogilessAccessToken() で定期的にトークンをリフレッシュ
 */

/**
 * ロジレス認証URL生成
 *
 * この関数を実行してログに表示されるURLにアクセスし、認証を行います。
 *
 * @param {string} redirectUrl - 認証後のリダイレクトURL（省略時はConfig設定を使用）
 * @return {string} 認証URL
 */
function generateLogilessAuthUrl(redirectUrl) {
  const config = getConfig();
  const clientId = config.LOGILESS.CLIENT_ID;

  if (!clientId) {
    throw new Error('ロジレスのClient IDが設定されていません。setLogilessConfig()で設定してください。');
  }

  // デフォルトのリダイレクトURL
  if (!redirectUrl) {
    redirectUrl = config.LOGILESS.REDIRECT_URI;
    if (!redirectUrl) {
      throw new Error('リダイレクトURLを指定するか、setLogilessConfig()で設定してください。');
    }
  }

  // 認可URLを構築
  const authUrl = config.LOGILESS.AUTH_URL +
    '?client_id=' + encodeURIComponent(clientId) +
    '&response_type=code' +
    '&redirect_uri=' + encodeURIComponent(redirectUrl);

  Logger.log('=== ロジレス認証URL ===');
  Logger.log(authUrl);
  Logger.log('');
  Logger.log('このURLにアクセスしてロジレスアカウントで認証してください。');
  Logger.log('認証後、リダイレクトURLに認可コードが付与されます。');

  return authUrl;
}

/**
 * 認可コードからアクセストークンを取得
 *
 * @param {string} code - 認可コード
 * @return {Object} トークン情報 {access_token, refresh_token, expires_in}
 */
function getLogilessAccessTokenFromCode(code) {
  const config = getConfig();
  const clientId = config.LOGILESS.CLIENT_ID;
  const clientSecret = config.LOGILESS.CLIENT_SECRET;
  const redirectUri = config.LOGILESS.REDIRECT_URI;

  if (!clientId || !clientSecret) {
    throw new Error('ロジレスのClient IDまたはClient Secretが設定されていません。');
  }

  if (!redirectUri) {
    throw new Error('ロジレスのリダイレクトURIが設定されていません。');
  }

  // トークンエンドポイントにGETリクエスト（ロジレスの仕様）
  const tokenUrl = config.LOGILESS.TOKEN_URL +
    '?client_id=' + encodeURIComponent(clientId) +
    '&client_secret=' + encodeURIComponent(clientSecret) +
    '&code=' + encodeURIComponent(code) +
    '&grant_type=authorization_code' +
    '&redirect_uri=' + encodeURIComponent(redirectUri);

  Logger.log('トークン取得リクエスト送信...');

  const options = {
    method: 'get',
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(tokenUrl, options);
  const responseCode = response.getResponseCode();
  const responseBody = response.getContentText();

  Logger.log(`レスポンスコード: ${responseCode}`);

  if (responseCode !== 200) {
    Logger.log(`エラーレスポンス: ${responseBody}`);
    throw new Error(`トークン取得エラー: ${responseCode} - ${responseBody}`);
  }

  const data = JSON.parse(responseBody);

  if (data.error) {
    throw new Error(`ロジレスAPIエラー: ${data.error} - ${data.error_description || ''}`);
  }

  // トークンを保存（Config.gsの関数を使用）
  setLogilessTokens(data.access_token, data.refresh_token, data.expires_in);

  Logger.log('アクセストークンを取得しました');
  Logger.log(`有効期限: ${data.expires_in}秒（約${Math.floor(data.expires_in / 86400)}日）`);

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in
  };
}

/**
 * アクセストークンをリフレッシュ
 *
 * @return {Object} 新しいトークン情報
 */
function refreshLogilessAccessToken() {
  Logger.log('=== ロジレスアクセストークンをリフレッシュ ===');

  const config = getConfig();
  const clientId = config.LOGILESS.CLIENT_ID;
  const clientSecret = config.LOGILESS.CLIENT_SECRET;
  const refreshToken = config.LOGILESS.REFRESH_TOKEN;

  if (!clientId || !clientSecret) {
    throw new Error('ロジレスのClient IDまたはClient Secretが設定されていません。');
  }

  if (!refreshToken) {
    throw new Error('リフレッシュトークンが設定されていません。再認証が必要です。');
  }

  // トークンエンドポイントにGETリクエスト
  const tokenUrl = config.LOGILESS.TOKEN_URL +
    '?client_id=' + encodeURIComponent(clientId) +
    '&client_secret=' + encodeURIComponent(clientSecret) +
    '&refresh_token=' + encodeURIComponent(refreshToken) +
    '&grant_type=refresh_token';

  const options = {
    method: 'get',
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(tokenUrl, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode !== 200) {
      throw new Error(`APIエラー: ${responseCode} - ${responseBody}`);
    }

    const data = JSON.parse(responseBody);

    if (data.error) {
      throw new Error(`ロジレスAPIエラー: ${data.error} - ${data.error_description || ''}`);
    }

    // 新しいトークンを保存（Config.gsの関数を使用）
    setLogilessTokens(data.access_token, data.refresh_token, data.expires_in);

    Logger.log('アクセストークンをリフレッシュしました');

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in
    };
  } catch (error) {
    Logger.log(`リフレッシュエラー: ${error.message}`);
    throw error;
  }
}

/**
 * 有効なアクセストークンを取得
 *
 * トークンが期限切れの場合は自動的にリフレッシュします。
 *
 * @return {string} アクセストークン
 */
function getValidLogilessAccessToken() {
  const config = getConfig();
  const accessToken = config.LOGILESS.ACCESS_TOKEN;
  const expireTime = config.LOGILESS.TOKEN_EXPIRE;

  if (!accessToken) {
    throw new Error('ロジレスのアクセストークンが設定されていません。認証を行ってください。');
  }

  // 有効期限をチェック（1日の余裕を持つ）
  const now = Date.now();
  const safetyMargin = 24 * 60 * 60 * 1000; // 1日

  if (expireTime && parseInt(expireTime) - safetyMargin < now) {
    Logger.log('アクセストークンの有効期限が近いためリフレッシュします');
    const result = refreshLogilessAccessToken();
    return result.access_token;
  }

  return accessToken;
}

/**
 * ロジレス認証のコールバック処理
 *
 * doGet関数内で呼び出してください。
 *
 * @param {Object} params - リクエストパラメータ
 * @return {HtmlOutput|null} HTMLレスポンス（ロジレス認証の場合）、それ以外はnull
 */
function handleLogilessCallback(params) {
  // ロジレス認証のコールバックかどうかを判定
  // codeパラメータがあり、shop_idがない場合でlogiless=trueの場合
  if (params.code && !params.shop_id && params.logiless === 'true') {
    try {
      const result = getLogilessAccessTokenFromCode(params.code);

      return HtmlService.createHtmlOutput(`
        <html>
          <head>
            <meta charset="UTF-8">
            <title>ロジレス認証成功</title>
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
              .logiless-badge {
                display: inline-block;
                background-color: #1976d2;
                color: white;
                padding: 5px 15px;
                border-radius: 20px;
                margin-bottom: 15px;
              }
            </style>
          </head>
          <body>
            <div class="success">✅ LOGILESS 認証成功</div>
            <div class="logiless-badge">LOGILESS API</div>
            <div class="info">
              <p><strong>Access Token:</strong> ${result.access_token.substring(0, 20)}...</p>
              <p><strong>有効期限:</strong> 30日間</p>
              <p style="margin-top: 20px; color: #666;">
                ロジレスの認証情報がスクリプトプロパティに保存されました。<br>
                このウィンドウを閉じて構いません。
              </p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      Logger.log(`ロジレス認証エラー: ${error.message}`);

      return HtmlService.createHtmlOutput(`
        <html>
          <head>
            <meta charset="UTF-8">
            <title>ロジレス認証エラー</title>
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
            <div class="error">❌ ロジレス認証エラー</div>
            <div class="info">
              <p><strong>エラー内容:</strong></p>
              <p>${error.message}</p>
            </div>
          </body>
        </html>
      `);
    }
  }

  return null;
}

/**
 * ロジレストークン自動リフレッシュのトリガーを設定
 *
 * 7日ごとにリフレッシュトークンでアクセストークンを更新します。
 * （30日の有効期限に対して十分な余裕を持たせる）
 */
function setupLogilessRefreshTrigger() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'refreshLogilessAccessToken') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 新しいトリガーを作成（7日ごと）
  ScriptApp.newTrigger('refreshLogilessAccessToken')
    .timeBased()
    .everyDays(7)
    .atHour(3) // 深夜3時に実行
    .create();

  Logger.log('ロジレスアクセストークン自動リフレッシュトリガーを設定しました（7日ごと）');
}

/**
 * ロジレス認証セットアップウィザード
 *
 * 認証までの手順を表示します。
 */
function logilessSetupWizard() {
  Logger.log('=== ロジレス認証セットアップウィザード ===');
  Logger.log('');

  Logger.log('【Step 1】アプリケーション登録');
  Logger.log('1. LOGILESS Developersでアプリケーションを登録');
  Logger.log('2. 審査完了後、Client IDとClient Secretを取得');
  Logger.log('');

  Logger.log('【Step 2】設定の保存');
  Logger.log('以下の関数を実行してください：');
  Logger.log('');
  Logger.log('setLogilessConfig(');
  Logger.log('  "YOUR_CLIENT_ID",');
  Logger.log('  "YOUR_CLIENT_SECRET",');
  Logger.log('  "https://script.google.com/macros/s/xxxxx/exec?logiless=true",');
  Logger.log('  "YOUR_MERCHANT_ID"');
  Logger.log(');');
  Logger.log('');

  Logger.log('【Step 3】認証URLの生成と認証');
  Logger.log('以下の関数を実行してください：');
  Logger.log('');
  Logger.log('generateLogilessAuthUrl();');
  Logger.log('');
  Logger.log('表示されたURLにアクセスして認証を行います。');
  Logger.log('');

  Logger.log('【Step 4】トリガーの設定');
  Logger.log('以下の関数を実行してください：');
  Logger.log('');
  Logger.log('setupLogilessRefreshTrigger();');
  Logger.log('');

  Logger.log('=== 以上でセットアップ完了です ===');
}
