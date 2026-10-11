// GitHub Actionsの envsubst によりビルド時に環境変数が注入されます
const LIFF_ID = "$LIFF_ID";
const GAS_URL = "$GAS_URL";

const GRADES = [
  "新中学１年生",
  "新中学２年生",
  "新中学３年生",
  "新高校１年生",
  "新高校２年生",
  "新高校３年生"
];

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
let CAMPUSES = [];

let returnToConfirm = false;
let coursesForCampus = "";

function updateStatus(msg) {
  const statusEl = document.getElementById("status");
  if (!statusEl) return;
  statusEl.className = "";
  statusEl.innerText = msg;
}

function showError(msg) {
  const statusEl = document.getElementById("status");
  if (!statusEl) return;
  statusEl.className = "error-msg";
  statusEl.innerText = msg;
  statusEl.style.display = "block";
  statusEl.scrollIntoView({ block: "nearest" });
}

function selectedRadio(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : "";
}

function jstTodayUtc() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = type => Number(parts.find(part => part.type === type).value);
  return Date.UTC(value("year"), value("month") - 1, value("day"));
}

function daysUntilCourse(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return (Date.UTC(year, month - 1, day) - jstTodayUtc()) / 86400000;
}

function isCourseOpen(dateStr, closeDaysBefore) {
  return daysUntilCourse(dateStr) > closeDaysBefore;
}

function formatCourseLabel(course) {
  const [year, month, day] = course.date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${course.title} ${month}月${day}日（${weekday}）${course.start}-${course.end}`;
}

async function loadCampuses() {
  const response = await fetch("courses.json?v=4");
  if (!response.ok) {
    throw new Error("講座情報を読み込めませんでした。");
  }
  const catalog = await response.json();
  const closeDaysBefore = Number(catalog.closeDaysBefore);
  const deadline = Number.isFinite(closeDaysBefore) ? closeDaysBefore : 2;
  CAMPUSES = (catalog.campuses || []).map(campus => ({
    name: campus.name,
    lineUrl: campus.lineUrl,
    courses: (campus.courses || [])
      .filter(course => isCourseOpen(course.date, deadline))
      .map(formatCourseLabel)
  })).filter(campus => campus.name && campus.courses.length > 0);
}

function findCampus(name) {
  return CAMPUSES.find(campus => campus.name === name) || null;
}

function selectedCourses() {
  const campus = findCampus(selectedRadio("campus"));
  if (!campus) return [];
  return [...document.querySelectorAll("input[name='courses']:checked")]
    .map(input => input.value)
    .filter(value => campus.courses.includes(value));
}

function readForm() {
  return {
    grade: selectedRadio("grade"),
    campus: selectedRadio("campus"),
    courses: selectedCourses(),
    name: document.getElementById("participant").value.trim(),
    school: document.getElementById("school").value.trim()
  };
}

function isStepValid(stepNumber) {
  const data = readForm();
  if (stepNumber === 1) return Boolean(data.grade);
  if (stepNumber === 2) return Boolean(data.campus);
  if (stepNumber === 3) return data.courses.length > 0;
  if (stepNumber === 4) return Boolean(data.name);
  if (stepNumber === 5) return Boolean(data.school);
  return true;
}

function refreshNav(step) {
  const nextBtn = step.querySelector(".next-btn");
  if (!nextBtn) return;
  const stepNumber = Number(step.dataset.step);
  nextBtn.disabled = !isStepValid(stepNumber);
  if (returnToConfirm && stepNumber === 2) {
    nextBtn.textContent = "無料講座を選ぶ";
  } else if (returnToConfirm) {
    nextBtn.textContent = "確認画面に戻る";
  } else if (stepNumber === 5) {
    nextBtn.textContent = "確認画面へ";
  } else {
    nextBtn.textContent = "次へ進む";
  }
}

function createChoice(type, name, value, checked) {
  const label = document.createElement("label");
  label.className = "choice";
  const input = document.createElement("input");
  input.type = type;
  input.name = name;
  input.value = value;
  input.checked = Boolean(checked);
  if (input.checked) label.classList.add("is-selected");
  const text = document.createElement("span");
  text.textContent = value;
  input.addEventListener("change", () => {
    if (type === "radio") {
      label.parentElement.querySelectorAll(".choice").forEach(choice => {
        choice.classList.remove("is-selected");
      });
      label.classList.add("is-selected");
    } else {
      label.classList.toggle("is-selected", input.checked);
    }
    refreshNav(label.closest(".step"));
  });
  label.append(input, text);
  return label;
}

function clearCourseSelections() {
  document.querySelectorAll("input[name='courses']").forEach(input => {
    input.checked = false;
    const choice = input.closest(".choice");
    if (choice) choice.classList.remove("is-selected");
  });
}

function renderCourses() {
  const campus = findCampus(selectedRadio("campus"));
  const keep = new Set(selectedCourses());
  const list = document.getElementById("course-list");
  list.replaceChildren();
  if (!campus || campus.courses.length === 0) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = "この校舎で申し込みできる無料講座はありません。";
    list.appendChild(note);
    refreshNav(document.querySelector(".step[data-step='3']"));
    return;
  }
  campus.courses.forEach(course => {
    list.appendChild(createChoice("checkbox", "courses", course, keep.has(course)));
  });
  refreshNav(document.querySelector(".step[data-step='3']"));
}

function renderConfirm() {
  const data = readForm();
  const rows = [
    ["新学年", data.grade, 1],
    ["校舎", data.campus, 2],
    ["無料講座", data.courses.join("\n"), 3],
    ["参加者氏名", data.name, 4],
    ["学校名", data.school, 5]
  ];
  const list = document.getElementById("confirm-list");
  list.replaceChildren();
  rows.forEach(([label, value, stepNumber]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "confirm-item";
    const labelEl = document.createElement("span");
    labelEl.className = "confirm-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.className = "confirm-value";
    valueEl.textContent = value;
    button.append(labelEl, valueEl);
    button.addEventListener("click", () => {
      returnToConfirm = true;
      showStep(stepNumber);
    });
    list.appendChild(button);
  });
}

function showStep(stepNumber) {
  document.getElementById("status").style.display = "none";
  document.querySelectorAll(".step").forEach(step => {
    step.classList.toggle("is-active", step.dataset.step === String(stepNumber));
  });
  if (stepNumber === 3) renderCourses();
  if (stepNumber === 6) renderConfirm();
  const active = document.querySelector(".step.is-active");
  if (active) refreshNav(active);
}

function goNext(step) {
  const stepNumber = Number(step.dataset.step);
  if (!isStepValid(stepNumber)) return;
  if (stepNumber === 2 && selectedRadio("campus") !== coursesForCampus) {
    clearCourseSelections();
  }
  if (stepNumber === 3) {
    coursesForCampus = selectedRadio("campus");
  }
  if (returnToConfirm && stepNumber === 2) {
    showStep(3);
    return;
  }
  if (returnToConfirm || stepNumber >= 5) {
    returnToConfirm = false;
    showStep(6);
    return;
  }
  showStep(stepNumber + 1);
}

function buildMessage(data) {
  const courses = data.courses.map(course => `・${course}`).join("\n");
  return [
    "【2027年度 春の無料講座 申込】",
    `新学年：${data.grade}`,
    `校舎：${data.campus}`,
    "無料講座：",
    courses,
    `参加者氏名：${data.name}`,
    `学校名：${data.school}`
  ].join("\n");
}

function showDone(campusName) {
  const campus = findCampus(campusName);
  document.getElementById("done-thanks").textContent =
    `申込ありがとうございました。${campusName}からのご連絡をお待ちください。`;
  document.getElementById("done-guide").textContent =
    `今後の詳細連絡のため、以下の【${campusName}専用LINE】を友だち追加してください。`;
  const link = document.getElementById("campus-line-link");
  link.href = campus.lineUrl;
  link.textContent = `${campusName}専用LINEを友だち追加する`;
  document.getElementById("apply-flow").style.display = "none";
  document.getElementById("status").style.display = "none";
  document.getElementById("done-step").style.display = "block";
}

function resetForm() {
  returnToConfirm = false;
  coursesForCampus = "";
  document.getElementById("apply-form").reset();
  document.querySelectorAll(".choice.is-selected").forEach(choice => {
    choice.classList.remove("is-selected");
  });
  document.getElementById("done-step").style.display = "none";
  document.getElementById("apply-flow").style.display = "block";
  showStep(1);
}

function isInvalidReceiver(err) {
  const code = err && err.code ? String(err.code) : "";
  const message = err && err.message ? String(err.message) : "";
  return code === "INVALID_RECEIVER" || /INVALID_RECEIVER|invalid receiver/i.test(message);
}

async function trySendInChat(text) {
  if (typeof liff === "undefined" || !liff.isInClient()) return false;
  const context = liff.getContext ? liff.getContext() : null;
  const inChat = context && ["utou", "group", "room"].includes(context.type);
  if (!inChat) return false;
  try {
    await liff.sendMessages([{ type: "text", text }]);
    return true;
  } catch (err) {
    if (isInvalidReceiver(err)) return false;
    if (/permission|403|FORBIDDEN/i.test(err && err.message ? err.message : "")) {
      throw new Error("LINEへ申込内容を送れませんでした。LIFFのスコープ「chat_message.write」を有効にし、トークのメッセージから開き直してください。");
    }
    throw new Error("LINEへ申込内容を送れませんでした。公式アカウントとのトークから開き直してください。");
  }
}

async function getLineUserId() {
  try {
    const context = liff.getContext ? liff.getContext() : null;
    if (context && context.userId) return context.userId;
    const profile = await liff.getProfile();
    return profile.userId || "";
  } catch (err) {
    return "";
  }
}

function requestGas(payload) {
  return new Promise((resolve, reject) => {
    const callbackName = `gasCallback_${Date.now()}`;
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("スプレッドシートに保存できませんでした。Apps Scriptを最新のコードに更新してから、もう一度お試しください。"));
    }, 8000);
    function cleanup() {
      clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    }
    window[callbackName] = result => {
      cleanup();
      resolve(result || {});
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("スプレッドシートに保存できませんでした。Apps Scriptを最新のコードに更新してから、もう一度お試しください。"));
    };
    const params = new URLSearchParams({
      callback: callbackName,
      payload: JSON.stringify(payload)
    });
    script.src = `${GAS_URL}?${params.toString()}`;
    document.body.appendChild(script);
  });
}

async function submitApplication() {
  const data = readForm();
  if (!data.grade || !data.campus || data.courses.length === 0 || !data.name || !data.school) {
    showStep(!data.grade ? 1 : !data.campus ? 2 : data.courses.length === 0 ? 3 : !data.name ? 4 : 5);
    return;
  }

  const button = document.getElementById("submit-btn");
  button.disabled = true;
  button.textContent = "送信中...";

  let sentInChat = false;
  try {
    const messageText = buildMessage(data);
    sentInChat = await trySendInChat(messageText);
    const userId = await getLineUserId();
    const result = await requestGas({
      ...data,
      userId,
      messageText,
      deliverLine: !sentInChat
    });
    if (!result || result.status !== "success") {
      const detail = result && result.message ? result.message : "";
      if (sentInChat) {
        throw new Error("LINEへは送信しましたが、スプレッドシートに保存できませんでした。Apps Scriptを最新のコードに更新してください。");
      }
      throw new Error(detail || "申込を保存できませんでした。");
    }
    showDone(data.campus);
  } catch (err) {
    const detail = err && err.message ? err.message : "送信できませんでした。もう一度お試しください。";
    if (sentInChat && detail.indexOf("スプレッドシート") === -1) {
      showError("LINEへは送信しましたが、スプレッドシートに保存できませんでした。Apps Scriptを最新のコードに更新してください。");
    } else {
      showError(detail);
    }
    button.disabled = false;
    button.textContent = "申込";
  }
}

function closeLine() {
  if (typeof liff !== "undefined" && liff.isInClient && liff.isInClient()) {
    liff.closeWindow();
    return;
  }
  history.back();
}

function setupForm() {
  const gradeList = document.getElementById("grade-list");
  GRADES.forEach(grade => gradeList.appendChild(createChoice("radio", "grade", grade, false)));

  const campusList = document.getElementById("campus-list");
  CAMPUSES.forEach(campus => campusList.appendChild(createChoice("radio", "campus", campus.name, false)));

  document.querySelectorAll(".next-btn").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      goNext(button.closest(".step"));
    });
  });

  ["participant", "school"].forEach(id => {
    document.getElementById(id).addEventListener("input", event => {
      refreshNav(event.target.closest(".step"));
    });
  });

  document.getElementById("apply-form").addEventListener("submit", event => {
    event.preventDefault();
  });
  document.getElementById("submit-btn").addEventListener("click", submitApplication);
  document.getElementById("restart-btn").addEventListener("click", resetForm);
  document.getElementById("back-btn").addEventListener("click", closeLine);
}

window.addEventListener("DOMContentLoaded", () => {
  updateStatus("講座情報を読み込み中...");
  loadCampuses()
    .then(() => {
      if (CAMPUSES.length === 0) {
        showError("現在申し込みできる無料講座はありません。");
        return;
      }
      setupForm();
      startLiff();
    })
    .catch(err => {
      showError(err && err.message ? err.message : "講座情報を読み込めませんでした。");
    });
});

function startLiff() {
  updateStatus("LINE SDK初期化中...");

  if (typeof liff === "undefined") {
    showError("エラー: LINE SDKの読み込みに失敗しました。");
    return;
  }

  liff.init({ liffId: LIFF_ID })
    .then(() => {
      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }
      document.getElementById("status").style.display = "none";
      document.getElementById("apply-flow").style.display = "block";
      showStep(1);
    })
    .catch(err => {
      showError(`初期化エラー: ${err.message || err}`);
    });
}
