document.addEventListener('DOMContentLoaded', () => {
  const reserveBtn = document.getElementById('reserveBtn');
  const anchorLinks = document.querySelectorAll('a[href^="#"]');

  anchorLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      const href = link.getAttribute('href');
      const target = href && document.querySelector(href);

      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  if (!reserveBtn) return;

  reserveBtn.addEventListener('click', (event) => {
    event.preventDefault();
    window.alert('体験予約ありがとうございます。24時間以内に日程候補をご連絡いたします。');
  });
});
