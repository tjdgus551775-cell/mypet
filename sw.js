// 멍월 휴대폰 알림(웹 푸시, 2026-11-18). 대표님 관리자 알림만 받는다. 화면·파일 받기에는 끼어들지 않는다(fetch 처리 없음).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : '멍월 알림' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || '멍월 알림', {
      body: data.body || '',
      icon: 'aurora/icon-192.png?v=20261111',
      badge: 'aurora/icon-192.png?v=20261111',
      data: { url: data.url || './#/admin' },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './#/admin';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const one of list) {
        if ('focus' in one) {
          one.navigate?.(url);
          return one.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
