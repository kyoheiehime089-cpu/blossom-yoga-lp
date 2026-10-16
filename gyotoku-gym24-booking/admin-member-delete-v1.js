(() => {
  async function deleteMember(memberId, memberName, button) {
    if (!window.confirm(`本当に「${memberName}」さんの会員情報を削除しますか？\n\n削除すると、この会員はログインできなくなり、今後の予約も取り消されます。`)) return;
    button.disabled = true;
    button.textContent = '削除中…';
    try {
      if (!window.gyotokuAdminSecureRpc) throw new Error('管理者ログインを確認してください。');
      await window.gyotokuAdminSecureRpc('fs_admin_delete_member', { p_member_id: memberId });
      window.alert('会員情報を削除しました。');
      document.querySelector(`[data-member-detail="${CSS.escape(memberId)}"]`)?.remove();
      await window.loadSnapshot?.();
    } catch {
      window.alert('会員情報を削除できませんでした。管理者ログインと会員の状態を確認してください。');
      button.disabled = false;
      button.textContent = '会員情報を削除';
    }
  }
  function attachDeleteButtons() {
    document.querySelectorAll('[data-member-detail]').forEach(detail => {
      if (detail.querySelector('[data-delete-member-v1]')) return;
      const memberId = detail.dataset.memberDetail;
      const memberName = detail.querySelector('h2')?.textContent?.trim() || 'この会員';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'danger';
      button.dataset.deleteMemberV1 = '1';
      button.style.width = '100%';
      button.style.marginTop = '14px';
      button.textContent = '会員情報を削除';
      button.addEventListener('click', () => deleteMember(memberId, memberName, button));
      detail.appendChild(button);
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    attachDeleteButtons();
    new MutationObserver(attachDeleteButtons).observe(document.querySelector('#customersTab') || document.body,
      { childList: true, subtree: true });
  });
})();
