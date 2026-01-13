# クイックスタートガイド

このガイドに従って、Shopee注文管理システムをセットアップできます。

## 準備するもの

- [ ] Shopee Open PlatformでAppを作成
- [ ] Go Live申請を完了（24時間以内に承認）
- [ ] Live Partner ID（Go Live承認後に取得）
- [ ] Live Partner Key（Go Live承認後に取得）
- [ ] Slack Webhook URL（任意）

**注意**:
- Shop IDとAccess Tokenは認証フローで自動取得されます！
- Go Live申請の詳細は`GO_LIVE_GUIDE.md`を参照してください

## セットアップ手順

### ステップ1: Google Apps Scriptプロジェクトを作成

1. https://script.google.com/ にアクセス
2. 「新しいプロジェクト」をクリック
3. プロジェクト名を「Shopee注文管理」に変更

### ステップ2: ファイルをアップロード

以下の6つのファイルを順番にアップロードします：

1. **Config.gs**
   - 左サイドバー「ファイル」→「+」→「スクリプト」
   - ファイル名: `Config`
   - 内容をコピー&ペースト

2. **Auth.gs**（認証用）
   - 同様に「スクリプト」を追加
   - ファイル名: `Auth`
   - 内容をコピー&ペースト

3. **ShopeeAPI.gs**
   - ファイル名: `ShopeeAPI`
   - 内容をコピー&ペースト

4. **SpreadsheetManager.gs**
   - ファイル名: `SpreadsheetManager`
   - 内容をコピー&ペースト

5. **SlackNotifier.gs**
   - ファイル名: `SlackNotifier`
   - 内容をコピー&ペースト

6. **Code.gs**（デフォルトで存在）
   - 既存の内容を削除して、Code.gsの内容で置き換え

### ステップ3: Partner IDとPartner Keyを設定

#### 方法A: Config.gsを直接編集

`Config.gs`を開いて、以下の部分を編集：

```javascript
const CONFIG = {
  SHOPEE: {
    PARTNER_ID: '【Live Partner ID】',
    PARTNER_KEY: '【Live Partner Key】',
    // ...
  },
  SLACK: {
    WEBHOOK_URL: '【Slack Webhook URL】', // 任意
    // ...
  }
};
```

#### 方法B: スクリプトプロパティで設定（推奨・安全）

1. 歯車アイコン（プロジェクトの設定）をクリック
2. 「スクリプト プロパティ」タブを選択
3. 「スクリプト プロパティを追加」をクリック
4. 以下を1つずつ追加：

| プロパティ | 値 |
|----------|---|
| `SHOPEE_PARTNER_ID` | Live Partner ID |
| `SHOPEE_PARTNER_KEY` | Live Partner Key |
| `SLACK_WEBHOOK_URL` | Slack Webhook URL（任意） |

**注意**: Shop IDとAccess Tokenは次のステップで認証時に自動設定されます。

### ステップ4: Webアプリとしてデプロイ

Shopeeからの認証コールバックを受け取るため、GASをWebアプリとして公開します。

1. GASエディタで「デプロイ」→「新しいデプロイ」をクリック
2. 「種類の選択」で歯車アイコン→「ウェブアプリ」を選択
3. 設定：
   - **次のユーザーとして実行**: 「自分」
   - **アクセスできるユーザー**: 「全員」
4. 「デプロイ」をクリック
5. 初回は権限の承認が必要：
   - 「権限を確認」→Googleアカウントを選択
   - 「詳細」→「（プロジェクト名）に移動」→「許可」
6. **WebアプリのURLをコピー**
   - 例: `https://script.google.com/macros/s/AKfycbxxx.../exec`

### ステップ5: Shopee認証

1. `Auth.gs`を開く
2. 関数選択で`generateAuthUrl`を選択
3. 実行ボタンをクリック
4. パラメータ入力で**ステップ4のWebアプリURL**を貼り付け
5. ログに表示される**認証URL**をコピー
6. その認証URLをブラウザで開く
7. Shopeeアカウントでログインして「Confirm Authorization」をクリック
8. 「✅ 認証成功！」画面が表示されれば完了

**これでShop IDとAccess Tokenが自動保存されました！**

### ステップ6: トークン情報を確認

1. 関数選択で`checkTokenInfo`を選択
2. 実行ボタンをクリック
3. ログでShop IDとトークンが表示されることを確認

### ステップ7: トリガーを設定

1. 関数選択で`setupAllTriggers`を選択
2. 実行ボタンをクリック

これで以下のトリガーが設定されます：
- 注文取得: 30分ごと
- トークン更新: 3時間ごと

### ステップ8: テスト実行

1. 関数選択で`testRun`を選択
2. 実行ボタンをクリック
3. 「表示」→「ログ」で実行結果を確認

成功すると：
- ✅ 新しいスプレッドシートが作成されます
- ✅ 注文データが取得されます
- ✅ Slackに通知が届きます（設定した場合）

### ステップ9: スプレッドシートを確認

1. ログに表示されるURLをクリック
2. または、Googleドライブで「Shopee注文管理」を検索

## トラブルシューティング

### エラー: 「設定エラー: SHOPEE_PARTNER_IDが設定されていません」

**原因**: 設定が正しく入力されていません

**解決策**:
- Config.gsの設定を確認
- またはスクリプトプロパティを確認

### エラー: 「APIエラー: error_auth」

**原因**: 認証情報が間違っています

**解決策**:
- Partner IDとPartner Keyを再確認
- 認証フローをもう一度実行

### エラー: 「code is expired」

**原因**: 認証コードの有効期限（10分）が切れました

**解決策**:
- 新しい認証URLを生成して再度認証

### 注文が取得できない

**原因**: 指定期間に注文がないか、Access Tokenが無効です

**解決策**:
- `fetchLast24Hours`関数を実行して過去24時間の注文を確認
- `checkTokenInfo`でトークンの有効期限を確認
- 必要に応じて`refreshAccessToken`を実行

### Slack通知が届かない

**原因**: Webhook URLが間違っているか、設定されていません

**解決策**:
- Webhook URLを再確認
- `testSlackNotification`関数でテスト送信

## 次のステップ

✅ セットアップ完了！

これで30分ごとに自動で注文が取得され、スプレッドシートに追記されます。

### 便利な機能

- **過去の注文を一括取得**: `fetchLast24Hours`を実行
- **トリガーの確認**: `checkTriggers`を実行
- **トリガーの削除**: `deleteTrigger`を実行（停止したい場合）
- **トークン情報の確認**: `checkTokenInfo`を実行
- **手動でトークン更新**: `refreshAccessToken`を実行

### カスタマイズ

詳細なカスタマイズ方法は`README.md`を参照してください。

## ヘルプ

問題が解決しない場合：

1. 実行ログを確認（「表示」→「ログ」）
2. トリガー履歴を確認（左サイドバー「トリガー」）
3. `AUTH_GUIDE.md`で認証手順を詳しく確認
4. `README.md`の「トラブルシューティング」セクションを参照
5. Shopee API公式ドキュメント: https://open.shopee.com/documents/v2/

---

Happy Selling! 🎉
