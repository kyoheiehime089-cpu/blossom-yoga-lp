-- 行徳ジム24：無料プラン一本化（2026-07-29）
-- 変更対象：プラン、利用時間、月回数、同時予約数のみ。
-- ヨガ管理画面連携、予約競合判定、締切、予約可能期間、同日上限等は変更しない。

begin;

-- 既存会員も含め、全会員を無料プランへ統一する。
update public.fs_members
set plan = 'free'
where plan is distinct from 'free';

-- 無料プラン：1回40分、月8回、同時予約1枠。
update public.fs_plan_settings
set use_minutes = 40,
    monthly_quota = 8,
    concurrent_limit = 1,
    is_configured = true
where plan_code = 'free';

-- スタンダード・プレミアムは削除せず無効化し、既存DB構造との互換性を維持する。
update public.fs_plan_settings
set is_configured = false
where plan_code in ('standard', 'premium');

commit;
