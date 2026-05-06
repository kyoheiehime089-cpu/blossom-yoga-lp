document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('.reserve-form');

  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    window.alert('予約リクエストありがとうございます。空席状況を確認してメールでご連絡します。');
    form.reset();
  });
});
