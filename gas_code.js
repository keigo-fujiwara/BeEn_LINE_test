// データ保存処理
// 保存先シート: 申込
// 列: 送信日時, 新学年, 校舎, 無料講座, 参加者氏名, 学校名, LINEユーザーID
//
// トーク以外（リッチメニューなど）から開いた申込を、公式アカウントから本人のLINEへ送るには
// スクリプト プロパティ LINE_CHANNEL_ACCESS_TOKEN にチャネルアクセストークンを設定する。
var HEADERS = ["送信日時", "新学年", "校舎", "無料講座", "参加者氏名", "学校名", "LINEユーザーID"];

function doGet(e) {
  var callback = "callback";
  if (e && e.parameter && /^[A-Za-z0-9_]+$/.test(e.parameter.callback || "")) {
    callback = e.parameter.callback;
  }
  var result;
  try {
    var data = JSON.parse((e && e.parameter && e.parameter.payload) || "{}");
    result = saveApplication(data);
  } catch (error) {
    result = { status: "error", lineSent: false, message: "送信できませんでした。もう一度お試しください。" };
  }
  return ContentService
    .createTextOutput(callback + "(" + JSON.stringify(result) + ")")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var result = saveApplication(data);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      lineSent: false,
      message: "送信できませんでした。もう一度お試しください。"
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function saveApplication(data) {
  if (!data || !data.name || !data.campus) {
    return { status: "error", lineSent: false, message: "申込内容が不足しているため、保存できませんでした。" };
  }
  var lineSent = false;
  if (data.deliverLine) {
    var pushResult = pushLineMessage(data.userId, data.messageText);
    if (!pushResult.ok) {
      return { status: "error", lineSent: false, message: pushResult.message };
    }
    lineSent = true;
  }
  appendApplication(data);
  return { status: "success", lineSent: lineSent, message: "" };
}

function appendApplication(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("申込");
  if (!sheet) {
    sheet = ss.insertSheet("申込", 0);
  }
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(1);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  } else if (!sheet.getRange(1, 7).getValue()) {
    sheet.getRange(1, 7).setValue("LINEユーザーID");
  }

  var courses = Array.isArray(data.courses) ? data.courses.join("、") : (data.courses || "");
  sheet.appendRow([
    new Date(),
    data.grade || "",
    data.campus || "",
    courses,
    data.name || "",
    data.school || "",
    data.userId || ""
  ]);
}

function pushLineMessage(userId, text) {
  var token = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
  if (!token) {
    return {
      ok: false,
      message: "LINEへ申込内容を送れませんでした。公式アカウントとのトークから開き直してください。"
    };
  }
  if (!userId || !text) {
    return {
      ok: false,
      message: "LINEへ申込内容を送れませんでした。公式アカウントとのトークから開き直してください。"
    };
  }

  var response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text: text }]
    }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) {
    return { ok: true, message: "" };
  }

  var body = response.getContentText();
  if (body.indexOf("INVALID_RECEIVER") !== -1) {
    return {
      ok: false,
      message: "この公式アカウントを友だち追加してから、もう一度申し込んでください。"
    };
  }
  return {
    ok: false,
    message: "LINEへ申込内容を送れませんでした。しばらくしてから、もう一度お試しください。"
  };
}
