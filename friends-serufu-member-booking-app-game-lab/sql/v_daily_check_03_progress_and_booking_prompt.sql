-- friendsセルフ game-lab 1日1問コンディションチェック v_daily_check_01
-- AI・外部APIを使わず、SQLに登録した質問・選択肢・フィードバックだけで運用する。

create table if not exists public.fs_daily_questions (
  id uuid primary key default gen_random_uuid(),
  question_key text unique not null,
  category_key text not null,
  category_label text not null,
  question_text text not null,
  description text,
  enabled boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fs_daily_question_options (
  id uuid primary key default gen_random_uuid(),
  question_key text not null,
  option_key text not null,
  option_label text not null,
  feedback_text text not null,
  tags jsonb not null default '[]'::jsonb,
  score jsonb not null default '{}'::jsonb,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  unique(question_key, option_key)
);

create table if not exists public.fs_member_daily_answers (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null,
  member_code text,
  question_key text not null,
  option_key text not null,
  answered_date date not null default current_date,
  question_text text,
  option_label text,
  feedback_text text,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(member_id, answered_date)
);

create index if not exists fs_member_daily_answers_member_created_idx on public.fs_member_daily_answers(member_id, created_at desc);
create index if not exists fs_member_daily_answers_answered_date_idx on public.fs_member_daily_answers(answered_date desc);
create index if not exists fs_daily_questions_enabled_idx on public.fs_daily_questions(enabled, sort_order);

insert into public.fs_daily_questions (question_key, category_key, category_label, question_text, sort_order)
values
('sleep_latency_01', 'sleep', '睡眠', '夜、布団に入ってから寝るまでの時間はどれくらいですか？', 10),
('sleep_wake_time_01', 'sleep', '睡眠', '起きる時間は毎日どれくらい安定していますか？', 20),
('hydration_01', 'hydration', '水分', '昨日、水分はどれくらい飲みましたか？', 30),
('breakfast_01', 'breakfast', '朝食', '朝食はどれくらい食べていますか？', 40),
('protein_01', 'protein', 'タンパク質', '昨日、タンパク質を意識して食べられましたか？', 50),
('snacking_01', 'snacking', '間食', '昨日、甘いものやスナックを食べたい衝動はありましたか？', 60),
('stress_01', 'stress', 'ストレス', '昨日のストレス度はどれくらいでしたか？', 70),
('digestion_01', 'digestion', '便通', '昨日から今日にかけて、お腹の調子はどうでしたか？', 80),
('fatigue_01', 'fatigue', '疲労感', '今日の疲労感はどれくらいですか？', 90),
('preworkout_meal_01', 'preworkout', '運動前の食事', '運動前に食事や軽食を取れていますか？', 100),
('postworkout_meal_01', 'postworkout', '運動後の食事', '運動後の食事は取れていますか？', 110),
('caffeine_01', 'caffeine', 'カフェイン', 'カフェインを飲む時間はいつが多いですか？', 120)
on conflict (question_key) do update set
  category_key = excluded.category_key,
  category_label = excluded.category_label,
  question_text = excluded.question_text,
  sort_order = excluded.sort_order,
  enabled = true,
  updated_at = now();

insert into public.fs_daily_question_options (question_key, option_key, option_label, feedback_text, tags, sort_order)
values
('sleep_latency_01', 'a', '5分未満', 'かなり早く眠れている一方で、日中の眠気や疲労感が強い場合は、睡眠時間が足りていない可能性もあります。まずは起床時間を固定し、夜の就寝時間を少しずつ早めることから始めてみましょう。', '["sleep_debt_possible"]'::jsonb, 10),
('sleep_latency_01', 'b', '10分くらい', '自然に眠りに入りやすい良い状態です。今の生活リズムをなるべく崩さず、寝る前のスマホ・カフェイン・夜更かしに気をつけて続けていきましょう。', '["sleep_good"]'::jsonb, 20),
('sleep_latency_01', 'c', '15分くらい', '自然な寝つきの範囲です。寝る前のルーティンを固定できると、さらに睡眠リズムが安定しやすくなります。', '["sleep_good"]'::jsonb, 30),
('sleep_latency_01', 'd', '20分以上', '寝つきに少し時間がかかっているかもしれません。寝る前のスマホ、カフェイン、強い光、考えごと、寝る直前の強い運動などを見直してみましょう。', '["sleep_latency_long"]'::jsonb, 40),
('sleep_wake_time_01', 'a', 'ほぼ同じ時間', '起床時間が安定しているのはとても良い習慣です。睡眠リズムを整える土台になるので、このまま続けていきましょう。', '["sleep_rhythm_good"]'::jsonb, 10),
('sleep_wake_time_01', 'b', '1時間以内のズレ', '大きく乱れてはいません。さらに安定させたい場合は、休日も起床時間のズレを少し小さくする意識を持つと良いです。', '["sleep_rhythm_moderate"]'::jsonb, 20),
('sleep_wake_time_01', 'c', '2時間以上ズレる', '起床時間のズレが大きいと、睡眠リズムが乱れやすくなります。まずは起きる時間を固定することから始めてみましょう。', '["sleep_rhythm_irregular"]'::jsonb, 30),
('sleep_wake_time_01', 'd', '日によってバラバラ', '生活リズムが安定しにくい状態かもしれません。最初は完璧を目指さず、起きる時間を1つ決めることから始めてみましょう。', '["sleep_rhythm_irregular"]'::jsonb, 40),
('hydration_01', 'a', '500ml未満', '水分が少なめかもしれません。まずは朝起きた後とトレーニング前後にコップ1杯ずつ増やすことから始めてみましょう。', '["hydration_low"]'::jsonb, 10),
('hydration_01', 'b', '500ml〜1L', '少し少なめの可能性があります。汗をかく日や運動する日は、意識してもう少し水分を足してみましょう。', '["hydration_moderate"]'::jsonb, 20),
('hydration_01', 'c', '1〜2L', '日常の水分量としては比較的良い範囲です。運動量や汗の量に合わせて調整していきましょう。', '["hydration_good"]'::jsonb, 30),
('hydration_01', 'd', '2L以上', '水分をしっかり意識できています。大量に汗をかく日は、塩分や食事とのバランスも意識できるとさらに良いです。', '["hydration_good"]'::jsonb, 40),
('breakfast_01', 'a', 'ほぼ食べない', '朝食を抜く日が多い場合、日中の空腹や間食につながることがあります。まずはヨーグルト、卵、プロテインなど、少量のタンパク質から始めてみましょう。', '["breakfast_missing", "protein_opportunity"]'::jsonb, 10),
('breakfast_01', 'b', '飲み物だけ', '飲み物だけだとエネルギーやタンパク質が不足しやすいかもしれません。無理なく食べられるものを1品足すところから始めてみましょう。', '["breakfast_light", "protein_opportunity"]'::jsonb, 20),
('breakfast_01', 'c', '軽く食べる', '朝に少しでも食べられているのは良い習慣です。できればタンパク質を少し足せると、さらに安定しやすくなります。', '["breakfast_moderate"]'::jsonb, 30),
('breakfast_01', 'd', 'しっかり食べる', '朝食をしっかり取れているのは良い習慣です。食べ過ぎではなく、タンパク質・炭水化物・野菜などのバランスを意識して続けていきましょう。', '["breakfast_good"]'::jsonb, 40),
('protein_01', 'a', 'ほとんど意識していない', 'まずは毎食どこかにタンパク質を1品入れることから始めてみましょう。肉、魚、卵、大豆製品、ヨーグルトなどから選ぶと続けやすいです。', '["protein_low"]'::jsonb, 10),
('protein_01', 'b', '1食だけ意識した', '1食でも意識できているのは良いスタートです。次は朝か昼のどちらかにもう1品タンパク質を足してみましょう。', '["protein_moderate"]'::jsonb, 20),
('protein_01', 'c', '2食以上意識した', 'かなり良い状態です。運動を続けるうえでも、タンパク質を毎日安定して取ることは大切です。', '["protein_good"]'::jsonb, 30),
('protein_01', 'd', '毎食意識した', 'とても良い習慣です。無理に増やしすぎず、主食や野菜、脂質とのバランスも大切にしていきましょう。', '["protein_good"]'::jsonb, 40),
('snacking_01', 'a', 'ほとんどなかった', '食欲が安定していた可能性があります。睡眠や食事リズムが整っていると、間食の衝動も落ち着きやすくなります。', '["snacking_stable"]'::jsonb, 10),
('snacking_01', 'b', '少しあったが調整できた', '衝動があっても調整できたのは良い状態です。完全に我慢するより、量やタイミングを決める方が続きやすいです。', '["snacking_controlled"]'::jsonb, 20),
('snacking_01', 'c', 'けっこう食べた', '強い我慢を続けるより、食事量・睡眠・ストレスの影響を見直す方が改善しやすいことがあります。まずは責めずに原因を探していきましょう。', '["snacking_high"]'::jsonb, 30),
('snacking_01', 'd', '止まらなかった', '食べすぎた日があっても、それだけで失敗ではありません。次の食事を抜くより、いつもの食事リズムに戻すことを優先しましょう。', '["snacking_high", "stress_possible"]'::jsonb, 40),
('stress_01', 'a', '低かった', '落ち着いて過ごせていたようです。余裕がある日は、次の予約や軽い運動を入れておくと習慣が安定しやすくなります。', '["stress_low"]'::jsonb, 10),
('stress_01', 'b', '普通', '大きく乱れていない状態です。軽い運動や散歩、呼吸を続けることで、ストレスをため込みにくくできます。', '["stress_moderate"]'::jsonb, 20),
('stress_01', 'c', '高かった', 'ストレスが高い日は、食欲や先延ばしが起きやすくなることがあります。まずは1分呼吸や短い散歩など、小さく切り替える行動を入れてみましょう。', '["stress_high"]'::jsonb, 30),
('stress_01', 'd', 'かなり高かった', 'かなり負担が大きかったかもしれません。無理に頑張りすぎず、睡眠・食事・軽い運動のどれか1つだけ整える意識で大丈夫です。', '["stress_high", "recovery_priority"]'::jsonb, 40),
('digestion_01', 'a', '良かった', 'お腹の調子が安定しているのは良い状態です。水分、食物繊維、睡眠、運動のバランスを続けていきましょう。', '["digestion_good"]'::jsonb, 10),
('digestion_01', 'b', '少し張った', 'お腹の張りは、食物繊維の量、早食い、ストレス、睡眠、食べ慣れない食品などが関係することがあります。まずは食べたものを軽く振り返ってみましょう。', '["bloating_moderate"]'::jsonb, 20),
('digestion_01', 'c', '便秘気味', '便秘気味の日は、水分・歩数・睡眠・食物繊維のバランスを見直してみましょう。急に食物繊維を増やしすぎると張ることもあります。', '["constipation_possible", "hydration_opportunity"]'::jsonb, 30),
('digestion_01', 'd', 'ゆるかった', 'お腹がゆるい日は、脂っこい食事、冷たい飲み物、ストレス、睡眠不足などが関係することがあります。無理せず消化しやすい食事を意識しましょう。', '["digestion_unstable"]'::jsonb, 40),
('fatigue_01', 'a', 'かなり軽い', '身体が軽い日は、予約や運動を入れやすいタイミングです。無理に追い込むより、良い状態を継続することを大切にしましょう。', '["fatigue_low"]'::jsonb, 10),
('fatigue_01', 'b', '普通', '大きな疲れはなさそうです。軽めでもいいので身体を動かすと、習慣をつなげやすくなります。', '["fatigue_moderate"]'::jsonb, 20),
('fatigue_01', 'c', 'やや疲れている', '疲労がある日は、無理に高強度を狙わなくても大丈夫です。軽い運動やストレッチ、睡眠を優先する選択も有効です。', '["fatigue_high"]'::jsonb, 30),
('fatigue_01', 'd', 'かなり疲れている', 'かなり疲れている時は、まず回復を優先しましょう。睡眠、食事、水分を整え、運動する場合も軽めから始めるのがおすすめです。', '["fatigue_high", "recovery_priority"]'::jsonb, 40),
('preworkout_meal_01', 'a', 'ほぼ取らない', '空腹が強いまま運動すると、力が出にくいことがあります。必要に応じて、運動前に消化しやすい炭水化物や軽い食事を試してみましょう。', '["preworkout_fuel_low"]'::jsonb, 10),
('preworkout_meal_01', 'b', 'たまに取る', '運動前の食事は、時間帯や空腹感に合わせて調整すると続けやすいです。まずは自分が動きやすいパターンを見つけていきましょう。', '["preworkout_fuel_moderate"]'::jsonb, 20),
('preworkout_meal_01', 'c', 'だいたい取る', '運動前の準備ができている良い状態です。食べる量やタイミングを調整しながら、動きやすい状態を作っていきましょう。', '["preworkout_fuel_good"]'::jsonb, 30),
('preworkout_meal_01', 'd', '食べすぎて重いことがある', '運動前に重さを感じる場合は、食事量や脂質の多さ、食べるタイミングを見直すと動きやすくなることがあります。', '["preworkout_timing_opportunity"]'::jsonb, 40),
('postworkout_meal_01', 'a', 'ほぼ取らない', '運動後に食事が取れない日が多い場合、回復や次の日の疲労感に影響することがあります。まずはタンパク質を含む軽い食事から始めてみましょう。', '["postworkout_recovery_low", "protein_opportunity"]'::jsonb, 10),
('postworkout_meal_01', 'b', '軽く取る', '軽くでも取れているのは良い状態です。タンパク質と炭水化物を少し意識すると、回復につながりやすくなります。', '["postworkout_recovery_moderate"]'::jsonb, 20),
('postworkout_meal_01', 'c', 'しっかり取る', '運動後の食事が取れているのは良い習慣です。食べすぎではなく、回復に必要な栄養を安定して取る意識を続けていきましょう。', '["postworkout_recovery_good"]'::jsonb, 30),
('postworkout_meal_01', 'd', '運動後に甘いものが増える', '運動後に甘いものが増える場合、空腹が強すぎる可能性があります。先に食事やタンパク質を入れると落ち着きやすいことがあります。', '["postworkout_snacking", "protein_opportunity"]'::jsonb, 40),
('caffeine_01', 'a', '午前中まで', 'カフェインの時間を午前中に収められているのは良い習慣です。睡眠への影響を抑えやすい生活リズムです。', '["caffeine_timing_good"]'::jsonb, 10),
('caffeine_01', 'b', '昼過ぎまで', '昼過ぎまでなら大きく乱れにくい人も多いです。寝つきが悪い場合は、少し早い時間にずらしてみましょう。', '["caffeine_timing_moderate"]'::jsonb, 20),
('caffeine_01', 'c', '夕方以降も飲む', '夕方以降のカフェインは、寝つきや睡眠の質に影響することがあります。まずは夕方以降の量を少し減らすところから試してみましょう。', '["caffeine_late"]'::jsonb, 30),
('caffeine_01', 'd', 'あまり飲まない', 'カフェインに頼りすぎていないのは良い状態です。眠気が強い場合は、カフェインより睡眠時間や生活リズムを見直してみましょう。', '["caffeine_low"]'::jsonb, 40)
on conflict (question_key, option_key) do update set
  option_label = excluded.option_label,
  feedback_text = excluded.feedback_text,
  tags = excluded.tags,
  sort_order = excluded.sort_order;

create or replace function public.fs_daily_find_member(p_member_code text, p_pin text)
returns public.fs_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.fs_members%rowtype;
begin
  if to_regprocedure('public.fs_find_active_member(text,text)') is not null then
    begin
      execute 'select * from public.fs_find_active_member($1,$2) limit 1' into v_member using p_member_code, p_pin;
      if v_member.id is not null then
        return v_member;
      end if;
    exception when others then
      null;
    end;
  end if;

  select * into v_member
  from public.fs_members
  where upper(member_code) = upper(p_member_code)
    and pin = p_pin
  limit 1;
  return v_member;
end;
$$;

create or replace function public.fs_daily_monthly_tags(p_member_id uuid, p_month date default current_date)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('tag', tag, 'count', tag_count) order by tag_count desc, tag), '[]'::jsonb)
  from (
    select tag_value.tag as tag, count(*)::int as tag_count
    from public.fs_member_daily_answers a
    cross join jsonb_array_elements_text(a.tags) as tag_value(tag)
    where a.member_id = p_member_id
      and a.answered_date >= date_trunc('month', p_month)::date
      and a.answered_date < (date_trunc('month', p_month) + interval '1 month')::date
    group by tag_value.tag
  ) t;
$$;

create or replace function public.fs_daily_monthly_themes(p_member_id uuid, p_month date default current_date)
returns jsonb
language sql
stable
set search_path = public
as $$
  with tag_counts as (
    select tag_value.tag as tag, count(*)::int as tag_count
    from public.fs_member_daily_answers a
    cross join jsonb_array_elements_text(a.tags) as tag_value(tag)
    where a.member_id = p_member_id
      and a.answered_date >= date_trunc('month', p_month)::date
      and a.answered_date < (date_trunc('month', p_month) + interval '1 month')::date
    group by tag_value.tag
  ), theme_map(theme_key, label, tags, priority) as (
    values
      ('hydration', '水分量を増やす', array['hydration_low','hydration_moderate','hydration_opportunity'], 10),
      ('protein', 'タンパク質を毎食1品足す', array['protein_low','protein_opportunity','protein_moderate'], 20),
      ('sleep', '睡眠リズムを整える', array['sleep_latency_long','sleep_rhythm_irregular','sleep_debt_possible'], 30),
      ('stress', 'ストレスリセットを優先する', array['stress_high','stress_possible'], 40),
      ('snacking', '間食の原因を整える', array['snacking_high'], 50),
      ('recovery', '回復を優先する', array['fatigue_high','recovery_priority','postworkout_recovery_low'], 60),
      ('breakfast', '朝食にタンパク質を足す', array['breakfast_missing','breakfast_light'], 70)
  ), theme_counts as (
    select m.theme_key, m.label, m.priority, coalesce(sum(c.tag_count), 0)::int as total_count
    from theme_map m
    left join tag_counts c on c.tag = any(m.tags)
    group by m.theme_key, m.label, m.priority
  )
  select coalesce(jsonb_agg(jsonb_build_object('theme_key', theme_key, 'label', label, 'count', total_count) order by total_count desc, priority) filter (where total_count > 0), '[]'::jsonb)
  from theme_counts;
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
  v_offset integer;
begin
  v_member := public.fs_daily_find_member(p_member_code, p_pin); -- fs_find_active_member 経由を優先
  if v_member.id is null then
    return jsonb_build_object('ok', false, 'error', '会員IDまたはPINが違います。');
  end if;

  select * into v_answer
  from public.fs_member_daily_answers
  where member_id = v_member.id and answered_date = current_date
  limit 1;

  if v_answer.id is not null then
    return jsonb_build_object(
      'ok', true,
      'answered_today', true,
      'answer', jsonb_build_object('question_key', v_answer.question_key, 'option_key', v_answer.option_key, 'question_text', v_answer.question_text, 'option_label', v_answer.option_label, 'feedback_text', v_answer.feedback_text, 'tags', v_answer.tags),
      'monthly_tags', public.fs_daily_monthly_tags(v_member.id, current_date),
      'monthly_themes', public.fs_daily_monthly_themes(v_member.id, current_date)
    );
  end if;

  select count(*) into v_count from public.fs_daily_questions where enabled = true;
  if coalesce(v_count, 0) = 0 then
    return jsonb_build_object('ok', true, 'answered_today', false, 'question', null, 'monthly_tags', '[]'::jsonb, 'monthly_themes', '[]'::jsonb);
  end if;
  v_offset := (extract(doy from current_date)::int - 1) % v_count;

  select * into v_question
  from public.fs_daily_questions
  where enabled = true
  order by sort_order, question_key
  offset v_offset limit 1;

  return jsonb_build_object(
    'ok', true,
    'answered_today', false,
    'question', jsonb_build_object(
      'question_key', v_question.question_key,
      'category_key', v_question.category_key,
      'category_label', v_question.category_label,
      'question_text', v_question.question_text,
      'options', coalesce((
        select jsonb_agg(jsonb_build_object('option_key', option_key, 'option_label', option_label) order by sort_order, option_key)
        from public.fs_daily_question_options
        where question_key = v_question.question_key
      ), '[]'::jsonb)
    ),
    'monthly_tags', public.fs_daily_monthly_tags(v_member.id, current_date),
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
begin
  v_member := public.fs_daily_find_member(p_member_code, p_pin);
  if v_member.id is null then
    return jsonb_build_object('ok', false, 'error', '会員IDまたはPINが違います。');
  end if;

  select * into v_answer from public.fs_member_daily_answers where member_id = v_member.id and answered_date = current_date limit 1;
  if v_answer.id is not null then
    return jsonb_build_object('ok', true, 'already_answered', true, 'error', '本日はすでに回答済みです。', 'answer', jsonb_build_object('feedback_text', v_answer.feedback_text), 'monthly_tags', public.fs_daily_monthly_tags(v_member.id, current_date), 'monthly_themes', public.fs_daily_monthly_themes(v_member.id, current_date));
  end if;

  select * into v_question from public.fs_daily_questions where question_key = p_question_key and enabled = true;
  select * into v_option from public.fs_daily_question_options where question_key = p_question_key and option_key = p_option_key;
  if v_question.question_key is null or v_option.option_key is null then
    return jsonb_build_object('ok', false, 'error', '質問または選択肢が見つかりません。');
  end if;

  insert into public.fs_member_daily_answers(member_id, member_code, question_key, option_key, answered_date, question_text, option_label, feedback_text, tags)
  values (v_member.id, v_member.member_code, v_question.question_key, v_option.option_key, current_date, v_question.question_text, v_option.option_label, v_option.feedback_text, v_option.tags)
  returning * into v_answer;

  return jsonb_build_object('ok', true, 'already_answered', false, 'answer', jsonb_build_object('question_text', v_answer.question_text, 'option_label', v_answer.option_label, 'feedback_text', v_answer.feedback_text, 'tags', v_answer.tags), 'monthly_tags', public.fs_daily_monthly_tags(v_member.id, current_date), 'monthly_themes', public.fs_daily_monthly_themes(v_member.id, current_date));
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
      select jsonb_agg(jsonb_build_object('id', a.id, 'member_id', a.member_id, 'member_code', coalesce(a.member_code, m.member_code), 'member_name', m.name, 'category_label', q.category_label, 'question_key', a.question_key, 'question_text', a.question_text, 'option_label', a.option_label, 'tags', a.tags, 'created_at', a.created_at) order by a.created_at desc)
      from (select * from public.fs_member_daily_answers order by created_at desc limit 80) a
      left join public.fs_members m on m.id = a.member_id
      left join public.fs_daily_questions q on q.question_key = a.question_key
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('question_key', question_key, 'category_label', category_label, 'question_text', question_text, 'enabled', enabled, 'sort_order', sort_order) order by sort_order, question_key)
      from public.fs_daily_questions
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
      select jsonb_agg(jsonb_build_object('id', a.id, 'category_label', q.category_label, 'question_key', a.question_key, 'option_key', a.option_key, 'question_text', a.question_text, 'option_label', a.option_label, 'feedback_text', a.feedback_text, 'tags', a.tags, 'answered_date', a.answered_date, 'created_at', a.created_at) order by a.created_at desc)
      from public.fs_member_daily_answers a
      left join public.fs_daily_questions q on q.question_key = a.question_key
      where a.member_id = p_member_id
    ), '[]'::jsonb),
    'monthly_tags', public.fs_daily_monthly_tags(p_member_id, current_date),
    'monthly_themes', public.fs_daily_monthly_themes(p_member_id, current_date)
  );
end;
$$;

grant execute on function public.fs_member_daily_check_snapshot(text, text) to anon, authenticated;
grant execute on function public.fs_member_submit_daily_answer(text, text, text, text) to anon, authenticated;
grant execute on function public.fs_admin_daily_check_snapshot(text) to anon, authenticated;
grant execute on function public.fs_admin_member_daily_answers(text, uuid) to anon, authenticated;
grant execute on function public.fs_daily_monthly_tags(uuid, date) to anon, authenticated;
grant execute on function public.fs_daily_monthly_themes(uuid, date) to anon, authenticated;

-- v_daily_check_03_progress_and_booking_prompt
-- 既存v01の質問・選択肢は増やさず、回答数ベースの進行と予約完了導線向けの履歴項目だけを補完する。

alter table public.fs_daily_question_options add column if not exists action_text text;
alter table public.fs_daily_question_options add column if not exists evidence_summary text;
alter table public.fs_daily_question_options add column if not exists references_json jsonb not null default '[]'::jsonb;
alter table public.fs_daily_question_options add column if not exists evidence_level text;

alter table public.fs_member_daily_answers add column if not exists action_text text;
alter table public.fs_member_daily_answers add column if not exists evidence_summary text;
alter table public.fs_member_daily_answers add column if not exists references_json jsonb not null default '[]'::jsonb;
alter table public.fs_member_daily_answers add column if not exists evidence_level text;
alter table public.fs_member_daily_answers add column if not exists score jsonb not null default '{}'::jsonb;

create or replace function public.fs_daily_recent_tags(p_member_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('tag', tag, 'count', tag_count) order by tag_count desc, tag), '[]'::jsonb)
  from (
    select tag_value.tag as tag, count(*)::int as tag_count
    from public.fs_member_daily_answers a
    cross join lateral jsonb_array_elements_text(coalesce(a.tags, '[]'::jsonb)) as tag_value(tag)
    where a.member_id = p_member_id
      and a.created_at >= now() - interval '14 days'
    group by tag_value.tag
  ) t;
$$;

create or replace function public.fs_daily_recent_advice(p_member_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce((
    select a.feedback_text
    from public.fs_member_daily_answers a
    where a.member_id = p_member_id
      and nullif(a.feedback_text, '') is not null
    order by a.created_at desc
    limit 1
  ), '回答が増えると、直近の傾向に合わせたアドバイスが表示されます。');
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

  select count(*) into v_count from public.fs_daily_questions where enabled = true;
  if coalesce(v_count, 0) = 0 then
    return jsonb_build_object('ok', true, 'answered_today', false, 'question', null, 'recent_tags', '[]'::jsonb, 'monthly_tags', '[]'::jsonb, 'recent_advice', '', 'monthly_themes', '[]'::jsonb);
  end if;

  select count(*) into v_answer_count from public.fs_member_daily_answers where member_id = v_member.id;
  v_offset := coalesce(v_answer_count, 0) % v_count;

  select * into v_question
  from public.fs_daily_questions
  where enabled = true
  order by sort_order, question_key
  offset v_offset limit 1;

  return jsonb_build_object(
    'ok', true,
    'answered_today', false,
    'question', jsonb_build_object(
      'question_key', v_question.question_key,
      'category_key', v_question.category_key,
      'category_label', v_question.category_label,
      'question_text', v_question.question_text,
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
begin
  v_member := public.fs_daily_find_member(p_member_code, p_pin);
  if v_member.id is null then
    return jsonb_build_object('ok', false, 'error', '会員IDまたはPINが違います。');
  end if;

  select * into v_answer from public.fs_member_daily_answers where member_id = v_member.id and answered_date = current_date limit 1;
  if v_answer.id is not null then
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

  select * into v_question from public.fs_daily_questions where question_key = p_question_key and enabled = true;
  select * into v_option from public.fs_daily_question_options where question_key = p_question_key and option_key = p_option_key;
  if v_question.question_key is null or v_option.option_key is null then
    return jsonb_build_object('ok', false, 'error', '質問または選択肢が見つかりません。');
  end if;

  insert into public.fs_member_daily_answers(member_id, member_code, question_key, option_key, answered_date, question_text, option_label, feedback_text, evidence_summary, action_text, references_json, evidence_level, tags, score)
  values (v_member.id, v_member.member_code, v_question.question_key, v_option.option_key, current_date, v_question.question_text, v_option.option_label, v_option.feedback_text, v_option.evidence_summary, v_option.action_text, coalesce(to_jsonb(v_option)->'references_json', '[]'::jsonb), v_option.evidence_level, v_option.tags, v_option.score)
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
      select jsonb_agg(jsonb_build_object('id', a.id, 'member_id', a.member_id, 'member_code', coalesce(a.member_code, m.member_code), 'member_name', m.name, 'category_label', q.category_label, 'question_key', a.question_key, 'question_text', a.question_text, 'option_label', a.option_label, 'feedback_text', a.feedback_text, 'evidence_summary', a.evidence_summary, 'action_text', a.action_text, 'references', coalesce(a."references_json", '[]'::jsonb), 'evidence_level', a.evidence_level, 'tags', a.tags, 'score', a.score, 'created_at', a.created_at) order by a.created_at desc)
      from (select * from public.fs_member_daily_answers order by created_at desc limit 80) a
      left join public.fs_members m on m.id = a.member_id
      left join public.fs_daily_questions q on q.question_key = a.question_key
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('question_key', question_key, 'category_label', category_label, 'question_text', question_text, 'enabled', enabled, 'sort_order', sort_order) order by sort_order, question_key)
      from public.fs_daily_questions
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
      select jsonb_agg(jsonb_build_object('id', a.id, 'category_label', q.category_label, 'question_key', a.question_key, 'option_key', a.option_key, 'question_text', a.question_text, 'option_label', a.option_label, 'feedback_text', a.feedback_text, 'evidence_summary', a.evidence_summary, 'action_text', a.action_text, 'references', coalesce(a."references_json", '[]'::jsonb), 'evidence_level', a.evidence_level, 'tags', a.tags, 'score', a.score, 'answered_date', a.answered_date, 'created_at', a.created_at) order by a.created_at desc)
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

grant execute on function public.fs_daily_recent_tags(uuid) to anon, authenticated;
grant execute on function public.fs_daily_recent_advice(uuid) to anon, authenticated;
grant execute on function public.fs_member_daily_check_snapshot(text, text) to anon, authenticated;
grant execute on function public.fs_member_submit_daily_answer(text, text, text, text) to anon, authenticated;
grant execute on function public.fs_admin_daily_check_snapshot(text) to anon, authenticated;
grant execute on function public.fs_admin_member_daily_answers(text, uuid) to anon, authenticated;
