-- 行徳ジム24：プレミアムプランの最大同時予約数を2枠へ修正
-- 対象Supabase: https://fplvstwmsewpqwrcsqrm.supabase.co
-- このファイルだけをSQL Editorで1回実行してください。

begin;

update public.fs_plan_settings
set concurrent_limit = 2
where plan_code = 'premium';

commit;

-- 確認用
select
  plan_code,
  use_minutes,
  monthly_quota,
  concurrent_limit,
  daily_limit,
  booking_days,
  booking_deadline_minutes,
  cancellation_deadline_minutes,
  is_configured
from public.fs_plan_settings
where plan_code = 'premium';
