// GitHub Actionsの envsubst によりビルド時に環境変数が注入されます
const LIFF_ID = "$LIFF_ID";
const GAS_URL = "$GAS_URL";

function updateStatus(msg) {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.innerText = msg;
  }
}

window.addEventListener("DOMContentLoaded", () => {
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
      document.getElementById("consent-step").style.display = "block";
    })
    .catch(err => {
      showError(`初期化エラー: ${err.message || err}`);
    });
});

function showSurveyStep(stepNumber) {
  document.querySelectorAll(".step").forEach(step => {
    step.classList.toggle("is-active", step.dataset.step === String(stepNumber));
  });
}

document.querySelectorAll(".step[data-required='true']").forEach(step => {
  const nextBtn = step.querySelector(".next-btn");
  step.querySelectorAll("input[type='radio']").forEach(radio => {
    radio.addEventListener("change", () => {
      step.querySelectorAll(".choice").forEach(choice => choice.classList.remove("is-selected"));
      radio.closest(".choice").classList.add("is-selected");
      nextBtn.disabled = false;
    });
  });
});

document.querySelectorAll(".next-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    showSurveyStep(Number(btn.closest(".step").dataset.step) + 1);
  });
});

document.getElementById("start-btn").onclick = function() {
  document.getElementById("consent-step").style.display = "none";
  document.getElementById("survey-form").style.display = "block";
  showSurveyStep(1);
};

document.getElementById("survey-form").onsubmit = function(e) {
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  const grade = data.get("grade") || "";
  const gender = data.get("gender") || "";
  const satisfaction = data.get("satisfaction") || "";

  if (!grade || !gender || !satisfaction) {
    showSurveyStep(!grade ? 1 : !gender ? 2 : 3);
    return;
  }

  const btn = document.getElementById("submit-btn");
  btn.disabled = true;
  btn.innerText = "送信中...";

  const payload = {
    grade: grade,
    gender: gender,
    satisfaction: satisfaction,
    highlight: data.get("highlight") || "",
    message: data.get("message") || "",
    future: data.get("future") || ""
  };

  fetch(GAS_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  })
  .then(() => {
    document.getElementById("status").style.display = "none";
    document.getElementById("survey-form").style.display = "none";
    document.getElementById("done-step").style.display = "block";
  })
  .catch(() => {
    showError("送信できませんでした。もう一度お試しください。");
    btn.disabled = false;
    btn.innerText = "送信する";
  });
};

document.getElementById("back-btn").onclick = function() {
  if (typeof liff !== "undefined" && liff.isInClient && liff.isInClient()) {
    liff.closeWindow();
    return;
  }
  history.back();
};

function showError(msg) {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.className = "error-msg";
    statusEl.innerText = msg;
    statusEl.style.display = "block";
  }
}