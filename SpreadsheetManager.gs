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
   * 注文データをスプレッドシートに追加（明細方式：1商品=1行）
   * @param {Array} orders - 注文データの配列
   * @return {number} 追加された注文数
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

    // 注文データを行データに変換（1注文で複数行になる可能性あり）
    const allRows = [];
    for (const order of newOrders) {
      const rows = this.orderToRows(order);
      allRows.push(...rows);
    }

    if (allRows.length === 0) {
      Logger.log('追加する行がありません');
      return 0;
    }

    // データを追加
    const lastRow = this.sheet.getLastRow();
    const startRow = lastRow + 1;

    this.sheet.getRange(startRow, 1, allRows.length, allRows[0].length).setValues(allRows);

    Logger.log(`${newOrders.length}件の注文（${allRows.length}行）を追加しました`);
    return newOrders.length;
  }

  /**
   * 既存の注文IDを取得（ユニーク）
   * @return {Array} 注文IDの配列（重複なし）
   */
  getExistingOrderIds() {
    const lastRow = this.sheet.getLastRow();

    if (lastRow <= 1) {
      return [];
    }

    // 注文ID列（D列 = 4列目）のデータを取得
    const orderIdColumn = this.sheet.getRange(2, 4, lastRow - 1, 1).getValues();

    // ユニークな注文IDを返す
    const orderIds = orderIdColumn.map(row => row[0]).filter(id => id);
    return [...new Set(orderIds)];
  }

  /**
   * 注文オブジェクトを行データに変換（明細方式：商品ごとに1行）
   * @param {Object} order - 注文データ
   * @return {Array} 行データの配列（複数行）
   */
  orderToRows(order) {
    const rows = [];
    const items = order.item_list && order.item_list.length > 0 ? order.item_list : [{}];

    // 注文日をフォーマット
    const orderDate = this.formatDate(order.create_time);

    // 注文ステータスを日本語に変換
    const orderStatus = this.translateOrderStatus(order.order_status);

    // 配送ステータス
    const isShipped = ['SHIPPED', 'COMPLETED', 'TO_RETURN'].includes(order.order_status);

    // 金額計算（注文全体の金額）
    const totalAmount = order.total_amount || 0;
    const actualShippingFee = order.actual_shipping_fee || 0;

    // 商品数で割った金額（明細行ごとに按分）
    const itemCount = items.length;
    const amountPerItem = itemCount > 0 ? totalAmount / itemCount : totalAmount;
    const shippingPerItem = itemCount > 0 ? actualShippingFee / itemCount : actualShippingFee;

    // 商品ごとに行を作成
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // バリエーション名を取得
      const modelName = item.model_name || '';
      const variations = this.parseVariations(modelName);

      // 行データを作成
      const row = [
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
        i === 0 ? totalAmount : '',     // 売上（最初の行のみに全額）
        '',                             // 販売手数料
        i === 0 ? actualShippingFee : '', // 国際送料（最初の行のみ）
        '',                             // 原価（手動入力）
        '',                             // 利益（計算式を後で設定）
        ''                              // 還付込利益（計算式を後で設定）
      ];

      rows.push(row);
    }

    return rows;
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
   * 配送ラベルが未設定の注文を取得（注文ID単位でユニーク）
   * @param {number} limit - 取得する最大件数（デフォルト10件）
   * @return {Array} 注文情報の配列 [{orderSn, status, rows}, ...]
   */
  getOrdersWithoutShippingLabel(limit = 10) {
    const lastRow = this.sheet.getLastRow();

    if (lastRow <= 1) {
      return [];
    }

    // D列（注文ID）、B列（ステータス）、J列（配送ラベルデータ）を取得
    const dataRange = this.sheet.getRange(2, 1, lastRow - 1, 19);
    const data = dataRange.getValues();

    // 注文IDごとに情報を集約
    const orderMap = {};

    for (let i = 0; i < data.length; i++) {
      const orderSn = data[i][3];        // D列（4番目、0-indexed: 3）
      const status = data[i][1];          // B列（2番目、0-indexed: 1）
      const shippingLabel = data[i][9];   // J列（10番目、0-indexed: 9）
      const row = i + 2;                  // 実際の行番号

      if (!orderSn) continue;

      // 既にこの注文IDが登録されていなければ初期化
      if (!orderMap[orderSn]) {
        orderMap[orderSn] = {
          orderSn: orderSn,
          status: status,
          rows: [],
          hasLabel: false
        };
      }

      // 行を追加
      orderMap[orderSn].rows.push(row);

      // 1つでもラベルがあればフラグを立てる
      if (shippingLabel) {
        orderMap[orderSn].hasLabel = true;
      }
    }

    // ラベル未設定かつ有効なステータスの注文を抽出
    const validStatuses = ['発送準備中', '処理中', 'READY_TO_SHIP', 'PROCESSED'];
    const ordersWithoutLabel = [];

    for (const orderSn in orderMap) {
      const orderInfo = orderMap[orderSn];

      // ラベル未設定かつ有効なステータス
      if (!orderInfo.hasLabel && validStatuses.includes(orderInfo.status)) {
        ordersWithoutLabel.push({
          orderSn: orderInfo.orderSn,
          status: orderInfo.status,
          rows: orderInfo.rows  // この注文IDに紐づく全ての行番号
        });
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
   * 特定の注文の配送ラベルURLを更新（同じ注文IDの全行を更新）
   * @param {string} orderSn - 注文番号
   * @param {string} labelUrl - 配送ラベルのURL
   * @return {number} 更新した行数
   */
  updateShippingLabel(orderSn, labelUrl) {
    const lastRow = this.sheet.getLastRow();

    if (lastRow <= 1) {
      return 0;
    }

    // D列（注文ID）を検索
    const orderIdColumn = this.sheet.getRange(2, 4, lastRow - 1, 1).getValues();

    let updatedRows = 0;
    for (let i = 0; i < orderIdColumn.length; i++) {
      if (orderIdColumn[i][0] === orderSn) {
        const row = i + 2; // 実際の行番号
        // J列（10列目）に配送ラベルURLを設定
        this.sheet.getRange(row, 10).setValue(labelUrl);
        updatedRows++;
      }
    }

    if (updatedRows > 0) {
      Logger.log(`配送ラベルURLを更新: ${orderSn} → ${labelUrl} (${updatedRows}行)`);
    } else {
      Logger.log(`注文が見つかりません: ${orderSn}`);
    }

    return updatedRows;
  }

  /**
   * 複数の行番号を指定して配送ラベルURLを更新
   * @param {Array} rows - 行番号の配列
   * @param {string} labelUrl - 配送ラベルのURL
   */
  updateShippingLabelByRows(rows, labelUrl) {
    for (const row of rows) {
      // J列（10列目）に配送ラベルURLを設定
      this.sheet.getRange(row, 10).setValue(labelUrl);
    }
    Logger.log(`行${rows.join(',')}の配送ラベルURLを更新: ${labelUrl}`);
  }

  /**
   * 行番号を指定して配送ラベルURLを更新（単一行）
   * @param {number} row - 行番号
   * @param {string} labelUrl - 配送ラベルのURL
   */
  updateShippingLabelByRow(row, labelUrl) {
    // J列（10列目）に配送ラベルURLを設定
    this.sheet.getRange(row, 10).setValue(labelUrl);
    Logger.log(`行${row}の配送ラベルURLを更新: ${labelUrl}`);
  }

  /**
   * 既存注文のステータスを取得（注文ID → {rows, status}のマップ）
   * @return {Object} 注文IDをキーとしたステータス情報のマップ
   */
  getExistingOrderStatuses() {
    const lastRow = this.sheet.getLastRow();

    if (lastRow <= 1) {
      return {};
    }

    // B列（ステータス）、D列（注文ID）を取得
    const dataRange = this.sheet.getRange(2, 1, lastRow - 1, 4);
    const data = dataRange.getValues();

    const statusMap = {};

    for (let i = 0; i < data.length; i++) {
      const orderSn = data[i][3];  // D列（4番目、0-indexed: 3）
      const status = data[i][1];    // B列（2番目、0-indexed: 1）
      const row = i + 2;            // 実際の行番号

      if (orderSn) {
        // 既にこの注文IDが登録されていなければ初期化
        if (!statusMap[orderSn]) {
          statusMap[orderSn] = {
            rows: [],
            status: status
          };
        }
        // 行を追加
        statusMap[orderSn].rows.push(row);
      }
    }

    return statusMap;
  }

  /**
   * 注文のステータスを更新（同じ注文IDの全行を更新）
   * @param {Array} orders - APIから取得した注文データの配列
   * @return {number} 更新された注文数
   */
  updateOrderStatuses(orders) {
    if (!orders || orders.length === 0) {
      return 0;
    }

    // 既存のステータス情報を取得
    const existingStatuses = this.getExistingOrderStatuses();

    let updatedCount = 0;

    for (const order of orders) {
      const orderSn = order.order_sn;
      const existingInfo = existingStatuses[orderSn];

      if (existingInfo) {
        // 新しいステータスを日本語に変換
        const newStatus = this.translateOrderStatus(order.order_status);

        // ステータスが変わっていたら更新（全行を更新）
        if (existingInfo.status !== newStatus) {
          this.updateOrderStatusByRows(existingInfo.rows, order);
          updatedCount++;
          Logger.log(`ステータス更新: ${orderSn} (${existingInfo.status} → ${newStatus}) [${existingInfo.rows.length}行]`);
        }
      }
    }

    return updatedCount;
  }

  /**
   * 複数行の注文情報を更新
   * @param {Array} rows - 行番号の配列
   * @param {Object} order - 注文データ
   */
  updateOrderStatusByRows(rows, order) {
    const newStatus = this.translateOrderStatus(order.order_status);
    const isShipped = ['SHIPPED', 'COMPLETED', 'TO_RETURN'].includes(order.order_status);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // B列（2列目）にステータスを更新
      this.sheet.getRange(row, 2).setValue(newStatus);

      // K列（11列目）の発送済フラグを更新
      this.sheet.getRange(row, 11).setValue(isShipped ? '済' : '未');

      // 最初の行のみ金額を更新
      if (i === 0) {
        // N列（14列目）の売上を更新
        if (order.total_amount !== undefined) {
          this.sheet.getRange(row, 14).setValue(order.total_amount);
        }

        // P列（16列目）の国際送料を更新
        if (order.actual_shipping_fee !== undefined) {
          this.sheet.getRange(row, 16).setValue(order.actual_shipping_fee);
        }
      }
    }
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
