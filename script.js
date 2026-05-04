document.addEventListener('DOMContentLoaded', () => {
  const reserveBtn = document.getElementById('reserveBtn');

  reserveBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    window.alert('体験予約ありがとうございます。近日中にご案内いたします。');
  });
});
