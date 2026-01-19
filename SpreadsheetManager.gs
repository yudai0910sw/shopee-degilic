/**
 * スプレッドシート管理クラス
 *
 * Google スプレッドシートへのデータ書き込みを管理
 */

class SpreadsheetManager {
  /**
   * コンストラクタ
   */
  constructor() {
    this.config = getConfig();
    this.spreadsheet = this.getOrCreateSpreadsheet();
    this.sheet = this.getOrCreateSheet();
  }

  /**
   * スプレッドシートを取得または作成
   * @return {Spreadsheet} スプレッドシート
   */
  getOrCreateSpreadsheet() {
    const spreadsheetId = this.config.SPREADSHEET.ID;

    if (spreadsheetId) {
      try {
        return SpreadsheetApp.openById(spreadsheetId);
      } catch (error) {
        Logger.log(`スプレッドシートが見つかりません: ${spreadsheetId}`);
      }
    }

    // 新しいスプレッドシートを作成
    const newSpreadsheet = SpreadsheetApp.create('Shopee注文管理');
    const newId = newSpreadsheet.getId();

    Logger.log(`新しいスプレッドシートを作成しました: ${newId}`);
    Logger.log(`URL: ${newSpreadsheet.getUrl()}`);

    // IDをスクリプトプロパティに保存
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', newId);

    return newSpreadsheet;
  }

  /**
   * シートを取得または作成
   * @return {Sheet} シート
   */
  getOrCreateSheet() {
    const sheetName = this.config.SPREADSHEET.SHEET_NAME;
    let sheet = this.spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
      sheet = this.spreadsheet.insertSheet(sheetName);
      Logger.log(`新しいシートを作成しました: ${sheetName}`);

      // ヘッダーを設定
      this.initializeSheet(sheet);
    }

    return sheet;
  }

  /**
   * シートを初期化（ヘッダー設定）
   * @param {Sheet} sheet - シート
   */
  initializeSheet(sheet) {
    const headers = this.config.SPREADSHEET.HEADERS;

    // ヘッダー行を設定
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    // ヘッダー行のスタイル設定
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');

    // 列幅を自動調整
    for (let i = 1; i <= headers.length; i++) {
      sheet.autoResizeColumn(i);
    }

    // 固定行を設定
    sheet.setFrozenRows(1);

    Logger.log('ヘッダーを設定しました');
  }

  /**
   * 注文データをスプレッドシートに追加
   * @param {Array} orders - 注文データの配列
   * @return {number} 追加された行数
   */
  addOrders(orders) {
    if (!orders || orders.length === 0) {
      Logger.log('追加する注文がありません');
      return 0;
    }

    // 既存の注文IDを取得（重複チェック用）
    const existingOrderIds = this.getExistingOrderIds();

    // 新しい注文のみをフィルタリング
    const newOrders = orders.filter(order => !existingOrderIds.includes(order.order_sn));

    if (newOrders.length === 0) {
      Logger.log('新しい注文はありません（すべて既存）');
      return 0;
    }

    // 注文データを行データに変換
    const rows = newOrders.map(order => this.orderToRow(order));

    // データを追加
    const lastRow = this.sheet.getLastRow();
    const startRow = lastRow + 1;

    this.sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);

    Logger.log(`${rows.length}件の新しい注文を追加しました`);
    return rows.length;
  }

  /**
   * 既存の注文IDを取得
   * @return {Array} 注文IDの配列
   */
  getExistingOrderIds() {
    const lastRow = this.sheet.getLastRow();

    if (lastRow <= 1) {
      return [];
    }

    // 注文ID列（D列 = 4列目）のデータを取得
    const orderIdColumn = this.sheet.getRange(2, 4, lastRow - 1, 1).getValues();

    return orderIdColumn.map(row => row[0]).filter(id => id);
  }

  /**
   * 注文オブジェクトを行データに変換
   * @param {Object} order - 注文データ
   * @return {Array} 行データ
   */
  orderToRow(order) {
    // 商品情報を取得（複数商品がある場合は最初の商品のみ）
    const item = order.item_list && order.item_list.length > 0 ? order.item_list[0] : {};

    // バリエーション名を取得
    const modelName = item.model_name || '';
    const variations = this.parseVariations(modelName);

    // 注文日をフォーマット
    const orderDate = this.formatDate(order.create_time);

    // 注文ステータスを日本語に変換
    const orderStatus = this.translateOrderStatus(order.order_status);

    // 配送ステータス
    const isShipped = ['SHIPPED', 'COMPLETED', 'TO_RETURN'].includes(order.order_status);

    // 金額計算
    const totalAmount = order.total_amount || 0;
    const actualShippingFee = order.actual_shipping_fee || 0;

    // 手数料情報（実際のAPIレスポンスに応じて調整が必要）
    const commissionFee = ''; // APIから取得できない場合は空
    const internationalShippingFee = actualShippingFee;

    // 行データを作成
    return [
      orderDate,                      // 注文日
      orderStatus,                    // 注文ステータス
      'Singapore',                    // 国
      order.order_sn,                 // 注文ID
      item.item_name || '',           // 商品タイトル
      variations[0] || '',            // バリエーション名①
      variations[1] || '',            // バリエーション名②
      item.model_sku || '',           // SKU
      item.model_quantity_purchased || 0, // 注文個数
      '',                             // 配送ラベルデータ
      isShipped ? '済' : '未',        // 発送済
      '',                             // 備考欄
      '',                             // 空列
      totalAmount,                    // 売上
      commissionFee,                  // 販売手数料
      internationalShippingFee,       // 国際送料
      '',                             // 原価（手動入力）
      '',                             // 利益（計算式を後で設定）
      ''                              // 還付込利益（計算式を後で設定）
    ];
  }

  /**
   * バリエーション名を解析
   * @param {string} modelName - モデル名
   * @return {Array} バリエーション名の配列
   */
  parseVariations(modelName) {
    if (!modelName) {
      return ['', ''];
    }

    // カンマ区切りで分割
    const parts = modelName.split(',').map(s => s.trim());

    return [
      parts[0] || '',
      parts[1] || ''
    ];
  }

  /**
   * 注文ステータスを日本語に変換
   * @param {string} status - ステータス
   * @return {string} 日本語のステータス
   */
  translateOrderStatus(status) {
    const statusMap = {
      'UNPAID': '未払い',
      'READY_TO_SHIP': '発送準備中',
      'PROCESSED': '処理中',
      'RETRY_SHIP': '再発送',
      'SHIPPED': '発送済み',
      'TO_CONFIRM_RECEIVE': '受取確認待ち',
      'IN_CANCEL': 'キャンセル処理中',
      'CANCELLED': 'キャンセル済み',
      'TO_RETURN': '返品中',
      'COMPLETED': '完了',
      'INVOICE_PENDING': '請求書待ち'
    };

    return statusMap[status] || status;
  }

  /**
   * タイムスタンプを日付文字列に変換
   * @param {number} timestamp - Unixタイムスタンプ
   * @return {string} 日付文字列
   */
  formatDate(timestamp) {
    if (!timestamp) {
      return '';
    }

    const date = new Date(timestamp * 1000);
    return Utilities.formatDate(date, this.config.OTHER.TIMEZONE, this.config.OTHER.DATE_FORMAT);
  }

  /**
   * スプレッドシートのURLを取得
   * @return {string} URL
   */
  getUrl() {
    return this.spreadsheet.getUrl();
  }

  /**
   * 配送ラベルが未設定の注文を取得
   * @param {number} limit - 取得する最大件数（デフォルト10件）
   * @return {Array} 注文情報の配列 [{row, orderSn, status}, ...]
   */
  getOrdersWithoutShippingLabel(limit = 10) {
    const lastRow = this.sheet.getLastRow();

    if (lastRow <= 1) {
      return [];
    }

    // D列（注文ID）、B列（ステータス）、J列（配送ラベルデータ）を取得
    const dataRange = this.sheet.getRange(2, 1, lastRow - 1, 19);
    const data = dataRange.getValues();

    const ordersWithoutLabel = [];

    for (let i = 0; i < data.length; i++) {
      const orderSn = data[i][3];        // D列（4番目、0-indexed: 3）
      const status = data[i][1];          // B列（2番目、0-indexed: 1）
      const shippingLabel = data[i][9];   // J列（10番目、0-indexed: 9）

      // 配送ラベルが空で、注文IDがある場合
      if (orderSn && !shippingLabel) {
        // 発送可能なステータスかチェック（発送準備中、処理中）
        // 注意: SHIPPED（発送済み）は既にピックアップ済みのため印刷不可
        const validStatuses = ['発送準備中', '処理中', 'READY_TO_SHIP', 'PROCESSED'];
        if (validStatuses.includes(status)) {
          ordersWithoutLabel.push({
            row: i + 2, // 実際の行番号（ヘッダー行 + 0-indexed補正）
            orderSn: orderSn,
            status: status
          });
        }
      }

      // 上限に達したら終了
      if (ordersWithoutLabel.length >= limit) {
        break;
      }
    }

    Logger.log(`配送ラベル未設定の注文: ${ordersWithoutLabel.length}件`);
    return ordersWithoutLabel;
  }

  /**
   * 特定の注文の配送ラベルURLを更新
   * @param {string} orderSn - 注文番号
   * @param {string} labelUrl - 配送ラベルのURL
   * @return {boolean} 更新成功の場合true
   */
  updateShippingLabel(orderSn, labelUrl) {
    const lastRow = this.sheet.getLastRow();

    if (lastRow <= 1) {
      return false;
    }

    // D列（注文ID）を検索
    const orderIdColumn = this.sheet.getRange(2, 4, lastRow - 1, 1).getValues();

    for (let i = 0; i < orderIdColumn.length; i++) {
      if (orderIdColumn[i][0] === orderSn) {
        const row = i + 2; // 実際の行番号
        // J列（10列目）に配送ラベルURLを設定
        this.sheet.getRange(row, 10).setValue(labelUrl);
        Logger.log(`配送ラベルURLを更新: ${orderSn} → ${labelUrl}`);
        return true;
      }
    }

    Logger.log(`注文が見つかりません: ${orderSn}`);
    return false;
  }

  /**
   * 行番号を指定して配送ラベルURLを更新
   * @param {number} row - 行番号
   * @param {string} labelUrl - 配送ラベルのURL
   */
  updateShippingLabelByRow(row, labelUrl) {
    // J列（10列目）に配送ラベルURLを設定
    this.sheet.getRange(row, 10).setValue(labelUrl);
    Logger.log(`行${row}の配送ラベルURLを更新: ${labelUrl}`);
  }
}

/**
 * テスト用：スプレッドシート初期化
 */
function testInitializeSpreadsheet() {
  const manager = new SpreadsheetManager();
  Logger.log(`スプレッドシートURL: ${manager.getUrl()}`);
}

/**
 * テスト用：サンプルデータを追加
 */
function testAddSampleData() {
  const manager = new SpreadsheetManager();

  const sampleOrders = [
    {
      order_sn: 'TEST001',
      create_time: Math.floor(Date.now() / 1000),
      order_status: 'READY_TO_SHIP',
      total_amount: 50.00,
      actual_shipping_fee: 5.00,
      item_list: [
        {
          item_name: 'テスト商品1',
          model_name: 'サイズ:M, カラー:赤',
          model_sku: 'TEST-SKU-001',
          model_quantity_purchased: 2
        }
      ]
    }
  ];

  manager.addOrders(sampleOrders);
}
