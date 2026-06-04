-- v38: ヨガ個別予約の終了後10分バッファをDB/RPC側の重複判定へ反映
-- Supabase SQL Editorでこのファイルを実行してください。

alter table if exists public.fs_external_blocks
  alter column member_name drop not null;

create or replace function public.fs_range_overlaps(a_start int, a_end int, b_start int, b_end int)
returns boolean
language sql
immutable
as $$
  select a_start < b_end and b_start < a_end;
$$;

create or replace function public.fs_external_block_overlaps(p_date date, p_start_minute int, p_end_minute int)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.fs_external_blocks b
    where b.date = p_date
      and b.source = 'yoga_private'
      -- ヨガ個別予約は実予約終了後10分を入れ替え時間としてブロックする。
      and public.fs_range_overlaps(p_start_minute,p_end_minute,b.start_minute,least(1440,b.end_minute + 10))
  );
$$;

create or replace function public.fs_self_reservation_overlaps(p_date date, p_start_minute int, p_end_minute int, p_ignore_reservation_id uuid default null)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.fs_reservations r
    where r.date = p_date
      and r.cancelled = false
      and (p_ignore_reservation_id is null or r.id <> p_ignore_reservation_id)
      -- セルフジム予約は画面表示40分、内部ブロック50分を維持する。
      and public.fs_range_overlaps(p_start_minute,p_end_minute,r.start_minute,r.start_minute + 50)
  );
$$;

create or replace function public.fs_closed_slot_overlaps(p_date date, p_start_minute int, p_end_minute int)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.fs_closed_slots c
    where c.date = p_date
      and public.fs_range_overlaps(p_start_minute,p_end_minute,c.start_minute,c.start_minute + 50)
  );
$$;

create or replace function public.fs_yoga_private_snapshot(p_admin_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.fs_is_admin(p_admin_password) then
    return jsonb_build_object('ok',false,'error','パスコードが違います。');
  end if;

  return jsonb_build_object(
    'ok', true,
    'reservations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,
        'date',r.date,
        'start_minute',r.start_minute,
        'people',r.people,
        'created_by',r.created_by
      ) order by r.date,r.start_minute)
      from public.fs_reservations r
      where r.cancelled = false
    ), '[]'::jsonb),
    'closed_slots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,
        'date',c.date,
        'start_minute',c.start_minute,
        'reason',c.reason
      ) order by c.date,c.start_minute)
      from public.fs_closed_slots c
    ), '[]'::jsonb),
    'external_blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',b.id,
        'date',b.date,
        'start_minute',b.start_minute,
        'end_minute',b.end_minute,
        'display_end_minute',b.end_minute,
        'block_end_minute',least(1440,b.end_minute + 10),
        'source',b.source,
        'title',b.title,
        'member_name',b.member_name,
        'instructor_name',b.instructor_name,
        'note',b.note,
        'created_at',b.created_at,
        'created_by',b.created_by
      ) order by b.date,b.start_minute)
      from public.fs_external_blocks b
      where b.source = 'yoga_private'
    ), '[]'::jsonb)
  );
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

  if exists(
    select 1
    from generate_series(p_start_minute, block_end - 10, 10) as g(minute)
    where public.fs_slot_blocked(p_date,g.minute)
  ) then
    return jsonb_build_object('ok',false,'error','この時間は固定の通常ヨガ・セミパーソナル不可時間と重なっています。');
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

create or replace function public.fs_member_snapshot(p_member_code text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.fs_members;
  mo text := to_char(current_date,'YYYY-MM');
  q int;
  ex int;
  enabled boolean;
begin
  select * into m from public.fs_member_by_login(p_member_code,p_pin);
  if m.id is null then
    return jsonb_build_object('ok',false,'error','会員IDまたはログインPINが違います。');
  end if;
  ex := public.fs_extra_slots(m.id, mo);
  q := public.fs_plan_quota(m.plan) + case when public.fs_is_unlimited_plan(m.plan) then 0 else ex end;
  select coalesce((select value='true' from public.fs_app_settings where key='purchase_enabled' limit 1), true) into enabled;
  return jsonb_build_object(
    'ok', true,
    'purchase_enabled', enabled,
    'member', jsonb_build_object('id',m.id,'member_code',m.member_code,'name',m.name,'email',m.email,'plan',m.plan,'quota',q,'base_quota',public.fs_plan_quota(m.plan),'extra_slots',case when public.fs_is_unlimited_plan(m.plan) then 0 else ex end,'monthly_limit',not public.fs_is_unlimited_plan(m.plan)),
    'reservations', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'date',r.date,'start_minute',r.start_minute,'people',r.people,'note',r.note,'created_at',r.created_at) order by r.date,r.start_minute) from public.fs_reservations r where r.member_id=m.id and r.cancelled=false),'[]'::jsonb),
    'booked_slots', coalesce((select jsonb_agg(jsonb_build_object('date',r.date,'start_minute',r.start_minute,'is_mine',(r.member_id=m.id)) order by r.date,r.start_minute) from public.fs_reservations r where r.cancelled=false),'[]'::jsonb),
    'closed_slots', coalesce((select jsonb_agg(to_jsonb(c) order by c.date,c.start_minute) from public.fs_closed_slots c),'[]'::jsonb),
    -- 会員側には氏名・インストラクター・メモを返さず、予約不可時間だけ返す。
    'external_blocks', coalesce((select jsonb_agg(jsonb_build_object('date',b.date,'start_minute',b.start_minute,'end_minute',b.end_minute,'display_end_minute',b.end_minute,'block_end_minute',least(1440,b.end_minute + 10),'source',b.source,'title','予約不可') order by b.date,b.start_minute) from public.fs_external_blocks b where b.source='yoga_private'),'[]'::jsonb)
  );
end;
$$;

create or replace function public.fs_member_create_reservation(p_member_code text, p_pin text, p_date date, p_start_minute int, p_people text, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.fs_members;
  mo text := to_char(p_date,'YYYY-MM');
  q int;
  start_ts timestamp := p_date::timestamp + make_interval(mins => p_start_minute);
begin
  select * into m from public.fs_member_by_login(p_member_code,p_pin);
  if m.id is null then return jsonb_build_object('ok',false,'error','ログイン情報が違います。'); end if;
  if p_date < current_date or p_date >= current_date + 14 then return jsonb_build_object('ok',false,'error','予約可能期間外です。'); end if;
  if start_ts <= now() + interval '60 minutes' then return jsonb_build_object('ok',false,'error','当日予約は1時間前までです。'); end if;
  if public.fs_slot_blocked(p_date,p_start_minute) then return jsonb_build_object('ok',false,'error','この時間は予約できません。'); end if;
  if public.fs_closed_slot_overlaps(p_date,p_start_minute,p_start_minute + 50) then return jsonb_build_object('ok',false,'error','この枠は利用不可です。'); end if;
  if public.fs_external_block_overlaps(p_date,p_start_minute,p_start_minute + 50) then return jsonb_build_object('ok',false,'error','この時間はヨガ個別予約が入っているため予約できません。'); end if;
  if public.fs_self_reservation_overlaps(p_date,p_start_minute,p_start_minute + 50) then return jsonb_build_object('ok',false,'error','この枠は予約済みです。'); end if;
  if (select count(*) from public.fs_reservations where member_id=m.id and cancelled=false and (date::timestamp + make_interval(mins=>start_minute)) > now()) >= 2 then return jsonb_build_object('ok',false,'error','同時予約は最大2枠までです。'); end if;
  if (select count(*) from public.fs_reservations where member_id=m.id and cancelled=false and date=p_date) >= 2 then return jsonb_build_object('ok',false,'error','同日予約は最大2枠までです。'); end if;
  q := public.fs_plan_quota(m.plan) + public.fs_extra_slots(m.id, mo);
  if not public.fs_is_unlimited_plan(m.plan) and (select count(*) from public.fs_reservations where member_id=m.id and cancelled=false and to_char(date,'YYYY-MM')=mo) >= q then return jsonb_build_object('ok',false,'error','今月の予約上限に達しています。'); end if;
  insert into public.fs_reservations(member_id,date,start_minute,people,note,created_by) values(m.id,p_date,p_start_minute,coalesce(nullif(p_people,''),'1名'),p_note,'member');
  return jsonb_build_object('ok',true);
exception when unique_violation then
  return jsonb_build_object('ok',false,'error','直前に予約が入りました。');
end;
$$;

create or replace function public.fs_admin_snapshot(p_admin_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  return jsonb_build_object(
    'ok',true,
    'purchase_enabled', coalesce((select value='true' from public.fs_app_settings where key='purchase_enabled' limit 1), true),
    'members', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from public.fs_members m where m.status='active'),'[]'::jsonb),
    'reservations', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'member_id',r.member_id,'member_name',m.name,'member_code',m.member_code,'plan',m.plan,'date',r.date,'start_minute',r.start_minute,'people',r.people,'note',r.note,'created_by',r.created_by,'created_at',r.created_at,'cancelled',r.cancelled) order by r.date,r.start_minute) from public.fs_reservations r join public.fs_members m on m.id=r.member_id where r.cancelled=false),'[]'::jsonb),
    'closed_slots', coalesce((select jsonb_agg(to_jsonb(c) order by c.date,c.start_minute) from public.fs_closed_slots c),'[]'::jsonb),
    'external_blocks', coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'date',b.date,'start_minute',b.start_minute,'end_minute',b.end_minute,'display_end_minute',b.end_minute,'block_end_minute',least(1440,b.end_minute + 10),'source',b.source,'title',b.title,'member_name',b.member_name,'instructor_name',b.instructor_name,'note',b.note,'created_at',b.created_at,'created_by',b.created_by) order by b.date,b.start_minute) from public.fs_external_blocks b where b.source='yoga_private'),'[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'member_id',p.member_id,'member_name',m.name,'plan',m.plan,'month',p.month,'price',p.price,'slots',p.slots,'billing_status',p.billing_status,'created_at',p.created_at,'billing_completed_at',p.billing_completed_at) order by p.created_at desc) from public.fs_slot_purchases p join public.fs_members m on m.id=p.member_id),'[]'::jsonb)
  );
end;
$$;

create or replace function public.fs_admin_create_reservation(p_admin_password text, p_member_id uuid, p_date date, p_start_minute int, p_people text, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.fs_members;
begin
  if not public.fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  select * into m from public.fs_members where id=p_member_id and status='active';
  if m.id is null then return jsonb_build_object('ok',false,'error','会員が見つかりません。'); end if;
  if public.fs_slot_blocked(p_date,p_start_minute) then return jsonb_build_object('ok',false,'error','この枠は予約できません。'); end if;
  if public.fs_closed_slot_overlaps(p_date,p_start_minute,p_start_minute + 50) then return jsonb_build_object('ok',false,'error','この枠は利用不可です。'); end if;
  if public.fs_external_block_overlaps(p_date,p_start_minute,p_start_minute + 50) then return jsonb_build_object('ok',false,'error','この時間はヨガ個別予約が入っているため予約できません。'); end if;
  if public.fs_self_reservation_overlaps(p_date,p_start_minute,p_start_minute + 50) then return jsonb_build_object('ok',false,'error','この枠は既に埋まっています。'); end if;
  insert into public.fs_reservations(member_id,date,start_minute,people,note,created_by) values(m.id,p_date,p_start_minute,coalesce(nullif(p_people,''),'1名'),p_note,'admin');
  return jsonb_build_object('ok',true);
exception when unique_violation then
  return jsonb_build_object('ok',false,'error','この枠は既に埋まっています。');
end;
$$;

create or replace function public.fs_admin_close_slot(p_admin_password text, p_date date, p_start_minute int, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  if public.fs_slot_blocked(p_date,p_start_minute) then return jsonb_build_object('ok',false,'error','本来予約できない時間です。'); end if;
  if public.fs_self_reservation_overlaps(p_date,p_start_minute,p_start_minute + 50) then return jsonb_build_object('ok',false,'error','予約済みの枠です。'); end if;
  if public.fs_external_block_overlaps(p_date,p_start_minute,p_start_minute + 50) then return jsonb_build_object('ok',false,'error','ヨガ個別予約と重なるため利用不可にできません。'); end if;
  insert into public.fs_closed_slots(date,start_minute,reason) values(p_date,p_start_minute,p_reason) on conflict(date,start_minute) do update set reason=excluded.reason;
  return jsonb_build_object('ok',true);
end;
$$;

grant execute on function public.fs_range_overlaps(int,int,int,int) to anon, authenticated;
grant execute on function public.fs_external_block_overlaps(date,int,int) to anon, authenticated;
grant execute on function public.fs_self_reservation_overlaps(date,int,int,uuid) to anon, authenticated;
grant execute on function public.fs_closed_slot_overlaps(date,int,int) to anon, authenticated;
grant execute on function public.fs_yoga_private_snapshot(text) to anon, authenticated;
grant execute on function public.fs_yoga_private_create(text,date,int,int,text,text,text) to anon, authenticated;
grant execute on function public.fs_member_snapshot(text,text) to anon, authenticated;
grant execute on function public.fs_member_create_reservation(text,text,date,int,text,text) to anon, authenticated;
grant execute on function public.fs_admin_snapshot(text) to anon, authenticated;
grant execute on function public.fs_admin_create_reservation(text,uuid,date,int,text,text) to anon, authenticated;
grant execute on function public.fs_admin_close_slot(text,date,int,text) to anon, authenticated;
