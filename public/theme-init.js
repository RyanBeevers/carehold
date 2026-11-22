/* Apply the saved/system theme before the app and its styles render. No inline script (CSP). */
try {
  const saved = localStorage.getItem('carehold-theme');
  const dark = saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#191b1a' : '#f4f1e9');
} catch {
  /* Storage can be blocked in private contexts; React reapplies the system default. */
}
