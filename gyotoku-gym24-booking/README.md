# 行徳ジム24 会員予約アプリ

会員向け予約画面と管理画面を、行徳ジム24専用の `fs_*` Supabase構成で提供します。

## 公開URL

- 会員画面: https://kyoheiehime089-cpu.github.io/blossom-yoga-lp/gyotoku-gym24-booking/
- 管理画面: https://kyoheiehime089-cpu.github.io/blossom-yoga-lp/gyotoku-gym24-booking/admin.html

## Supabase

接続先は `https://fplvstwmsewpqwrcsqrm.supabase.co` の1つだけです。

初回はSupabase SQL Editorで `supabase-setup-gyotoku-gym24-v1.sql` を実行し、既存環境には続けて `supabase-final-migration.sql` を実行します。テーブルはRLSを有効にし、公開画面からは認証情報を受け取るRPCだけを実行します。

## 現在の確定プラン（2026-07-29）

- 無料プランのみ
- 1回40分
- 月8回まで
- 同時予約1枠まで
- 同日1枠まで
- 利用は会員本人1名のみ（大人の同伴者なし）
- 7日先まで予約可能
- 予約は開始2時間前まで
- キャンセルは開始3時間前まで
- 小さなお子様の同伴設定は維持

スタンダードプランとプレミアムプランは無効です。既存会員も無料プランへ統一しています。

ユーザーから「最初の状態に戻して」と指定された場合は、上記の2026-07-29確定状態へ完全に戻します。

予約可能時間、月回数、人数、同時予約、同日予約、予約締切、キャンセル締切はSupabase RPCでも検証します。ヨガ管理画面との連携・競合判定は変更しません。
