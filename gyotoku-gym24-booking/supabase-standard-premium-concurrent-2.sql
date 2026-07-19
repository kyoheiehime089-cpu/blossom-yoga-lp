-- 行徳ジム24：スタンダード・プレミアムを同時予約2枠へ修正
-- 同日は1枠のまま、別日なら2枠まで保持できます。
begin;

update public.fs_plan_settings
set concurrent_limit = 2,
    daily_limit = 1
where plan_code in ('standard', 'premium');

commit;

select
  plan_code,
  concurrent_limit,
  daily_limit
from public.fs_plan_settings
where plan_code in ('standard', 'premium')
order by plan_code;
