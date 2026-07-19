-- 会員本人がホーム画面から同伴者を2名まで登録・編集するための追加SQL
begin;

create or replace function public.fs_member_upsert_registered_user(
  p_member_code text,
  p_pin text,
  p_user_id uuid,
  p_name text,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  m public.fs_members;
  target public.fs_registered_users;
  companion_count integer;
  clean_name text;
begin
  select * into m from public.fs_member_by_login(p_member_code,p_pin);
  if m.id is null then
    return jsonb_build_object('ok',false,'error','ログイン情報が違います。');
  end if;

  if m.plan not in ('standard','premium') then
    return jsonb_build_object('ok',false,'error','このプランでは同伴者を登録できません。');
  end if;

  clean_name:=btrim(coalesce(p_name,''));
  if length(clean_name) not between 1 and 80 then
    return jsonb_build_object('ok',false,'error','同伴者名を正しく入力してください。');
  end if;

  if p_user_id is null then
    select count(*) into companion_count
    from public.fs_registered_users
    where member_id=m.id and not is_contract_holder;

    if companion_count>=2 then
      return jsonb_build_object('ok',false,'error','同伴者は2名までです。');
    end if;

    insert into public.fs_registered_users(member_id,name,is_contract_holder,is_active)
    values(m.id,clean_name,false,true);
  else
    select * into target
    from public.fs_registered_users
    where id=p_user_id and member_id=m.id;

    if target.id is null or target.is_contract_holder then
      return jsonb_build_object('ok',false,'error','同伴者情報を更新できません。');
    end if;

    update public.fs_registered_users
    set name=clean_name,
        is_active=coalesce(p_is_active,true),
        updated_at=now()
    where id=target.id;
  end if;

  return jsonb_build_object('ok',true);
end $$;

grant execute on function public.fs_member_upsert_registered_user(text,text,uuid,text,boolean) to anon,authenticated;

commit;

select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name='fs_member_upsert_registered_user';
