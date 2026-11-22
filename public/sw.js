// Background push only. Never cache health data, private messages or API responses.
// Diagnostics send an ephemeral non-sensitive test ID only to currently open pages.
const TEST_PREFIX='carehold-test-';
async function reportTest(testId,stage) {
  if(!testId)return;
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clients)client.postMessage({type:'carehold:push-test',testId,stage});
}
self.addEventListener('push',event=>{
  let msg={};
  try{msg=event.data?event.data.json():{};}catch{/* Invalid payload: display generic copy. */}
  const tag=typeof msg.tag==='string'?msg.tag.slice(0,100):'carehold-reminder';
  const testId=/^carehold-test-[0-9a-f-]{36}$/.test(tag)?tag.slice(TEST_PREFIX.length):null;
  event.waitUntil((async()=>{
    await reportTest(testId,'received').catch(()=>{});
    try{
      await self.registration.showNotification('A moment for care',{
        body:testId?'Your Carehold notification test arrived.':'Open Carehold to check your care schedule.',
        icon:'/branding/carehold/pwa/carehold-any-light-192.png',badge:'/branding/carehold/pwa/carehold-notification-badge-96.png',tag,
        data:{url:'/'},
      });
      await reportTest(testId,'display-requested').catch(()=>{});
    }catch{
      await reportTest(testId,'display-error').catch(()=>{});
      console.error('Carehold could not request a browser notification.');
    }
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
    const existing=clients.find(c=>new URL(c.url).origin===self.location.origin);
    return existing?existing.focus():self.clients.openWindow('/');
  }));
});
