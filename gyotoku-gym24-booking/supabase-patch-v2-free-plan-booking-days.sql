-- 行徳ジム24：無料プランを含む予約可能期間を2週間先までに統一
-- 新しいSupabaseプロジェクトのSQL Editorで1回実行してください。

update public.fs_plan_settings
set booking_days = 14
where plan_code in ('free', 'standard', 'premium');

-- 確認
select plan_code, monthly_quota, use_minutes, adults_allowed,
       concurrent_limit, daily_limit, booking_days,
       booking_deadline_minutes, cancellation_deadline_minutes
from public.fs_plan_settings
order by plan_code;
