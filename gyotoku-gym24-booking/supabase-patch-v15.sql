-- friendsセルフ予約アプリ v15 追加修正SQL
-- Supabase SQL Editor にこのSQL本文を貼り付けて実行してください。
-- 内容：削除済み会員のメール/会員ID再利用、予約残あり削除防止、追加枠購入ON/OFF設定

-- 1) 削除済み会員と重複しても、active会員だけ重複不可にする
alter table fs_members drop constraint if exists fs_members_email_key;
alter table fs_members drop constraint if exists fs_members_member_code_key;

drop index if exists fs_members_email_active_unique;
drop index if exists fs_members_member_code_active_unique;

create unique index fs_members_email_active_unique
on fs_members(lower(email))
where status = 'active' and email is not null and email <> '';

create unique index fs_members_member_code_active_unique
on fs_members(upper(member_code))
where status = 'active';

-- 2) 追加枠購入のON/OFF設定。初期値はON
insert into fs_app_settings(key,value)
values ('extra_slot_purchase_enabled','true')
on conflict (key) do nothing;

-- 3) 管理者による購入ON/OFF切り替え
create or replace function fs_admin_set_purchase_enabled(p_admin_password text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fs_is_admin(p_admin_password) then
    return jsonb_build_object('ok',false,'error','管理者パスコードが違います。');
  end if;

  insert into fs_app_settings(key,value)
  values ('extra_slot_purchase_enabled', case when p_enabled then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value;

  return jsonb_build_object('ok',true,'enabled',p_enabled);
end;
$$;

-- 4) 管理者スナップショットに購入ON/OFF設定を含める
create or replace function fs_admin_snapshot(p_admin_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  enabled boolean;
begin
  if not fs_is_admin(p_admin_password) then
    return jsonb_build_object('ok',false,'error','管理者パスコードが違います。');
  end if;

  select coalesce((select value = 'true' from fs_app_settings where key='extra_slot_purchase_enabled'), true)
  into enabled;

  return jsonb_build_object(
    'ok', true,
    'purchase_enabled', enabled,
    'members', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at desc) from fs_members m where status='active'),'[]'::jsonb),
    'reservations', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'member_id',r.member_id,'member_name',m.name,'member_code',m.member_code,'plan',m.plan,'date',r.date,'start_minute',r.start_minute,'people',r.people,'note',r.note,'created_by',r.created_by,'created_at',r.created_at,'cancelled',r.cancelled) order by r.date,r.start_minute) from fs_reservations r join fs_members m on m.id=r.member_id where r.cancelled=false),'[]'::jsonb),
    'closed_slots', coalesce((select jsonb_agg(to_jsonb(c) order by c.date,c.start_minute) from fs_closed_slots c),'[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'member_id',p.member_id,'member_name',m.name,'member_code',m.member_code,'plan',m.plan,'month',p.month,'price',p.price,'slots',p.slots,'billing_status',p.billing_status,'created_at',p.created_at,'billing_completed_at',p.billing_completed_at) order by p.created_at desc) from fs_slot_purchases p join fs_members m on m.id=p.member_id),'[]'::jsonb)
  );
end;
$$;

-- 5) 会員スナップショットにも購入ON/OFF設定を含める
create or replace function fs_member_snapshot(p_member_code text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m fs_members;
  mo text := to_char(current_date,'YYYY-MM');
  q int;
  ex int;
  enabled boolean;
begin
  select * into m from fs_member_by_login(p_member_code,p_pin);
  if m.id is null then
    return jsonb_build_object('ok',false,'error','会員IDまたはPINが違います。');
  end if;

  ex := fs_extra_slots(m.id, mo);
  q := fs_plan_quota(m.plan) + ex;
  select coalesce((select value = 'true' from fs_app_settings where key='extra_slot_purchase_enabled'), true)
  into enabled;

  return jsonb_build_object(
    'ok', true,
    'purchase_enabled', enabled,
    'member', jsonb_build_object('id',m.id,'member_code',m.member_code,'name',m.name,'email',m.email,'plan',m.plan,'quota',q,'extra_slots',ex),
    'reservations', coalesce((select jsonb_agg(to_jsonb(x) order by x.date,x.start_minute) from (select id,date,start_minute,people,note,created_at,cancelled from fs_reservations where member_id=m.id and cancelled=false) x),'[]'::jsonb),
    'booked_slots', coalesce((select jsonb_agg(jsonb_build_object('date',r.date,'start_minute',r.start_minute,'is_mine',r.member_id=m.id)) from fs_reservations r where r.cancelled=false and r.date between current_date and current_date + 14),'[]'::jsonb),
    'closed_slots', coalesce((select jsonb_agg(to_jsonb(c)) from fs_closed_slots c where c.date between current_date and current_date + 14),'[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from fs_slot_purchases p where p.member_id=m.id),'[]'::jsonb)
  );
end;
$$;

-- 6) 購入OFFの時は会員の追加枠購入を止める
create or replace function fs_member_purchase_slot(p_member_code text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m fs_members;
  mo text := to_char(current_date,'YYYY-MM');
  enabled boolean;
begin
  select * into m from fs_member_by_login(p_member_code,p_pin);
  if m.id is null then
    return jsonb_build_object('ok',false,'error','ログイン情報が違います。');
  end if;

  select coalesce((select value = 'true' from fs_app_settings where key='extra_slot_purchase_enabled'), true)
  into enabled;

  if not enabled then
    return jsonb_build_object('ok',false,'error','現在、追加枠の購入は停止中です。');
  end if;

  insert into fs_slot_purchases(member_id,month,price,slots,billing_status)
  values(m.id,mo,3000,1,'unconfirmed');

  return jsonb_build_object('ok',true);
end;
$$;

-- 7) 会員追加。削除済み会員のメール/IDは再利用可能。FS番号はactiveで空いている最小番号を使う
create or replace function fs_admin_create_member(p_admin_password text, p_name text, p_email text, p_plan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 1;
  code text;
  pin text;
  m fs_members;
begin
  if not fs_is_admin(p_admin_password) then
    return jsonb_build_object('ok',false,'error','管理者パスコードが違います。');
  end if;

  loop
    code := 'FS' || lpad(n::text,3,'0');
    exit when not exists(select 1 from fs_members where upper(member_code)=upper(code) and status='active');
    n := n + 1;
  end loop;

  pin := (floor(random()*9000)+1000)::int::text;

  insert into fs_members(member_code,name,email,pin,plan,status)
  values(code,p_name,p_email,pin,p_plan,'active')
  returning * into m;

  return jsonb_build_object('ok',true,'member',to_jsonb(m));
exception when unique_violation then
  return jsonb_build_object('ok',false,'error','同じメールアドレス、または会員IDの有効な会員が既にあります。');
end;
$$;

-- 8) 会員削除。残り予約がある場合は削除しない
create or replace function fs_admin_delete_member(p_admin_password text, p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fs_is_admin(p_admin_password) then
    return jsonb_build_object('ok',false,'error','管理者パスコードが違います。');
  end if;

  if exists(select 1 from fs_reservations where member_id=p_member_id and cancelled=false) then
    return jsonb_build_object('ok',false,'error','この会員には予約が残っているため削除できません。先に予約をキャンセルしてください。');
  end if;

  update fs_members
  set status='deleted',
      email = coalesce(email,'') || '.deleted.' || id::text,
      member_code = member_code || '-deleted-' || left(id::text,8)
  where id=p_member_id;

  return jsonb_build_object('ok',true);
end;
$$;

grant execute on all functions in schema public to anon, authenticated;
