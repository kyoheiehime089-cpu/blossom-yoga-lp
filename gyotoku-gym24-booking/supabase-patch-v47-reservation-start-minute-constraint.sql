-- v47: 深夜・早朝の自由予約枠（23:20〜24:00 など）を fs_reservations に保存できるようにする
-- Supabase SQL Editorで実行してください。
--
-- 事前確認用SQL（ユーザー依頼の確認項目）:
-- select
--   conname,
--   pg_get_constraintdef(oid)
-- from pg_constraint
-- where conname = 'fs_reservations_start_minute_check';
--
-- 仕様:
-- - fs_reservations.start_minute は「0時からの経過分」で保存します。
-- - 例: 23:20 は 23 * 60 + 20 = 1400、00:10 は 10、08:10 は 490。
-- - セルフ予約は 40分利用 + 10分入れ替えのため、同日内で開始できる最終時刻は 23:20 (1400) です。
-- - 既存の重複チェック（fs_self_reservation_overlaps / fs_member_create_reservation 等）は変更しません。

alter table public.fs_reservations
  drop constraint if exists fs_reservations_start_minute_check;

alter table public.fs_reservations
  add constraint fs_reservations_start_minute_check
  check (start_minute >= 0 and start_minute <= 1400);

-- 管理画面の利用不可枠も同じ自由予約開始時刻を閉じられるように揃えます。
alter table public.fs_closed_slots
  drop constraint if exists fs_closed_slots_start_minute_check;

alter table public.fs_closed_slots
  add constraint fs_closed_slots_start_minute_check
  check (start_minute >= 0 and start_minute <= 1400);
