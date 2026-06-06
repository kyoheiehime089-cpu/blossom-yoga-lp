(() => {
  function cleanMemberNameField() {
    const input = document.querySelector('[name="memberName"]');
    if (!input) return;
    input.required = true;
    input.removeAttribute('placeholder');
    const label = input.closest('label');
    if (label && label.firstChild) label.firstChild.textContent = '会員名（必須）';
  }
  window.addEventListener('DOMContentLoaded', () => {
    cleanMemberNameField();
    setInterval(cleanMemberNameField, 500);
  });
})();
