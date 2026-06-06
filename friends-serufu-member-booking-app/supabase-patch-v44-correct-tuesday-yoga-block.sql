-- v44: 火曜日の昼枠を 12:00〜13:40 セミパーソナル から 12:30〜13:10 通常ヨガ へ修正
-- Supabase SQL Editorでこのファイルを実行してください。

create or replace function public.fs_slot_blocked(p_date date, p_start_minute int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  dow int := extract(dow from p_date);
  s int := p_start_minute;
  e int := p_start_minute + 50;
begin
  if p_date in (
    date '2026-01-01',date '2026-01-12',date '2026-02-11',date '2026-02-23',date '2026-03-20',date '2026-04-29',date '2026-05-03',date '2026-05-04',date '2026-05-05',date '2026-05-06',date '2026-07-20',date '2026-08-11',date '2026-09-21',date '2026-09-22',date '2026-09-23',date '2026-10-12',date '2026-11-03',date '2026-11-23'
  ) then
    return s < 820 and 510 < e;
  end if;

  if dow = 1 then
    return (s < 610 and 510 < e) or (s < 1330 and 1080 < e);
  elsif dow = 2 then
    -- 火曜昼は通常ヨガ 12:30〜13:10。12:00〜13:40 セミパーソナルではありません。
    return (s < 610 and 510 < e) or (s < 790 and 750 < e) or (s < 1330 and 1080 < e);
  elsif dow = 3 then
    return s < 1330 and 1080 < e;
  elsif dow = 4 then
    return (s < 790 and 690 < e) or (s < 1315 and 1215 < e);
  elsif dow = 5 then
    return s < 1330 and 1080 < e;
  elsif dow = 6 or dow = 0 then
    return s < 820 and 460 < e;
  end if;

  return false;
end;
$$;
