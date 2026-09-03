/**
 * sw.js — Service Worker
 *
 * Hai nhiệm vụ chính:
 * 1. Cache "app shell" (HTML/CSS/JS/icon) để app mở được ngay cả khi
 *    không có mạng — kể cả sau khi tắt hẳn trình duyệt và mở lại.
 * 2. Lắng nghe sự kiện 'sync' (Background Sync API) để tự động đẩy các
 *    phiếu đang "pending" trong IndexedDB lên server ngay khi có mạng
 *    trở lại, kể cả khi người dùng đã đóng tab.
 */

const CACHE_VERSION = "v1";
const CACHE_NAME = `vku-survey-shell-${CACHE_VERSION}`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/db.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

/* ---------------- Install: cache app shell ---------------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

/* ---------------- Activate: dọn cache phiên bản cũ ---------------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("vku-survey-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ---------------- Fetch: cache-first cho app shell ---------------- */
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Chỉ can thiệp GET request cùng origin (bỏ qua API bên ngoài như
  // httpbin.org — để request đó đi thẳng ra mạng, thất bại tự nhiên khi
  // offline và được app.js xử lý qua cơ chế "pending").
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          // Lưu thêm vào cache các tài nguyên tĩnh mới gặp (ví dụ ảnh sau này)
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => {
          // Offline và không có trong cache: nếu là điều hướng trang,
          // trả về app shell để SPA vẫn mở được.
          if (request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
    })
  );
});

/* ---------------- Background Sync: đồng bộ phiếu đang chờ ---------------- */
importScripts("js/db.js");

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-survey-records") {
    event.waitUntil(syncPendingRecords());
  }
});

const SYNC_ENDPOINT = "https://httpbin.org/post";

async function syncPendingRecords() {
  const pending = await self.SurveyDB.getPendingRecords();
  if (pending.length === 0) return;

  let syncedCount = 0;

  for (const record of pending) {
    try {
      const payload = {
        building: record.building,
        room: record.room,
        issueType: record.issueType,
        priority: record.priority,
        description: record.description,
        inspector: record.inspector,
        studentClass: record.studentClass,  
        studentId: record.studentId,  
        createdAt: record.createdAt,
        hasPhoto: !!record.photo,
      };

      const res = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await self.SurveyDB.updateRecordStatus(record.id, "synced");
        syncedCount++;
      }
    } catch (err) {
      // Vẫn còn offline hoặc lỗi mạng — Background Sync sẽ tự thử lại
      // theo cơ chế mặc định của trình duyệt (retry với backoff).
    }
  }

  if (syncedCount > 0) {
    const clientsList = await self.clients.matchAll();
    for (const client of clientsList) {
      client.postMessage({ type: "SYNC_COMPLETE", count: syncedCount });
    }
  }
}
