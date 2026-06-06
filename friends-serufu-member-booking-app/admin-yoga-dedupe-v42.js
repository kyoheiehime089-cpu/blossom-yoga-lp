(() => {
  function dedupeYogaRows() {
    const list = document.querySelector('#calendarList');
    if (!list) return;
    const seen = new Set();
    list.querySelectorAll('.slot-row.yoga-private, article.yoga-private').forEach((row) => {
      const btn = row.querySelector('[data-yoga-delete]');
      const id = btn && btn.getAttribute('data-yoga-delete');
      if (!id) return;
      if (seen.has(id)) {
        row.remove();
        return;
      }
      seen.add(id);
    });
  }
  window.addEventListener('DOMContentLoaded', () => {
    dedupeYogaRows();
    const list = document.querySelector('#calendarList');
    if (!list) return;
    new MutationObserver(dedupeYogaRows).observe(list, { childList: true, subtree: true });
  });
})();
