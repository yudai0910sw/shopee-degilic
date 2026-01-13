# トラブルシューティングガイド

このガイドでは、Shopee注文管理システムでよくある問題と解決方法を説明します。

## 🚨 GAS URL Fetch制限エラー

### エラーメッセージ

```
認証エラー: 1 日にサービス premium urlfetch を実行した回数が多すぎます。
```

### 原因

Google Apps Scriptには1日あたりのURL Fetch（外部APIリクエスト）回数制限があります：

| アカウントタイプ | 1日の制限 |
|----------------|----------|
| **無料Googleアカウント** | 20,000回 |
| **Google Workspace** | 100,000回 |

### すぐに解決する方法

#### 方法1: 翌日まで待つ（推奨）

制限は**日本時間の午前0時（PST）**にリセットされます。

```javascript
// 翌日以降に再度実行
generateAuthUrl("webapp_url");
// または
testRun();
```

#### 方法2: 別のGoogleアカウントを使用

1. 別のGoogleアカウントでGASプロジェクトを作成
2. すべてのファイルをアップロード
3. 設定と認証を再実行

#### 方法3: Google Workspaceにアップグレード

- 制限が **100,000回/日** に増加
- ビジネス用途に推奨
- [Google Workspace](https://workspace.google.com/)

### 制限に達した原因を特定

#### 原因1: 認証を何度も繰り返した

**確認方法**:
```javascript
// GASエディタで「実行数」を確認
// 左サイドバー → 「実行数」
```

**対処法**:
- 認証は1回だけ実行すれば十分です
- エラーが出ても何度もリトライしない

#### 原因2: トリガーが頻繁に実行されている

**確認方法**:
```javascript
checkTriggers(); // トリガーを確認
```

**対処法**:
```javascript
// トリガーを一時停止
deleteTrigger();

// トリガー頻度を調整（30分 → 1時間）
// Code.gs を編集
ScriptApp.newTrigger('main')
  .timeBased()
  .everyHours(1)  // 1時間ごとに変更
  .create();
```

#### 原因3: 注文数が多い

**1回の実行でのAPI呼び出し回数**:
- 注文リスト取得: 1回
- 注文詳細取得: 注文数分（10件の注文 = 10回）
- 合計: 1 + 注文数

**対処法**:
```javascript
// Config.gs で取得期間を調整
OTHER: {
  FETCH_TIME_RANGE: 3900  // 65分（余裕を持たせる）
}
```

### 長期的な対策

#### 1. トリガー頻度を最適化

##### 現在（30分ごと）
- 1日48回実行
- 1回10件の注文 = 480回 + 48回 = **528回/日**

##### 推奨（1時間ごと）
- 1日24回実行
- 1回20件の注文 = 480回 + 24回 = **504回/日**

```javascript
// Code.gs の setupTrigger を編集
function setupTrigger() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'main') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 新しいトリガーを作成（1時間ごと）
  ScriptApp.newTrigger('main')
    .timeBased()
    .everyHours(1)  // 30分 → 1時間
    .create();

  Logger.log('1時間ごとのトリガーを設定しました');
}
```

#### 2. 取得期間を調整

```javascript
// Config.gs
OTHER: {
  TIMEZONE: 'Asia/Singapore',
  DATE_FORMAT: 'yyyy-MM-dd HH:mm:ss',
  FETCH_TIME_RANGE: 3900  // 65分（1時間+余裕）
}
```

#### 3. エラー時にSlack通知

URL Fetch制限エラーが発生したら、Slackで通知するように改善：

```javascript
// Code.gs の main 関数は既にエラー通知に対応済み
```

#### 4. 実行回数を監視

定期的に実行回数を確認：

```javascript
// GASエディタ → 左サイドバー → 「実行数」
// または
// https://script.google.com/home/executions
```

## 🔑 認証関連のエラー

### エラー: 「error_sign」（署名エラー）

```
Shopee APIエラー: error_sign - Wrong sign.
```

#### 原因

HMAC-SHA256署名の計算が間違っています。以下のいずれかが原因です：

- **Partner Keyが間違っている**（最も多い原因）
- Partner IDが間違っている
- Access Tokenが無効または期限切れ
- Shop IDが間違っている

#### 対処法

1. **現在の設定を確認**:
   ```javascript
   checkCurrentConfig();
   ```

   ログで以下を確認：
   - ✅ Partner IDが正しく設定されているか
   - ✅ Partner Keyが設定されているか（長さは32～64文字が一般的）
   - ✅ Shop IDとAccess Tokenが設定されているか

2. **Partner Keyを再確認**:

   [Shopee Open Platform Console](https://open.shopee.com/console) にアクセス：
   - アプリを選択
   - 「App Key」セクションで **Live Partner Key** を確認
   - **重要**: Test Partner Keyではなく、Live Partner Keyを使用

3. **スクリプトプロパティを再設定**:

   GASエディタで「プロジェクトの設定」→「スクリプト プロパティ」:
   ```
   SHOPEE_PARTNER_ID: 【正しいLive Partner ID】
   SHOPEE_PARTNER_KEY: 【正しいLive Partner Key】
   ```

   **注意**: Partner Keyをコピーする際、前後に余分なスペースや改行が入らないようにしてください。

4. **設定を再確認**:
   ```javascript
   checkCurrentConfig();
   ```

5. **再度テスト実行**:
   ```javascript
   testRun();
   ```

### エラー: 「error_auth」

```
Shopee APIエラー: error_auth - Invalid partner_id or shopid.
```

#### 原因

- Partner IDまたはPartner Keyが間違っている
- Shop IDが間違っている
- Access Tokenが無効

#### 対処法

1. **Partner IDとKeyを確認**:
   ```javascript
   checkCurrentConfig();
   ```

2. **再認証**:
   ```javascript
   generateAuthUrl("webapp_url");
   // ブラウザで認証URLを開いて再認証
   ```

3. **トークン情報を確認**:
   ```javascript
   checkTokenInfo();
   ```

### エラー: 「code is expired」

```
Shopee APIエラー: error_param - code is expired
```

#### 原因

認証コードの有効期限（10分）が切れました。

#### 対処法

1. 新しい認証URLを生成:
   ```javascript
   generateAuthUrl("webapp_url");
   ```

2. **10分以内**にブラウザで開いて認証

### エラー: 「access_token is invalid」

```
Shopee APIエラー: error_auth - access_token is invalid
```

#### 原因

Access Tokenの有効期限（4時間）が切れました。

#### 対処法

1. **トークンをリフレッシュ**:
   ```javascript
   refreshAccessToken();
   ```

2. **トークン情報を確認**:
   ```javascript
   checkTokenInfo();
   ```

## 📊 データ取得のエラー

### エラー: 「order.order_list_invalid_time」

```
Shopee APIエラー: order.order_list_invalid_time - Start time must be earlier than end time and diff in 15days.
```

#### 原因

Shopee APIには**最大15日間**の期間制限があります。15日を超える期間を指定すると、このエラーが発生します。

#### 対処法

取得期間を15日以内に調整してください：

```javascript
// ❌ 30日間は不可
fetchLatestOrders(10, 30);

// ✅ 15日以内ならOK
fetchLatestOrders(10, 15);  // 過去15日間の最新10件
fetchLatestOrders(10, 7);   // 過去7日間の最新10件
fetchLatestOrders(10);      // デフォルト15日間
```

**注意**: `getLatestOrders()` 関数は自動的に15日に調整されますが、それでもエラーが出る場合は期間を短くしてください。

### エラー: 「注文が見つかりませんでした」

#### 原因

指定期間に注文がありません。

#### 対処法

1. **期間を拡大して確認**:
   ```javascript
   fetchLast24Hours(); // 過去24時間の注文を取得
   fetchLatestOrders(10, 15); // 過去15日間の最新10件
   ```

2. **実際に注文があるか確認**:
   - Shopee Seller Centerで注文を確認

### エラー: スプレッドシートに書き込めない

#### 原因

- スプレッドシートが削除された
- 権限がない

#### 対処法

1. **スプレッドシートIDを確認**:
   ```javascript
   // スクリプトプロパティの SPREADSHEET_ID を確認
   ```

2. **新しいスプレッドシートを作成**:
   ```javascript
   testInitializeSpreadsheet();
   ```

## 📱 Slack通知のエラー

### エラー: Slack通知が届かない

#### 原因

- Webhook URLが間違っている
- Webhookが無効化されている

#### 対処法

1. **Webhook URLを確認**:
   ```javascript
   // Config.gs または スクリプトプロパティを確認
   ```

2. **テスト送信**:
   ```javascript
   testSlackNotification();
   ```

3. **Slack Webhookを再作成**:
   - [Slack Incoming Webhooks](https://slack.com/apps/A0F7XDUAZ-incoming-webhooks)

## ⏰ トリガー関連のエラー

### エラー: トリガーが実行されない

#### 原因

- トリガーが設定されていない
- トリガーが無効化されている

#### 対処法

1. **トリガーを確認**:
   ```javascript
   checkTriggers();
   ```

2. **トリガーを再設定**:
   ```javascript
   setupAllTriggers();
   ```

3. **GASエディタで確認**:
   - 左サイドバー → 「トリガー」

### エラー: トリガーがエラーで止まる

#### 原因

- コードにエラーがある
- API制限に達した

#### 対処法

1. **実行ログを確認**:
   - GASエディタ → 「表示」→「ログ」

2. **実行履歴を確認**:
   - 左サイドバー → 「実行数」

3. **手動でテスト実行**:
   ```javascript
   testRun();
   ```

## 🔧 その他のエラー

### エラー: 「設定エラー: SHOPEE_PARTNER_IDが設定されていません」

#### 対処法

```javascript
// スクリプトプロパティに設定を追加
setConfig('partner_id', 'partner_key', '', '', 'webhook_url', '');
```

### エラー: 「APIエラー: 429 - Too Many Requests」

#### 原因

Shopee APIのレート制限に達しました。

#### 対処法

1. **1秒待機**（コードに既に組み込み済み）
2. 注文数が多い場合は、トリガー頻度を減らす

### エラー: 「APIエラー: 500 - Internal Server Error」

#### 原因

Shopee APIサーバーエラー（一時的）

#### 対処法

1. 数分待ってから再実行
2. [Shopee Open Platform Status](https://open.shopee.com/)を確認

## 📞 サポート

### ログの確認方法

1. GASエディタで「表示」→「ログ」
2. または「表示」→「実行数」

### デバッグモード

詳細なログを出力：

```javascript
// Code.gs で testRun を実行
testRun();
// ログで詳細を確認
```

### 問題が解決しない場合

1. すべてのログをコピー
2. エラーメッセージをメモ
3. 実行した手順をメモ
4. [Shopee Open Platform Console](https://open.shopee.com/console)でアプリステータスを確認

## 📚 参考資料

- [Google Apps Script Quotas](https://developers.google.com/apps-script/guides/services/quotas)
- [Shopee Open Platform API](https://open.shopee.com/documents/v2/)
- [Shopee Open Platform FAQ](https://open.shopee.com/faq)

---

**作成者**: Claude Code
**最終更新**: 2026-01-12
