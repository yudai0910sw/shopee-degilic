/**
 * Shopee API通信クラス
 *
 * Shopee Open Platform API v2との通信を管理
 */

class ShopeeAPI {
  /**
   * コンストラクタ
   *
   * @param {Object|string} shopConfigOrCode - ショップ設定オブジェクト、またはショップコード（SG, MY, PH）
   *                                            省略時はSGを使用
   */
  constructor(shopConfigOrCode = null) {
    const baseConfig = getConfig();

    // ショップ設定を決定
    let shopConfig;
    if (typeof shopConfigOrCode === 'string') {
      // ショップコードが渡された場合
      shopConfig = getShopConfig(shopConfigOrCode);
    } else if (shopConfigOrCode && typeof shopConfigOrCode === 'object') {
      // ショップ設定オブジェクトが渡された場合
      shopConfig = shopConfigOrCode;
    } else {
      // デフォルトは最初の認証済みショップ、なければSG
      const activeShops = getActiveShops();
      const defaultCode = activeShops.length > 0 ? activeShops[0] : 'SG';
      shopConfig = getShopConfig(defaultCode);
    }

    this.shopCode = shopConfig.code;
    this.shopName = shopConfig.name;
    this.partnerId = shopConfig.partnerId || baseConfig.SHOPEE.PARTNER_ID;
    this.partnerKey = shopConfig.partnerKey || baseConfig.SHOPEE.PARTNER_KEY;
    this.shopId = shopConfig.shopId;
    this.accessToken = shopConfig.accessToken;
    this.baseUrl = shopConfig.baseUrl || baseConfig.SHOPEE.BASE_URL;
    this.endpoints = shopConfig.endpoints || baseConfig.SHOPEE.ENDPOINTS;
    this.timezone = shopConfig.timezone || 'Asia/Singapore';
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
    const endpoint = this.endpoints.GET_ORDER_LIST;

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
    const endpoint = this.endpoints.GET_ORDER_DETAIL;

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
    const endpoint = this.endpoints.GET_SHIPPING_PARAMETER;

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
    const endpoint = this.endpoints.GET_ESCROW_DETAIL;

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

  /**
   * POSTリクエストを送信
   * @param {string} endpoint - エンドポイント
   * @param {Object} payload - リクエストボディ
   * @return {Object} レスポンス
   */
  postRequest(endpoint, payload = {}) {
    const timestamp = Math.floor(Date.now() / 1000);
    const path = `/api/v2${endpoint}`;
    const sign = this.generateSign(path, timestamp);

    // URLパラメータ
    const queryParams = {
      partner_id: this.partnerId,
      timestamp: timestamp,
      access_token: this.accessToken,
      shop_id: this.shopId,
      sign: sign
    };

    const queryString = Object.keys(queryParams)
      .map(key => `${key}=${encodeURIComponent(queryParams[key])}`)
      .join('&');

    const url = `${this.baseUrl}${endpoint}?${queryString}`;

    Logger.log(`POSTリクエストURL: ${url}`);
    Logger.log(`ペイロード: ${JSON.stringify(payload)}`);

    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      const responseCode = response.getResponseCode();
      const contentType = response.getHeaders()['Content-Type'] || '';

      Logger.log(`レスポンスコード: ${responseCode}`);

      // PDFの場合はBlobを返す
      if (contentType.includes('application/pdf')) {
        Logger.log('PDFレスポンスを受信しました');
        const blob = response.getBlob();
        blob.setContentType('application/pdf');
        return blob;
      }

      const responseBody = response.getContentText();
      Logger.log(`レスポンスボディ: ${responseBody}`);

      if (responseCode !== 200) {
        throw new Error(`APIエラー: ${responseCode} - ${responseBody}`);
      }

      const data = JSON.parse(responseBody);

      if (data.error) {
        // batch API失敗の場合、result_listから詳細を取得
        if (data.error === 'common.batch_api_all_failed' &&
            data.response && data.response.result_list && data.response.result_list.length > 0) {
          const result = data.response.result_list[0];
          if (result.fail_error && result.fail_message) {
            throw new Error(`${result.fail_error}: ${result.fail_message}`);
          }
        }
        throw new Error(`Shopee APIエラー: ${data.error} - ${data.message}`);
      }

      return data;
    } catch (error) {
      Logger.log(`POSTリクエストエラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 配送ドキュメントパラメータを取得
   * @param {string} orderSn - 注文番号
   * @param {string} packageNumber - パッケージ番号（任意）
   * @return {Object} 配送ドキュメントパラメータ
   */
  getShippingDocumentParameter(orderSn, packageNumber = null) {
    const endpoint = this.endpoints.GET_SHIPPING_DOCUMENT_PARAMETER;

    const orderItem = { order_sn: orderSn };
    if (packageNumber) {
      orderItem.package_number = packageNumber;
    }

    const payload = {
      order_list: [orderItem]
    };

    try {
      const response = this.postRequest(endpoint, payload);

      if (response.response && response.response.result_list && response.response.result_list.length > 0) {
        const result = response.response.result_list[0];
        if (result.fail_error) {
          throw new Error(`配送ドキュメントパラメータ取得エラー: ${result.fail_error} - ${result.fail_message}`);
        }
        return result;
      }

      throw new Error('配送ドキュメントパラメータが見つかりません');
    } catch (error) {
      Logger.log(`配送ドキュメントパラメータ取得エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 配送ドキュメント作成タスクを開始
   * @param {string} orderSn - 注文番号
   * @param {string} shippingDocumentType - ドキュメントタイプ（THERMAL_AIR_WAYBILLなど）
   * @param {string} trackingNumber - 追跡番号（必須）
   * @param {string} packageNumber - パッケージ番号（任意）
   * @return {Object} 作成結果
   */
  createShippingDocument(orderSn, shippingDocumentType = 'THERMAL_AIR_WAYBILL', trackingNumber = null, packageNumber = null) {
    const endpoint = this.endpoints.CREATE_SHIPPING_DOCUMENT;

    const orderItem = {
      order_sn: orderSn,
      shipping_document_type: shippingDocumentType
    };
    if (trackingNumber) {
      orderItem.tracking_number = trackingNumber;
    }
    if (packageNumber) {
      orderItem.package_number = packageNumber;
    }

    const payload = {
      order_list: [orderItem]
    };

    try {
      const response = this.postRequest(endpoint, payload);

      if (response.response && response.response.result_list && response.response.result_list.length > 0) {
        const result = response.response.result_list[0];
        if (result.fail_error) {
          // 詳細なエラーメッセージを含めてスロー
          throw new Error(`${result.fail_error}: ${result.fail_message}`);
        }
        Logger.log(`配送ドキュメント作成タスクを開始しました: ${orderSn}`);
        return result;
      }

      throw new Error('配送ドキュメント作成に失敗しました');
    } catch (error) {
      Logger.log(`配送ドキュメント作成エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 配送ドキュメントのステータスを確認
   * @param {string} orderSn - 注文番号
   * @param {string} shippingDocumentType - ドキュメントタイプ
   * @param {string} packageNumber - パッケージ番号（任意）
   * @return {Object} ステータス結果
   */
  getShippingDocumentResult(orderSn, shippingDocumentType = 'THERMAL_AIR_WAYBILL', packageNumber = null) {
    const endpoint = this.endpoints.GET_SHIPPING_DOCUMENT_RESULT;

    const orderItem = {
      order_sn: orderSn,
      shipping_document_type: shippingDocumentType
    };
    if (packageNumber) {
      orderItem.package_number = packageNumber;
    }

    const payload = {
      order_list: [orderItem]
    };

    try {
      const response = this.postRequest(endpoint, payload);

      if (response.response && response.response.result_list && response.response.result_list.length > 0) {
        const result = response.response.result_list[0];
        if (result.fail_error) {
          throw new Error(`ステータス確認エラー: ${result.fail_error} - ${result.fail_message}`);
        }
        return result;
      }

      throw new Error('ステータス確認に失敗しました');
    } catch (error) {
      Logger.log(`ステータス確認エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 配送ドキュメント（PDF）をダウンロード
   * @param {string} orderSn - 注文番号
   * @param {string} shippingDocumentType - ドキュメントタイプ
   * @param {string} packageNumber - パッケージ番号（任意）
   * @return {Blob} PDFのBlob
   */
  downloadShippingDocument(orderSn, shippingDocumentType = 'THERMAL_AIR_WAYBILL', packageNumber = null) {
    const endpoint = this.endpoints.DOWNLOAD_SHIPPING_DOCUMENT;

    const orderItem = { order_sn: orderSn };
    if (packageNumber) {
      orderItem.package_number = packageNumber;
    }

    const payload = {
      shipping_document_type: shippingDocumentType,
      order_list: [orderItem]
    };

    try {
      const response = this.postRequest(endpoint, payload);

      // Google Apps ScriptではBlobかどうかをgetBytes関数の存在で判定
      if (response && typeof response.getBytes === 'function') {
        Logger.log(`配送ドキュメントをダウンロードしました: ${orderSn}`);
        return response;
      }

      throw new Error('PDFのダウンロードに失敗しました');
    } catch (error) {
      Logger.log(`ダウンロードエラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * Logistics APIからTracking Numberを取得
   * @param {string} orderSn - 注文番号
   * @return {Object} {trackingNumber, packageNumber} または null
   */
  getTrackingNumber(orderSn) {
    try {
      // まず注文詳細からpackage_numberを取得
      const orderDetail = this.getOrderDetail(orderSn);
      let packageNumber = null;

      if (orderDetail.package_list && orderDetail.package_list.length > 0) {
        packageNumber = orderDetail.package_list[0].package_number;
      }

      // v2.logistics.get_tracking_number API を呼び出し（GETリクエスト）
      const endpoint = this.endpoints.GET_TRACKING_NUMBER;

      const params = {
        order_sn: orderSn
      };
      if (packageNumber) {
        params.package_number = packageNumber;
      }

      const response = this.request(endpoint, params);

      if (response.response) {
        const result = response.response;

        // first_mile_tracking_number または tracking_number を取得
        const trackingNumber = result.tracking_number || result.first_mile_tracking_number || null;

        if (trackingNumber) {
          Logger.log(`Tracking Number取得成功: ${trackingNumber}`);
          return {
            trackingNumber: trackingNumber,
            packageNumber: result.package_number || packageNumber
          };
        }
      }

      Logger.log('Tracking Numberが見つかりません');
      return null;

    } catch (error) {
      Logger.log(`Tracking Number取得エラー: ${error.message}`);
      return null;
    }
  }

  /**
   * 配送ラベルを取得（create → wait → download の一連の流れ）
   * @param {string} orderSn - 注文番号
   * @param {string} shippingDocumentType - ドキュメントタイプ（任意）
   * @param {number} maxWaitSeconds - 最大待機時間（秒）
   * @return {Blob} PDFのBlob
   */
  getShippingLabel(orderSn, shippingDocumentType = null, maxWaitSeconds = 30) {
    Logger.log(`=== 配送ラベル取得開始: ${orderSn} ===`);

    try {
      // Step 0-A: Tracking Number を取得
      const trackingInfo = this.getTrackingNumber(orderSn);
      if (!trackingInfo || !trackingInfo.trackingNumber) {
        throw new Error('Tracking Numberが見つかりません。Arrange Shipmentが完了しているか確認してください。');
      }
      Logger.log(`Tracking Number: ${trackingInfo.trackingNumber}`);

      // Step 0-B: ドキュメントタイプを確認（指定がない場合）
      if (!shippingDocumentType) {
        const docParam = this.getShippingDocumentParameter(orderSn);
        shippingDocumentType = docParam.suggest_shipping_document_type || 'THERMAL_AIR_WAYBILL';
        Logger.log(`推奨ドキュメントタイプ: ${shippingDocumentType}`);
      }

      // Step 1: 配送ドキュメント作成タスクを開始（tracking_number付き）
      this.createShippingDocument(orderSn, shippingDocumentType, trackingInfo.trackingNumber, trackingInfo.packageNumber);
      Utilities.sleep(1000);

      // Step 2: ステータスがREADYになるまで待機
      const checkInterval = 3000; // 3秒間隔
      const maxChecks = Math.ceil((maxWaitSeconds * 1000) / checkInterval);

      for (let i = 0; i < maxChecks; i++) {
        const result = this.getShippingDocumentResult(orderSn, shippingDocumentType);
        Logger.log(`ステータス確認 (${i + 1}/${maxChecks}): ${result.status}`);

        if (result.status === 'READY') {
          Logger.log('ドキュメント準備完了');
          break;
        } else if (result.status === 'FAILED') {
          throw new Error('配送ドキュメントの作成に失敗しました');
        }

        if (i < maxChecks - 1) {
          Utilities.sleep(checkInterval);
        }
      }

      Utilities.sleep(1000);

      // Step 3: PDFをダウンロード
      const pdfBlob = this.downloadShippingDocument(orderSn, shippingDocumentType);
      pdfBlob.setName(`${orderSn}_shipping_label.pdf`);

      Logger.log(`=== 配送ラベル取得完了: ${orderSn} ===`);
      return pdfBlob;

    } catch (error) {
      Logger.log(`配送ラベル取得エラー: ${error.message}`);
      throw error;
    }
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

/**
 * テスト用：配送ラベルを取得
 */
function testGetShippingLabel() {
  const api = new ShopeeAPI();
  const orderSn = 'YOUR_ORDER_SN_HERE'; // 実際の注文番号に置き換え

  try {
    const pdfBlob = api.getShippingLabel(orderSn);
    Logger.log(`PDFサイズ: ${pdfBlob.getBytes().length} bytes`);
  } catch (error) {
    Logger.log(`エラー: ${error.message}`);
  }
}
