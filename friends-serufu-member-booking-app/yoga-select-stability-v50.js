(() => {
  const isYogaSelect = (el) => el && (el.id === 'yogaStart' || el.id === 'yogaEnd');
  let activeUntil = 0;
  const now = () => Date.now();
  const markActive = () => { activeUntil = now() + 30000; };
  const releaseSoon = () => { activeUntil = Math.max(activeUntil, now() + 800); };
  const isActive = () => now() < activeUntil || isYogaSelect(document.activeElement);

  const originalSetInterval = window.setInterval.bind(window);
  window.setInterval = (fn, delay, ...args) => {
    if (typeof fn !== 'function') return originalSetInterval(fn, delay, ...args);
    return originalSetInterval(() => {
      if (isActive()) return;
      fn(...args);
    }, delay);
  };

  document.addEventListener('touchstart', (e) => { if (isYogaSelect(e.target)) markActive(); }, true);
  document.addEventListener('pointerdown', (e) => { if (isYogaSelect(e.target)) markActive(); }, true);
  document.addEventListener('mousedown', (e) => { if (isYogaSelect(e.target)) markActive(); }, true);
  document.addEventListener('focusin', (e) => { if (isYogaSelect(e.target)) markActive(); }, true);
  document.addEventListener('change', (e) => { if (isYogaSelect(e.target)) releaseSoon(); }, true);
  document.addEventListener('blur', (e) => { if (isYogaSelect(e.target)) releaseSoon(); }, true);
})();
