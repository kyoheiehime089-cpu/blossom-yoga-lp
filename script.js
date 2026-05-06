document.addEventListener('DOMContentLoaded', () => {
  const reserveBtn = document.getElementById('reserveBtn');

  if (!reserveBtn) return;

  reserveBtn.addEventListener('click', (event) => {
    event.preventDefault();
    window.alert('体験予約ありがとうございます。24時間以内にご連絡いたします。');
  });

  // Smooth scroll for anchor links
  const links = document.querySelectorAll('a[href^="#"]');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href !== '#' && document.querySelector(href)) {
        e.preventDefault();
        const target = document.querySelector(href);
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
});
