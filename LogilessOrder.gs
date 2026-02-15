/**
 * ロジレス受注連携モジュール
 *
 * Shopeeの注文データをロジレスの受注伝票として登録します。
 */

/**
 * スプレッドシートで選択した行の注文をロジレスへ連携
 *
 * スプレッドシートのカスタムメニューから呼び出します。
 */
function sendSelectedOrdersToLogiless() {
  const ui = SpreadsheetApp.getUi();

  try {
    // アクティブなスプレッドシートとシートを取得
    const sheet = SpreadsheetApp.getActiveSheet();
    const selection = sheet.getActiveRange();

    if (!selection) {
      ui.alert('エラー', '連携する行を選択してください。', ui.ButtonSet.OK);
      return;
    }

    // 選択範囲の行番号を取得
    const startRow = selection.getRow();
    const numRows = selection.getNumRows();

    // ヘッダー行は除外
    if (startRow === 1) {
      ui.alert('エラー', 'ヘッダー行は選択できません。データ行を選択してください。', ui.ButtonSet.OK);
      return;
    }

    // 選択行の注文IDとSKU（H列 = 8列目）を取得
    const orderItemsMap = {}; // { orderId: [{ sku, rowNumber }] }
    const emptySkuRows = [];

    for (let i = 0; i < numRows; i++) {
      const row = startRow + i;
      if (row === 1) continue; // ヘッダー行スキップ

      const orderId = sheet.getRange(row, 4).getValue();
      const sku = sheet.getRange(row, 8).getValue();

      if (!orderId) continue;

      // SKUが空の行を記録
      if (!sku || String(sku).trim() === '') {
        emptySkuRows.push(row);
      }

      if (!orderItemsMap[orderId]) {
        orderItemsMap[orderId] = [];
      }
      orderItemsMap[orderId].push({ sku: String(sku).trim(), rowNumber: row });
    }

    const orderIds = Object.keys(orderItemsMap);

    if (orderIds.length === 0) {
      ui.alert('エラー', '有効な注文IDが見つかりません。', ui.ButtonSet.OK);
      return;
    }

    // SKUが空の行がある場合は連携不可
    if (emptySkuRows.length > 0) {
      ui.alert(
        'エラー',
        `SKU（商品コード）が空の行があるため連携できません。\n\n該当行: ${emptySkuRows.join(', ')}`,
        ui.ButtonSet.OK
      );
      return;
    }

    // ロジレス連携済みチェック（M列 = 13列目）
    const alreadySentOrders = [];
    for (const orderId of orderIds) {
      const items = orderItemsMap[orderId];
      for (const item of items) {
        const isChecked = sheet.getRange(item.rowNumber, 13).getValue();
        if (isChecked === true) {
          alreadySentOrders.push(orderId);
          break;
        }
      }
    }

    if (alreadySentOrders.length > 0) {
      ui.alert(
        'エラー',
        `以下の注文は既にロジレス連携済みのため連携できません。\n\n${alreadySentOrders.join('\n')}`,
        ui.ButtonSet.OK
      );
      return;
    }

    // 確認ダイアログ
    const confirmResult = ui.alert(
      '確認',
      `${orderIds.length}件の注文をロジレスへ連携しますか？\n\n注文ID:\n${orderIds.join('\n')}`,
      ui.ButtonSet.YES_NO
    );

    if (confirmResult !== ui.Button.YES) {
      return;
    }

    // 連携処理を実行
    const result = sendOrdersToLogiless(orderIds, orderItemsMap);

    // 結果を表示
    let message = `連携完了\n\n成功: ${result.success.length}件`;
    if (result.failed.length > 0) {
      message += `\n失敗: ${result.failed.length}件\n\n失敗した注文:\n`;
      result.failed.forEach(f => {
        message += `${f.orderId}: ${f.error}\n`;
      });
    }

    ui.alert('結果', message, ui.ButtonSet.OK);

    // 連携済みの注文をスプレッドシートにマーク
    markOrdersAsSentToLogiless(sheet, result.success);

  } catch (error) {
    Logger.log(`ロジレス連携エラー: ${error.message}`);
    ui.alert('エラー', `連携中にエラーが発生しました:\n${error.message}`, ui.ButtonSet.OK);
  }
}

/**
 * 注文をロジレスへ連携
 *
 * @param {Array} orderIds - 注文IDの配列
 * @param {Object} orderItemsMap - 注文IDごとのスプレッドシート商品情報 { orderId: [{ sku, rowNumber }] }
 * @return {Object} { success: [{orderId, logilessId}], failed: [{orderId, error}] }
 */
function sendOrdersToLogiless(orderIds, orderItemsMap) {
  const result = {
    success: [],
    failed: []
  };

  const logilessApi = new LogilessAPI();
  logilessApi.initialize();

  // ショップコードを判定するために現在のシート名を取得
  const sheet = SpreadsheetApp.getActiveSheet();
  const sheetName = sheet.getName();
  const shopCode = getShopCodeFromSheetName(sheetName);

  const shopeeApi = new ShopeeAPI(shopCode);

  for (const orderId of orderIds) {
    try {
      Logger.log(`=== 注文連携開始: ${orderId} ===`);

      // Shopee APIから注文詳細を取得
      const orderDetail = shopeeApi.getOrderDetail(orderId);

      // ロジレス用の受注データに変換（スプレッドシートのSKU情報を渡す）
      const sheetItems = orderItemsMap[orderId] || [];
      const salesOrderData = convertToLogilessSalesOrder(orderDetail, shopCode, sheetItems);

      // ロジレスに受注登録
      const response = logilessApi.createSalesOrder(salesOrderData);

      Logger.log(`ロジレス登録成功: ${orderId} → ID: ${response.id}`);

      result.success.push({
        orderId: orderId,
        logilessId: response.id,
        logilessCode: response.code
      });

      // APIレート制限対策
      Utilities.sleep(1000);

    } catch (error) {
      Logger.log(`注文連携失敗: ${orderId} - ${error.message}`);

      // エラーメッセージをわかりやすく変換
      let userFriendlyError = error.message;
      if (error.message.includes('Validation Failed') && error.message.includes('"code"')) {
        userFriendlyError = 'この注文は既にロジレスに登録済みです。チェックボックスにチェックを入れてください。';
      }

      result.failed.push({
        orderId: orderId,
        error: userFriendlyError
      });
    }
  }

  Logger.log(`=== 連携完了: 成功 ${result.success.length}件, 失敗 ${result.failed.length}件 ===`);
  return result;
}

/**
 * シート名からショップコードを判定
 *
 * @param {string} sheetName - シート名
 * @return {string} ショップコード（SG, MY, PH）
 */
function getShopCodeFromSheetName(sheetName) {
  if (sheetName.startsWith('SG')) return 'SG';
  if (sheetName.startsWith('MY')) return 'MY';
  if (sheetName.startsWith('PH')) return 'PH';
  return 'SG'; // デフォルト
}

/**
 * Shopee注文をロジレス受注伝票形式に変換
 *
 * @param {Object} orderDetail - Shopeeの注文詳細
 * @param {string} shopCode - ショップコード
 * @param {Array} sheetItems - スプレッドシートの商品情報 [{ sku, rowNumber }]
 * @return {Object} ロジレス受注伝票データ
 */
function convertToLogilessSalesOrder(orderDetail, shopCode, sheetItems) {
  const config = getConfig();
  const logilessConfig = config.LOGILESS;

  // 配送先情報
  const recipient = orderDetail.recipient_address || {};

  // 購入者情報（配送先と同じ場合が多い）
  const buyerName = orderDetail.buyer_username || recipient.name || 'Unknown Buyer';

  // 注文日時をフォーマット
  const orderedAt = formatDateForLogiless(orderDetail.create_time);

  // 店舗IDの取得（Config.gsで設定されたもの、または国ごとに設定）
  const storeId = getLogilessStoreId(shopCode);

  // 支払方法の変換
  const paymentMethod = convertPaymentMethod(orderDetail.payment_method);

  // 配送方法の変換
  const deliveryMethod = convertDeliveryMethod(orderDetail.shipping_carrier);

  // 明細行の作成（スプレッドシートのSKUを使用）
  const lines = [];
  if (orderDetail.item_list && orderDetail.item_list.length > 0) {
    for (let i = 0; i < orderDetail.item_list.length; i++) {
      const item = orderDetail.item_list[i];
      const sheetItem = sheetItems[i];

      lines.push({
        article_code: sheetItem ? sheetItem.sku : item.model_sku || item.item_sku || `SHOPEE-${item.item_id}`,
        article_name: item.item_name || 'Unknown Item',
        price: item.model_discounted_price || item.model_original_price || 0,
        quantity: item.model_quantity_purchased || 1,
        article_option: item.model_name || '' // バリエーション情報を備考に
      });
    }
  }

  // 受注伝票データを構築
  const salesOrder = {
    code: `SHOPEE-${orderDetail.order_sn}`, // 受注コード
    buyer_name1: buyerName,
    buyer_phone: recipient.phone || '',
    recipient_name1: recipient.name || buyerName,
    recipient_phone: recipient.phone || '',
    recipient_country: 'JP',
    recipient_post_code: '1040033',
    recipient_prefecture: '東京都',
    recipient_address1: '中央区新川1丁目3番21号',
    recipient_address2: 'BIZ SMART茅場町 211',
    recipient_address3: '',
    payment_method: paymentMethod,
    delivery_method: deliveryMethod,
    delivery_fee: orderDetail.actual_shipping_fee || 0,
    ordered_at: orderedAt,
    lines: lines,
    store: storeId,
    // Shopee固有情報をフリー項目に保存
    attr1: orderDetail.order_sn, // Shopee注文ID
    attr2: shopCode, // ショップコード
    attr3: orderDetail.order_status, // Shopeeステータス
    merchant_comment: `Shopee ${shopCode} Order: ${orderDetail.order_sn}`
  };

  // タグを追加（任意）
  salesOrder.tags = [`Shopee`, shopCode];

  Logger.log(`変換完了: ${orderDetail.order_sn}`);
  return { sales_order: salesOrder };
}

/**
 * ショップコードからロジレスの店舗IDを取得
 *
 * @param {string} shopCode - ショップコード
 * @return {number} ロジレス店舗ID
 */
function getLogilessStoreId(shopCode) {
  const props = PropertiesService.getScriptProperties();

  // ショップコード別の店舗IDを取得
  const storeId = props.getProperty(`LOGILESS_STORE_ID_${shopCode}`);
  if (storeId) {
    return parseInt(storeId);
  }

  // デフォルトの店舗IDを取得
  const defaultStoreId = props.getProperty('LOGILESS_STORE_ID');
  if (defaultStoreId) {
    return parseInt(defaultStoreId);
  }

  throw new Error(`ロジレスの店舗IDが設定されていません。setLogilessStoreId()で設定してください。`);
}

/**
 * ロジレスの店舗IDを設定
 *
 * @param {number} storeId - 店舗ID
 * @param {string} shopCode - ショップコード（任意、指定しない場合はデフォルト）
 */
function setLogilessStoreId(storeId, shopCode = null) {
  const props = PropertiesService.getScriptProperties();

  if (shopCode) {
    props.setProperty(`LOGILESS_STORE_ID_${shopCode}`, String(storeId));
    Logger.log(`ロジレス店舗ID (${shopCode}) を設定しました: ${storeId}`);
  } else {
    props.setProperty('LOGILESS_STORE_ID', String(storeId));
    Logger.log(`ロジレス店舗ID (デフォルト) を設定しました: ${storeId}`);
  }
}

/**
 * 支払方法を変換
 *
 * @param {string} shopeePaymentMethod - Shopeeの支払方法
 * @return {string} ロジレスの支払方法
 */
function convertPaymentMethod(shopeePaymentMethod) {
  // Shopeeの支払方法をロジレスの支払方法にマッピング
  const paymentMethodMap = {
    'Credit Card': 'credit_card_payment',
    'ShopeePay': 'credit_card_payment',
    'COD': 'cod',
    'Cash on Delivery': 'cod',
    'Bank Transfer': 'bank_transfer'
  };

  return paymentMethodMap[shopeePaymentMethod] || 'credit_card_payment';
}

/**
 * 配送方法を変換
 *
 * @param {string} shopeeCarrier - Shopeeの配送キャリア
 * @return {string} ロジレスの配送方法
 */
function convertDeliveryMethod(shopeeCarrier) {
  // 配送方法のマッピング（ロジレスに登録されている配送方法名に合わせる）
  const deliveryMethodMap = {
    'DHL': 'dhl',
    'FedEx': 'fed_ex'
  };

  // マッピングにない場合は佐川急便 飛脚宅配便をデフォルトとして使用
  return deliveryMethodMap[shopeeCarrier] || 'sagawa';
}

/**
 * ショップコードを国コードに変換
 *
 * @param {string} shopCode - ショップコード
 * @return {string} 国コード
 */
function convertCountryCode(shopCode) {
  const countryMap = {
    'SG': 'SG',
    'MY': 'MY',
    'PH': 'PH',
    'TH': 'TH',
    'VN': 'VN',
    'ID': 'ID',
    'TW': 'TW'
  };

  return countryMap[shopCode] || 'SG';
}

/**
 * Unixタイムスタンプをロジレス用日時形式に変換
 *
 * @param {number} timestamp - Unixタイムスタンプ
 * @return {string} Y-m-d H:i:s 形式の日時
 */
function formatDateForLogiless(timestamp) {
  if (!timestamp) {
    return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  }

  const date = new Date(timestamp * 1000);
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}

/**
 * 連携済み注文をスプレッドシートにマーク（M列チェックボックス）
 *
 * @param {Sheet} sheet - スプレッドシート
 * @param {Array} successOrders - 成功した注文の配列
 */
function markOrdersAsSentToLogiless(sheet, successOrders) {
  if (!successOrders || successOrders.length === 0) return;

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  // 注文ID列（D列）を取得
  const orderIdColumn = sheet.getRange(2, 4, lastRow - 1, 1).getValues();

  // 成功した注文IDのセット
  const successOrderIds = new Set(successOrders.map(o => o.orderId));

  // M列（13列目）にチェックボックスを挿入してチェックを入れる
  for (let i = 0; i < orderIdColumn.length; i++) {
    const orderId = orderIdColumn[i][0];
    if (successOrderIds.has(orderId)) {
      const row = i + 2;
      const cell = sheet.getRange(row, 13);

      // チェックボックスを挿入してチェックを入れる
      cell.insertCheckboxes();
      cell.setValue(true);
    }
  }

  Logger.log(`${successOrders.length}件の注文をチェックしました`);
}

/**
 * スプレッドシートにカスタムメニューを追加
 *
 * スプレッドシートを開いた時に自動的に呼び出されます。
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('Shopee管理')
    .addItem('選択した注文をロジレスへ連携', 'sendSelectedOrdersToLogiless')
    .addSeparator()
    .addItem('ロジレス接続テスト', 'testLogilessConnection')
    .addItem('ロジレス設定確認', 'checkLogilessConfig')
    .addToUi();
}

/**
 * 単一注文をロジレスへ連携（テスト用）
 *
 * @param {string} orderId - 注文ID
 */
function sendSingleOrderToLogiless(orderId) {
  const result = sendOrdersToLogiless([orderId]);

  if (result.success.length > 0) {
    Logger.log(`成功: ${orderId} → ロジレスID: ${result.success[0].logilessId}`);
  } else {
    Logger.log(`失敗: ${orderId} - ${result.failed[0].error}`);
  }

  return result;
}

/**
 * ロジレスの店舗一覧を取得（設定確認用）
 */
function listLogilessStores() {
  try {
    const api = new LogilessAPI();
    api.initialize();

    const response = api.getStores();

    Logger.log('=== ロジレス店舗一覧 ===');
    if (response.data && response.data.length > 0) {
      response.data.forEach(store => {
        Logger.log(`ID: ${store.id}, 名前: ${store.name}`);
      });
    } else {
      Logger.log('店舗が見つかりませんでした');
    }

    return response;
  } catch (error) {
    Logger.log(`店舗一覧取得エラー: ${error.message}`);
    throw error;
  }
}

/**
 * ロジレス連携のセットアップウィザード
 */
function logilessOrderSetupWizard() {
  Logger.log('=== ロジレス受注連携セットアップ ===');
  Logger.log('');

  Logger.log('【Step 1】店舗IDの確認');
  Logger.log('以下の関数を実行して店舗一覧を確認してください:');
  Logger.log('');
  Logger.log('listLogilessStores();');
  Logger.log('');

  Logger.log('【Step 2】店舗IDの設定');
  Logger.log('確認した店舗IDを設定してください:');
  Logger.log('');
  Logger.log('// 全ショップ共通の場合');
  Logger.log('setLogilessStoreId(123);');
  Logger.log('');
  Logger.log('// ショップごとに設定する場合');
  Logger.log('setLogilessStoreId(123, "SG");');
  Logger.log('setLogilessStoreId(124, "MY");');
  Logger.log('setLogilessStoreId(125, "PH");');
  Logger.log('');

  Logger.log('【Step 3】配送方法の確認');
  Logger.log('ロジレスに登録されている配送方法名を確認し、');
  Logger.log('必要に応じてconvertDeliveryMethod()関数を修正してください。');
  Logger.log('');

  Logger.log('【使用方法】');
  Logger.log('1. スプレッドシートを開く');
  Logger.log('2. 連携したい注文の行を選択');
  Logger.log('3. メニュー「Shopee管理」→「選択した注文をロジレスへ連携」をクリック');
  Logger.log('');

  Logger.log('=== セットアップ完了 ===');
}
