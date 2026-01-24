/**
 * Shopee注文管理システム - メインファイル
 *
 * 30分ごとに実行され、新しい注文を取得してスプレッドシートに追記し、Slackに通知します。
 *
 * 作成者: Claude Code
 * バージョン: 1.0.0
 */

/**
 * メイン処理：最新の注文を取得してスプレッドシートに追記し、Slackに通知
 *
 * このメソッドは30分ごとのトリガーで実行されます。
 * 過去15日間の最新10件の注文を取得し、重複チェックを行い、新しい注文のみを追加します。
 */
function main() {
  try {
    Logger.log('=== Shopee注文管理システム開始 ===');

    // 設定を取得
    const config = getConfig();

    // 必須設定のチェック
    validateConfig(config);

    // 各クラスのインスタンスを作成
    const shopeeAPI = new ShopeeAPI();
    const spreadsheetManager = new SpreadsheetManager();
    const slackNotifier = new SlackNotifier();

    // 最新10件の注文を取得（過去15日間）
    Logger.log('過去15日間の最新10件の注文を取得します');

    const orders = shopeeAPI.getLatestOrders(10, 15);

    if (orders.length === 0) {
      Logger.log('注文が見つかりませんでした');
      Logger.log('=== Shopee注文管理システム終了 ===');
      return;
    }

    Logger.log(`${orders.length}件の注文を取得しました`);

    // 既存注文のステータスを更新
    const updatedCount = spreadsheetManager.updateOrderStatuses(orders);
    if (updatedCount > 0) {
      Logger.log(`${updatedCount}件の注文ステータスを更新しました`);
    }

    // スプレッドシートに追加（重複チェックあり）
    const addedCount = spreadsheetManager.addOrders(orders);

    if (addedCount === 0 && updatedCount === 0) {
      Logger.log('新しい注文・ステータス変更はありません');
      Logger.log('=== Shopee注文管理システム終了 ===');
      return;
    }

    if (addedCount > 0) {
      Logger.log(`${addedCount}件の新しい注文をスプレッドシートに追加しました`);

      // Slackに通知（追加された注文のみ）
      const addedOrders = orders.slice(0, addedCount);
      const spreadsheetUrl = spreadsheetManager.getUrl();

      slackNotifier.notifyNewOrders(addedOrders, spreadsheetUrl);

      Logger.log('Slackに通知を送信しました');
    }

    Logger.log('=== Shopee注文管理システム終了 ===');
  } catch (error) {
    Logger.log(`エラーが発生しました: ${error.message}`);
    Logger.log(error.stack);

    // エラーをSlackに通知
    try {
      const slackNotifier = new SlackNotifier();
      slackNotifier.notifyError(`Shopee注文管理システムでエラーが発生しました:\n${error.message}`);
    } catch (notifyError) {
      Logger.log(`Slack通知の送信に失敗しました: ${notifyError.message}`);
    }

    throw error;
  }
}

/**
 * 設定の妥当性をチェック
 * @param {Object} config - 設定オブジェクト
 */
function validateConfig(config) {
  const errors = [];

  // Shopee API設定のチェック
  if (!config.SHOPEE.PARTNER_ID) {
    errors.push('SHOPEE_PARTNER_IDが設定されていません');
  }
  if (!config.SHOPEE.PARTNER_KEY) {
    errors.push('SHOPEE_PARTNER_KEYが設定されていません');
  }
  if (!config.SHOPEE.SHOP_ID) {
    errors.push('SHOPEE_SHOP_IDが設定されていません');
  }
  if (!config.SHOPEE.ACCESS_TOKEN) {
    errors.push('SHOPEE_ACCESS_TOKENが設定されていません');
  }

  // Slack設定のチェック（任意）
  if (!config.SLACK.WEBHOOK_URL) {
    Logger.log('警告: SLACK_WEBHOOK_URLが設定されていません。Slack通知はスキップされます。');
  }

  // エラーがあれば例外をスロー
  if (errors.length > 0) {
    throw new Error(`設定エラー:\n${errors.join('\n')}`);
  }
}

/**
 * 30分ごとのトリガーを設定
 *
 * 実行方法：
 * 1. GASエディタでこの関数を選択
 * 2. 実行ボタンをクリック
 * 3. 初回は権限の承認が必要
 */
function setupTrigger() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'main') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 新しいトリガーを作成（30分ごと）
  ScriptApp.newTrigger('main')
    .timeBased()
    .everyMinutes(30)
    .create();

  Logger.log('30分ごとのトリガーを設定しました');
}

/**
 * トリガーを削除
 */
function deleteTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'main') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  Logger.log('トリガーを削除しました');
}

/**
 * トリガーの状態を確認
 */
function checkTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  const mainTriggers = triggers.filter(trigger => trigger.getHandlerFunction() === 'main');

  if (mainTriggers.length === 0) {
    Logger.log('トリガーは設定されていません');
  } else {
    Logger.log(`${mainTriggers.length}件のトリガーが設定されています:`);
    mainTriggers.forEach(trigger => {
      Logger.log(`- ${trigger.getEventType()}: ${trigger.getTriggerSource()}`);
    });
  }
}

/**
 * 現在の設定を確認（デバッグ用）
 */
function checkCurrentConfig() {
  Logger.log('=== 現在の設定を確認 ===');

  const props = PropertiesService.getScriptProperties();
  const config = getConfig();

  Logger.log(`Partner ID: ${config.SHOPEE.PARTNER_ID ? config.SHOPEE.PARTNER_ID : '❌ 未設定'}`);
  Logger.log(`Partner Key: ${config.SHOPEE.PARTNER_KEY ? '✅ 設定済み（' + config.SHOPEE.PARTNER_KEY.substring(0, 10) + '...）' : '❌ 未設定'}`);
  Logger.log(`Shop ID: ${config.SHOPEE.SHOP_ID ? config.SHOPEE.SHOP_ID : '❌ 未設定'}`);
  Logger.log(`Access Token: ${config.SHOPEE.ACCESS_TOKEN ? '✅ 設定済み（' + config.SHOPEE.ACCESS_TOKEN.substring(0, 10) + '...）' : '❌ 未設定'}`);
  Logger.log(`Base URL: ${config.SHOPEE.BASE_URL}`);

  // Partner Keyの長さを確認（通常は32文字または64文字のはず）
  if (config.SHOPEE.PARTNER_KEY) {
    Logger.log(`Partner Key長: ${config.SHOPEE.PARTNER_KEY.length}文字`);
  }

  Logger.log('===================');
}

/**
 * 初期セットアップ
 *
 * 初めて使用する際に実行してください：
 * 1. スプレッドシートを作成
 * 2. 設定を保存
 * 3. トリガーを設定
 *
 * @param {string} partnerId - Partner ID
 * @param {string} partnerKey - Partner Key
 * @param {string} shopId - Shop ID
 * @param {string} accessToken - Access Token
 * @param {string} slackWebhookUrl - Slack Webhook URL（任意）
 */
function initialSetup(partnerId, partnerKey, shopId, accessToken, slackWebhookUrl = '') {
  Logger.log('=== 初期セットアップ開始 ===');

  try {
    // 設定を保存
    setConfig(partnerId, partnerKey, shopId, accessToken, slackWebhookUrl, '');

    // スプレッドシートを作成
    const spreadsheetManager = new SpreadsheetManager();
    const spreadsheetUrl = spreadsheetManager.getUrl();

    Logger.log(`スプレッドシートを作成しました: ${spreadsheetUrl}`);

    // トリガーを設定
    setupTrigger();

    Logger.log('=== 初期セットアップ完了 ===');
    Logger.log('以下のURLでスプレッドシートを確認できます:');
    Logger.log(spreadsheetUrl);
  } catch (error) {
    Logger.log(`初期セットアップエラー: ${error.message}`);
    throw error;
  }
}

/**
 * テスト実行（トリガーなしで手動実行）
 *
 * 設定が正しいかテストする際に使用してください
 */
function testRun() {
  Logger.log('=== テスト実行開始 ===');

  try {
    main();
    Logger.log('=== テスト実行成功 ===');
  } catch (error) {
    Logger.log('=== テスト実行失敗 ===');
    Logger.log(`エラー: ${error.message}`);
    throw error;
  }
}

/**
 * 過去24時間の注文を一括取得（初回セットアップ用）
 */
function fetchLast24Hours() {
  Logger.log('=== 過去24時間の注文を一括取得 ===');

  try {
    const config = getConfig();
    validateConfig(config);

    const shopeeAPI = new ShopeeAPI();
    const spreadsheetManager = new SpreadsheetManager();

    // 過去24時間の注文を取得
    const timeRangeSeconds = 86400; // 24時間
    const orders = shopeeAPI.getNewOrders(timeRangeSeconds);

    if (orders.length === 0) {
      Logger.log('注文が見つかりませんでした');
      return;
    }

    // スプレッドシートに追加
    const addedCount = spreadsheetManager.addOrders(orders);

    Logger.log(`${addedCount}件の注文を追加しました`);
    Logger.log(`スプレッドシートURL: ${spreadsheetManager.getUrl()}`);
  } catch (error) {
    Logger.log(`エラー: ${error.message}`);
    throw error;
  }
}

/**
 * 最新N件の注文を取得
 *
 * @param {number} limit - 取得する注文数（デフォルト10件、最大100件）
 * @param {number} daysBack - 何日前まで遡るか（デフォルト15日、最大15日）
 *
 * 使用例：
 * fetchLatestOrders();     // 最新10件（過去15日間）
 * fetchLatestOrders(10);   // 最新10件（過去15日間）
 * fetchLatestOrders(20);   // 最新20件（過去15日間）
 * fetchLatestOrders(10, 7); // 過去7日間の最新10件
 *
 * 注意: Shopee APIは最大15日間の期間しか取得できません
 */
function fetchLatestOrders(limit = 10, daysBack = 15) {
  Logger.log(`=== 最新${limit}件の注文を取得 ===`);

  try {
    const config = getConfig();
    validateConfig(config);

    const shopeeAPI = new ShopeeAPI();
    const spreadsheetManager = new SpreadsheetManager();

    // 最新N件の注文を取得
    const orders = shopeeAPI.getLatestOrders(limit, daysBack);

    if (orders.length === 0) {
      Logger.log('注文が見つかりませんでした');
      return;
    }

    // スプレッドシートに追加
    const addedCount = spreadsheetManager.addOrders(orders);

    Logger.log(`${addedCount}件の注文を追加しました`);
    Logger.log(`スプレッドシートURL: ${spreadsheetManager.getUrl()}`);

    Logger.log('=== 完了 ===');
  } catch (error) {
    Logger.log(`エラー: ${error.message}`);
    throw error;
  }
}

// ============================================
// 配送ラベル取得機能
// ============================================

/**
 * 配送ラベル未設定の注文の配送ラベルを一括取得
 *
 * このメソッドは定期的に実行され、配送ラベルが未設定の注文を検索し、
 * Shopee APIから配送ラベルを取得してGoogle Driveにアップロードし、
 * スプレッドシートにURLを記録します。
 *
 * @param {number} limit - 一度に処理する最大件数（デフォルト5件）
 */
function fetchShippingLabels(limit = 5) {
  Logger.log('=== 配送ラベル一括取得開始 ===');

  try {
    const config = getConfig();
    validateConfig(config);

    const shopeeAPI = new ShopeeAPI();
    const spreadsheetManager = new SpreadsheetManager();
    const driveManager = new DriveManager();

    // 配送ラベル未設定の注文を取得
    const ordersWithoutLabel = spreadsheetManager.getOrdersWithoutShippingLabel(limit);

    if (ordersWithoutLabel.length === 0) {
      Logger.log('配送ラベル未設定の注文はありません');
      Logger.log('=== 配送ラベル一括取得終了 ===');
      return;
    }

    Logger.log(`${ordersWithoutLabel.length}件の注文を処理します`);

    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;

    for (const order of ordersWithoutLabel) {
      try {
        Logger.log(`処理中: ${order.orderSn} (${order.rows.length}行)`);

        // 配送ラベルを取得
        const pdfBlob = shopeeAPI.getShippingLabel(order.orderSn);

        // Google Driveにアップロード
        const labelUrl = driveManager.uploadAndGetUrl(pdfBlob, order.orderSn);

        // スプレッドシートを更新（同じ注文IDの全行を更新）
        spreadsheetManager.updateShippingLabelByRows(order.rows, labelUrl);

        successCount++;
        Logger.log(`完了: ${order.orderSn}`);

        // APIレート制限対策（次の処理まで2秒待機）
        Utilities.sleep(2000);

      } catch (error) {
        const errorMessage = error.message;

        // スキップ対象のエラーかチェック
        if (errorMessage.includes('Tracking Numberが見つかりません')) {
          // Arrange Shipment未完了
          skipCount++;
          Logger.log(`スキップ: ${order.orderSn} - Arrange Shipment未完了`);
        } else if (errorMessage.includes('parcel has been shipped') || errorMessage.includes('package_can_not_print')) {
          // 既に発送済み
          skipCount++;
          Logger.log(`スキップ: ${order.orderSn} - 既に発送済み（ラベル印刷不可）`);
        } else {
          // その他のエラー
          failCount++;
          Logger.log(`失敗: ${order.orderSn} - ${errorMessage}`);
        }

        // 次の注文を処理
        Utilities.sleep(1000);
      }
    }

    Logger.log(`=== 配送ラベル一括取得完了 ===`);
    Logger.log(`成功: ${successCount}件, スキップ: ${skipCount}件, 失敗: ${failCount}件`);

  } catch (error) {
    Logger.log(`エラーが発生しました: ${error.message}`);
    Logger.log(error.stack);

    // エラーをSlackに通知
    try {
      const slackNotifier = new SlackNotifier();
      slackNotifier.notifyError(`配送ラベル取得でエラーが発生しました:\n${error.message}`);
    } catch (notifyError) {
      Logger.log(`Slack通知の送信に失敗しました: ${notifyError.message}`);
    }

    throw error;
  }
}

/**
 * 特定の注文の配送ラベルを取得
 *
 * @param {string} orderSn - 注文番号
 */
function fetchShippingLabelForOrder(orderSn) {
  Logger.log(`=== 配送ラベル取得: ${orderSn} ===`);

  try {
    const config = getConfig();
    validateConfig(config);

    const shopeeAPI = new ShopeeAPI();
    const spreadsheetManager = new SpreadsheetManager();
    const driveManager = new DriveManager();

    // 配送ラベルを取得
    const pdfBlob = shopeeAPI.getShippingLabel(orderSn);

    // Google Driveにアップロード
    const labelUrl = driveManager.uploadAndGetUrl(pdfBlob, orderSn);

    // スプレッドシートを更新
    spreadsheetManager.updateShippingLabel(orderSn, labelUrl);

    Logger.log(`=== 完了 ===`);
    Logger.log(`配送ラベルURL: ${labelUrl}`);

    return labelUrl;

  } catch (error) {
    Logger.log(`エラー: ${error.message}`);
    throw error;
  }
}

/**
 * 配送ラベル取得用の定期トリガーを設定（30分ごと）
 */
function setupShippingLabelTrigger() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'fetchShippingLabels') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 新しいトリガーを作成（30分ごと）
  ScriptApp.newTrigger('fetchShippingLabels')
    .timeBased()
    .everyMinutes(30)
    .create();

  Logger.log('配送ラベル取得用の30分ごとのトリガーを設定しました');
}

/**
 * 配送ラベル取得用のトリガーを削除
 */
function deleteShippingLabelTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'fetchShippingLabels') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  Logger.log('配送ラベル取得用のトリガーを削除しました');
}

/**
 * すべてのトリガーを設定（main + fetchShippingLabels）
 */
function setupAllTriggers() {
  setupTrigger();           // main用トリガー
  setupShippingLabelTrigger(); // 配送ラベル取得用トリガー

  Logger.log('すべてのトリガーを設定しました');
}

/**
 * すべてのトリガーを削除
 */
function deleteAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });

  Logger.log('すべてのトリガーを削除しました');
}
