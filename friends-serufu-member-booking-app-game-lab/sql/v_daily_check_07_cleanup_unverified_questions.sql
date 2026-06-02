-- game-lab: 未検証質問だけを削除するクリーンアップSQL
--
-- 削除対象:
--   - public.fs_daily_questions.verified = false の質問
--   - 上記未検証質問に紐づく public.fs_daily_question_options
--   - 上記未検証質問に紐づく public.fs_daily_question_references
--
-- 削除しないもの:
--   - public.fs_member_daily_answers（回答履歴）
--   - public.fs_members（会員データ）
--   - public.fs_reservations（予約データ）
--   - public.fs_daily_references（参考文献マスタ）
--   - verified = true の質問・選択肢・参考文献リンク

begin;

-- 未検証質問に紐づく参考文献リンクだけを削除します。
delete from public.fs_daily_question_references
where question_key in (
  select question_key
  from public.fs_daily_questions
  where verified = false
);

-- 未検証質問に紐づく選択肢だけを削除します。
delete from public.fs_daily_question_options
where question_key in (
  select question_key
  from public.fs_daily_questions
  where verified = false
);

-- 未検証質問本体だけを削除します。
delete from public.fs_daily_questions
where verified = false;

commit;

-- 実行後確認: 検証済み質問 30件 / 未検証質問 0件 を想定しています。
select
  count(*) filter (where verified = true) as verified_questions,
  count(*) filter (where verified = false) as unverified_questions
from public.fs_daily_questions;
