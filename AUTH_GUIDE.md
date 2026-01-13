# Shopee API 認証ガイド

このガイドでは、Shopee APIのアクセストークンを取得する手順を説明します。

## 📝 認証フローの概要

```
1. GASをWebアプリとしてデプロイ
   ↓
2. 認証URLを生成
   ↓
3. セラーが認証URLで認証
   ↓
4. コールバックでアクセストークン自動取得
   ↓
5. 3時間ごとに自動リフレッシュ
```

## 🚀 セットアップ手順

### ステップ1: Partner IDとPartner Keyの設定

まず、Shopee Open Platformで取得した認証情報を設定します。

#### 方法A: スクリプトプロパティで設定（推奨）

1. GASエディタで「プロジェクトの設定」（歯車アイコン）をクリック
2. 「スクリプト プロパティ」タブを選択
3. 以下のプロパティを追加：
   - `SHOPEE_PARTNER_ID`: あなたのPartner ID
   - `SHOPEE_PARTNER_KEY`: あなたのPartner Key

#### 方法B: Config.gsで設定

`Config.gs`ファイルを開き、以下を入力：

```javascript
const CONFIG = {
  SHOPEE: {
    PARTNER_ID: '123456',        // ← Partner ID
    PARTNER_KEY: 'your_key',     // ← Partner Key
    // ...
  }
};
```

### ステップ2: WebアプリとしてGASをデプロイ

Shopeeからのコールバックを受け取るため、GASをWebアプリとして公開します。

1. GASエディタで「デプロイ」→「新しいデプロイ」をクリック
2. 「種類の選択」で歯車アイコン→「ウェブアプリ」を選択
3. 設定：
   - **説明**: 「Shopee認証コールバック」（任意）
   - **次のユーザーとして実行**: 「自分」
   - **アクセスできるユーザー**: 「全員」
4. 「デプロイ」をクリック
5. **WebアプリのURLをコピー**
   - 例: `https://script.google.com/macros/s/AKfycbxxx.../exec`

⚠️ **重要**: このURLは次のステップで使用します。

### ステップ3: 認証URLを生成

1. GASエディタで`Auth.gs`を開く
2. 関数選択で`generateAuthUrl`を選択
3. 実行ボタンをクリック
4. パラメータ入力画面が表示されたら、**ステップ2でコピーしたWebアプリのURL**を入力

または、スクリプトエディタで直接実行：

```javascript
generateAuthUrl("https://script.google.com/macros/s/AKfycbxxx.../exec");
```

5. 「実行」をクリック
6. ログに表示される**認証URL**をコピー

### ステップ4: セラーが認証

1. **ステップ3で生成された認証URL**をブラウザで開く
2. Shopeeアカウントでログイン
3. 権限確認画面で**「Confirm Authorization」**をクリック
4. 認証が完了すると、WebアプリのURLにリダイレクトされます
5. 「✅ 認証成功！」画面が表示されれば完了

**自動処理される内容:**
- Access Tokenの取得
- Refresh Tokenの取得
- Shop IDの保存
- スクリプトプロパティへの自動保存

### ステップ5: トークン情報を確認

認証が成功したか確認します：

1. 関数選択で`checkTokenInfo`を選択
2. 実行ボタンをクリック
3. ログでトークン情報を確認

正しく設定されていれば：
```
=== トークン情報 ===
Shop ID: 123456789
Access Token: abc123...
Refresh Token: def456...
有効期限: 2026-01-09 23:30:00
残り時間: 3時間45分
```

### ステップ6: 自動リフレッシュトリガーを設定

Access Tokenは4時間で期限切れになるため、自動更新を設定します。

1. 関数選択で`setupAllTriggers`を選択
2. 実行ボタンをクリック

これで以下のトリガーが設定されます：
- **メイン処理**: 30分ごと（注文取得）
- **トークンリフレッシュ**: 3時間ごと（自動更新）

### ステップ7: テスト実行

すべての設定が完了したので、テスト実行します：

1. 関数選択で`testRun`を選択
2. 実行ボタンをクリック
3. ログで実行結果を確認

成功すると：
- 注文が取得されます
- スプレッドシートに追加されます
- Slackに通知が送信されます

## 🔄 トークンの自動リフレッシュ

### 仕組み

- **Access Token**: 4時間有効
- **Refresh Token**: 30日有効
- **自動更新**: 3時間ごとにトリガーで`refreshAccessToken()`が実行されます

### 手動でリフレッシュする場合

トリガーを待たずに今すぐリフレッシュしたい場合：

```javascript
refreshAccessToken();
```

## 📊 トークン管理のベストプラクティス

### 1. 定期的な確認

週に1回程度、トークン情報を確認：

```javascript
checkTokenInfo();
```

### 2. エラー通知の活用

トークンリフレッシュに失敗すると、Slackに通知されます（Webhook設定時）。

### 3. 再認証が必要な場合

以下の場合は再認証が必要です：

- Refresh Tokenの有効期限（30日）が切れた場合
- セラーが認証を取り消した場合
- APIキーを変更した場合

**再認証手順:**
1. `generateAuthUrl()`で新しい認証URLを生成
2. セラーに再度認証してもらう

## 🔧 トラブルシューティング

### エラー: 「Partner IDとPartner Keyを設定してください」

**原因**: 認証情報が設定されていません

**解決策**:
- スクリプトプロパティまたはConfig.gsを確認
- 正しいPartner IDとPartner Keyを設定

### エラー: 「Shopee APIエラー: error_auth」

**原因**: 認証情報が間違っています

**解決策**:
- Partner IDとPartner Keyを再確認
- Shopee Open Platformで正しい値をコピー

### エラー: 「code is expired」

**原因**: 認証コードの有効期限（10分）が切れました

**解決策**:
- 新しい認証URLを生成
- 10分以内に認証を完了する

### トークンが自動リフレッシュされない

**原因**: トリガーが設定されていません

**解決策**:
```javascript
setupRefreshTokenTrigger();
```

### Webアプリにアクセスできない

**原因**: デプロイ設定が間違っています

**解決策**:
- 「アクセスできるユーザー」が「全員」になっているか確認
- 「新しいデプロイ」からやり直す

## 📱 複数ショップの管理

現在のシステムは1ショップのみ対応していますが、複数ショップを管理する場合：

### 方法1: 複数のGASプロジェクトを作成

各ショップごとに別々のGASプロジェクトを作成します。

### 方法2: ショップIDを切り替える

スクリプトプロパティの`SHOPEE_SHOP_ID`と`SHOPEE_ACCESS_TOKEN`を変更して実行します。

## 🔐 セキュリティに関する注意

### Access TokenとRefresh Tokenの保護

- **スクリプトプロパティ**に保存されたトークンは暗号化されています
- GASプロジェクトへのアクセスを制限してください
- トークンを外部に公開しないでください

### Partner Keyの管理

- Partner Keyは絶対に公開しないでください
- GitHubなどにアップロードする場合は、Config.gsから削除してください
- スクリプトプロパティでの管理を推奨します

## 📚 参考資料

- [Shopee Open Platform 認証ドキュメント](https://open.shopee.com/documents/v2/v2.public.authentication_and_authorization.introduction)
- [Google Apps Script ウェブアプリ](https://developers.google.com/apps-script/guides/web)

## 🆘 サポート

問題が解決しない場合：

1. `checkTokenInfo()`でトークン状態を確認
2. ログを確認（「表示」→「ログ」）
3. Shopee Open Platformのステータスを確認

---

**作成者**: Claude Code
**最終更新**: 2026-01-09
