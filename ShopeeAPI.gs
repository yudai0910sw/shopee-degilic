/**
 * Shopee API通信クラス
 *
 * Shopee Open Platform API v2との通信を管理
 */

class ShopeeAPI {
  /**
   * コンストラクタ
   */
  constructor() {
    this.config = getConfig();
    this.partnerId = this.config.SHOPEE.PARTNER_ID;
    this.partnerKey = this.config.SHOPEE.PARTNER_KEY;
    this.shopId = this.config.SHOPEE.SHOP_ID;
    this.accessToken = this.config.SHOPEE.ACCESS_TOKEN;
    this.baseUrl = this.config.SHOPEE.BASE_URL;
  }

  /**
   * HMAC-SHA256署名を生成
   * @param {string} path - APIパス
   * @param {number} timestamp - タイムスタンプ
   * @return {string} 署名
   */
  generateSign(path, timestamp) {
    const baseString = `${this.partnerId}${path}${timestamp}${this.accessToken}${this.shopId}`;

    Logger.log(`署名ベース文字列: ${baseString}`);

    const signature = Utilities.computeHmacSha256Signature(
      baseString,
      this.partnerKey
    );

    const sign = signature
      .map(byte => {
        const hex = (byte < 0 ? byte + 256 : byte).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('');

    Logger.log(`生成された署名: ${sign}`);

    return sign;
  }

  /**
   * APIリクエストを送信
   * @param {string} endpoint - エンドポイント
   * @param {Object} params - リクエストパラメータ
   * @return {Object} レスポンス
   */
  request(endpoint, params = {}) {
    const timestamp = Math.floor(Date.now() / 1000);
    // 署名生成には完全なAPIパス（/api/v2を含む）を使用
    const path = `/api/v2${endpoint}`;
    const sign = this.generateSign(path, timestamp);

    // 共通パラメータ
    const commonParams = {
      partner_id: this.partnerId,
      timestamp: timestamp,
      access_token: this.accessToken,
      shop_id: this.shopId,
      sign: sign
    };

    // パラメータをマージ
    const allParams = Object.assign({}, commonParams, params);

    // URLを構築
    const queryString = Object.keys(allParams)
      .map(key => `${key}=${encodeURIComponent(allParams[key])}`)
      .join('&');

    const url = `${this.baseUrl}${endpoint}?${queryString}`;

    Logger.log(`リクエストURL: ${url}`);

    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true
      });

      const responseCode = response.getResponseCode();
      const responseBody = response.getContentText();

      Logger.log(`レスポンスコード: ${responseCode}`);
      Logger.log(`レスポンスボディ: ${responseBody}`);

      if (responseCode !== 200) {
        throw new Error(`APIエラー: ${responseCode} - ${responseBody}`);
      }

      const data = JSON.parse(responseBody);

      // エラーチェック
      if (data.error) {
        throw new Error(`Shopee APIエラー: ${data.error} - ${data.message}`);
      }

      return data;
    } catch (error) {
      // URL Fetch制限エラーの特別処理
      if (error.message.includes('urlfetch') || error.message.includes('quota')) {
        Logger.log('⚠️ GAS URL Fetch制限に達しました。翌日まで待つか、トリガー頻度を調整してください。');
      }
      Logger.log(`APIリクエストエラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 注文リストを取得
   * @param {number} timeFrom - 開始時刻（Unixタイムスタンプ）
   * @param {number} timeTo - 終了時刻（Unixタイムスタンプ）
   * @param {number} pageSize - 取得件数（デフォルト100、最大100）
   * @return {Array} 注文リスト
   */
  getOrderList(timeFrom, timeTo, pageSize = 100) {
    const endpoint = this.config.SHOPEE.ENDPOINTS.GET_ORDER_LIST;

    const params = {
      time_range_field: 'create_time',
      time_from: timeFrom,
      time_to: timeTo,
      page_size: Math.min(pageSize, 100), // 最大100件
      cursor: ''
    };

    try {
      const response = this.request(endpoint, params);

      if (!response.response || !response.response.order_list) {
        Logger.log('注文が見つかりませんでした');
        return [];
      }

      const orderList = response.response.order_list;
      Logger.log(`${orderList.length}件の注文を取得しました`);

      return orderList;
    } catch (error) {
      Logger.log(`注文リスト取得エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 注文詳細を取得
   * @param {string} orderSn - 注文番号
   * @return {Object} 注文詳細
   */
  getOrderDetail(orderSn) {
    const endpoint = this.config.SHOPEE.ENDPOINTS.GET_ORDER_DETAIL;

    const params = {
      order_sn_list: orderSn,
      response_optional_fields: 'buyer_user_id,buyer_username,estimated_shipping_fee,recipient_address,actual_shipping_fee,goods_to_declare,note,note_update_time,item_list,pay_time,dropshipper,dropshipper_phone,split_up,buyer_cancel_reason,cancel_by,cancel_reason,actual_shipping_fee_confirmed,buyer_cpf_id,fulfillment_flag,pickup_done_time,package_list,shipping_carrier,payment_method,total_amount,buyer_username,invoice_data,checkout_shipping_carrier,reverse_shipping_fee,order_chargeable_weight_gram,edt'
    };

    try {
      const response = this.request(endpoint, params);

      if (!response.response || !response.response.order_list || response.response.order_list.length === 0) {
        throw new Error(`注文詳細が見つかりません: ${orderSn}`);
      }

      const orderDetail = response.response.order_list[0];
      Logger.log(`注文詳細を取得しました: ${orderSn}`);

      return orderDetail;
    } catch (error) {
      Logger.log(`注文詳細取得エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 配送情報を取得
   * @param {string} orderSn - 注文番号
   * @return {Object} 配送情報
   */
  getShippingParameter(orderSn) {
    const endpoint = this.config.SHOPEE.ENDPOINTS.GET_SHIPPING_PARAMETER;

    const params = {
      order_sn: orderSn
    };

    try {
      const response = this.request(endpoint, params);
      return response.response || {};
    } catch (error) {
      Logger.log(`配送情報取得エラー: ${error.message}`);
      return {};
    }
  }

  /**
   * 支払い詳細を取得（エスクロー情報）
   * @param {string} orderSn - 注文番号
   * @return {Object} 支払い詳細
   */
  getEscrowDetail(orderSn) {
    const endpoint = this.config.SHOPEE.ENDPOINTS.GET_ESCROW_DETAIL;

    const params = {
      order_sn: orderSn
    };

    try {
      const response = this.request(endpoint, params);
      return response.response || {};
    } catch (error) {
      Logger.log(`支払い詳細取得エラー: ${error.message}`);
      return {};
    }
  }

  /**
   * 新しい注文を取得（過去の指定時間範囲内）
   * @param {number} timeRangeSeconds - 過去何秒前までの注文を取得するか
   * @return {Array} 注文詳細のリスト
   */
  getNewOrders(timeRangeSeconds) {
    const now = Math.floor(Date.now() / 1000);
    const timeFrom = now - timeRangeSeconds;
    const timeTo = now;

    Logger.log(`注文取得期間: ${new Date(timeFrom * 1000)} 〜 ${new Date(timeTo * 1000)}`);

    // 注文リストを取得
    const orderList = this.getOrderList(timeFrom, timeTo);

    if (orderList.length === 0) {
      return [];
    }

    // 各注文の詳細を取得
    const orderDetails = [];
    for (const order of orderList) {
      try {
        const detail = this.getOrderDetail(order.order_sn);
        orderDetails.push(detail);

        // APIレート制限対策（1秒待機）
        Utilities.sleep(1000);
      } catch (error) {
        Logger.log(`注文詳細取得失敗: ${order.order_sn} - ${error.message}`);
      }
    }

    return orderDetails;
  }

  /**
   * 最新N件の注文を取得
   * @param {number} limit - 取得する注文数（デフォルト10件、最大100件）
   * @param {number} daysBack - 何日前まで遡るか（デフォルト15日、最大15日）
   * @return {Array} 注文詳細のリスト
   */
  getLatestOrders(limit = 10, daysBack = 15) {
    // Shopee APIの制限：最大15日間
    if (daysBack > 15) {
      Logger.log(`⚠️ 警告: Shopee APIは最大15日間の取得しかサポートしていません。${daysBack}日 → 15日に調整します`);
      daysBack = 15;
    }

    const now = Math.floor(Date.now() / 1000);
    const timeFrom = now - (daysBack * 24 * 60 * 60); // 過去N日
    const timeTo = now;

    Logger.log(`過去${daysBack}日間の最新${limit}件の注文を取得します`);
    Logger.log(`取得期間: ${new Date(timeFrom * 1000)} 〜 ${new Date(timeTo * 1000)}`);

    // 注文リストを取得（limitを指定）
    const orderList = this.getOrderList(timeFrom, timeTo, limit);

    if (orderList.length === 0) {
      Logger.log('注文が見つかりませんでした');
      return [];
    }

    Logger.log(`${orderList.length}件の注文リストを取得しました`);

    // 各注文の詳細を取得
    const orderDetails = [];
    for (const order of orderList) {
      try {
        const detail = this.getOrderDetail(order.order_sn);
        orderDetails.push(detail);

        // APIレート制限対策（1秒待機）
        Utilities.sleep(1000);
      } catch (error) {
        Logger.log(`注文詳細取得失敗: ${order.order_sn} - ${error.message}`);
      }
    }

    Logger.log(`${orderDetails.length}件の注文詳細を取得しました`);

    return orderDetails;
  }
}

/**
 * テスト用：注文リストを取得
 */
function testGetOrderList() {
  const api = new ShopeeAPI();
  const timeRangeSeconds = 86400; // 過去24時間
  const orders = api.getNewOrders(timeRangeSeconds);

  Logger.log(`取得した注文数: ${orders.length}`);
  Logger.log(JSON.stringify(orders, null, 2));
}
