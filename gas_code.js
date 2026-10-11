// データ保存処理（POST）
// 保存する列: 送信日時, 学年, 性別, イベントの感想, 良かった点, その他のメッセージ, 今後参加したいイベント
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    sheet.appendRow([
      new Date(),
      data.grade,
      data.gender,
      data.satisfaction,
      data.highlight,
      data.message,
      data.future
    ]);

    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
