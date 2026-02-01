/**
 * Shopee注文管理システム - メインファイル
 *
 * 30分ごとに実行され、新しい注文を取得してスプレッドシートに追記し、Slackに通知します。
 *
 * 作成者: Claude Code
 * バージョン: 1.0.0
 */

/**
 * メイン処理：全ショップの最新注文を取得してスプレッドシートに追記し、Slackに通知
 *
 * このメソッドは30分ごとのトリガーで実行されます。
 * 各ショップから過去15日間の最新10件の注文を取得し、重複チェックを行い、新しい注文のみを追加します。
 */
function main() {
  try {
    Logger.log('=== Shopee注文管理システム開始（マルチショップ対応） ===');

    // 設定を取得
    const config = getConfig();

    // 必須設定のチェック（基本設定のみ）
    validateBaseConfig(config);

    // 認証済みショップを取得
    const activeShops = getActiveShops();

    if (activeShops.length === 0) {
      Logger.log('認証済みのショップがありません。先に認証を行ってください。');
      Logger.log('=== Shopee注文管理システム終了 ===');
      return;
    }

    Logger.log(`処理対象ショップ: ${activeShops.join(', ')}`);

    const slackNotifier = new SlackNotifier();
    let totalAdded = 0;
    let totalUpdated = 0;
    const allProcessedOrders = [];

    // 各ショップを処理
    for (const shopCode of activeShops) {
      Logger.log(`\n--- ${shopCode}ショップの処理開始 ---`);

      try {
        const shopConfig = getShopConfig(shopCode);

        // 各クラスのインスタンスを作成
        const shopeeAPI = new ShopeeAPI(shopConfig);
        const spreadsheetManager = new SpreadsheetManager(shopConfig);

        // 最新10件の注文を取得（過去15日間）
        const orders = shopeeAPI.getLatestOrders(10, 15);

        if (orders.length === 0) {
          Logger.log(`${shopCode}: 注文が見つかりませんでした`);
          continue;
        }

        Logger.log(`${shopCode}: ${orders.length}件の注文を取得しました`);

        // 既存注文のステータスを更新
        const updateResult = spreadsheetManager.updateOrderStatuses(orders);
        if (updateResult.updatedCount > 0) {
          Logger.log(`${shopCode}: ${updateResult.updatedCount}件の注文ステータスを更新しました`);
          totalUpdated += updateResult.updatedCount;

          // 処理中になった注文を収集（ショップ名を追加）
          updateResult.processedOrders.forEach(order => order._shopName = shopConfig.name);
          allProcessedOrders.push(...updateResult.processedOrders);
        }

        // スプレッドシートに追加（重複チェックあり）
        const addedCount = spreadsheetManager.addOrders(orders);

        if (addedCount > 0) {
          Logger.log(`${shopCode}: ${addedCount}件の新しい注文をスプレッドシートに追加しました`);
          totalAdded += addedCount;
        }

        // APIレート制限対策
        Utilities.sleep(1000);

      } catch (shopError) {
        Logger.log(`${shopCode}: エラー - ${shopError.message}`);
      }
    }

    // サマリーログ
    Logger.log(`\n=== 処理サマリー ===`);
    Logger.log(`新規追加: ${totalAdded}件, ステータス更新: ${totalUpdated}件`);

    // Slackに通知（処理中になった注文をまとめて）
    if (allProcessedOrders.length > 0) {
      const spreadsheetManager = new SpreadsheetManager('SG');
      slackNotifier.notifyProcessedOrders(allProcessedOrders, spreadsheetManager.getUrl());
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
 * 特定ショップの注文を取得（単独実行用）
 *
 * @param {string} shopCode - ショップコード（SG, MY, PH）
 */
function mainForShop(shopCode) {
  Logger.log(`=== ${shopCode}ショップの注文取得開始 ===`);

  const shopConfig = getShopConfig(shopCode);
  const shopeeAPI = new ShopeeAPI(shopConfig);
  const spreadsheetManager = new SpreadsheetManager(shopConfig);
  const slackNotifier = new SlackNotifier();

  const orders = shopeeAPI.getLatestOrders(10, 15);

  if (orders.length === 0) {
    Logger.log('注文が見つかりませんでした');
    return;
  }

  const updateResult = spreadsheetManager.updateOrderStatuses(orders);
  const addedCount = spreadsheetManager.addOrders(orders);

  Logger.log(`新規追加: ${addedCount}件, ステータス更新: ${updateResult.updatedCount}件`);

  if (updateResult.processedOrders.length > 0) {
    updateResult.processedOrders.forEach(order => order._shopName = shopConfig.name);
    slackNotifier.notifyProcessedOrders(updateResult.processedOrders, spreadsheetManager.getUrl());
  }

  Logger.log(`=== ${shopCode}ショップの注文取得完了 ===`);
}

/**
 * 基本設定の妥当性をチェック（Partner ID/Key）
 * @param {Object} config - 設定オブジェクト
 */
function validateBaseConfig(config) {
  const errors = [];

  // Shopee API基本設定のチェック
  if (!config.SHOPEE.PARTNER_ID) {
    errors.push('SHOPEE_PARTNER_IDが設定されていません');
  }
  if (!config.SHOPEE.PARTNER_KEY) {
    errors.push('SHOPEE_PARTNER_KEYが設定されていません');
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
 * ショップ設定の妥当性をチェック
 * @param {Object} shopConfig - ショップ設定オブジェクト
 */
function validateShopConfig(shopConfig) {
  const errors = [];

  if (!shopConfig.shopId) {
    errors.push(`${shopConfig.code}: Shop IDが設定されていません`);
  }
  if (!shopConfig.accessToken) {
    errors.push(`${shopConfig.code}: Access Tokenが設定されていません`);
  }

  if (errors.length > 0) {
    throw new Error(`ショップ設定エラー:\n${errors.join('\n')}`);
  }
}

/**
 * 後方互換性のためのvalidateConfig（非推奨）
 * @param {Object} config - 設定オブジェクト
 * @deprecated validateBaseConfigを使用してください
 */
function validateConfig(config) {
  validateBaseConfig(config);
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
 * 全ショップの最新N件の注文を取得
 *
 * @param {number} limit - 各ショップから取得する注文数（デフォルト10件、最大100件）
 * @param {number} daysBack - 何日前まで遡るか（デフォルト15日、最大15日）
 *
 * 使用例：
 * fetchLatestOrders();      // 全ショップの最新10件（過去15日間）
 * fetchLatestOrders(20);    // 全ショップの最新20件（過去15日間）
 * fetchLatestOrders(10, 7); // 全ショップの過去7日間の最新10件
 *
 * 注意: Shopee APIは最大15日間の期間しか取得できません
 */
function fetchLatestOrders(limit = 10, daysBack = 15) {
  Logger.log(`=== 全ショップの最新${limit}件の注文を取得 ===`);

  try {
    const config = getConfig();
    validateBaseConfig(config);

    const activeShops = getActiveShops();

    if (activeShops.length === 0) {
      Logger.log('認証済みのショップがありません');
      return;
    }

    let totalAdded = 0;

    for (const shopCode of activeShops) {
      Logger.log(`\n--- ${shopCode}ショップ ---`);

      try {
        const shopConfig = getShopConfig(shopCode);
        const shopeeAPI = new ShopeeAPI(shopConfig);
        const spreadsheetManager = new SpreadsheetManager(shopConfig);

        const orders = shopeeAPI.getLatestOrders(limit, daysBack);

        if (orders.length === 0) {
          Logger.log(`${shopCode}: 注文が見つかりませんでした`);
          continue;
        }

        const addedCount = spreadsheetManager.addOrders(orders);
        totalAdded += addedCount;

        Logger.log(`${shopCode}: ${addedCount}件の注文を追加しました`);

        Utilities.sleep(1000);
      } catch (shopError) {
        Logger.log(`${shopCode}: エラー - ${shopError.message}`);
      }
    }

    Logger.log(`\n=== 完了: 合計 ${totalAdded}件の注文を追加 ===`);
  } catch (error) {
    Logger.log(`エラー: ${error.message}`);
    throw error;
  }
}

/**
 * 特定ショップの最新N件の注文を取得
 *
 * @param {string} shopCode - ショップコード（SG, MY, PH）
 * @param {number} limit - 取得する注文数（デフォルト10件、最大100件）
 * @param {number} daysBack - 何日前まで遡るか（デフォルト15日、最大15日）
 */
function fetchLatestOrdersForShop(shopCode, limit = 10, daysBack = 15) {
  Logger.log(`=== ${shopCode}ショップの最新${limit}件の注文を取得 ===`);

  const shopConfig = getShopConfig(shopCode);
  const shopeeAPI = new ShopeeAPI(shopConfig);
  const spreadsheetManager = new SpreadsheetManager(shopConfig);

  const orders = shopeeAPI.getLatestOrders(limit, daysBack);

  if (orders.length === 0) {
    Logger.log('注文が見つかりませんでした');
    return;
  }

  const addedCount = spreadsheetManager.addOrders(orders);

  Logger.log(`${addedCount}件の注文を追加しました`);
  Logger.log(`スプレッドシートURL: ${spreadsheetManager.getUrl()}`);
  Logger.log('=== 完了 ===');
}

// ============================================
// 配送ラベル取得機能
// ============================================

/**
 * 全ショップの配送ラベル未設定の注文の配送ラベルを一括取得
 *
 * このメソッドは定期的に実行され、各ショップの配送ラベルが未設定の注文を検索し、
 * Shopee APIから配送ラベルを取得してGoogle Driveにアップロードし、
 * スプレッドシートにURLを記録します。
 *
 * @param {number} limit - 各ショップで一度に処理する最大件数（デフォルト5件）
 */
function fetchShippingLabels(limit = 5) {
  Logger.log('=== 配送ラベル一括取得開始（マルチショップ対応） ===');

  try {
    const config = getConfig();
    validateBaseConfig(config);

    const activeShops = getActiveShops();

    if (activeShops.length === 0) {
      Logger.log('認証済みのショップがありません');
      Logger.log('=== 配送ラベル一括取得終了 ===');
      return;
    }

    const driveManager = new DriveManager();
    let totalSuccess = 0;
    let totalSkip = 0;
    let totalFail = 0;

    for (const shopCode of activeShops) {
      Logger.log(`\n--- ${shopCode}ショップの配送ラベル取得 ---`);

      try {
        const shopConfig = getShopConfig(shopCode);
        const shopeeAPI = new ShopeeAPI(shopConfig);
        const spreadsheetManager = new SpreadsheetManager(shopConfig);

        // 配送ラベル未設定の注文を取得
        const ordersWithoutLabel = spreadsheetManager.getOrdersWithoutShippingLabel(limit);

        if (ordersWithoutLabel.length === 0) {
          Logger.log(`${shopCode}: 配送ラベル未設定の注文はありません`);
          continue;
        }

        Logger.log(`${shopCode}: ${ordersWithoutLabel.length}件の注文を処理します`);

        let successCount = 0;
        let skipCount = 0;
        let failCount = 0;

        for (const order of ordersWithoutLabel) {
          try {
            Logger.log(`${shopCode}: 処理中 ${order.orderSn}`);

            // 配送ラベルを取得
            const pdfBlob = shopeeAPI.getShippingLabel(order.orderSn);

            // Google Driveにアップロード
            const labelUrl = driveManager.uploadAndGetUrl(pdfBlob, order.orderSn);

            // スプレッドシートを更新
            spreadsheetManager.updateShippingLabelByRows(order.rows, labelUrl);

            successCount++;
            Logger.log(`${shopCode}: 完了 ${order.orderSn}`);

            Utilities.sleep(2000);

          } catch (error) {
            const errorMessage = error.message;

            if (errorMessage.includes('Tracking Numberが見つかりません')) {
              skipCount++;
              Logger.log(`${shopCode}: スキップ ${order.orderSn} - Arrange Shipment未完了`);
            } else if (errorMessage.includes('parcel has been shipped') || errorMessage.includes('package_can_not_print')) {
              skipCount++;
              Logger.log(`${shopCode}: スキップ ${order.orderSn} - 既に発送済み`);
            } else {
              failCount++;
              Logger.log(`${shopCode}: 失敗 ${order.orderSn} - ${errorMessage}`);
            }

            Utilities.sleep(1000);
          }
        }

        totalSuccess += successCount;
        totalSkip += skipCount;
        totalFail += failCount;

        Logger.log(`${shopCode}: 成功 ${successCount}件, スキップ ${skipCount}件, 失敗 ${failCount}件`);

      } catch (shopError) {
        Logger.log(`${shopCode}: エラー - ${shopError.message}`);
      }
    }

    Logger.log(`\n=== 配送ラベル一括取得完了 ===`);
    Logger.log(`合計: 成功 ${totalSuccess}件, スキップ ${totalSkip}件, 失敗 ${totalFail}件`);

  } catch (error) {
    Logger.log(`エラーが発生しました: ${error.message}`);
    Logger.log(error.stack);

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
 * 特定ショップの配送ラベルを取得（単独実行用）
 *
 * @param {string} shopCode - ショップコード（SG, MY, PH）
 * @param {number} limit - 一度に処理する最大件数（デフォルト5件）
 */
function fetchShippingLabelsForShop(shopCode, limit = 5) {
  Logger.log(`=== ${shopCode}ショップの配送ラベル取得開始 ===`);

  const shopConfig = getShopConfig(shopCode);
  const shopeeAPI = new ShopeeAPI(shopConfig);
  const spreadsheetManager = new SpreadsheetManager(shopConfig);
  const driveManager = new DriveManager();

  const ordersWithoutLabel = spreadsheetManager.getOrdersWithoutShippingLabel(limit);

  if (ordersWithoutLabel.length === 0) {
    Logger.log('配送ラベル未設定の注文はありません');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const order of ordersWithoutLabel) {
    try {
      const pdfBlob = shopeeAPI.getShippingLabel(order.orderSn);
      const labelUrl = driveManager.uploadAndGetUrl(pdfBlob, order.orderSn);
      spreadsheetManager.updateShippingLabelByRows(order.rows, labelUrl);
      successCount++;
      Utilities.sleep(2000);
    } catch (error) {
      failCount++;
      Logger.log(`失敗: ${order.orderSn} - ${error.message}`);
      Utilities.sleep(1000);
    }
  }

  Logger.log(`=== ${shopCode}ショップの配送ラベル取得完了 ===`);
  Logger.log(`成功: ${successCount}件, 失敗: ${failCount}件`);
}

/**
 * 特定の注文の配送ラベルを取得
 *
 * @param {string} orderSn - 注文番号
 * @param {string} shopCode - ショップコード（SG, MY, PH）。省略時は最初の認証済みショップを使用
 */
function fetchShippingLabelForOrder(orderSn, shopCode = null) {
  // ショップコードが指定されていない場合は最初の認証済みショップを使用
  if (!shopCode) {
    const activeShops = getActiveShops();
    if (activeShops.length === 0) {
      throw new Error('認証済みのショップがありません');
    }
    shopCode = activeShops[0];
  }

  Logger.log(`=== 配送ラベル取得: ${orderSn} (${shopCode}) ===`);

  try {
    const shopConfig = getShopConfig(shopCode);
    const shopeeAPI = new ShopeeAPI(shopConfig);
    const spreadsheetManager = new SpreadsheetManager(shopConfig);
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
