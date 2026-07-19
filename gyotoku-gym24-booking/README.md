# 行徳ジム24 会員予約アプリ

会員向け予約画面と管理画面を、行徳ジム24専用の `fs_*` Supabase構成で提供します。

## 公開URL

- 会員画面: https://kyoheiehime089-cpu.github.io/blossom-yoga-lp/gyotoku-gym24-booking/
- 管理画面: https://kyoheiehime089-cpu.github.io/blossom-yoga-lp/gyotoku-gym24-booking/admin.html

## Supabase

接続先は `https://fplvstwmsewpqwrcsqrm.supabase.co` の1つだけです。

初回はSupabase SQL Editorで `supabase-setup-gyotoku-gym24-v1.sql` を実行し、既存環境には続けて `supabase-final-migration.sql` を実行します。テーブルはRLSを有効にし、公開画面からは認証情報を受け取るRPCだけを実行します。

## プラン

- 無料プラン: 1回25分、月4回まで、同時予約1枠、同日1枠、14日先まで。大人2名は不可です。
- スタンダードプラン: 月4,800円、1回40分、月6回まで、同時予約1枠、同日1枠、14日先まで。大人2名は2枠消化です。
- プレミアムプラン: 管理画面で選択できますが、具体仕様は未確定です。仕様を設定するまで予約は受け付けません。

予約可能時間、月回数、人数、同時予約、同日予約、予約締切、キャンセル締切はSupabase RPCでも検証します。
