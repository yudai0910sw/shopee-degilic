# Shopee注文管理システム

Shopee APIを使った注文データのExcel管理とSlack通知システム（Google Apps Script版）

## 機能

- **30分ごとの自動実行**: トリガーによる定期的な注文チェック
- **新規注文の自動取得**: Shopee APIから最新の注文情報を取得
- **スプレッドシートへの自動追記**: 新しい注文をGoogleスプレッドシートに追加（重複チェック付き）
- **Slack通知**: 新しい注文があったときにSlackへ自動通知
- **エラー通知**: システムエラーが発生した場合もSlackに通知

## セットアップ

### 1. 事前準備

#### 1.1 Shopee Open Platformでアプリを作成

1. [Shopee Open Platform](https://open.shopee.com/)にアクセス
2. アカウントを作成してログイン
3. 新しいアプリを作成
4. 以下の情報を取得：
   - **Partner ID**
   - **Partner Key**

#### 1.2 ショップ認証

1. 作成したアプリでショップ認証を行う
2. 認証後、以下の情報を取得：
   - **Shop ID**
   - **Access Token**（4時間で期限切れ、定期的な更新が必要）

#### 1.3 Slack Webhook URL（任意）

1. Slackワークスペースで[Incoming Webhooks](https://slack.com/apps/A0F7XDUAZ-incoming-webhooks)を設定
2. 通知先チャンネルを選択
3. Webhook URLを取得

### 2. Google Apps Scriptプロジェクトの作成

1. [Google Apps Script](https://script.google.com/)にアクセス
2. 「新しいプロジェクト」をクリック
3. プロジェクト名を「Shopee注文管理システム」に変更

### 3. ファイルのアップロード

以下のファイルをGASプロジェクトに追加します：

1. `Code.gs` - メインファイル
2. `Config.gs` - 設定ファイル
3. `ShopeeAPI.gs` - Shopee API通信
4. `SpreadsheetManager.gs` - スプレッドシート管理
5. `SlackNotifier.gs` - Slack通知

**アップロード手順:**
- 左サイドバーの「ファイル」セクションで「+」ボタンをクリック
- 「スクリプト」を選択
- ファイル名を入力（例: `Config`）
- コードをコピー&ペースト

### 4. 設定の入力

#### 方法1: Config.gsに直接入力

`Config.gs`ファイルを開き、以下の部分に情報を入力：

```javascript
const CONFIG = {
  SHOPEE: {
    PARTNER_ID: '123456',        // ← あなたのPartner IDを入力
    PARTNER_KEY: 'your_key',     // ← あなたのPartner Keyを入力
    SHOP_ID: '789012',           // ← あなたのShop IDを入力
    ACCESS_TOKEN: 'your_token',  // ← あなたのAccess Tokenを入力
    // ...
  },
  SLACK: {
    WEBHOOK_URL: 'https://hooks.slack.com/services/xxx', // ← Webhook URLを入力
    // ...
  },
  // ...
};
```

#### 方法2: スクリプトプロパティで設定（推奨）

1. GASエディタで「プロジェクトの設定」（歯車アイコン）をクリック
2. 「スクリプト プロパティ」タブを選択
3. 以下のプロパティを追加：
   - `SHOPEE_PARTNER_ID`: Partner ID
   - `SHOPEE_PARTNER_KEY`: Partner Key
   - `SHOPEE_SHOP_ID`: Shop ID
   - `SHOPEE_ACCESS_TOKEN`: Access Token
   - `SLACK_WEBHOOK_URL`: Slack Webhook URL（任意）

### 5. 初回実行とトリガー設定

#### 初回セットアップ実行

1. GASエディタで`Code.gs`を開く
2. 関数選択ドロップダウンから`setupTrigger`を選択
3. 実行ボタン（▶）をクリック
4. 初回実行時は権限の承認が必要です：
   - 「権限を確認」をクリック
   - Googleアカウントを選択
   - 「詳細」→「安全でないページに移動」をクリック
   - 必要な権限を許可

#### トリガーの確認

1. 左サイドバーの「トリガー」（時計アイコン）をクリック
2. `main`関数のトリガーが30分間隔で設定されていることを確認

### 6. テスト実行

設定が正しいか確認するため、テスト実行を行います：

1. 関数選択ドロップダウンから`testRun`を選択
2. 実行ボタンをクリック
3. 実行ログを確認（「表示」→「ログ」）

成功すると：
- 新しいスプレッドシートが作成されます
- 注文データが取得され、スプレッドシートに追加されます
- Slackに通知が送信されます（Webhook URL設定時）

## 使用方法

### 自動実行

トリガーを設定すると、30分ごとに自動で以下の処理が実行されます：

1. 過去35分間の注文を取得
2. 新しい注文をスプレッドシートに追記
3. Slackに通知

### 手動実行

必要に応じて手動で実行できます：

- **`testRun()`**: テスト実行（30分間隔と同じ処理）
- **`fetchLast24Hours()`**: 過去24時間の注文を一括取得（初回データ投入用）

### スプレッドシートの確認

1. GASエディタで`testInitializeSpreadsheet`を実行
2. ログに表示されるURLからスプレッドシートにアクセス

または：

1. Googleドライブを開く
2. 「Shopee注文管理」という名前のスプレッドシートを検索

## スプレッドシート項目

| 列 | 項目 | 説明 |
|---|---|---|
| A | 注文日 | 注文が作成された日時 |
| B | 注文ステータス | 注文の現在のステータス |
| C | 国 | マーケット（Singapore固定） |
| D | 注文ID | Shopeeの注文番号 |
| E | 商品タイトル | 商品名 |
| F | バリエーション名① | バリエーション1 |
| G | バリエーション名② | バリエーション2 |
| H | SKU（商品コード） | 商品SKU |
| I | 注文個数 | 注文数量 |
| J | 配送ラベルデータ | 配送情報 |
| K | 発送済 | 発送ステータス |
| L | 備考欄 | 手動入力用 |
| M | （空列） | - |
| N | 売上 | 注文金額 |
| O | 販売手数料 | 手数料（要確認） |
| P | 国際送料 | 配送料 |
| Q | 原価 | 手動入力用 |
| R | 利益 | 計算用（要設定） |
| S | 還付込利益 | 計算用（要設定） |

### 取得できない項目

以下の項目はShopee APIから自動取得できません：

- **原価**: 手動入力または別途管理が必要
- **利益**: 計算式で算出（売上 - 販売手数料 - 国際送料 - 原価）
- **還付込利益**: 計算式で算出

## トラブルシューティング

### Access Tokenの期限切れ

Shopee APIのAccess Tokenは4時間で期限切れになります。

**対処方法:**
1. Shopee Open Platformで再認証
2. 新しいAccess Tokenを取得
3. `Config.gs`またはスクリプトプロパティを更新

### APIレート制限

Shopeeには1秒あたりのリクエスト制限があります。

**対処方法:**
- コード内で`Utilities.sleep(1000)`により1秒待機しています
- 大量の注文がある場合は処理時間がかかります

### エラー通知

システムエラーが発生すると、Slackに通知されます（Webhook URL設定時）。

ログの確認方法：
1. GASエディタで「表示」→「ログ」
2. または「表示」→「実行数」でトリガー実行履歴を確認

### スプレッドシートが作成されない

1. `testInitializeSpreadsheet`を実行
2. ログでスプレッドシートURLを確認
3. URLをブラウザで開く

## カスタマイズ

### 取得間隔の変更

`Config.gs`の`FETCH_TIME_RANGE`を変更：

```javascript
OTHER: {
  FETCH_TIME_RANGE: 2100  // 秒単位（デフォルト: 35分）
}
```

### トリガー間隔の変更

`Code.gs`の`setupTrigger`関数を編集：

```javascript
ScriptApp.newTrigger('main')
  .timeBased()
  .everyMinutes(30)  // ← ここを変更（15, 30分のみ選択可能）
  .create();
```

### Slack通知のカスタマイズ

`SlackNotifier.gs`の`formatOrderAttachments`メソッドを編集して、通知内容を変更できます。

### スプレッドシートヘッダーの変更

`Config.gs`の`HEADERS`配列を編集：

```javascript
HEADERS: [
  '注文日',
  '注文ステータス',
  // ... 必要に応じて追加・削除
]
```

## 注意事項

1. **Access Tokenの管理**: 定期的に更新が必要です
2. **APIレート制限**: 短時間に大量のリクエストを送らないよう注意
3. **データのバックアップ**: スプレッドシートは定期的にバックアップを推奨
4. **プライバシー**: APIキーやトークンは安全に管理してください

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## サポート

問題が発生した場合：

1. ログを確認（GASエディタ →「表示」→「ログ」）
2. Shopee API公式ドキュメントを参照: https://open.shopee.com/documents/v2/
3. Google Apps Script公式ドキュメント: https://developers.google.com/apps-script

---

**作成者**: Claude Code
**バージョン**: 1.0.0
**最終更新**: 2026-01-09
