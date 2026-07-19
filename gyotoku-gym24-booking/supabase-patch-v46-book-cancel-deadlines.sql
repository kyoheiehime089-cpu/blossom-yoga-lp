-- v46: 会員予約締切・キャンセル締切の変更
-- 予約：開始時刻の2時間前まで
-- キャンセル：開始時刻の3時間前まで
-- Supabase SQL Editor に貼り付けて実行してください。

create or replace function fs_member_create_reservation(
  p_member_code text,
  p_pin text,
  p_date date,
  p_start_minute int,
  p_people text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m members;
  mo text := to_char(p_date,'YYYY-MM');
  q int;
  start_ts timestamp := p_date::timestamp + make_interval(mins => p_start_minute);
begin
  select * into m from fs_member_by_login(p_member_code,p_pin);
  if m.id is null then return jsonb_build_object('ok',false,'error','ログイン情報が違います。'); end if;
  if p_date < current_date or p_date >= current_date + 14 then return jsonb_build_object('ok',false,'error','予約可能期間外です。'); end if;
  if start_ts <= now() + interval '120 minutes' then return jsonb_build_object('ok',false,'error','予約は開始時刻の2時間前までです。'); end if;
  if fs_slot_blocked(p_date,p_start_minute) then return jsonb_build_object('ok',false,'error','この時間は予約できません。'); end if;
  if exists(select 1 from closed_slots where date=p_date and start_minute=p_start_minute) then return jsonb_build_object('ok',false,'error','この枠は利用不可です。'); end if;
  if exists(select 1 from reservations where date=p_date and start_minute=p_start_minute and cancelled=false) then return jsonb_build_object('ok',false,'error','この枠は予約済みです。'); end if;
  if (select count(*) from reservations where member_id=m.id and cancelled=false and (date::timestamp + make_interval(mins=>start_minute)) > now()) >= 2 then return jsonb_build_object('ok',false,'error','同時予約は最大2枠までです。'); end if;
  if (select count(*) from reservations where member_id=m.id and cancelled=false and date=p_date) >= 2 then return jsonb_build_object('ok',false,'error','同日予約は最大2枠までです。'); end if;
  q := fs_plan_quota(m.plan) + fs_extra_slots(m.id, mo);
  if (select count(*) from reservations where member_id=m.id and cancelled=false and to_char(date,'YYYY-MM')=mo) >= q then return jsonb_build_object('ok',false,'error','今月の予約上限に達しています。'); end if;
  insert into reservations(member_id,date,start_minute,people,note,created_by) values(m.id,p_date,p_start_minute,coalesce(nullif(p_people,''),'1名'),p_note,'member');
  return jsonb_build_object('ok',true);
exception when unique_violation then
  return jsonb_build_object('ok',false,'error','直前に予約が入りました。');
end;
$$;

create or replace function fs_member_cancel_reservation(
  p_member_code text,
  p_pin text,
  p_reservation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m members;
  r reservations;
begin
  select * into m from fs_member_by_login(p_member_code,p_pin);
  if m.id is null then return jsonb_build_object('ok',false,'error','ログイン情報が違います。'); end if;
  select * into r from reservations where id=p_reservation_id and member_id=m.id and cancelled=false;
  if r.id is null then return jsonb_build_object('ok',false,'error','予約が見つかりません。'); end if;
  if (r.date::timestamp + make_interval(mins=>r.start_minute)) <= now() + interval '180 minutes' then return jsonb_build_object('ok',false,'error','キャンセルは開始時刻の3時間前までです。'); end if;
  update reservations set cancelled=true, cancelled_at=now() where id=r.id;
  return jsonb_build_object('ok',true);
end;
$$;
