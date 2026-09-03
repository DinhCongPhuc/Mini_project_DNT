/**
 * app.js — logic chính của ứng dụng.
 *
 * Endpoint đồng bộ dùng httpbin.org làm ĐIỂM DEMO (chỉ echo lại dữ liệu
 * gửi lên, không lưu trữ thật). Khi triển khai thực tế, đổi SYNC_ENDPOINT
 * sang API backend thật của bạn (ví dụ: https://api.vku.edu.vn/surveys).
 */
const SYNC_ENDPOINT = "https://httpbin.org/post";

const els = {
  netStatus: document.getElementById("netStatus"),
  netStatusText: document.getElementById("netStatusText"),
  tabForm: document.getElementById("tabForm"),
  tabLog: document.getElementById("tabLog"),
  formView: document.getElementById("formView"),
  logView: document.getElementById("logView"),
  logCount: document.getElementById("logCount"),
  surveyForm: document.getElementById("surveyForm"),
  photo: document.getElementById("photo"),
  photoPreview: document.getElementById("photoPreview"),
  photoPrompt: document.getElementById("photoPrompt"),
  recordList: document.getElementById("recordList"),
  emptyState: document.getElementById("emptyState"),
  syncBtn: document.getElementById("syncBtn"),
  toast: document.getElementById("toast"),
};

let pendingPhotoBlob = null;

/* ---------------- Toast ---------------- */
let toastTimer = null;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

/* ---------------- Tabs ---------------- */
function switchView(viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(viewId).classList.add("active");
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelector(`.tab-btn[data-view="${viewId}"]`).classList.add("active");
  if (viewId === "logView") renderLog();
}
els.tabForm.addEventListener("click", () => switchView("formView"));
els.tabLog.addEventListener("click", () => switchView("logView"));

/* ---------------- Online / offline status ---------------- */
function updateNetStatus() {
  const online = navigator.onLine;
  els.netStatus.classList.toggle("online", online);
  els.netStatus.classList.toggle("offline", !online);
  els.netStatusText.textContent = online ? "Trực tuyến" : "Ngoại tuyến";
  els.syncBtn.disabled = !online;
  if (online) attemptSync();
}
window.addEventListener("online", updateNetStatus);
window.addEventListener("offline", updateNetStatus);

/* ---------------- Photo preview ---------------- */
els.photo.addEventListener("change", () => {
  const file = els.photo.files[0];
  if (!file) {
    pendingPhotoBlob = null;
    els.photoPreview.style.display = "none";
    els.photoPrompt.textContent = "Chạm để chụp hoặc chọn ảnh";
    return;
  }
  pendingPhotoBlob = file;
  const url = URL.createObjectURL(file);
  els.photoPreview.src = url;
  els.photoPreview.style.display = "block";
  els.photoPrompt.textContent = file.name;
});

/* ---------------- Submit form ---------------- */
els.surveyForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const priorityInput = els.surveyForm.querySelector('input[name="priority"]:checked');
  if (!els.surveyForm.reportValidity() || !priorityInput) {
    if (!priorityInput) showToast("Vui lòng chọn mức độ ưu tiên");
    return;
  }

  const record = {
    building: document.getElementById("building").value,
    room: document.getElementById("room").value.trim(),
    issueType: document.getElementById("issueType").value,
    priority: priorityInput.value,
    description: document.getElementById("description").value.trim(),
    inspector: document.getElementById("inspector").value.trim(),
    photo: pendingPhotoBlob || null,
    status: "pending",
    createdAt: Date.now(),
    syncedAt: null,
  };

  try {
    await window.SurveyDB.addRecord(record);
    els.surveyForm.reset();
    els.photoPreview.style.display = "none";
    els.photoPrompt.textContent = "Chạm để chụp hoặc chọn ảnh";
    pendingPhotoBlob = null;

    showToast(navigator.onLine ? "Đã lưu — đang đồng bộ..." : "Đã lưu trên máy (ngoại tuyến)");
    switchView("logView");

    if (navigator.onLine) attemptSync();
    else registerBackgroundSync();
  } catch (err) {
    console.error(err);
    showToast("Lỗi khi lưu phiếu. Thử lại nhé.");
  }
});

/* ---------------- Background Sync registration ---------------- */
async function registerBackgroundSync() {
  if (!("serviceWorker" in navigator) || !("SyncManager" in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register("sync-survey-records");
  } catch (err) {
    // Background Sync có thể không được hỗ trợ/permission — sẽ dựa vào
    // sự kiện 'online' và nút "Đồng bộ ngay" làm phương án dự phòng.
    console.warn("Không thể đăng ký Background Sync:", err);
  }
}

/* ---------------- Manual / automatic sync ---------------- */
let isSyncing = false;

async function attemptSync() {
  if (isSyncing || !navigator.onLine) return;
  isSyncing = true;
  els.syncBtn.textContent = "Đang đồng bộ...";
  els.syncBtn.disabled = true;

  try {
    const pending = await window.SurveyDB.getPendingRecords();
    let syncedCount = 0;

    for (const record of pending) {
      const ok = await syncOne(record);
      if (ok) syncedCount++;
    }

    if (syncedCount > 0) {
      showToast(`Đã đồng bộ ${syncedCount} phiếu`);
      renderLog();
    }
  } finally {
    isSyncing = false;
    els.syncBtn.textContent = "Đồng bộ ngay";
    els.syncBtn.disabled = !navigator.onLine;
  }
}

async function syncOne(record) {
  try {
    // Gửi phần dữ liệu dạng JSON (ảnh Blob không gửi trong demo này để
    // giữ endpoint demo đơn giản; ở backend thật nên dùng multipart/form-data).
    const payload = {
      building: record.building,
      room: record.room,
      issueType: record.issueType,
      priority: record.priority,
      description: record.description,
      inspector: record.inspector,
      createdAt: record.createdAt,
      hasPhoto: !!record.photo,
    };

    const res = await fetch(SYNC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    await window.SurveyDB.updateRecordStatus(record.id, "synced");
    return true;
  } catch (err) {
    console.warn("Đồng bộ thất bại cho bản ghi", record.id, err);
    return false;
  }
}

els.syncBtn.addEventListener("click", attemptSync);

/* ---------------- Render log ---------------- */
function fmtDate(ts) {
  return new Date(ts).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function renderLog() {
  const records = await window.SurveyDB.getAllRecords();
  els.logCount.textContent = records.length ? `(${records.length})` : "";

  if (records.length === 0) {
    els.recordList.innerHTML = "";
    els.emptyState.style.display = "block";
    return;
  }
  els.emptyState.style.display = "none";

  els.recordList.innerHTML = "";
  for (const r of records) {
    const card = document.createElement("div");
    card.className = "record" + (r.status === "synced" ? " synced" : "");

    let photoHTML = "";
    if (r.photo) {
      const url = URL.createObjectURL(r.photo);
      photoHTML = `<img class="record-photo" src="${url}" alt="Ảnh hiện trường" />`;
    }

    card.innerHTML = `
      <div class="record-top">
        <div>
          <div class="record-title">${escapeHTML(r.building)} — ${escapeHTML(r.room)}</div>
          <div class="record-meta">${escapeHTML(r.issueType)} · Ưu tiên ${escapeHTML(r.priority)} · #${r.id} · ${fmtDate(r.createdAt)}</div>
        </div>
        <span class="record-status">${r.status === "synced" ? "Đã đồng bộ" : "Chờ đồng bộ"}</span>
      </div>
      <p class="record-desc">${escapeHTML(r.description)}</p>
      ${photoHTML}
      <div class="record-actions">
        <button data-action="delete" data-id="${r.id}">Xoá</button>
      </div>
    `;
    els.recordList.appendChild(card);
  }
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

els.recordList.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action='delete']");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (!confirm("Xoá phiếu kiểm tra này?")) return;
  await window.SurveyDB.deleteRecord(id);
  renderLog();
});

/* ---------------- Service worker registration ---------------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Đăng ký Service Worker thất bại:", err);
    });
  });

  // Khi service worker báo đã đồng bộ xong (từ sự kiện 'sync'), cập nhật lại UI
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "SYNC_COMPLETE") {
      renderLog();
      showToast("Đã đồng bộ phiếu đang chờ");
    }
  });
}

/* ---------------- Init ---------------- */
updateNetStatus();
renderLog();
