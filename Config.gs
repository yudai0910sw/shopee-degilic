/**
 * Shopee注文管理システム - 設定ファイル
 *
 * 使用方法：
 * 1. Shopee Partner IDとPartner Keyを設定
 * 2. Shop IDとAccess Tokenを設定（認証後に取得）
 * 3. Slack Webhook URLを設定
 * 4. スプレッドシートIDを設定
 */

const CONFIG = {
  // Shopee API設定（本番環境）
  SHOPEE: {
    PARTNER_ID: '2014691', // Live Partner ID（Go Live承認後に取得）
    PARTNER_KEY: 'shpk596c50566f555469627743504b4f5a545a6c506352496d7059724c7a4546', // Live Partner Key（Go Live承認後に取得）

    // 本番環境のベースURL（全リージョン共通）
    BASE_URL: 'https://partner.shopeemobile.com/api/v2',

    // APIエンドポイント
    ENDPOINTS: {
      GET_ORDER_LIST: '/order/get_order_list',
      GET_ORDER_DETAIL: '/order/get_order_detail',
      GET_SHIPPING_PARAMETER: '/logistics/get_shipping_parameter',
      GET_ESCROW_DETAIL: '/payment/get_escrow_detail',
      // 配送ラベル関連
      GET_TRACKING_NUMBER: '/logistics/get_tracking_number',
      GET_SHIPPING_DOCUMENT_PARAMETER: '/logistics/get_shipping_document_parameter',
      CREATE_SHIPPING_DOCUMENT: '/logistics/create_shipping_document',
      GET_SHIPPING_DOCUMENT_RESULT: '/logistics/get_shipping_document_result',
      DOWNLOAD_SHIPPING_DOCUMENT: '/logistics/download_shipping_document'
    }
  },

  // 複数ショップ設定（国ごと）
  // 認証後にスクリプトプロパティから自動で読み込まれます
  SHOPS: [
    {
      code: 'SG',
      name: 'Singapore',
      sheetName: 'SG_注文データ',
      timezone: 'Asia/Singapore'
    },
    {
      code: 'MY',
      name: 'Malaysia',
      sheetName: 'MY_注文データ',
      timezone: 'Asia/Kuala_Lumpur'
    },
    {
      code: 'PH',
      name: 'Philippines',
      sheetName: 'PH_注文データ',
      timezone: 'Asia/Manila'
    }
  ],

  // Slack通知設定
  SLACK: {
    // Webhook URLはスクリプトプロパティで設定してください
    WEBHOOK_URL: '', // スクリプトプロパティ SLACK_WEBHOOK_URL で設定
    CHANNEL: '#shopee注文通知', // 通知先チャンネル
    USERNAME: 'Shopee Bot',
    ICON_EMOJI: ':package:'
  },

  // スプレッドシート設定
  SPREADSHEET: {
    ID: '1q3WN7fSmc7TUZuCIK9ciHRbLQwkcORL1qOwRQTy-D4c', // ここにスプレッドシートIDを入力（空の場合は自動作成）
    SHEET_NAME: 'SG_注文データ',

    // ヘッダー定義
    HEADERS: [
      '注文日',
      '注文ステータス',
      '国',
      '注文ID',
      '商品タイトル',
      'バリエーション名①',
      'バリエーション名②',
      'SKU（商品コード）',
      '注文個数',
      '配送ラベルデータ',
      '発送済',
      '備考欄',
      '',  // 空列
      '売上',
      '販売手数料',
      '国際送料',
      '原価',
      '利益',
      '還付込利益'
    ]
  },

  // その他の設定
  OTHER: {
    DEFAULT_TIMEZONE: 'Asia/Singapore',
    DATE_FORMAT: 'yyyy-MM-dd HH:mm:ss',

    // 注文取得の時間範囲（秒）
    // 30分 = 1800秒、余裕を持って35分前から取得
    FETCH_TIME_RANGE: 2100
  }
};

/**
 * スクリプトプロパティから設定を取得（基本設定）
 */
function getConfig() {
  const props = PropertiesService.getScriptProperties();

  return {
    SHOPEE: {
      PARTNER_ID: props.getProperty('SHOPEE_PARTNER_ID') || CONFIG.SHOPEE.PARTNER_ID,
      PARTNER_KEY: props.getProperty('SHOPEE_PARTNER_KEY') || CONFIG.SHOPEE.PARTNER_KEY,
      BASE_URL: CONFIG.SHOPEE.BASE_URL,
      ENDPOINTS: CONFIG.SHOPEE.ENDPOINTS
    },
    SHOPS: CONFIG.SHOPS,
    SLACK: {
      WEBHOOK_URL: props.getProperty('SLACK_WEBHOOK_URL') || CONFIG.SLACK.WEBHOOK_URL,
      CHANNEL: CONFIG.SLACK.CHANNEL,
      USERNAME: CONFIG.SLACK.USERNAME,
      ICON_EMOJI: CONFIG.SLACK.ICON_EMOJI
    },
    SPREADSHEET: {
      ID: props.getProperty('SPREADSHEET_ID') || CONFIG.SPREADSHEET.ID,
      SHEET_NAME: CONFIG.SPREADSHEET.SHEET_NAME,
      HEADERS: CONFIG.SPREADSHEET.HEADERS
    },
    OTHER: CONFIG.OTHER
  };
}

/**
 * 特定のショップの設定を取得
 * @param {string} shopCode - ショップコード（SG, MY, PH）
 * @return {Object} ショップ設定（shopId, accessToken, refreshToken, name, sheetName, timezone）
 */
function getShopConfig(shopCode) {
  const props = PropertiesService.getScriptProperties();
  const baseConfig = getConfig();

  // ショップの基本情報を取得
  const shopInfo = CONFIG.SHOPS.find(shop => shop.code === shopCode);
  if (!shopInfo) {
    throw new Error(`不明なショップコード: ${shopCode}`);
  }

  // スクリプトプロパティからショップ固有の認証情報を取得
  const shopId = props.getProperty(`SHOP_${shopCode}_ID`) || '';
  const accessToken = props.getProperty(`SHOP_${shopCode}_ACCESS_TOKEN`) || '';
  const refreshToken = props.getProperty(`SHOP_${shopCode}_REFRESH_TOKEN`) || '';

  return {
    code: shopCode,
    name: shopInfo.name,
    sheetName: shopInfo.sheetName,
    timezone: shopInfo.timezone,
    shopId: shopId,
    accessToken: accessToken,
    refreshToken: refreshToken,
    partnerId: baseConfig.SHOPEE.PARTNER_ID,
    partnerKey: baseConfig.SHOPEE.PARTNER_KEY,
    baseUrl: baseConfig.SHOPEE.BASE_URL,
    endpoints: baseConfig.SHOPEE.ENDPOINTS
  };
}

/**
 * 認証済みのショップ一覧を取得
 * @return {Array} 認証済みショップのコード配列
 */
function getActiveShops() {
  const props = PropertiesService.getScriptProperties();
  const activeShops = [];

  for (const shop of CONFIG.SHOPS) {
    const shopId = props.getProperty(`SHOP_${shop.code}_ID`);
    const accessToken = props.getProperty(`SHOP_${shop.code}_ACCESS_TOKEN`);

    if (shopId && accessToken) {
      activeShops.push(shop.code);
    }
  }

  return activeShops;
}

/**
 * 全ショップの設定一覧を取得（認証済みのみ）
 * @return {Array} ショップ設定の配列
 */
function getAllShopConfigs() {
  const activeShops = getActiveShops();
  return activeShops.map(code => getShopConfig(code));
}

/**
 * スクリプトプロパティに基本設定を保存
 *
 * @param {string} partnerId - Partner ID
 * @param {string} partnerKey - Partner Key
 * @param {string} slackWebhookUrl - Slack Webhook URL（任意）
 * @param {string} spreadsheetId - スプレッドシートID（任意）
 */
function setConfig(partnerId, partnerKey, slackWebhookUrl, spreadsheetId) {
  const props = PropertiesService.getScriptProperties();

  if (partnerId) props.setProperty('SHOPEE_PARTNER_ID', partnerId);
  if (partnerKey) props.setProperty('SHOPEE_PARTNER_KEY', partnerKey);
  if (slackWebhookUrl) props.setProperty('SLACK_WEBHOOK_URL', slackWebhookUrl);
  if (spreadsheetId) props.setProperty('SPREADSHEET_ID', spreadsheetId);

  Logger.log('基本設定を保存しました');
}

/**
 * 特定ショップの認証情報を保存
 *
 * @param {string} shopCode - ショップコード（SG, MY, PH）
 * @param {string} shopId - Shop ID
 * @param {string} accessToken - Access Token
 * @param {string} refreshToken - Refresh Token
 */
function setShopCredentials(shopCode, shopId, accessToken, refreshToken) {
  const props = PropertiesService.getScriptProperties();

  // ショップコードの妥当性をチェック
  const validCodes = CONFIG.SHOPS.map(s => s.code);
  if (!validCodes.includes(shopCode)) {
    throw new Error(`無効なショップコード: ${shopCode}。有効なコード: ${validCodes.join(', ')}`);
  }

  if (shopId) props.setProperty(`SHOP_${shopCode}_ID`, shopId);
  if (accessToken) props.setProperty(`SHOP_${shopCode}_ACCESS_TOKEN`, accessToken);
  if (refreshToken) props.setProperty(`SHOP_${shopCode}_REFRESH_TOKEN`, refreshToken);

  // トークン有効期限も保存（4時間後）
  props.setProperty(`SHOP_${shopCode}_TOKEN_EXPIRE`, String(Date.now() + (4 * 60 * 60 * 1000)));

  Logger.log(`${shopCode}ショップの認証情報を保存しました`);
}

/**
 * 全ショップの設定状態を確認
 */
function checkAllShopsConfig() {
  Logger.log('=== 全ショップの設定状態 ===');

  const props = PropertiesService.getScriptProperties();
  const config = getConfig();

  Logger.log(`Partner ID: ${config.SHOPEE.PARTNER_ID ? '✅ 設定済み' : '❌ 未設定'}`);
  Logger.log(`Partner Key: ${config.SHOPEE.PARTNER_KEY ? '✅ 設定済み' : '❌ 未設定'}`);
  Logger.log('');

  for (const shop of CONFIG.SHOPS) {
    const shopId = props.getProperty(`SHOP_${shop.code}_ID`);
    const accessToken = props.getProperty(`SHOP_${shop.code}_ACCESS_TOKEN`);
    const refreshToken = props.getProperty(`SHOP_${shop.code}_REFRESH_TOKEN`);
    const expireTime = props.getProperty(`SHOP_${shop.code}_TOKEN_EXPIRE`);

    Logger.log(`【${shop.name} (${shop.code})】`);
    Logger.log(`  Shop ID: ${shopId || '❌ 未設定'}`);
    Logger.log(`  Access Token: ${accessToken ? '✅ 設定済み' : '❌ 未設定'}`);
    Logger.log(`  Refresh Token: ${refreshToken ? '✅ 設定済み' : '❌ 未設定'}`);

    if (expireTime) {
      const expireDate = new Date(parseInt(expireTime));
      const now = new Date();
      if (now > expireDate) {
        Logger.log(`  有効期限: ❌ 期限切れ`);
      } else {
        const remainingMinutes = Math.floor((expireDate - now) / (1000 * 60));
        Logger.log(`  有効期限: ${remainingMinutes}分後`);
      }
    }
    Logger.log('');
  }

  const activeShops = getActiveShops();
  Logger.log(`認証済みショップ: ${activeShops.length > 0 ? activeShops.join(', ') : 'なし'}`);
}
