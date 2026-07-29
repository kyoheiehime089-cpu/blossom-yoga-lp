// 行徳ジム24：無料プラン一本化（2026-07-29）
// 変更対象はプラン表示と無料プランの予約条件だけ。ヨガ連携・予約競合判定等には触れない。
(function () {
  // 会員画面では常に無料プランとして表示する。
  if (typeof rule === 'function') {
    rule = function () {
      return {
        ...(DEFAULT_RULES.free || {}),
        ...(snapshot?.plan_settings || {}),
        plan_code: 'free',
        label: '無料プラン'
      };
    };
  }
})();
