/**
 * ロジレス（LOGILESS）API通信クラス
 *
 * ロジレスAPIとの通信を管理します。
 * Rate Limit: 1秒間に1リクエスト程度を推奨
 */

class LogilessAPI {
  /**
   * コンストラクタ
   */
  constructor() {
    const config = getConfig();
    this.baseUrl = config.LOGILESS.BASE_URL;
    this.accessToken = null;
    this.merchantId = null;
  }

  /**
   * 初期化
   * アクセストークンとマーチャントIDを取得
   */
  initialize() {
    this.accessToken = getValidLogilessAccessToken();
    const config = getConfig();
    this.merchantId = config.LOGILESS.MERCHANT_ID;

    if (!this.merchantId) {
      Logger.log('警告: マーチャントIDが設定されていません');
    }
  }

  /**
   * APIリクエストを実行
   *
   * @param {string} method - HTTPメソッド (GET, POST, PUT, DELETE)
   * @param {string} endpoint - APIエンドポイント
   * @param {Object} payload - リクエストボディ（POST/PUT時）
   * @param {Object} queryParams - クエリパラメータ
   * @return {Object} レスポンスデータ
   */
  request(method, endpoint, payload = null, queryParams = {}) {
    if (!this.accessToken) {
      this.initialize();
    }

    // URLを構築
    let url = `${this.baseUrl}${endpoint}`;

    // クエリパラメータを追加
    const queryString = Object.keys(queryParams)
      .filter(key => queryParams[key] !== undefined && queryParams[key] !== null)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`)
      .join('&');

    if (queryString) {
      url += '?' + queryString;
    }

    // リクエストオプション
    const options = {
      method: method.toLowerCase(),
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    };

    // POST/PUTの場合はペイロードを追加
    if (payload && (method === 'POST' || method === 'PUT')) {
      options.payload = JSON.stringify(payload);
    }

    Logger.log(`ロジレスAPI: ${method} ${url}`);

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();
    const responseHeaders = response.getHeaders();

    // Rate Limit情報をログ出力
    if (responseHeaders['X-RateLimit-Remaining']) {
      Logger.log(`Rate Limit残り: ${responseHeaders['X-RateLimit-Remaining']}/${responseHeaders['X-RateLimit-Limit']}`);
    }

    // エラーハンドリング
    if (responseCode === 429) {
      const resetTime = responseHeaders['X-RateLimit-Reset'];
      Logger.log(`Rate Limit超過。リセット時刻: ${new Date(resetTime * 1000).toLocaleString()}`);
      throw new Error('Rate Limit超過。しばらく待ってから再試行してください。');
    }

    if (responseCode === 401) {
      Logger.log('認証エラー。トークンをリフレッシュして再試行します。');
      refreshLogilessAccessToken();
      this.accessToken = getValidLogilessAccessToken();
      // 再帰的に再試行
      return this.request(method, endpoint, payload, queryParams);
    }

    if (responseCode !== 200 && responseCode !== 201) {
      Logger.log(`APIエラー: ${responseCode} - ${responseBody}`);
      throw new Error(`ロジレスAPIエラー: ${responseCode} - ${responseBody}`);
    }

    // 空レスポンスの場合
    if (!responseBody) {
      return null;
    }

    return JSON.parse(responseBody);
  }

  /**
   * GETリクエスト
   *
   * @param {string} endpoint - APIエンドポイント
   * @param {Object} queryParams - クエリパラメータ
   * @return {Object} レスポンスデータ
   */
  get(endpoint, queryParams = {}) {
    return this.request('GET', endpoint, null, queryParams);
  }

  /**
   * POSTリクエスト
   *
   * @param {string} endpoint - APIエンドポイント
   * @param {Object} payload - リクエストボディ
   * @param {Object} queryParams - クエリパラメータ
   * @return {Object} レスポンスデータ
   */
  post(endpoint, payload, queryParams = {}) {
    return this.request('POST', endpoint, payload, queryParams);
  }

  /**
   * PUTリクエスト
   *
   * @param {string} endpoint - APIエンドポイント
   * @param {Object} payload - リクエストボディ
   * @param {Object} queryParams - クエリパラメータ
   * @return {Object} レスポンスデータ
   */
  put(endpoint, payload, queryParams = {}) {
    return this.request('PUT', endpoint, payload, queryParams);
  }

  /**
   * DELETEリクエスト
   *
   * @param {string} endpoint - APIエンドポイント
   * @param {Object} queryParams - クエリパラメータ
   * @return {Object} レスポンスデータ
   */
  delete(endpoint, queryParams = {}) {
    return this.request('DELETE', endpoint, null, queryParams);
  }

  /**
   * 受注を登録
   *
   * @param {Object} orderData - 受注データ（{sales_order: {...}}形式）
   * @return {Object} 登録結果
   */
  createSalesOrder(orderData) {
    if (!this.merchantId) {
      throw new Error('マーチャントIDが設定されていません');
    }
    // エンドポイントは /sales_orders/new
    return this.post(`/v1/merchant/${this.merchantId}/sales_orders/new`, orderData);
  }

  /**
   * 受注を複数件まとめて登録（最大100件）
   *
   * @param {Array} ordersData - 受注データの配列
   * @return {Object} 登録結果
   */
  createSalesOrdersMultiple(ordersData) {
    if (!this.merchantId) {
      throw new Error('マーチャントIDが設定されていません');
    }
    return this.post(`/v1/merchant/${this.merchantId}/sales_orders/new/multiple`, { sales_orders: ordersData });
  }

  /**
   * 受注コードで受注を検索
   *
   * @param {string} code - 受注コード
   * @return {Object|null} 受注データ（存在しない場合はnull）
   */
  findSalesOrderByCode(code) {
    if (!this.merchantId) {
      throw new Error('マーチャントIDが設定されていません');
    }
    const response = this.get(`/v1/merchant/${this.merchantId}/sales_orders`, { code: code });
    if (response.data && response.data.length > 0) {
      return response.data[0];
    }
    return null;
  }

  /**
   * 受注一覧を取得
   *
   * @param {Object} params - 検索パラメータ
   * @return {Object} 受注一覧
   */
  getSalesOrders(params = {}) {
    if (!this.merchantId) {
      throw new Error('マーチャントIDが設定されていません');
    }
    return this.get(`/v1/merchant/${this.merchantId}/sales_orders`, params);
  }

  /**
   * 受注詳細を取得
   *
   * @param {string} orderId - 受注ID
   * @return {Object} 受注詳細
   */
  getSalesOrder(orderId) {
    if (!this.merchantId) {
      throw new Error('マーチャントIDが設定されていません');
    }
    return this.get(`/v1/merchant/${this.merchantId}/sales_orders/${orderId}`);
  }

  /**
   * 商品マスタ一覧を取得
   *
   * @param {Object} params - 検索パラメータ
   * @return {Object} 商品一覧
   */
  getItems(params = {}) {
    if (!this.merchantId) {
      throw new Error('マーチャントIDが設定されていません');
    }
    return this.get(`/v1/merchant/${this.merchantId}/items`, params);
  }

  /**
   * 店舗一覧を取得
   *
   * @return {Object} 店舗一覧
   */
  getStores() {
    if (!this.merchantId) {
      throw new Error('マーチャントIDが設定されていません');
    }
    return this.get(`/v1/merchant/${this.merchantId}/stores`);
  }

  /**
   * 配送方法一覧を取得
   *
   * @return {Object} 配送方法一覧
   */
  getDeliveryMethods() {
    if (!this.merchantId) {
      throw new Error('マーチャントIDが設定されていません');
    }
    return this.get(`/v1/merchant/${this.merchantId}/delivery_methods`);
  }

  /**
   * 支払方法一覧を取得
   *
   * @return {Object} 支払方法一覧
   */
  getPaymentMethods() {
    if (!this.merchantId) {
      throw new Error('マーチャントIDが設定されていません');
    }
    return this.get(`/v1/merchant/${this.merchantId}/payment_methods`);
  }

  /**
   * API接続テスト
   *
   * @return {boolean} 接続成功かどうか
   */
  testConnection() {
    try {
      this.initialize();
      // 店舗一覧を取得してテスト
      const stores = this.getStores();
      Logger.log('ロジレスAPI接続テスト成功');
      Logger.log(`取得した店舗数: ${stores.data ? stores.data.length : 0}`);
      return true;
    } catch (error) {
      Logger.log(`ロジレスAPI接続テスト失敗: ${error.message}`);
      return false;
    }
  }
}

/**
 * ロジレスAPI接続テスト
 */
function testLogilessConnection() {
  const api = new LogilessAPI();
  return api.testConnection();
}

/**
 * ロジレスの配送方法一覧を取得
 */
function listLogilessDeliveryMethods() {
  try {
    const api = new LogilessAPI();
    api.initialize();

    const response = api.getDeliveryMethods();

    Logger.log('=== ロジレス配送方法一覧 ===');
    if (response.data && response.data.length > 0) {
      response.data.forEach(method => {
        Logger.log(`ID: ${method.id}, 名前: ${method.name}`);
      });
    } else {
      Logger.log('配送方法が見つかりませんでした');
    }

    return response;
  } catch (error) {
    Logger.log(`配送方法一覧取得エラー: ${error.message}`);
    throw error;
  }
}

/**
 * ロジレスの支払方法一覧を取得
 */
function listLogilessPaymentMethods() {
  try {
    const api = new LogilessAPI();
    api.initialize();

    const response = api.getPaymentMethods();

    Logger.log('=== ロジレス支払方法一覧 ===');
    if (response.data && response.data.length > 0) {
      response.data.forEach(method => {
        Logger.log(`ID: ${method.id}, 名前: ${method.name}`);
      });
    } else {
      Logger.log('支払方法が見つかりませんでした');
    }

    return response;
  } catch (error) {
    Logger.log(`支払方法一覧取得エラー: ${error.message}`);
    throw error;
  }
}
