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
    PARTNER_ID: '', // Live Partner ID（Go Live承認後に取得）
    PARTNER_KEY: '', // Live Partner Key（Go Live承認後に取得）
    SHOP_ID: '', // Shop ID（認証後に自動設定）
    ACCESS_TOKEN: '', // Access Token（認証後に自動設定）

    // シンガポール本番環境のベースURL
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

  // Slack通知設定
  SLACK: {
    WEBHOOK_URL: '', // ここにSlack Webhook URLを入力
    CHANNEL: '#shopee-orders', // 通知先チャンネル
    USERNAME: 'Shopee Bot',
    ICON_EMOJI: ':package:'
  },

  // スプレッドシート設定
  SPREADSHEET: {
    ID: '', // ここにスプレッドシートIDを入力（空の場合は自動作成）
    SHEET_NAME: '注文データ',

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
    TIMEZONE: 'Asia/Singapore',
    DATE_FORMAT: 'yyyy-MM-dd HH:mm:ss',

    // 注文取得の時間範囲（秒）
    // 30分 = 1800秒、余裕を持って35分前から取得
    FETCH_TIME_RANGE: 2100
  }
};

/**
 * スクリプトプロパティから設定を取得
 */
function getConfig() {
  const props = PropertiesService.getScriptProperties();

  return {
    SHOPEE: {
      PARTNER_ID: props.getProperty('SHOPEE_PARTNER_ID') || CONFIG.SHOPEE.PARTNER_ID,
      PARTNER_KEY: props.getProperty('SHOPEE_PARTNER_KEY') || CONFIG.SHOPEE.PARTNER_KEY,
      SHOP_ID: props.getProperty('SHOPEE_SHOP_ID') || CONFIG.SHOPEE.SHOP_ID,
      ACCESS_TOKEN: props.getProperty('SHOPEE_ACCESS_TOKEN') || CONFIG.SHOPEE.ACCESS_TOKEN,
      BASE_URL: CONFIG.SHOPEE.BASE_URL,
      ENDPOINTS: CONFIG.SHOPEE.ENDPOINTS
    },
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
 * スクリプトプロパティに設定を保存
 *
 * @param {string} partnerId - Partner ID
 * @param {string} partnerKey - Partner Key
 * @param {string} shopId - Shop ID（任意）
 * @param {string} accessToken - Access Token（任意）
 * @param {string} slackWebhookUrl - Slack Webhook URL（任意）
 * @param {string} spreadsheetId - スプレッドシートID（任意）
 */
function setConfig(partnerId, partnerKey, shopId, accessToken, slackWebhookUrl, spreadsheetId) {
  const props = PropertiesService.getScriptProperties();

  if (partnerId) props.setProperty('SHOPEE_PARTNER_ID', partnerId);
  if (partnerKey) props.setProperty('SHOPEE_PARTNER_KEY', partnerKey);
  if (shopId) props.setProperty('SHOPEE_SHOP_ID', shopId);
  if (accessToken) props.setProperty('SHOPEE_ACCESS_TOKEN', accessToken);
  if (slackWebhookUrl) props.setProperty('SLACK_WEBHOOK_URL', slackWebhookUrl);
  if (spreadsheetId) props.setProperty('SPREADSHEET_ID', spreadsheetId);

  Logger.log('設定を保存しました');
}
