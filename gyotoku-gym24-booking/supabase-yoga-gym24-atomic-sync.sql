-- ヨガ個別予約と行徳ジム24を同一DB内で排他制御する最終連携SQL
-- 実行先: 行徳ジム24 Supabase（fplvstwmsewpqwrcsqrm）
begin;

create table if not exists public.fs_yoga_private_reservations (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_minute integer not null check (start_minute between 0 and 1430 and start_minute % 10 = 0),
  end_minute integer not null check (end_minute between 10 and 1440 and end_minute % 10 = 0),
  member_name text not null,
  note text not null default '',
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (end_minute > start_minute)
);
create index if not exists fs_yoga_private_date_idx on public.fs_yoga_private_reservations(date,cancelled,start_minute);
alter table public.fs_yoga_private_reservations enable row level security;

create or replace function public.fs_yoga_conflicts_gym(
  p_date date,p_start_minute integer,p_end_minute integer,p_ignore_id uuid default null
) returns boolean language sql stable security definer set search_path=public as $$
  with yoga_block as (
    select p_date::timestamp + make_interval(mins=>p_start_minute-30) s,
           p_date::timestamp + make_interval(mins=>p_end_minute+30) e
  )
  select exists(
    select 1 from yoga_block y join public.fs_reservations r
      on not r.cancelled and (p_ignore_id is null or r.id<>p_ignore_id)
     and r.date between p_date-1 and p_date+1
     and y.s < r.date::timestamp + make_interval(mins=>r.start_minute+coalesce(r.use_minutes_snapshot,40)+10)
     and r.date::timestamp + make_interval(mins=>r.start_minute-10) < y.e
  );
$$;

create or replace function public.fs_gym_conflicts_yoga(
  p_date date,p_start_minute integer,p_use_minutes integer
) returns boolean language sql stable security definer set search_path=public as $$
  with gym_block as (
    select p_date::timestamp + make_interval(mins=>p_start_minute-10) s,
           p_date::timestamp + make_interval(mins=>p_start_minute+p_use_minutes+10) e
  )
  select exists(
    select 1 from gym_block g join public.fs_yoga_private_reservations y
      on not y.cancelled and y.date between p_date-1 and p_date+1
     and g.s < y.date::timestamp + make_interval(mins=>y.end_minute+30)
     and y.date::timestamp + make_interval(mins=>y.start_minute-30) < g.e
  );
$$;

create or replace function public.fs_reservations_yoga_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare use_mins integer;
begin
  if new.cancelled then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('shared-booking:'||new.date::text,0));
  use_mins:=coalesce(new.use_minutes_snapshot,40);
  if public.fs_gym_conflicts_yoga(new.date,new.start_minute,use_mins) then
    raise exception 'ヨガ個別予約の前後30分と重なるため予約できません。';
  end if;
  return new;
end $$;
drop trigger if exists fs_reservations_yoga_guard_trg on public.fs_reservations;
create trigger fs_reservations_yoga_guard_trg before insert or update of date,start_minute,cancelled,use_minutes_snapshot
on public.fs_reservations for each row execute function public.fs_reservations_yoga_guard();

create or replace function public.fs_yoga_private_snapshot_central(p_admin_password text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  return jsonb_build_object(
    'ok',true,
    'yoga_reservations',coalesce((select jsonb_agg(to_jsonb(y) order by y.date,y.start_minute) from public.fs_yoga_private_reservations y where not y.cancelled),'[]'::jsonb),
    'gym_reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'date',r.date,'start_minute',r.start_minute,'use_minutes',coalesce(r.use_minutes_snapshot,40),'member_name',m.name) order by r.date,r.start_minute) from public.fs_reservations r join public.fs_members m on m.id=r.member_id where not r.cancelled),'[]'::jsonb),
    'closed_slots',coalesce((select jsonb_agg(to_jsonb(c) order by c.date,c.start_minute) from public.fs_closed_slots c),'[]'::jsonb)
  );
end $$;

create or replace function public.fs_yoga_private_create_central(
  p_admin_password text,p_date date,p_start_minute integer,p_end_minute integer,p_member_name text,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare new_id uuid; yoga_s timestamp; yoga_e timestamp;
begin
  if not public.fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  if p_start_minute not between 0 and 1430 or p_end_minute not between 10 and 1440 or p_start_minute%10<>0 or p_end_minute%10<>0 or p_end_minute<=p_start_minute then
    return jsonb_build_object('ok',false,'error','開始・終了時間が不正です。');
  end if;
  if length(btrim(coalesce(p_member_name,'')))=0 then return jsonb_build_object('ok',false,'error','会員名を入力してください。'); end if;
  perform pg_advisory_xact_lock(hashtextextended('shared-booking:'||p_date::text,0));
  yoga_s:=p_date::timestamp+make_interval(mins=>p_start_minute-30);
  yoga_e:=p_date::timestamp+make_interval(mins=>p_end_minute+30);
  if public.fs_yoga_conflicts_gym(p_date,p_start_minute,p_end_minute,null) then return jsonb_build_object('ok',false,'error','行徳ジム24の予約と前後時間が重なっています。'); end if;
  if public.fs_business_conflicts(p_date,p_start_minute-20,(p_end_minute-p_start_minute)+40) then return jsonb_build_object('ok',false,'error','通常ヨガ・friends等の利用時間と重なっています。'); end if;
  if exists(select 1 from public.fs_closed_slots c where c.date between p_date-1 and p_date+1 and yoga_s<c.date::timestamp+make_interval(mins=>c.start_minute+c.block_minutes+10) and c.date::timestamp+make_interval(mins=>c.start_minute-10)<yoga_e) then
    return jsonb_build_object('ok',false,'error','利用不可時間と重なっています。');
  end if;
  if exists(select 1 from public.fs_yoga_private_reservations y where not y.cancelled and y.date between p_date-1 and p_date+1 and yoga_s<y.date::timestamp+make_interval(mins=>y.end_minute+30) and y.date::timestamp+make_interval(mins=>y.start_minute-30)<yoga_e) then
    return jsonb_build_object('ok',false,'error','別のヨガ個別予約の前後30分と重なっています。');
  end if;
  insert into public.fs_yoga_private_reservations(date,start_minute,end_minute,member_name,note)
  values(p_date,p_start_minute,p_end_minute,btrim(p_member_name),coalesce(p_note,'')) returning id into new_id;
  return jsonb_build_object('ok',true,'id',new_id);
end $$;

create or replace function public.fs_yoga_private_delete_central(p_admin_password text,p_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.fs_is_admin(p_admin_password) then return jsonb_build_object('ok',false,'error','管理者パスコードが違います。'); end if;
  update public.fs_yoga_private_reservations set cancelled=true,cancelled_at=now() where id=p_id and not cancelled;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.fs_yoga_public_blocks()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('ok',true,'blocks',coalesce(jsonb_agg(jsonb_build_object(
    'id',y.id,'date',y.date,'start_minute',y.start_minute,'end_minute',y.end_minute,
    'block_start_ts',y.date::timestamp+make_interval(mins=>y.start_minute-30),
    'block_end_ts',y.date::timestamp+make_interval(mins=>y.end_minute+30),
    'reason','ヨガ個別予約（前後30分）'
  ) order by y.date,y.start_minute),'[]'::jsonb)) from public.fs_yoga_private_reservations y where not y.cancelled;
$$;

grant execute on function public.fs_yoga_private_snapshot_central(text) to anon,authenticated;
grant execute on function public.fs_yoga_private_create_central(text,date,integer,integer,text,text) to anon,authenticated;
grant execute on function public.fs_yoga_private_delete_central(text,uuid) to anon,authenticated;
grant execute on function public.fs_yoga_public_blocks() to anon,authenticated;

commit;

select routine_name from information_schema.routines where routine_schema='public' and routine_name in ('fs_yoga_private_snapshot_central','fs_yoga_private_create_central','fs_yoga_private_delete_central','fs_yoga_public_blocks') order by routine_name;
