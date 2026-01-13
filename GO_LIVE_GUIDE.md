# Go Live ガイド - Shopee Open Platformアプリ申請

このガイドでは、Shopee Open PlatformでAppを作成し、Go Live申請を行う手順を説明します。

## 📋 Go Live申請の流れ

```
1. Shopee Open Platformでアプリ作成
   ↓
2. Go Live申請
   - アプリ情報入力
   - IT資産申告
   - 審査（24時間）
   ↓
3. Go Live承認
   - Live Partner ID & Live Key取得
   ↓
4. GASで設定・認証
   ↓
5. 本番稼働開始
```

## 🚀 Step 1: Shopee Open Platformでアプリを作成

### 1-1: アカウント登録

1. [Shopee Open Platform](https://open.shopee.com/)にアクセス
2. 「Register」をクリック
3. 開発者アカウントタイプを選択：
   - **Third-party Partner Platform (ISV)**: 複数のセラーにサービスを提供
   - **Registered Business Seller**: ビジネス登録済みセラー
   - **Individual Seller**: 個人セラー

### 1-2: アプリを作成

1. [Shopee Open Platform Console](https://open.shopee.com/console)にログイン
2. 「Create App」をクリック
3. アプリ情報を入力：

#### Basic Information

| 項目 | 説明 | 例 |
|------|------|-----|
| **App Type** | アプリのタイプ | Order Management |
| **App Name** | アプリ名 | My Order Manager |
| **App Description** | アプリの説明 | Shopee注文を自動管理するシステム |
| **App Logo** | ロゴ画像（任意） | 512x512px推奨 |

#### App Type（用途別）

- **ERP System**: 販売管理全般（在庫、注文、商品など）
- **Order Management**: 注文管理のみ
- **Product Management**: 商品管理のみ
- **Accounting and Finance**: 会計・財務管理
- **Marketing**: マーケティング
- **Seller In-house System**: 自社ショップ専用

4. 「Submit」をクリック

⚠️ **重要**: この時点ではまだ本番環境は使用できません。Go Live申請が必要です。

## 📝 Step 2: Go Live申請

### 2-1: アプリ情報を完成させる

1. Shopee Open Platform Consoleでアプリを選択
2. 「Edit」をクリック
3. 以下の情報を入力・更新：

#### 必須情報

| 項目 | 説明 |
|------|------|
| **App Name** | 正式なアプリ名（本番用） |
| **App Description** | 詳細な説明（何ができるか、どう使うか） |
| **App Logo** | ロゴ画像（**必須**） |
| **Support Email** | サポート用メールアドレス |
| **Privacy Policy URL** | プライバシーポリシーのURL |
| **Terms of Service URL** | 利用規約のURL |

### 2-2: IT資産の申告（Declaration of IT Assets）

1. アプリ詳細ページで「Declaration of IT Assets」を選択
2. 以下の情報を入力：

#### Server Location（サーバーの場所）

**Google Apps Scriptの場合**:
- **選択**: Google Cloud Platform
- **説明**: "Using Google Apps Script with Google-managed infrastructure"

#### IP Address（IPアドレス）

GASは動的IPアドレスを使用するため：

1. 「IP address(es) unavailable」を選択
2. **理由を記載**（英語）:
   ```
   Using Google Apps Script which runs on Google's managed
   infrastructure with dynamic IP addresses.
   We do not have static IP addresses to declare.
   ```

#### Domain（ドメイン）

**GASのWebアプリURL**を入力:
```
https://script.google.com
```

### 2-3: Go Live申請を提出

1. アプリ詳細ページで「Go Live」をクリック
2. 申請フォームを入力：

| 項目 | 説明 | 例 |
|------|------|-----|
| **Business Model** | ビジネスモデルの説明 | "Provide order management automation for Shopee sellers" |
| **Target Audience** | ターゲットユーザー | "Shopee sellers in Singapore" |
| **Key Features** | 主要機能（箇条書き） | - Automatic order retrieval<br>- Excel/Spreadsheet management<br>- Slack notifications |
| **Screenshots** | スクリーンショット（推奨） | システムの画面キャプチャ |

3. 利用規約に同意
4. 「Submit for Review」をクリック

### 2-4: 審査を待つ

- **審査期間**: 通常24時間以内
- **メール通知**: 審査結果がメールで届きます
- **ステータス確認**: Open Platform Consoleでステータスを確認できます

#### 審査中のステータス

- **Developing**: 開発中（Go Live申請前）
- **Under Review**: 審査中
- **Online**: 承認済み（本番環境使用可能）

⚠️ **審査が却下された場合**:
1. 却下理由をメールで確認
2. 必要な情報を追加・修正
3. 再申請

## ✅ Step 3: Go Live承認後の設定

### 3-1: Live Partner IDとLive Keyを取得

1. Go Live承認のメールを確認
2. Shopee Open Platform Consoleでアプリを選択
3. 「App Key」セクションで以下を確認：
   - **Live Partner ID**
   - **Live Key**
4. これらの値を安全にメモ

⚠️ **重要**: Live KeyはAPI認証に使用する重要な情報です。絶対に公開しないでください。

### 3-2: GASでLive設定

#### 方法A: Config.gsで設定

`Config.gs`を開いて設定：

```javascript
const CONFIG = {
  SHOPEE: {
    PARTNER_ID: '789012',        // Live Partner ID
    PARTNER_KEY: 'your_live_key' // Live Key
  }
};
```

#### 方法B: スクリプトプロパティで設定（推奨）

1. GASエディタで「プロジェクトの設定」→「スクリプト プロパティ」
2. 以下を追加：
   - `SHOPEE_PARTNER_ID`: Live Partner ID
   - `SHOPEE_PARTNER_KEY`: Live Key

### 3-3: 認証フローを実行

⚠️ **重要**: 本番環境で新しいAccess Tokenが必要です。

1. Webアプリをデプロイ（まだの場合）
2. 認証URLを生成：
   ```javascript
   generateAuthUrl("https://script.google.com/macros/s/xxx/exec");
   ```
3. 生成された認証URLをブラウザで開く
4. 本番Shopeeアカウントでログイン
5. 「Confirm Authorization」をクリック
6. トークン情報を確認：
   ```javascript
   checkTokenInfo();
   ```

### 3-4: テスト実行

1. テスト実行：
   ```javascript
   testRun();
   ```

2. 以下を確認：
   - ✅ 本番の注文データが取得できるか
   - ✅ スプレッドシートに正しく書き込まれるか
   - ✅ Slack通知が届くか

3. トリガーを設定：
   ```javascript
   setupAllTriggers();
   ```

## 🔐 セキュリティに関する注意

### Partner KeyとAccess Tokenの管理

- **絶対に公開しないでください**
- スクリプトプロパティで管理（推奨）
- GitHubなどにアップロードしない
- `.gitignore`にConfig.gsを追加

### 本番データの取り扱い

- 本番データは顧客情報を含みます
- プライバシーポリシーに従って管理
- テスト目的でむやみに本番データを使用しない

## 📊 アプリステータスと制限

Go Live承認後も、アプリのステータスによって制限があります：

| ステータス | 説明 | 制限 |
|----------|------|------|
| **Online** | 正常稼働 | なし |
| **New App authorizations restricted** | 新規認証制限 | 新しいショップの認証不可 |
| **API calls restricted** | API呼び出し制限 | API呼び出し不可 |
| **Suspended** | 停止 | すべての機能停止 |

⚠️ **ポリシー違反に注意**: Shopee Open Platformのポリシーに違反すると、アプリが制限または停止される可能性があります。

## 🚨 トラブルシューティング

### Go Live申請が却下された

**原因**: 申請内容が不十分または不適切

**対処法**:
1. 却下理由をメールで確認
2. 必要な情報を追加・修正
3. 再申請

### 認証エラー「error_auth」

**原因**: Partner IDまたはPartner Keyが間違っている

**対処法**:
1. Open Platform ConsoleでLive Partner IDとLive Keyを再確認
2. GASの設定を更新
3. 再度認証

### 本番データが取得できない

**原因1**: Access Tokenが期限切れ

**対処法**:
```javascript
checkTokenInfo(); // 確認
refreshAccessToken(); // 更新
```

**原因2**: アプリステータスが制限されている

**対処法**:
1. Open Platform Consoleでアプリステータスを確認
2. 制限されている場合、原因をメールで確認
3. 問題を解決してステータスの復旧を依頼

## 📚 参考資料

- [Shopee Open Platform - App Management](https://open.shopee.com/developer-guide/10)
- [Shopee Open Platform Console](https://open.shopee.com/console)
- [API Documentation](https://open.shopee.com/documents/v2/)
- [Developer Guide](https://open.shopee.com/developer-guide)

## ✅ チェックリスト

### アプリ作成

- [ ] Shopee Open Platformアカウント登録
- [ ] アプリ作成
- [ ] App Type選択
- [ ] App Name, Description, Logo設定

### Go Live申請

- [ ] アプリ情報完成（Name, Description, Logo, Support Email）
- [ ] Privacy Policy URL設定
- [ ] Terms of Service URL設定
- [ ] IT資産申告完了
- [ ] Go Live申請提出
- [ ] 審査承認待ち（24時間）

### 本番環境セットアップ

- [ ] Live Partner IDとLive Key取得
- [ ] GASで設定
- [ ] Webアプリデプロイ
- [ ] 本番環境で認証
- [ ] テスト実行
- [ ] トリガー設定
- [ ] 本番稼働開始

---

**作成者**: Claude Code
**最終更新**: 2026-01-09
