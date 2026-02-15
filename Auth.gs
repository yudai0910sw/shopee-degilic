/**
 * Shopee認証フロー管理
 *
 * アクセストークンの取得・更新を管理
 */

/**
 * 認証URL生成（ショップコード付き）
 *
 * この関数を実行してログに表示されるURLをセラーに送信し、認証してもらいます。
 * リダイレクトURLにショップコードを含めることで、どの国のショップかを識別します。
 *
 * @param {string} redirectUrl - 認証後のリダイレクトURL（WebアプリのURL）
 * @param {string} shopCode - ショップコード（SG, MY, PH）
 * @return {string} 認証URL
 */
function generateAuthUrl(redirectUrl, shopCode = 'SG') {
  const config = getConfig();
  const partnerId = config.SHOPEE.PARTNER_ID;
  const partnerKey = config.SHOPEE.PARTNER_KEY;

  if (!partnerId || !partnerKey) {
    throw new Error('Partner IDとPartner Keyを設定してください');
  }

  // ショップコードの妥当性をチェック
  const validCodes = CONFIG.SHOPS.map(s => s.code);
  if (!validCodes.includes(shopCode)) {
    throw new Error(`無効なショップコード: ${shopCode}。有効なコード: ${validCodes.join(', ')}`);
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

  // リダイレクトURLにショップコードを追加
  const separator = redirectUrl.includes('?') ? '&' : '?';
  const redirectWithCode = `${redirectUrl}${separator}shop_code=${shopCode}`;

  // 本番環境の認証URLを構築
  const authUrl = `https://partner.shopeemobile.com/api/v2/shop/auth_partner?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirectWithCode)}`;

  const shopInfo = CONFIG.SHOPS.find(s => s.code === shopCode);
  Logger.log(`=== ${shopInfo.name} (${shopCode}) 認証URL ===`);
  Logger.log(authUrl);
  Logger.log('');
  Logger.log(`このURLでセラーに${shopInfo.name}ショップの認証をしてもらってください。`);

  return authUrl;
}

/**
 * 全ショップの認証URLを一括生成
 *
 * @param {string} redirectUrl - 認証後のリダイレクトURL（WebアプリのURL）。省略時はデフォルトURLを使用
 */
function generateAllAuthUrls(redirectUrl) {
  // デフォルトのリダイレクトURL（WebアプリURL）
  if (!redirectUrl) {
    redirectUrl = 'https://script.google.com/macros/s/AKfycbxzr5910TwP6F9PD1keoYtds4Q2vgp58HkQ1J_xKTIG3lUGeXOs4Cmop0y-bL5cvxoW/exec';
  }

  Logger.log('=== 全ショップの認証URL ===');
  Logger.log('');

  for (const shop of CONFIG.SHOPS) {
    generateAuthUrl(redirectUrl, shop.code);
    Logger.log('');
  }
}

/**
 * Webアプリとして公開するためのdoGet関数
 *
 * Shopeeの認証コールバックを受け取ります。
 * shop_codeパラメータで、どの国のショップかを識別します。
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

  // ロジレス認証のコールバックを先にチェック
  const logilessResponse = handleLogilessCallback(params);
  if (logilessResponse) {
    return logilessResponse;
  }

  // Shopee認証コールバック
  if (params.code && params.shop_id) {
    try {
      // ショップコードを取得（デフォルトはSG）
      const shopCode = params.shop_code || 'SG';

      // ショップコードの妥当性をチェック
      const shopInfo = CONFIG.SHOPS.find(s => s.code === shopCode);
      if (!shopInfo) {
        throw new Error(`無効なショップコード: ${shopCode}`);
      }

      // アクセストークンを取得
      const result = getAccessTokenFromCode(params.code, params.shop_id);

      // ショップ固有の認証情報を保存
      setShopCredentials(shopCode, params.shop_id, result.access_token, result.refresh_token);

      Logger.log(`${shopInfo.name}ショップのアクセストークンを取得しました`);
      Logger.log(`Shop Code: ${shopCode}`);
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
              .country-badge {
                display: inline-block;
                background-color: #ee4d2d;
                color: white;
                padding: 5px 15px;
                border-radius: 20px;
                margin-bottom: 15px;
              }
            </style>
          </head>
          <body>
            <div class="success">✅ 認証成功！</div>
            <div class="country-badge">${shopInfo.name} (${shopCode})</div>
            <div class="info">
              <p><strong>Shop ID:</strong> ${params.shop_id}</p>
              <p><strong>Access Token:</strong> ${result.access_token.substring(0, 20)}...</p>
              <p><strong>有効期限:</strong> 4時間</p>
              <p style="margin-top: 20px; color: #666;">
                ${shopInfo.name}ショップの認証情報がスクリプトプロパティに保存されました。<br>
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
        <title>Shopee認証システム（マルチショップ対応）</title>
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
          .shops {
            text-align: left;
            background: #f5f5f5;
            padding: 20px;
            border-radius: 8px;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <h1>Shopee認証システム</h1>
        <p>このURLは認証コールバック用です。</p>
        <p>認証URLを生成してセラーに送信してください。</p>
        <div class="shops">
          <p><strong>対応ショップ:</strong></p>
          <ul>
            <li>Singapore (SG)</li>
            <li>Malaysia (MY)</li>
            <li>Philippines (PH)</li>
          </ul>
        </div>
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
 * 特定ショップのアクセストークンをリフレッシュ
 *
 * @param {string} shopCode - ショップコード（SG, MY, PH）
 * @return {Object} 新しいトークン情報
 */
function refreshShopAccessToken(shopCode) {
  Logger.log(`=== ${shopCode}ショップのアクセストークンをリフレッシュ ===`);

  const props = PropertiesService.getScriptProperties();
  const refreshToken = props.getProperty(`SHOP_${shopCode}_REFRESH_TOKEN`);
  const shopId = props.getProperty(`SHOP_${shopCode}_ID`);

  if (!refreshToken || !shopId) {
    Logger.log(`${shopCode}: Refresh TokenまたはShop IDが設定されていません。スキップします。`);
    return null;
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

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode !== 200) {
      throw new Error(`APIエラー: ${responseCode} - ${responseBody}`);
    }

    const data = JSON.parse(responseBody);

    if (data.error) {
      throw new Error(`Shopee APIエラー: ${data.error} - ${data.message}`);
    }

    // 新しいトークンを保存
    setShopCredentials(shopCode, shopId, data.access_token, data.refresh_token);

    Logger.log(`${shopCode}: アクセストークンをリフレッシュしました`);

    return {
      shopCode: shopCode,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expire_in: data.expire_in
    };
  } catch (error) {
    Logger.log(`${shopCode}: リフレッシュエラー - ${error.message}`);
    return null;
  }
}

/**
 * 全ショップのアクセストークンをリフレッシュ
 *
 * この関数は定期的に実行されるトリガーで呼び出されます。
 */
function refreshAccessToken() {
  Logger.log('=== 全ショップのアクセストークンをリフレッシュ ===');

  const activeShops = getActiveShops();

  if (activeShops.length === 0) {
    Logger.log('認証済みのショップがありません');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const shopCode of activeShops) {
    const result = refreshShopAccessToken(shopCode);
    if (result) {
      successCount++;
    } else {
      failCount++;
    }

    // APIレート制限対策
    Utilities.sleep(1000);
  }

  Logger.log(`=== リフレッシュ完了: 成功 ${successCount}件, 失敗 ${failCount}件 ===`);
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
