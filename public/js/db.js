/**
 * db.js — Lớp bọc (wrapper) cho IndexedDB.
 *
 * Vì sao dùng IndexedDB thay vì localStorage?
 * - localStorage chỉ lưu được chuỗi text, giới hạn ~5MB, và là API đồng bộ
 *   (chặn luồng chính -> giật lag khi lưu dữ liệu lớn).
 * - IndexedDB là API bất đồng bộ (không chặn UI), lưu được đối tượng có cấu
 *   trúc (object) lẫn Blob (ảnh) trực tiếp, với dung lượng hàng chục/hàng
 *   trăm MB tuỳ trình duyệt — phù hợp để lưu phiếu khảo sát kèm ảnh khi
 *   offline.
 */

const DB_NAME = "vku-field-survey";
const DB_VERSION = 1;
const STORE_NAME = "records";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Chạy khi DB được tạo lần đầu hoặc cần nâng cấp schema (đổi DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        // Index để lọc nhanh theo trạng thái đồng bộ mà không cần quét toàn bộ
        store.createIndex("status", "status", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });

  return dbPromise;
}

/** Thêm một bản ghi mới, trả về id vừa tạo. */
async function addRecord(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Lấy toàn bộ bản ghi, mới nhất trước. */
async function getAllRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const records = req.result || [];
      records.sort((a, b) => b.createdAt - a.createdAt);
      resolve(records);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Lấy các bản ghi đang chờ đồng bộ (status === "pending"). */
async function getPendingRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("status");
    const req = index.getAll("pending");
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/** Cập nhật trạng thái của một bản ghi (ví dụ: pending -> synced). */
async function updateRecordStatus(id, status) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record) return resolve(null);
      record.status = status;
      record.syncedAt = status === "synced" ? Date.now() : record.syncedAt;
      const putReq = store.put(record);
      putReq.onsuccess = () => resolve(record);
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/** Xoá một bản ghi theo id. */
async function deleteRecord(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Expose ra phạm vi toàn cục để app.js VÀ sw.js đều dùng được.
// Dùng `self` thay vì `window` vì Service Worker không có `window`,
// nhưng `self` tồn tại ở cả hai môi trường (trong tab thường, self === window).
self.SurveyDB = {
  addRecord,
  getAllRecords,
  getPendingRecords,
  updateRecordStatus,
  deleteRecord,
};
