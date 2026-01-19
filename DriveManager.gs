/**
 * Google Drive管理クラス
 *
 * 配送ラベルPDFのアップロードと公開URL取得を管理
 */

class DriveManager {
  /**
   * コンストラクタ
   */
  constructor() {
    this.folderName = 'Shopee配送ラベル';
    this.folder = this.getOrCreateFolder();
  }

  /**
   * フォルダを取得または作成
   * @return {Folder} フォルダ
   */
  getOrCreateFolder() {
    const folders = DriveApp.getFoldersByName(this.folderName);

    if (folders.hasNext()) {
      const folder = folders.next();
      Logger.log(`既存フォルダを使用: ${this.folderName}`);
      return folder;
    }

    // 新しいフォルダを作成
    const newFolder = DriveApp.createFolder(this.folderName);
    Logger.log(`新しいフォルダを作成: ${this.folderName}`);

    return newFolder;
  }

  /**
   * PDFをアップロードして公開URLを取得
   * @param {Blob} pdfBlob - PDFのBlob
   * @param {string} orderSn - 注文番号（ファイル名用）
   * @return {string} 公開URL
   */
  uploadAndGetUrl(pdfBlob, orderSn) {
    const fileName = `${orderSn}_shipping_label.pdf`;

    // 既存のファイルがあれば削除（上書き）
    const existingFiles = this.folder.getFilesByName(fileName);
    while (existingFiles.hasNext()) {
      const file = existingFiles.next();
      file.setTrashed(true);
      Logger.log(`既存ファイルを削除: ${fileName}`);
    }

    // ファイルをアップロード
    pdfBlob.setName(fileName);
    const file = this.folder.createFile(pdfBlob);

    // 公開設定（リンクを知っている全員が閲覧可能）
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileUrl = file.getUrl();
    Logger.log(`ファイルをアップロードしました: ${fileUrl}`);

    return fileUrl;
  }

  /**
   * フォルダのURLを取得
   * @return {string} フォルダURL
   */
  getFolderUrl() {
    return this.folder.getUrl();
  }

  /**
   * 注文番号からファイルを検索
   * @param {string} orderSn - 注文番号
   * @return {File|null} ファイル（見つからない場合はnull）
   */
  findFileByOrderSn(orderSn) {
    const fileName = `${orderSn}_shipping_label.pdf`;
    const files = this.folder.getFilesByName(fileName);

    if (files.hasNext()) {
      return files.next();
    }

    return null;
  }

  /**
   * 注文番号からファイルURLを取得
   * @param {string} orderSn - 注文番号
   * @return {string|null} ファイルURL（見つからない場合はnull）
   */
  getFileUrlByOrderSn(orderSn) {
    const file = this.findFileByOrderSn(orderSn);

    if (file) {
      return file.getUrl();
    }

    return null;
  }
}

/**
 * テスト用：フォルダ作成
 */
function testCreateFolder() {
  const driveManager = new DriveManager();
  Logger.log(`フォルダURL: ${driveManager.getFolderUrl()}`);
}

/**
 * テスト用：サンプルPDFアップロード
 */
function testUploadSamplePdf() {
  const blob = Utilities.newBlob('サンプルPDF内容', 'application/pdf', 'test_label.pdf');
  const driveManager = new DriveManager();
  const url = driveManager.uploadAndGetUrl(blob, 'TEST_ORDER_123');
  Logger.log(`アップロード完了: ${url}`);
}
