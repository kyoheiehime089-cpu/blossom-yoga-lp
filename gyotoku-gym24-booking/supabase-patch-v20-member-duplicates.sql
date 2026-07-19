-- friendsセルフ予約アプリ v20 会員追加重複エラー修正SQL
-- 目的：削除済み会員のメールアドレス／会員IDが、新規会員追加の邪魔をしないようにする
-- Supabase SQL Editor にこのSQL本文を貼り付けて Run してください。

-- 0) status列がない環境でも動くように保険
alter table public.fs_members
add column if not exists status text default 'active';

update public.fs_members
set status = 'active'
where status is null;

-- 1) fs_members に残っている email / member_code の通常UNIQUE制約をすべて外す
--    これが残っていると、status='deleted' の会員でも重複扱いになってしまう
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.fs_members'::regclass
      AND contype = 'u'
      AND (
        pg_get_constraintdef(oid) ilike '%email%'
        OR pg_get_constraintdef(oid) ilike '%member_code%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.fs_members DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- 2) email / member_code に関係する古いユニークインデックスも外す
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'fs_members'
      AND indexdef ilike '%unique%'
      AND (
        indexdef ilike '%email%'
        OR indexdef ilike '%member_code%'
      )
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
  END LOOP;
END $$;

-- 3) 削除済み会員の email / member_code を物理的にも退避して、今後の衝突を防ぐ
--    例：sample@example.com → deleted+会員UUID+sample@example.com
update public.fs_members
set
  email = case
    when email is null or email = '' then email
    when email ilike 'deleted+%@%' then email
    else 'deleted+' || id::text || '+' || email
  end,
  member_code = case
    when member_code ilike '%-deleted-%' then member_code
    else member_code || '-deleted-' || left(id::text,8)
  end
where status <> 'active';

-- 4) active会員だけ重複不可にする部分ユニークインデックスを作る
--    削除済み会員は重複判定から外れる
create unique index if not exists fs_members_email_active_unique
on public.fs_members(lower(email))
where status = 'active' and email is not null and email <> '';

create unique index if not exists fs_members_member_code_active_unique
on public.fs_members(upper(member_code))
where status = 'active' and member_code is not null and member_code <> '';

-- 5) 会員削除関数：予約が残っている会員は削除できない。削除時はメール/会員IDを退避する
create or replace function public.fs_admin_delete_member(p_admin_password text, p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fs_is_admin(p_admin_password) then
    return jsonb_build_object('ok', false, 'error', '管理者パスコードが違います。');
  end if;

  if exists (
    select 1
    from public.fs_reservations
    where member_id = p_member_id
      and cancelled = false
  ) then
    return jsonb_build_object('ok', false, 'error', 'この会員には予約が残っているため削除できません。先に予約をキャンセルしてください。');
  end if;

  update public.fs_members
  set
    status = 'deleted',
    email = case
      when email is null or email = '' then email
      when email ilike 'deleted+%@%' then email
      else 'deleted+' || id::text || '+' || email
    end,
    member_code = case
      when member_code ilike '%-deleted-%' then member_code
      else member_code || '-deleted-' || left(id::text,8)
    end
  where id = p_member_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- 6) 会員追加関数：active会員だけを見てメール重複を判定し、FS番号もactiveで空いている番号を使う
create or replace function public.fs_admin_create_member(
  p_admin_password text,
  p_name text,
  p_email text,
  p_plan text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 1;
  code text;
  pin text;
  m public.fs_members;
  clean_email text := nullif(trim(p_email), '');
begin
  if not fs_is_admin(p_admin_password) then
    return jsonb_build_object('ok', false, 'error', '管理者パスコードが違います。');
  end if;

  if exists (
    select 1
    from public.fs_members
    where status = 'active'
      and clean_email is not null
      and lower(email) = lower(clean_email)
  ) then
    return jsonb_build_object('ok', false, 'error', '同じメールアドレスの有効な会員が既にあります。');
  end if;

  loop
    code := 'FS' || lpad(n::text, 3, '0');
    exit when not exists (
      select 1
      from public.fs_members
      where status = 'active'
        and upper(member_code) = upper(code)
    );
    n := n + 1;
  end loop;

  pin := (floor(random() * 9000) + 1000)::int::text;

  insert into public.fs_members(member_code, name, email, pin, plan, status)
  values(code, trim(p_name), clean_email, pin, p_plan, 'active')
  returning * into m;

  return jsonb_build_object('ok', true, 'member', to_jsonb(m));
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'error', '会員追加時に重複が発生しました。削除済み会員の退避処理が未反映の可能性があります。supabase-patch-v20-member-duplicates.sql を再実行してください。'
    );
end;
$$;

grant execute on function public.fs_admin_create_member(text,text,text,text) to anon, authenticated;
grant execute on function public.fs_admin_delete_member(text,uuid) to anon, authenticated;
