// 行徳ジム24：管理画面を無料プランのみに固定（2026-07-29）
// 会員・予約・ヨガ連携など、プラン以外の処理は変更しない。
(function () {
  function forceFreePlanSelects(root) {
    (root || document).querySelectorAll('select[name="plan"]').forEach(function (select) {
      if (select.options.length !== 1 || select.options[0].value !== 'free') {
        select.innerHTML = '<option value="free">無料プラン</option>';
      }
      select.value = 'free';
    });
  }

  if (typeof planLabel === 'function') {
    planLabel = function () { return '無料プラン'; };
  }

  if (typeof lineMessage === 'function') {
    lineMessage = function (member) {
      return `行徳ジム24の会員登録が完了しました。\n\n下記URLから予約画面にログインできます。\n\n【会員用URL】\n${loginUrl(member)}\n\n【会員ID】\n${member.member_code}\n\n【ログインPIN】\n${member.pin}\n\n【プラン】\n無料プラン\n\n無料プランは1回40分・月8回まで・同時予約1枠までです。`;
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    forceFreePlanSelects(document);
    const target = document.querySelector('#adminView') || document.body;
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) forceFreePlanSelects(node);
        });
      });
    }).observe(target, { childList: true, subtree: true });
  });
})();
