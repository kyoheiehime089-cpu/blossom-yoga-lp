document.addEventListener('DOMContentLoaded', () => {
  const reserveBtn = document.getElementById('reserveBtn');

  if (!reserveBtn) return;

  reserveBtn.addEventListener('click', (event) => {
    event.preventDefault();
    window.alert('体験予約ありがとうございます。24時間以内にご連絡いたします。');
  });
});
