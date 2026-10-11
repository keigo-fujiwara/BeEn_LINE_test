// データ保存処理（POST）
// 保存先シート: 申込
// 列: 送信日時, 新学年, 校舎, 無料講座, 参加者氏名, 学校名
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("申込");
    if (!sheet) {
      sheet = ss.insertSheet("申込");
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["送信日時", "新学年", "校舎", "無料講座", "参加者氏名", "学校名"]);
    }

    var courses = Array.isArray(data.courses) ? data.courses.join("、") : (data.courses || "");
    sheet.appendRow([
      new Date(),
      data.grade,
      data.campus,
      courses,
      data.name,
      data.school
    ]);

    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
