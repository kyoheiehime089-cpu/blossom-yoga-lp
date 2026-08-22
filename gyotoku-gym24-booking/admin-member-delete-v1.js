(() => {
  const db = window.supabase.createClient(window.GYOTOKU_SUPABASE_URL, window.GYOTOKU_SUPABASE_ANON_KEY);

  function currentPassword() {
    return document.querySelector('#adminPass')?.value
      || sessionStorage.getItem('gyotoku_admin_password')
      || localStorage.getItem('gyotoku_admin_saved_password')
      || '';
  }

  async function deleteMember(memberId, memberName, button) {
    const confirmed = window.confirm(`本当に「${memberName}」さんの会員情報を削除しますか？\n\nこの操作をすると会員画面へログインできなくなり、今後の予約も取り消されます。`);
    if (!confirmed) return;

    button.disabled = true;
    button.textContent = '削除中…';
    try {
      const { data, error } = await db.rpc('fs_admin_delete_member', {
        p_admin_password: currentPassword(),
        p_member_id: memberId
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || '削除に失敗しました。');

      alert('会員情報を削除しました。');
      document.querySelector(`[data-member-detail="${CSS.escape(memberId)}"]`)?.remove();
      if (typeof window.loadSnapshot === 'function') await window.loadSnapshot();
    } catch (error) {
      alert(error?.message || '会員情報を削除できませんでした。');
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
    const target = document.querySelector('#customersTab') || document.body;
    new MutationObserver(attachDeleteButtons).observe(target, { childList: true, subtree: true });
  });
})();
