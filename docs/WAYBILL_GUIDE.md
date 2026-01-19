# Shopee配送ラベル（Waybill）ガイド

## 概要

Shopeeの配送ラベル（Waybill/AWB）は、注文を発送するために必要な配送伝票です。
このドキュメントでは、配送ラベルの発行条件、API、注意点をまとめています。

---

## 配送ラベルの種類

### First Mile vs Last Mile

| 種類 | 区間 | 用途 | API |
|------|------|------|-----|
| **First Mile** | セラー → 国内倉庫（SLS倉庫） | 国内配送用（佐川急便等） | `/api/v2/first_mile/get_waybill` |
| **Last Mile** | 国内倉庫 → 購入者 | 海外配送用（購入者宛ラベル） | `/api/v2/logistics/download_shipping_document` |

**注意**: SLSを使用する場合、セラーが印刷するのは「Last Mile」のラベルです。

---

## 配送ラベル発行の条件

### 必須条件

| 条件 | 説明 |
|------|------|
| **購入者の支払い完了** | 注文ステータスが「Unpaid」から「To Ship」に移動 |
| **Arrange Shipment完了** | Seller Centerで「Arrange Shipment」ボタンをクリック済み |
| **Tracking Number発番** | Arrange Shipment後に自動発番される |
| **Logistics API権限** | アプリにLogistics APIの権限が付与されている |

### 注文ステータスと発行可否

| 注文ステータス | Waybill発行 | 説明 |
|---------------|-------------|------|
| `UNPAID` | ❌ 不可 | 支払い待ち |
| `READY_TO_SHIP` (Arrange Shipment前) | ❌ 不可 | Tracking Number未発番 |
| `READY_TO_SHIP` (Arrange Shipment後) | ✅ 可能 | Tracking Number発番済み |
| `PROCESSED` | ✅ 可能 | 処理中（SLSでよく使用） |
| `SHIPPED` | ❌ 不可 | 既にピックアップ済み（印刷不可） |
| `COMPLETED` | ❌ 不可 | 配送完了 |
| `CANCELLED` | ❌ 不可 | キャンセル済み |

**重要**: `SHIPPED`ステータスの注文は、既にピックアップされているためAPIからラベル印刷ができません。
（エラー: `logistics.package_can_not_print: Failed to print the shipping document because the parcel has been shipped.`）

### 発行期限（DTS: Days To Ship）

```
オーダー受注後の翌日から2営業日以内に
「Arrange Shipment」ボタンを押してラベルを発行する必要あり
```

---

## Logistics API（Last Mile用）

### API呼び出しフロー

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 0-A: get_tracking_number (GET)                             │
│           → Tracking Numberを取得                               │
│           ※ Arrange Shipment完了後のみ取得可能                  │
│           ※ 空の場合はArrange Shipment未完了                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 0-B: get_shipping_document_parameter (POST)                │
│           → 利用可能なドキュメントタイプを確認                   │
│           → suggest_shipping_document_type を取得               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: create_shipping_document (POST)                         │
│         → ラベル作成タスクを開始                                │
│         ※ tracking_number と package_number が必須             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: get_shipping_document_result (POST)                     │
│         → ステータスが「READY」になるまでポーリング             │
│         → ステータス: PROCESSING / READY / FAILED               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: download_shipping_document (POST)                       │
│         → PDFファイルをダウンロード                             │
└─────────────────────────────────────────────────────────────────┘
```

### APIエンドポイント

| API | メソッド | 説明 |
|-----|---------|------|
| `/api/v2/logistics/get_tracking_number` | **GET** | Tracking Numberを取得 |
| `/api/v2/logistics/get_shipping_document_parameter` | POST | 利用可能なドキュメントタイプを取得 |
| `/api/v2/logistics/create_shipping_document` | POST | ラベル作成タスクを開始 |
| `/api/v2/logistics/get_shipping_document_result` | POST | タスクステータスを確認 |
| `/api/v2/logistics/download_shipping_document` | POST | PDFをダウンロード |

**注意**: `get_tracking_number` は **GETメソッド** です（他のLogistics APIはPOST）。

### shipping_document_type の種類

| タイプ | 説明 |
|--------|------|
| `NORMAL_AIR_WAYBILL` | 通常サイズ（A4等）のラベル |
| `THERMAL_AIR_WAYBILL` | サーマルプリンター用ラベル |
| `NORMAL_JOB_AIR_WAYBILL` | 通常サイズ（ジョブ用） |
| `THERMAL_JOB_AIR_WAYBILL` | サーマル（ジョブ用） |
| `THERMAL_UNPACKAGED_LABEL` | サーマル（梱包なしラベル）※2025年7月追加 |

---

## よくあるエラーと対処法

### `logistics.package_can_not_print` (Arrange Shipment未完了)

```
The package can not print now. Detail: The document is not yet ready for printing.
```

**原因**: Arrange Shipmentが完了していない、またはTracking Numberが発番されていない

**対処法**:
1. Seller Centerで「Arrange Shipment」をクリック
2. 数分〜数時間待ってから再試行
3. `get_tracking_number` APIでTracking Numberが取得できるか確認

### `logistics.package_can_not_print` (発送済み)

```
The package can not print now. Detail: Failed to print the shipping document because the parcel has been shipped.
```

**原因**: 注文が既にピックアップ・発送されているため、ラベル印刷ができない

**対処法**:
- このエラーは正常な動作です（発送済みの注文はラベル不要）
- システム上でスキップ処理として扱う

### `logistics.order_status_error`

```
Order status does not support awb printing.
```

**原因**: 注文ステータスがラベル印刷をサポートしていない

**対処法**: 注文ステータスを確認（COMPLETED, CANCELLEDなどは印刷不可）

### `logistics.tracking_number_invalid`

```
The tracking number is invalid.
```

**原因**: Tracking Numberがまだ発番されていない

**対処法**: Arrange Shipment完了後に再試行

### `logistics.can_not_print_jit_order`

```
This shipping channel only supports document printing in Shopee seller center
```

**原因**: このチャンネルはAPIからの印刷をサポートしていない

**対処法**: Seller Centerから手動で印刷

### `logistics.can_not_print_combine_order`

```
This order is part of a combined parcel, please use Seller Center instead.
```

**原因**: 結合注文はAPIから印刷できない

**対処法**: Seller Centerから手動で印刷

### Tracking Numberが空で返ってくる

```javascript
{"response":{"tracking_number":"","hint":""}}
```

**原因**: Arrange Shipmentが完了していない

**対処法**: Seller Centerで「Arrange Shipment」を実行

---

## カスタマイズAWBのガイドライン

### 必須要件

カスタマイズされたAWBを使用する場合、以下を遵守する必要があります：

1. **必須フィールド**: 公式ガイドラインで定められた全ての項目を含める
2. **レイアウト**: 指定のレイアウトに従う（仕分け・配送を円滑にするため）
3. **QRコード/バーコード**: Shopeeは提供しない → 自分で生成する必要あり

### FAQ

| 質問 | 回答 |
|------|------|
| デザインのカスタマイズは可能？ | 可能。ただし必須フィールドと適切な位置を守る |
| 空の必須フィールドはどうする？ | APIで空で返ってきた場合は含めなくてよい |
| Shopee標準AWBにないフィールドは？ | 標準AWBにないものは含めなくてよい |

---

## SLS発送手続きの流れ

### Step 1: 購入者の支払い完了確認
- セラーセンター > Order > My Orders
- 「Unpaid」から「To Ship」に移動したことを確認

### Step 2: 「Arrange Shipment」ボタンをクリック
- Tracking Numberが自動発番される
- 発送処理期限（DTS）までに必ず実行

### Step 3: ラストマイルラベルの印刷
- 「My Shipment」> 「Print Waybill」
- 一括印刷: 「Mass Ship」から操作

### Step 4: 発送処理
- 1オーダー = 1梱包 = 1ラベル
- シールラベルに印字
- 二重梱包（海外向け貨物を国内配送用梱包材に入れる）

---

## 重要な注意点

### ラベル貼付ルール

- **1オーダー = 1ラベル**: 同じ購入者でも複数オーダーは別々にラベル発行
- **手書き修正禁止**: 配達先住所の手書き訂正は不可
- **配送チャンネル厳守**: SLS設定商品はSLSで発送（違反すると自動キャンセル）

### 住所変更

- **発送手続き後は住所変更不可**
- 住所変更が必要な場合は、購入者にキャンセル→再注文を依頼

### 証拠写真

荷物の破損・紛失に備えて、以下を撮影しておく：
- 梱包前の商品
- 梱包後の外観
- ラベル貼付後の状態

---

## 実装例（Google Apps Script）

### 完全な配送ラベル取得フロー

```javascript
/**
 * 配送ラベルを取得（create → wait → download の一連の流れ）
 * @param {string} orderSn - 注文番号
 * @return {Blob} PDFのBlob
 */
function getShippingLabel(orderSn) {
  // Step 0-A: 注文詳細からpackage_numberを取得
  const orderDetail = getOrderDetail(orderSn);
  const packageNumber = orderDetail.package_list[0].package_number;

  // Step 0-B: Tracking Numberを取得（GETリクエスト）
  const trackingInfo = getTrackingNumber(orderSn, packageNumber);
  if (!trackingInfo.tracking_number) {
    throw new Error('Tracking Numberが見つかりません。Arrange Shipmentが完了しているか確認してください。');
  }

  // Step 0-C: ドキュメントタイプを確認
  const docParam = getShippingDocumentParameter(orderSn);
  const docType = docParam.suggest_shipping_document_type || 'THERMAL_AIR_WAYBILL';

  // Step 1: 作成タスクを開始（tracking_numberとpackage_numberが必須）
  createShippingDocument(orderSn, docType, trackingInfo.tracking_number, packageNumber);
  Utilities.sleep(1000);

  // Step 2: READYになるまで待機（最大30秒）
  for (let i = 0; i < 10; i++) {
    const result = getShippingDocumentResult(orderSn, docType);
    if (result.status === 'READY') break;
    if (result.status === 'FAILED') throw new Error('作成失敗');
    Utilities.sleep(3000); // 3秒待機
  }

  // Step 3: PDFダウンロード
  const pdfBlob = downloadShippingDocument(orderSn, docType);
  pdfBlob.setName(`${orderSn}_shipping_label.pdf`);

  return pdfBlob;
}

/**
 * Tracking Numberを取得（GETリクエスト）
 * ※ 他のLogistics APIはPOSTだが、このAPIはGET
 */
function getTrackingNumber(orderSn, packageNumber) {
  const params = {
    order_sn: orderSn,
    package_number: packageNumber
  };
  // GETリクエストでクエリパラメータとして送信
  return request('/logistics/get_tracking_number', params);
}
```

### Google Apps Script固有の注意点

```javascript
// ❌ NG: Blobのチェックに instanceof は使えない
if (response instanceof Blob) { ... }

// ✅ OK: getBytes関数の存在でBlobかどうかを判定
if (response && typeof response.getBytes === 'function') { ... }
```

### エラーハンドリングの例

```javascript
try {
  const pdfBlob = getShippingLabel(orderSn);
  // 成功時の処理
} catch (error) {
  const msg = error.message;

  if (msg.includes('Tracking Numberが見つかりません')) {
    // Arrange Shipment未完了 → スキップ
    Logger.log(`スキップ: ${orderSn} - Arrange Shipment未完了`);
  } else if (msg.includes('parcel has been shipped') || msg.includes('package_can_not_print')) {
    // 既に発送済み → スキップ
    Logger.log(`スキップ: ${orderSn} - 既に発送済み`);
  } else {
    // その他のエラー
    Logger.log(`失敗: ${orderSn} - ${msg}`);
  }
}
```

---

## 参考リンク

- [Shopee Open Platform - Logistics API](https://open.shopee.com/documents/v2/v2.logistics)
- [Shopee Open Platform - Developer Guide](https://open.shopee.com/developer-guide)
- [SLS発送手続きガイド](https://shopee.jp/edu/)

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-01-19 | 実装経験に基づく大幅更新: API呼び出しフロー修正、get_tracking_numberがGETであることを明記、SHIPPEDステータスは印刷不可であることを追記、エラーハンドリング例を追加、GAS固有の注意点を追加 |
| 2026-01-16 | 初版作成 |
