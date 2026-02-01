/**
 * Slack通知クラス
 *
 * Slackへの通知を管理
 */

class SlackNotifier {
  /**
   * コンストラクタ
   */
  constructor() {
    this.config = getConfig();
    this.webhookUrl = this.config.SLACK.WEBHOOK_URL;
    this.channel = this.config.SLACK.CHANNEL;
    this.username = this.config.SLACK.USERNAME;
    this.iconEmoji = this.config.SLACK.ICON_EMOJI;
  }

  /**
   * Slackに通知を送信
   * @param {string} text - メッセージテキスト
   * @param {Array} attachments - 添付情報
   */
  send(text, attachments = []) {
    if (!this.webhookUrl) {
      Logger.log('Slack Webhook URLが設定されていません');
      return;
    }

    const payload = {
      channel: this.channel,
      username: this.username,
      icon_emoji: this.iconEmoji,
      text: text
    };

    if (attachments.length > 0) {
      payload.attachments = attachments;
    }

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    try {
      const response = UrlFetchApp.fetch(this.webhookUrl, options);
      const responseCode = response.getResponseCode();

      if (responseCode !== 200) {
        throw new Error(`Slack通知失敗: ${responseCode}`);
      }

      Logger.log('Slack通知を送信しました');
    } catch (error) {
      Logger.log(`Slack通知エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 新しい注文をSlackに通知
   * @param {Array} orders - 注文データの配列
   * @param {string} spreadsheetUrl - スプレッドシートURL
   */
  notifyNewOrders(orders, spreadsheetUrl) {
    if (!orders || orders.length === 0) {
      Logger.log('通知する注文がありません');
      return;
    }

    const text = `:bell: *新しい注文が ${orders.length} 件あります*`;
    const attachments = this.formatOrderAttachments(orders, spreadsheetUrl);

    this.send(text, attachments);
  }

  /**
   * 処理中になった注文をSlackに通知
   * @param {Array} orders - 注文データの配列
   * @param {string} spreadsheetUrl - スプレッドシートURL
   */
  notifyProcessedOrders(orders, spreadsheetUrl) {
    if (!orders || orders.length === 0) {
      Logger.log('通知する注文がありません');
      return;
    }

    const text = `:package: *${orders.length} 件の注文が処理中になりました*`;
    const attachments = this.formatOrderAttachments(orders, spreadsheetUrl);

    this.send(text, attachments);
  }

  /**
   * 注文データを添付情報にフォーマット
   * @param {Array} orders - 注文データの配列
   * @param {string} spreadsheetUrl - スプレッドシートURL
   * @return {Array} 添付情報
   */
  formatOrderAttachments(orders, spreadsheetUrl) {
    const attachments = [];

    // 各注文の情報を添付
    orders.forEach((order, index) => {
      if (index < 10) { // 最大10件まで表示
        const item = order.item_list && order.item_list.length > 0 ? order.item_list[0] : {};

        const fields = [
          {
            title: 'ショップ',
            value: this.formatShopName(order._shopName),
            short: true
          },
          {
            title: '注文ID',
            value: order.order_sn,
            short: true
          },
          {
            title: 'ステータス',
            value: this.translateOrderStatus(order.order_status),
            short: true
          },
          {
            title: '商品名',
            value: item.item_name || '不明',
            short: false
          },
          {
            title: 'SKU',
            value: item.model_sku || '-',
            short: true
          },
          {
            title: '数量',
            value: `${item.model_quantity_purchased || 0}個`,
            short: true
          },
          {
            title: '金額',
            value: `$${(order.total_amount || 0).toFixed(2)}`,
            short: true
          }
        ];

        attachments.push({
          color: this.getColorByStatus(order.order_status),
          fields: fields,
          footer: this.formatDate(order.create_time),
          mrkdwn_in: ['fields']
        });
      }
    });

    // 10件以上ある場合は省略メッセージを追加
    if (orders.length > 10) {
      attachments.push({
        color: '#cccccc',
        text: `... 他 ${orders.length - 10} 件の注文があります`
      });
    }

    // スプレッドシートへのリンクを追加
    attachments.push({
      color: '#36a64f',
      text: `<${spreadsheetUrl}|:clipboard: スプレッドシートで全件を確認>`,
      mrkdwn_in: ['text']
    });

    return attachments;
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
   * ステータスに応じた色を取得
   * @param {string} status - ステータス
   * @return {string} カラーコード
   */
  getColorByStatus(status) {
    const colorMap = {
      'UNPAID': '#ff9800',
      'READY_TO_SHIP': '#2196f3',
      'PROCESSED': '#2196f3',
      'RETRY_SHIP': '#ff9800',
      'SHIPPED': '#4caf50',
      'TO_CONFIRM_RECEIVE': '#4caf50',
      'IN_CANCEL': '#f44336',
      'CANCELLED': '#9e9e9e',
      'TO_RETURN': '#ff9800',
      'COMPLETED': '#4caf50',
      'INVOICE_PENDING': '#ff9800'
    };

    return colorMap[status] || '#607d8b';
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
    return Utilities.formatDate(date, this.config.OTHER.DEFAULT_TIMEZONE, this.config.OTHER.DATE_FORMAT);
  }

  /**
   * ショップ名を国旗絵文字付きでフォーマット
   * @param {string} shopName - ショップ名（Singapore, Malaysia, Philippines）
   * @return {string} フォーマット済みのショップ名
   */
  formatShopName(shopName) {
    const shopMap = {
      'Singapore': ':flag-sg: Singapore',
      'Malaysia': ':flag-my: Malaysia',
      'Philippines': ':flag-ph: Philippines'
    };

    return shopMap[shopName] || shopName || '不明';
  }

  /**
   * エラー通知をSlackに送信
   * @param {string} errorMessage - エラーメッセージ
   */
  notifyError(errorMessage) {
    const text = ':warning: *エラーが発生しました*';
    const attachments = [
      {
        color: 'danger',
        text: errorMessage,
        footer: new Date().toISOString()
      }
    ];

    this.send(text, attachments);
  }
}

/**
 * テスト用：処理中通知テスト
 *
 * GASエディタでこの関数を実行すると、実際にSlackに通知が送信されます。
 * 複数の国からの注文がどのように表示されるか確認できます。
 */
function testProcessedOrderNotification() {
  const notifier = new SlackNotifier();

  const sampleOrders = [
    {
      order_sn: 'SG240201TEST001',
      create_time: Math.floor(Date.now() / 1000),
      order_status: 'PROCESSED',
      total_amount: 45.50,
      _shopName: 'Singapore',
      item_list: [
        {
          item_name: 'サンプル商品A（シンガポール）',
          model_sku: 'SKU-SG-001',
          model_quantity_purchased: 1
        }
      ]
    },
    {
      order_sn: 'MY240201TEST002',
      create_time: Math.floor(Date.now() / 1000),
      order_status: 'PROCESSED',
      total_amount: 89.90,
      _shopName: 'Malaysia',
      item_list: [
        {
          item_name: 'サンプル商品B（マレーシア）',
          model_sku: 'SKU-MY-002',
          model_quantity_purchased: 3
        }
      ]
    },
    {
      order_sn: 'PH240201TEST003',
      create_time: Math.floor(Date.now() / 1000),
      order_status: 'PROCESSED',
      total_amount: 120.00,
      _shopName: 'Philippines',
      item_list: [
        {
          item_name: 'サンプル商品C（フィリピン）',
          model_sku: 'SKU-PH-003',
          model_quantity_purchased: 2
        }
      ]
    }
  ];

  notifier.notifyProcessedOrders(sampleOrders, 'https://docs.google.com/spreadsheets/d/xxx');
  Logger.log('テスト通知を送信しました');
}

/**
 * テスト用：エラー通知テスト
 */
function testSlackErrorNotification() {
  const notifier = new SlackNotifier();
  notifier.notifyError('これはテストエラーメッセージです');
}
