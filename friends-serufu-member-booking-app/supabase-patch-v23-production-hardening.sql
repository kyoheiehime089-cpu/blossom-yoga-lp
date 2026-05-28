-- v23: production hardening
insert into public.fs_app_settings(key,value)
values ('purchase_enabled','true')
on conflict (key) do nothing;

create or replace function public.fs_admin_set_purchase_enabled(p_admin_password text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
as $$
begin
  if not public.fs_is_admin(p_admin_password) then
    return jsonb_build_object('ok',false,'error','管理者パスコードが違います。');
  end if;
  insert into public.fs_app_settings(key,value)
  values('purchase_enabled', case when p_enabled then 'true' else 'false' end)
  on conflict (key) do update set value=excluded.value;
  return jsonb_build_object('ok',true,'purchase_enabled',p_enabled);
end$$;

grant execute on function public.fs_admin_set_purchase_enabled(text,boolean) to anon, authenticated;

create or replace function public.fs_admin_snapshot(p_admin_password text)
returns jsonb
language plpgsql
security definer
as $$
declare
  enabled boolean;
begin
  if not public.fs_is_admin(p_admin_password) then
    return jsonb_build_object('ok', false, 'error', '管理者パスコードが違います。');
  end if;
  select coalesce((select value='true' from public.fs_app_settings where key='purchase_enabled' limit 1), true) into enabled;
  return jsonb_build_object(
    'ok', true,
    'purchase_enabled', enabled,
    'members', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at desc) from public.fs_members m where status='active'),'[]'::jsonb),
    'reservations', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'member_id',r.member_id,'member_name',m.name,'member_code',m.member_code,'plan',m.plan,'date',r.date,'start_minute',r.start_minute,'people',r.people,'note',r.note,'created_by',r.created_by,'created_at',r.created_at,'cancelled',r.cancelled) order by r.date,r.start_minute) from public.fs_reservations r join public.fs_members m on m.id=r.member_id where r.cancelled=false),'[]'::jsonb),
    'all_reservations', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'member_id',r.member_id,'member_name',m.name,'member_code',m.member_code,'plan',m.plan,'date',r.date,'start_minute',r.start_minute,'people',r.people,'note',r.note,'created_by',r.created_by,'created_at',r.created_at,'cancelled',r.cancelled,'cancelled_at',r.cancelled_at) order by r.date desc,r.start_minute desc) from public.fs_reservations r join public.fs_members m on m.id=r.member_id),'[]'::jsonb),
    'closed_slots', coalesce((select jsonb_agg(to_jsonb(c) order by c.date,c.start_minute) from public.fs_closed_slots c),'[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'member_id',p.member_id,'member_name',m.name,'member_code',m.member_code,'plan',m.plan,'month',p.month,'price',p.price,'slots',p.slots,'billing_status',p.billing_status,'created_at',p.created_at,'billing_completed_at',p.billing_completed_at) order by p.created_at desc) from public.fs_slot_purchases p join public.fs_members m on m.id=p.member_id),'[]'::jsonb)
  );
end$$;

create or replace function public.fs_member_snapshot(p_member_code text, p_pin text)
returns jsonb
language plpgsql
security definer
as $$
declare
  m public.fs_members;
  mo text;
  q int;
  ex int;
  enabled boolean;
begin
  select * into m from public.fs_find_active_member(p_member_code, p_pin);
  if m.id is null then
    return jsonb_build_object('ok',false,'error','会員IDまたはログインPINが違います。');
  end if;
  mo := to_char(current_date,'YYYY-MM');
  select public.fs_member_quota(m.plan) into q;
  select coalesce(sum(slots),0) into ex from public.fs_slot_purchases where member_id=m.id and month=mo;
  select coalesce((select value='true' from public.fs_app_settings where key='purchase_enabled' limit 1), true) into enabled;
  return jsonb_build_object('ok',true,'purchase_enabled',enabled,'member',jsonb_build_object('id',m.id,'member_code',m.member_code,'name',m.name,'email',m.email,'plan',m.plan,'quota',q+ex,'base_quota',q,'extra_slots',ex),'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'date',r.date,'start_minute',r.start_minute,'people',r.people,'note',r.note,'created_at',r.created_at) order by r.date,r.start_minute) from public.fs_reservations r where r.member_id=m.id and r.cancelled=false),'[]'::jsonb),'booked_slots',coalesce((select jsonb_agg(jsonb_build_object('date',r.date,'start_minute',r.start_minute,'is_mine',(r.member_id=m.id)) order by r.date,r.start_minute) from public.fs_reservations r where r.cancelled=false),'[]'::jsonb),'closed_slots',coalesce((select jsonb_agg(to_jsonb(c) order by c.date,c.start_minute) from public.fs_closed_slots c),'[]'::jsonb));
end$$;
