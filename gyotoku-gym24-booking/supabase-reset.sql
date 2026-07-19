-- friendsセルフ予約アプリ Supabase リセットSQL
-- 途中まで作られた古いテーブル／関数を削除します。
-- 本番データが入っている場合は実行しないでください。

-- functions
DROP FUNCTION IF EXISTS fs_admin_grant_slot(text, uuid) CASCADE;
DROP FUNCTION IF EXISTS fs_admin_mark_purchase_billed(text, uuid) CASCADE;
DROP FUNCTION IF EXISTS fs_admin_open_slot(text, uuid) CASCADE;
DROP FUNCTION IF EXISTS fs_admin_close_slot(text, date, int, text) CASCADE;
DROP FUNCTION IF EXISTS fs_admin_cancel_reservation(text, uuid) CASCADE;
DROP FUNCTION IF EXISTS fs_admin_create_reservation(text, uuid, date, int, text, text) CASCADE;
DROP FUNCTION IF EXISTS fs_admin_delete_member(text, uuid) CASCADE;
DROP FUNCTION IF EXISTS fs_admin_update_member(text, uuid, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS fs_admin_create_member(text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS fs_admin_snapshot(text) CASCADE;
DROP FUNCTION IF EXISTS fs_member_purchase_slot(text, text) CASCADE;
DROP FUNCTION IF EXISTS fs_member_cancel_reservation(text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS fs_member_create_reservation(text, text, date, int, text, text) CASCADE;
DROP FUNCTION IF EXISTS fs_member_snapshot(text, text) CASCADE;
DROP FUNCTION IF EXISTS fs_member_by_login(text, text) CASCADE;
DROP FUNCTION IF EXISTS fs_slot_blocked(date, int) CASCADE;
DROP FUNCTION IF EXISTS fs_extra_slots(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS fs_plan_quota(text) CASCADE;
DROP FUNCTION IF EXISTS fs_is_admin(text) CASCADE;

-- tables
DROP TABLE IF EXISTS slot_purchases CASCADE;
DROP TABLE IF EXISTS closed_slots CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS members CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;
