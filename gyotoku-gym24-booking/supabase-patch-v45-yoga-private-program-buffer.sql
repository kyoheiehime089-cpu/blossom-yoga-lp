-- v45: ヨガ個別予約は、既存の通常ヨガ・セミパーソナル枠に対して前後10分の余白で登録可能にする。
-- 例: 木曜12:00〜12:40の通常ヨガがある場合、11:10〜11:50のヨガ個別予約は登録可能。
-- Supabase SQL Editorでこのファイルを実行してください。

create or replace function public.fs_program_block_overlaps_for_yoga_private(p_date date, p_start_minute int, p_end_minute int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  dow int := extract(dow from p_date);
  s int := p_start_minute;
  -- ヨガ個別予約も終了後10分を入れ替え時間として見る。
  e int := least(1440, p_end_minute + 10);
begin
  if p_date in (
    date '2026-01-01',date '2026-01-12',date '2026-02-11',date '2026-02-23',date '2026-03-20',date '2026-04-29',date '2026-05-03',date '2026-05-04',date '2026-05-05',date '2026-05-06',date '2026-07-20',date '2026-08-11',date '2026-09-21',date '2026-09-22',date '2026-09-23',date '2026-10-12',date '2026-11-03',date '2026-11-23'
  ) then
    -- 祝日: 9:00〜9:40 ヨガ、10:00〜13:10 セミパーソナル
    return public.fs_range_overlaps(s,e,540,590) or public.fs_range_overlaps(s,e,600,800);
  end if;

  if dow = 1 then
    -- 月曜: 9:00〜9:40 ヨガ、18:30〜21:40 セミパーソナル
    return public.fs_range_overlaps(s,e,540,590) or public.fs_range_overlaps(s,e,1110,1310);
  elsif dow = 2 then
    -- 火曜: 9:00〜9:40 ヨガ、12:30〜13:10 通常ヨガ、18:30〜21:40 セミパーソナル
    return public.fs_range_overlaps(s,e,540,590) or public.fs_range_overlaps(s,e,750,800) or public.fs_range_overlaps(s,e,1110,1310);
  elsif dow = 3 then
    -- 水曜: 18:30〜21:40 セミパーソナル
    return public.fs_range_overlaps(s,e,1110,1310);
  elsif dow = 4 then
    -- 木曜: 12:00〜12:40 通常ヨガ、20:15〜21:55 セミパーソナル
    return public.fs_range_overlaps(s,e,720,770) or public.fs_range_overlaps(s,e,1215,1325);
  elsif dow = 5 then
    -- 金曜: 18:30〜21:40 セミパーソナル
    return public.fs_range_overlaps(s,e,1110,1310);
  elsif dow = 6 or dow = 0 then
    -- 土日: 8:10〜8:50 ヨガ、10:00〜13:10 セミパーソナル
    return public.fs_range_overlaps(s,e,490,540) or public.fs_range_overlaps(s,e,600,800);
  end if;

  return false;
end;
$$;

create or replace function public.fs_yoga_private_create(
  p_admin_password text,
  p_date date,
  p_start_minute int,
  p_end_minute int,
  p_member_name text default '',
  p_instructor_name text default '',
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_member text := nullif(btrim(coalesce(p_member_name,'')), '');
  clean_instructor text := nullif(btrim(coalesce(p_instructor_name,'')), '');
  clean_note text := nullif(btrim(coalesce(p_note,'')), '');
  block_end int := least(1440, p_end_minute + 10);
begin
  if not public.fs_is_admin(p_admin_password) then
    return jsonb_build_object('ok',false,'error','パスコードが違います。');
  end if;

  if p_start_minute is null or p_end_minute is null
     or p_start_minute < 0 or p_start_minute > 1430
     or p_end_minute < 10 or p_end_minute > 1440
     or p_end_minute <= p_start_minute
     or p_start_minute % 10 <> 0 or p_end_minute % 10 <> 0 then
    return jsonb_build_object('ok',false,'error','開始・終了時間は同じ日付内の10分単位で、終了を開始より後にしてください。');
  end if;

  -- ヨガ個別予約は、既存プログラム枠に対して前後10分だけ空ければ登録できる。
  -- ここでは fs_slot_blocked の50分判定を使わず、実プログラム時間＋10分バッファで判定します。
  if public.fs_program_block_overlaps_for_yoga_private(p_date,p_start_minute,p_end_minute) then
    return jsonb_build_object('ok',false,'error','この時間は固定の通常ヨガ・セミパーソナル枠と重なっています。前後10分の余白を空けてください。');
  end if;

  if public.fs_self_reservation_overlaps(p_date,p_start_minute,block_end) then
    return jsonb_build_object('ok',false,'error','この時間はセルフジム予約と重なっています。');
  end if;

  if public.fs_closed_slot_overlaps(p_date,p_start_minute,block_end) then
    return jsonb_build_object('ok',false,'error','この時間は利用不可枠と重なっています。');
  end if;

  if public.fs_external_block_overlaps(p_date,p_start_minute,block_end) then
    return jsonb_build_object('ok',false,'error','この時間は既存のヨガ個別予約と重なっています。');
  end if;

  insert into public.fs_external_blocks(date,start_minute,end_minute,source,title,member_name,instructor_name,note,created_by)
  values(p_date,p_start_minute,p_end_minute,'yoga_private','ヨガ個別予約',clean_member,clean_instructor,clean_note,'yoga_private');

  return jsonb_build_object('ok',true);
end;
$$;

grant execute on function public.fs_program_block_overlaps_for_yoga_private(date,int,int) to anon, authenticated;
grant execute on function public.fs_yoga_private_create(text,date,int,int,text,text,text) to anon, authenticated;
