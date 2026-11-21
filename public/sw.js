// Only handles push and navigation. Never cache medication data or API responses.
self.addEventListener('push', event => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch { /* Ignore malformed payload. */ }
  const title = 'A moment for care';
  const body = msg.tag === 'carehold-test' ? 'Your Carehold notification test arrived.' : 'Open Carehold to check your care schedule.';
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: '/icon-192.png', badge: '/badge-96.png',
    tag: typeof msg.tag === 'string' ? msg.tag.slice(0,100) : 'carehold-reminder',
    data: { url: '/' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients => {
    const existing = clients.find(c => new URL(c.url).origin === self.location.origin);
    return existing ? existing.focus() : self.clients.openWindow('/');
  }));
});
