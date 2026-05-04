document.addEventListener('DOMContentLoaded', () => {
  const reserveBtn = document.getElementById('reserveBtn');

  if (!reserveBtn) return;

  reserveBtn.addEventListener('click', () => {
    window.alert('体験予約を受け付けました。担当者より24時間以内にご連絡します。');
  });
});
