-- friendsセルフ game-lab 1日1問コンディションチェック Evidence Gate
-- 未検証質問・確認済み参考文献が紐づかない質問を会員画面に出さないための追加SQL。

alter table public.fs_daily_questions add column if not exists verified boolean not null default false;
alter table public.fs_daily_questions add column if not exists verification_note text;
alter table public.fs_daily_questions add column if not exists verified_at timestamptz;
alter table public.fs_daily_questions add column if not exists source_count int not null default 0;

create table if not exists public.fs_daily_references (
  id uuid primary key default gen_random_uuid(),
  reference_key text unique not null,
  title text not null,
  source_name text not null,
  source_type text not null,
  authors text,
  year int,
  url text,
  doi text,
  pmid text,
  summary_ja text,
  verified boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.fs_daily_question_references (
  id uuid primary key default gen_random_uuid(),
  question_key text not null,
  option_key text,
  reference_key text not null,
  evidence_role text not null default 'supporting',
  note text,
  created_at timestamptz not null default now(),
  unique(question_key, option_key, reference_key)
);

create index if not exists fs_daily_references_verified_idx on public.fs_daily_references(verified, reference_key);
create index if not exists fs_daily_question_references_question_idx on public.fs_daily_question_references(question_key, option_key, reference_key);
create index if not exists fs_daily_questions_evidence_gate_idx on public.fs_daily_questions(enabled, verified, sort_order);

create or replace function public.fs_daily_verified_references(
  p_question_key text,
  p_option_key text default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(ref_payload order by role_priority, reference_key), '[]'::jsonb)
  from (
    select distinct on (r.reference_key)
      r.reference_key,
      case when qr.option_key = p_option_key then 0 else 1 end as role_priority,
      jsonb_build_object(
        'reference_key', r.reference_key,
        'title', r.title,
        'source_name', r.source_name,
        'source_type', r.source_type,
        'authors', r.authors,
        'year', r.year,
        'url', r.url,
        'doi', r.doi,
        'pmid', r.pmid,
        'summary_ja', r.summary_ja,
        'verified', r.verified
      ) as ref_payload
    from public.fs_daily_question_references qr
    join public.fs_daily_references r
      on r.reference_key = qr.reference_key
    where qr.question_key = p_question_key
      and r.verified = true
      and (qr.option_key is null or (p_option_key is not null and qr.option_key = p_option_key))
    order by r.reference_key, case when qr.option_key = p_option_key then 0 else 1 end
  ) refs;
$$;

create or replace function public.fs_member_daily_check_snapshot(p_member_code text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.fs_members%rowtype;
  v_answer public.fs_member_daily_answers%rowtype;
  v_question public.fs_daily_questions%rowtype;
  v_count integer;
  v_answer_count integer;
  v_offset integer;
  v_preparing_message text := 'コンディションチェックは現在準備中です。科学的根拠と参考文献を確認した質問から順番に公開します。';
begin
  v_member := public.fs_daily_find_member(p_member_code, p_pin);
  if v_member.id is null then
    return jsonb_build_object('ok', false, 'error', '会員IDまたはPINが違います。');
  end if;

  select * into v_answer
  from public.fs_member_daily_answers
  where member_id = v_member.id and answered_date = current_date
  limit 1;

  if v_answer.id is not null then
    if not exists (
      select 1
      from public.fs_daily_questions q
      where q.question_key = v_answer.question_key
        and q.enabled = true
        and q.verified = true
        and exists (
          select 1
          from public.fs_daily_question_references qr
          join public.fs_daily_references r
            on r.reference_key = qr.reference_key
          where qr.question_key = q.question_key
            and r.verified = true
        )
    ) then
      return jsonb_build_object(
        'ok', true,
        'answered_today', true,
        'question', null,
        'status', 'preparing',
        'message', v_preparing_message,
        'recent_tags', '[]'::jsonb,
        'monthly_tags', '[]'::jsonb,
        'recent_advice', '',
        'monthly_themes', '[]'::jsonb
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'answered_today', true,
      'answer', jsonb_build_object(
        'question_key', v_answer.question_key,
        'option_key', v_answer.option_key,
        'question_text', v_answer.question_text,
        'option_label', v_answer.option_label,
        'feedback_text', v_answer.feedback_text,
        'evidence_summary', v_answer.evidence_summary,
        'action_text', v_answer.action_text,
        'references', coalesce(to_jsonb(v_answer)->'references_json', '[]'::jsonb),
        'evidence_level', v_answer.evidence_level,
        'tags', v_answer.tags,
        'score', v_answer.score
      ),
      'recent_tags', public.fs_daily_recent_tags(v_member.id),
      'monthly_tags', public.fs_daily_monthly_tags(v_member.id, current_date),
      'recent_advice', public.fs_daily_recent_advice(v_member.id),
      'monthly_themes', public.fs_daily_monthly_themes(v_member.id, current_date)
    );
  end if;

  select count(*) into v_count
  from public.fs_daily_questions q
  where q.enabled = true
    and q.verified = true
    and exists (
      select 1
      from public.fs_daily_question_references qr
      join public.fs_daily_references r
        on r.reference_key = qr.reference_key
      where qr.question_key = q.question_key
        and r.verified = true
    );

  if coalesce(v_count, 0) = 0 then
    return jsonb_build_object(
      'ok', true,
      'answered_today', false,
      'question', null,
      'status', 'preparing',
      'message', v_preparing_message,
      'recent_tags', '[]'::jsonb,
      'monthly_tags', '[]'::jsonb,
      'recent_advice', '',
      'monthly_themes', '[]'::jsonb
    );
  end if;

  select count(*) into v_answer_count
  from public.fs_member_daily_answers a
  where a.member_id = v_member.id
    and exists (
      select 1
      from public.fs_daily_questions q
      where q.question_key = a.question_key
        and q.enabled = true
        and q.verified = true
        and exists (
          select 1
          from public.fs_daily_question_references qr
          join public.fs_daily_references r
            on r.reference_key = qr.reference_key
          where qr.question_key = q.question_key
            and r.verified = true
        )
    );
  v_offset := coalesce(v_answer_count, 0) % v_count;

  select * into v_question
  from public.fs_daily_questions q
  where q.enabled = true
    and q.verified = true
    and exists (
      select 1
      from public.fs_daily_question_references qr
      join public.fs_daily_references r
        on r.reference_key = qr.reference_key
      where qr.question_key = q.question_key
        and r.verified = true
    )
  order by q.sort_order, q.question_key
  offset v_offset limit 1;

  return jsonb_build_object(
    'ok', true,
    'answered_today', false,
    'question', jsonb_build_object(
      'question_key', v_question.question_key,
      'category_key', v_question.category_key,
      'category_label', v_question.category_label,
      'question_text', v_question.question_text,
      'references', public.fs_daily_verified_references(v_question.question_key, null),
      'options', coalesce((
        select jsonb_agg(jsonb_build_object('option_key', option_key, 'option_label', option_label) order by sort_order, option_key)
        from public.fs_daily_question_options
        where question_key = v_question.question_key
      ), '[]'::jsonb)
    ),
    'recent_tags', public.fs_daily_recent_tags(v_member.id),
    'monthly_tags', public.fs_daily_monthly_tags(v_member.id, current_date),
    'recent_advice', public.fs_daily_recent_advice(v_member.id),
    'monthly_themes', public.fs_daily_monthly_themes(v_member.id, current_date)
  );
end;
$$;

create or replace function public.fs_member_submit_daily_answer(p_member_code text, p_pin text, p_question_key text, p_option_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.fs_members%rowtype;
  v_question public.fs_daily_questions%rowtype;
  v_option public.fs_daily_question_options%rowtype;
  v_answer public.fs_member_daily_answers%rowtype;
  v_verified_references jsonb;
begin
  v_member := public.fs_daily_find_member(p_member_code, p_pin);
  if v_member.id is null then
    return jsonb_build_object('ok', false, 'error', '会員IDまたはPINが違います。');
  end if;

  select * into v_answer from public.fs_member_daily_answers where member_id = v_member.id and answered_date = current_date limit 1;
  if v_answer.id is not null then
    if not exists (
      select 1
      from public.fs_daily_questions q
      where q.question_key = v_answer.question_key
        and q.enabled = true
        and q.verified = true
        and exists (
          select 1
          from public.fs_daily_question_references qr
          join public.fs_daily_references r
            on r.reference_key = qr.reference_key
          where qr.question_key = q.question_key
            and r.verified = true
        )
    ) then
      return jsonb_build_object('ok', false, 'error', 'この質問は現在準備中です。');
    end if;

    return jsonb_build_object(
      'ok', true,
      'already_answered', true,
      'error', '本日はすでに回答済みです。',
      'answer', jsonb_build_object('feedback_text', v_answer.feedback_text, 'evidence_summary', v_answer.evidence_summary, 'action_text', v_answer.action_text, 'references', coalesce(to_jsonb(v_answer)->'references_json', '[]'::jsonb), 'evidence_level', v_answer.evidence_level, 'tags', v_answer.tags, 'score', v_answer.score),
      'recent_tags', public.fs_daily_recent_tags(v_member.id),
      'monthly_tags', public.fs_daily_monthly_tags(v_member.id, current_date),
      'recent_advice', public.fs_daily_recent_advice(v_member.id),
      'monthly_themes', public.fs_daily_monthly_themes(v_member.id, current_date)
    );
  end if;

  select * into v_question
  from public.fs_daily_questions q
  where q.question_key = p_question_key
    and q.enabled = true
    and q.verified = true
    and exists (
      select 1
      from public.fs_daily_question_references qr
      join public.fs_daily_references r
        on r.reference_key = qr.reference_key
      where qr.question_key = q.question_key
        and r.verified = true
    );

  select * into v_option from public.fs_daily_question_options where question_key = p_question_key and option_key = p_option_key;
  if v_question.question_key is null then
    return jsonb_build_object('ok', false, 'error', 'この質問は現在準備中です。');
  end if;
  if v_option.option_key is null then
    return jsonb_build_object('ok', false, 'error', '質問または選択肢が見つかりません。');
  end if;

  v_verified_references := public.fs_daily_verified_references(v_question.question_key, v_option.option_key);

  insert into public.fs_member_daily_answers(member_id, member_code, question_key, option_key, answered_date, question_text, option_label, feedback_text, evidence_summary, action_text, references_json, evidence_level, tags, score)
  values (v_member.id, v_member.member_code, v_question.question_key, v_option.option_key, current_date, v_question.question_text, v_option.option_label, v_option.feedback_text, v_option.evidence_summary, v_option.action_text, coalesce(nullif(to_jsonb(v_option)->'references_json', '[]'::jsonb), v_verified_references, '[]'::jsonb), v_option.evidence_level, v_option.tags, v_option.score)
  returning * into v_answer;

  return jsonb_build_object(
    'ok', true,
    'already_answered', false,
    'answer', jsonb_build_object('question_text', v_answer.question_text, 'option_label', v_answer.option_label, 'feedback_text', v_answer.feedback_text, 'evidence_summary', v_answer.evidence_summary, 'action_text', v_answer.action_text, 'references', coalesce(to_jsonb(v_answer)->'references_json', '[]'::jsonb), 'evidence_level', v_answer.evidence_level, 'tags', v_answer.tags, 'score', v_answer.score),
    'recent_tags', public.fs_daily_recent_tags(v_member.id),
    'monthly_tags', public.fs_daily_monthly_tags(v_member.id, current_date),
    'recent_advice', public.fs_daily_recent_advice(v_member.id),
    'monthly_themes', public.fs_daily_monthly_themes(v_member.id, current_date)
  );
exception when unique_violation then
  return jsonb_build_object('ok', true, 'already_answered', true, 'error', '本日はすでに回答済みです。');
end;
$$;

create or replace function public.fs_admin_daily_check_snapshot(p_admin_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_admin_password <> '1111' then
    return jsonb_build_object('ok', false, 'error', '管理者パスコードが違います。');
  end if;

  return jsonb_build_object(
    'ok', true,
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'member_id', a.member_id, 'member_code', coalesce(a.member_code, m.member_code), 'member_name', m.name, 'category_label', q.category_label, 'question_key', a.question_key, 'question_text', a.question_text, 'option_label', a.option_label, 'feedback_text', a.feedback_text, 'evidence_summary', a.evidence_summary, 'action_text', a.action_text, 'references', coalesce(to_jsonb(a)->'references_json', '[]'::jsonb), 'evidence_level', a.evidence_level, 'tags', a.tags, 'score', a.score, 'answered_date', a.answered_date, 'created_at', a.created_at) order by a.created_at desc)
      from (select * from public.fs_member_daily_answers order by created_at desc limit 80) a
      left join public.fs_members m on m.id = a.member_id
      left join public.fs_daily_questions q on q.question_key = a.question_key
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question_key', q.question_key,
        'category_label', q.category_label,
        'question_text', q.question_text,
        'enabled', q.enabled,
        'verified', q.verified,
        'source_count', q.source_count,
        'verified_reference_count', coalesce(refs.verified_reference_count, 0),
        'references', coalesce(to_jsonb(refs)->'verified_refs_json', '[]'::jsonb),
        'sort_order', q.sort_order
      ) order by q.sort_order, q.question_key)
      from public.fs_daily_questions q
      left join lateral (
        select count(distinct r.reference_key)::int as verified_reference_count,
          coalesce(jsonb_agg(distinct jsonb_build_object(
            'reference_key', r.reference_key,
            'title', r.title,
            'source_name', r.source_name,
            'source_type', r.source_type,
            'authors', r.authors,
            'year', r.year,
            'url', r.url,
            'doi', r.doi,
            'pmid', r.pmid,
            'summary_ja', r.summary_ja,
            'verified', r.verified
          )) filter (where r.reference_key is not null), '[]'::jsonb) as verified_refs_json
        from public.fs_daily_question_references qr
        join public.fs_daily_references r
          on r.reference_key = qr.reference_key
        where qr.question_key = q.question_key
          and r.verified = true
      ) refs on true
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.fs_admin_member_daily_answers(p_admin_password text, p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_admin_password <> '1111' then
    return jsonb_build_object('ok', false, 'error', '管理者パスコードが違います。');
  end if;

  return jsonb_build_object(
    'ok', true,
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'category_label', q.category_label, 'question_key', a.question_key, 'option_key', a.option_key, 'question_text', a.question_text, 'option_label', a.option_label, 'feedback_text', a.feedback_text, 'evidence_summary', a.evidence_summary, 'action_text', a.action_text, 'references', coalesce(to_jsonb(a)->'references_json', '[]'::jsonb), 'evidence_level', a.evidence_level, 'tags', a.tags, 'score', a.score, 'answered_date', a.answered_date, 'created_at', a.created_at) order by a.created_at desc)
      from public.fs_member_daily_answers a
      left join public.fs_daily_questions q on q.question_key = a.question_key
      where a.member_id = p_member_id
    ), '[]'::jsonb),
    'recent_tags', public.fs_daily_recent_tags(p_member_id),
    'monthly_tags', public.fs_daily_monthly_tags(p_member_id, current_date),
    'recent_advice', public.fs_daily_recent_advice(p_member_id),
    'monthly_themes', public.fs_daily_monthly_themes(p_member_id, current_date)
  );
end;
$$;

grant execute on function public.fs_daily_verified_references(text, text) to anon, authenticated;
grant execute on function public.fs_member_daily_check_snapshot(text, text) to anon, authenticated;
grant execute on function public.fs_member_submit_daily_answer(text, text, text, text) to anon, authenticated;
grant execute on function public.fs_admin_daily_check_snapshot(text) to anon, authenticated;
grant execute on function public.fs_admin_member_daily_answers(text, uuid) to anon, authenticated;
