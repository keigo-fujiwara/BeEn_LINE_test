// データ保存処理
// 保存先シート: 申込
// 列: 送信日時, 新学年, 校舎, 講座名, 日時, 参加者氏名, 学校名, LINE表示名
//
// トーク以外（リッチメニューなど）から開いた申込を、公式アカウントから本人のLINEへ送るには
// スクリプト プロパティ LINE_CHANNEL_ACCESS_TOKEN にチャネルアクセストークンを設定する。
// 友だち追加時のカードのボタンは、このLIFFを開く。
var LIFF_URL = "https://liff.line.me/2011967447-JLPxTrfL";
var HEADERS = ["送信日時", "新学年", "校舎", "講座名", "日時", "参加者氏名", "学校名", "LINE表示名"];

function doGet(e) {
  if (e && e.parameter && e.parameter.webhook === "1") {
    var last = PropertiesService.getScriptProperties().getProperty("LAST_WEBHOOK") || "";
    return ContentService.createTextOutput(last || "{\"status\":\"none\"}")
      .setMimeType(ContentService.MimeType.JSON);
  }
  reformatCourseColumn();
  if (!e || !e.parameter || !e.parameter.payload) {
    return ContentService.createTextOutput(JSON.stringify({ status: "success", version: 6 }))
      .setMimeType(ContentService.MimeType.JSON);
  }
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
    reformatCourseColumn();
    var data = JSON.parse(e.postData.contents);
    if (data && Array.isArray(data.events)) {
      handleLineWebhook(data);
      return ContentService.createTextOutput(JSON.stringify({ status: "success", version: 6 }))
        .setMimeType(ContentService.MimeType.JSON);
    }
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
    var pushResult = pushLineMessage(data.userId, data.messageText, data.flexMessage);
    if (!pushResult.ok) {
      return { status: "error", lineSent: false, message: pushResult.message };
    }
    lineSent = true;
  }
  if (!data.lineName && data.userId) {
    data.lineName = getLineDisplayName(data.userId);
  }
  appendApplication(data);
  return { status: "success", lineSent: lineSent, message: "" };
}

function getLineDisplayName(userId) {
  var token = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
  if (!token || !userId) return "";
  try {
    var response = UrlFetchApp.fetch(
      "https://api.line.me/v2/bot/profile/" + encodeURIComponent(userId),
      {
        method: "get",
        headers: { Authorization: "Bearer " + token },
        muteHttpExceptions: true
      }
    );
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) return "";
    var profile = JSON.parse(response.getContentText() || "{}");
    return profile.displayName || "";
  } catch (error) {
    return "";
  }
}

function appendApplication(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("申込");
  if (!sheet) {
    sheet = ss.insertSheet("申込", 0);
  }
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(1);
  ensureApplicationSheet(sheet);

  var courses = splitCourseLines(data.courseTitles, data.courseDatetimes, data.courses);
  sheet.appendRow([
    new Date(),
    data.grade || "",
    data.campus || "",
    courses.titles.join("\n"),
    courses.datetimes.join("\n"),
    data.name || "",
    data.school || "",
    data.lineName || ""
  ]);

  layoutCourseColumns(sheet);
}

function ensureApplicationSheet(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    return;
  }
  var headerD = String(sheet.getRange(1, 4).getValue() || "");
  var headerE = String(sheet.getRange(1, 5).getValue() || "");
  if (headerD === "無料講座" && headerE !== "日時") {
    sheet.insertColumnBefore(5);
    sheet.getRange(1, 4).setValue("講座名");
    sheet.getRange(1, 5).setValue("日時");
    splitExistingCourseColumn(sheet);
  } else if (headerD === "無料講座") {
    sheet.getRange(1, 4).setValue("講座名");
  }
  if (String(sheet.getRange(1, 8).getValue() || "") === "LINEユーザーID") {
    sheet.getRange(1, 8).clearContent();
  }
  if (String(sheet.getRange(1, 8).getValue() || "") !== "LINE表示名") {
    sheet.getRange(1, 8).setValue("LINE表示名");
  }
}

function splitExistingCourseColumn(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var range = sheet.getRange(2, 4, lastRow - 1, 2);
  var values = range.getValues();
  for (var i = 0; i < values.length; i++) {
    var split = splitCourseLines(null, null, values[i][0]);
    values[i][0] = split.titles.join("\n");
    values[i][1] = split.datetimes.join("\n");
  }
  range.setValues(values);
}

function splitCourseLines(titles, datetimes, courses) {
  var titleList = listFrom(titles);
  var timeList = listFrom(datetimes);
  if (titleList.length) {
    return { titles: titleList, datetimes: timeList };
  }
  var lines = courseLinesFrom(courses);
  var splitTitles = [];
  var splitTimes = [];
  for (var i = 0; i < lines.length; i++) {
    var parts = splitCourseLine(lines[i]);
    splitTitles.push(parts.title);
    splitTimes.push(parts.datetime);
  }
  return { titles: splitTitles, datetimes: splitTimes };
}

function splitCourseLine(line) {
  var text = String(line || "");
  var match = text.match(/^(.*)\s(\d{1,2}月\d{1,2}日（.）\d{1,2}:\d{2}-\d{1,2}:\d{2})$/);
  if (!match) return { title: text, datetime: "" };
  return { title: match[1], datetime: match[2] };
}

function listFrom(values) {
  var lines = [];
  if (Array.isArray(values)) {
    lines = values;
  } else if (values) {
    lines = String(values).split(/\n/);
  }
  var result = [];
  for (var i = 0; i < lines.length; i++) {
    var line = String(lines[i] || "").replace(/^\s+|\s+$/g, "");
    if (line) result.push(line);
  }
  return result;
}

function reformatCourseColumn() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("申込");
  if (!sheet) return 0;
  ensureApplicationSheet(sheet);
  return layoutCourseColumns(sheet);
}

function layoutCourseColumns(sheet) {
  if (sheet.getColumnWidth(4) < 280) sheet.setColumnWidth(4, 280);
  if (sheet.getColumnWidth(5) < 240) sheet.setColumnWidth(5, 240);
  if (sheet.getColumnWidth(8) < 160) sheet.setColumnWidth(8, 160);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var range = sheet.getRange(2, 4, lastRow - 1, 2);
  range.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  range.setVerticalAlignment("top");
  var values = range.getValues();
  for (var i = 0; i < values.length; i++) {
    var titleLines = String(values[i][0] || "").split("\n");
    var timeLines = String(values[i][1] || "").split("\n");
    var lineCount = Math.max(
      visualLineCount(titleLines, sheet.getColumnWidth(4)),
      visualLineCount(timeLines, sheet.getColumnWidth(5))
    );
    if (lineCount > 1) sheet.setRowHeight(i + 2, lineCount * 32);
  }
  return lastRow - 1;
}

function visualLineCount(lines, columnWidth) {
  var usable = Math.max(columnWidth - 16, 80);
  var total = 0;
  for (var i = 0; i < lines.length; i++) {
    var width = 0;
    var text = lines[i];
    for (var j = 0; j < text.length; j++) {
      width += text.charCodeAt(j) > 255 ? 13 : 7;
    }
    total += Math.max(1, Math.ceil(width / usable));
  }
  return Math.max(total, 1);
}

function courseLinesFrom(courses) {
  var lines = [];
  if (Array.isArray(courses)) {
    lines = courses;
  } else if (courses) {
    lines = String(courses).split(/\n|、/);
  }
  var result = [];
  for (var i = 0; i < lines.length; i++) {
    var line = String(lines[i] || "").replace(/^\s+|\s+$/g, "");
    if (line) result.push(line);
  }
  return result;
}

function handleLineWebhook(body) {
  var events = body.events || [];
  if (events.length === 0) {
    rememberWebhook({ status: "empty" });
    return;
  }
  for (var i = 0; i < events.length; i++) {
    handleLineEvent(events[i]);
  }
}

function handleLineEvent(event) {
  var type = event && event.type ? event.type : "";
  rememberWebhook({ status: "received", type: type });
  try {
    if (type === "follow" || isTestMessage(event)) {
      var userId = event.source && event.source.userId;
      var result = sendWelcome(event.replyToken, userId);
      result.type = type;
      rememberWebhook(result);
      return;
    }
    rememberWebhook({ status: "ignored", type: type });
  } catch (error) {
    rememberWebhook({
      status: "error",
      type: type,
      message: String(error && error.message ? error.message : error).slice(0, 180)
    });
  }
}

function isTestMessage(event) {
  if (!event || event.type !== "message" || !event.message || event.message.type !== "text") return false;
  return String(event.message.text || "").replace(/^\s+|\s+$/g, "") === "テスト";
}

function sendWelcome(replyToken, userId) {
  var messages = [buildWelcomeFlex(), buildWelcomeCard()];
  var errors = [];
  for (var i = 0; i < messages.length; i++) {
    var sent = deliverLineMessage(replyToken, userId, messages[i]);
    if (sent.ok) return { status: "sent", via: sent.via };
    if (sent.message) errors.push(sent.message);
  }
  var reason = errors.join(" / ").slice(0, 300);
  if (userId) {
    postLine("https://api.line.me/v2/bot/message/push", {
      to: userId,
      messages: [{
        type: "text",
        text: "申込カードを送れませんでした。\n" + reason + "\n" + LIFF_URL
      }]
    });
  }
  return { status: "failed", message: reason };
}

function deliverLineMessage(replyToken, userId, message) {
  if (userId) {
    var push = postLine("https://api.line.me/v2/bot/message/push", {
      to: userId,
      messages: [message]
    });
    if (push.ok) return { ok: true, via: "push" };
    var reply = replyLineMessage(replyToken, message);
    if (reply.ok) return { ok: true, via: "reply" };
    return { ok: false, message: push.message || reply.message };
  }
  var replyOnly = replyLineMessage(replyToken, message);
  return replyOnly.ok ? { ok: true, via: "reply" } : replyOnly;
}

function authorizeLineSend() {
  UrlFetchApp.fetch("https://api.line.me/", { muteHttpExceptions: true });
}

function postLine(url, payload) {
  try {
    var token = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
    if (!token) return { ok: false, message: "トークンが未設定です" };
    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) {
      return { ok: true, message: "" };
    }
    return { ok: false, message: response.getContentText().slice(0, 180) };
  } catch (error) {
    return { ok: false, message: String(error && error.message ? error.message : error).slice(0, 180) };
  }
}

function buildWelcomeCard() {
  return {
    type: "template",
    altText: "2027年度 BeEngineer 春の無料体験講座のお申し込みはこちら",
    template: {
      type: "buttons",
      title: "春の無料体験講座",
      text: "2027年度 BeEngineer。下のボタンから、校舎と講座を選んでお申し込みください。",
      actions: [
        { type: "uri", label: "申し込む", uri: LIFF_URL }
      ]
    }
  };
}

function rememberWebhook(note) {
  note.at = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty("LAST_WEBHOOK", JSON.stringify(note));
}

function buildWelcomeFlex() {
  return {
    type: "flex",
    altText: "2027年度 BeEngineer 春の無料体験講座のお申し込みはこちら",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0f9b20",
        paddingAll: "20px",
        contents: [
          { type: "text", text: "2027年度　BeEngineer", color: "#b5f6b7", size: "sm", weight: "bold", wrap: true },
          { type: "text", text: "春の無料体験講座", color: "#FFFFFF", weight: "bold", size: "xl", wrap: true, margin: "md" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        backgroundColor: "#FFFFFF",
        contents: [
          {
            type: "image",
            url: "https://keigo-fujiwara.github.io/BeEn_LINE_test/logo_color.png",
            size: "lg",
            aspectRatio: "5:2",
            aspectMode: "fit",
            align: "center"
          },
          {
            type: "text",
            text: "無料体験講座へのお申込みは下のボタンから行えます。校舎と講座をご選択ください。",
            margin: "lg",
            size: "sm",
            color: "#333333",
            wrap: true
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        backgroundColor: "#FFFFFF",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#0f9b20",
            height: "sm",
            action: {
              type: "uri",
              label: "申し込む",
              uri: LIFF_URL
            }
          }
        ]
      }
    }
  };
}

function replyLineMessage(replyToken, message) {
  try {
    var token = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
    if (!token) return { ok: false, message: "トークンが未設定です" };
    if (!replyToken) return { ok: false, message: "replyTokenがありません" };
    var response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + token },
      payload: JSON.stringify({
        replyToken: replyToken,
        messages: [message]
      }),
      muteHttpExceptions: true
    });
    if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) {
      return { ok: true, message: "" };
    }
    return { ok: false, message: response.getContentText().slice(0, 180) };
  } catch (error) {
    return { ok: false, message: String(error && error.message ? error.message : error).slice(0, 180) };
  }
}

function pushLineMessage(userId, text, flexMessage) {
  var token = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
  if (!token) {
    return {
      ok: false,
      message: "LINEへ申込内容を送れませんでした。公式アカウントとのトークから開き直してください。"
    };
  }
  if (!userId || (!text && !flexMessage)) {
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
      messages: [flexMessage && flexMessage.type ? flexMessage : { type: "text", text: text }]
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
