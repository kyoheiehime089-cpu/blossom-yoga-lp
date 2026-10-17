# Manual Release Review: Not Yet Deployed

This review supersedes historical consent-bridge and seven-source instructions.
It authorizes no production write. Only the designated cloud operator executes
approved production SQL. No account, key, MFA, password or email changes are needed.

## Read-only Receipt

- Booking project: `fplvstwmsewpqwrcsqrm`, `gyotoku-gym24-booking`, healthy.
- Consent project: `ukpzqjhkajdsfrfozcvl`; excluded from this release.
- Main: `577f1790e7e27784031265b1b649f357ae7bd826`.
- Candidate base: `9baea2c454b95bdaf66b994bb9a5d4d33c4ce294`; this branch additionally
  contains the reviewed day14/month/JST/fixed-block/store-cancel corrections.
- Enabled administrators: one, enrolled by the cloud operator after explicit owner approval.
  V7 relations/functions: zero. Do not rerun enrollment.
- Existing intended Email identity: exactly one, confirmed, Email provider.
  Identity existence is NOT owner designation or real-login evidence.
- Both Gym/central-Yoga mutual guard triggers are enabled (`O`).
- Seventeen legacy admin RPCs are still executable by `anon`. Do not expose
  new sensitive operations through the old passcode mechanism.
- Member/admin/two central-Yoga entry pages return HTTP200, but no new modules
  or Email Auth fields are published. HTTP200 is not a live booking test.

## Owner Approval Recorded

The owner approved ONLY the one privately confirmed existing Email Auth identity as a
reservation-app administrator in the booking project, until explicitly revoked.
The purpose is manual member/plan management and reservation/individual-Yoga
administration. It grants no Dashboard/organization, consent DB, payment,
Vercel, secret-management or automatic-sync access.

The cloud operator verified the exact existing account and completed its one-row
enrollment at 16:33 JST. Original business-table hashes were unchanged. Never paste
IDs or credentials into public documents. No additional account enrollment or
account creation. At 16:54 JST the owner separately authorized the rule release,
preserving all existing members and applying new rules only to newly created members.

## Real Login Check Before Cutover

The owner enters the existing account credentials on a separately approved,
working private preview with the current auth controller. Do not give a stopped
localhost URL, use the public old passcode form, or print tokens/passwords.
The same authenticated session must receive `true` from
`gym24_admin_authorized()`; sign-out must remove local administrative access.
No fabricated UUID/JWT or SQL role impersonation counts as this check.
V7 administrative actions cannot be verified until the guarded backend exists.
Actual owner login remains UNVERIFIED.
Eight synthetic auth-controller tests pass (including no forced MFA, rejection
of unapproved access, revoked approval and local sign-out). Their fixture-only
credentials do not establish actual owner authorization.

## Coordinated Release Still Pending

After real authorization evidence under the recorded release approval, pause/drain
the current Gym and central-Yoga writers. Recheck live metadata, helper/guard
fingerprints and old data invariants. Execute ONLY the current guarded atomic
manual-plan transaction, then publish its matching member/admin/Yoga assets.
Do not rerun baseline, buffer, auth-helper or old consent-linked SQL.
If any prerequisite fails, keep the new UI unpublished.

The candidate-to-main delta contains manual cohort rules, guarded admin RPCs,
member/admin/central-Yoga adapters, cache versions, SQL and tests (36 files at
the code candidate). It does not modify the independent consent app or emails.
Existing members are not migrated; names/emails do not select a new cohort.

## Recovery Boundary

The protected DB-local baseline is `gym24_baseline_20261016.catalog`,
`before_rule_alignment`, captured `2026-10-15T23:50:04.390948Z`.
Its payload stays in the protected DB; do not export bodies or legacy secrets.
Verified SHA256: `2f30f36cbfae93b97dc209cb0c7e2448fc0a9c77157c109661c0be0bb9277449`.
This is a catalog baseline, NOT a full member/reservation data backup.
Retain an owner-controlled current data recovery point before release as well.
The reviewed backup candidate `production-private-data-backup-20261017.sql`
copies current fs tables only into an owner-only private schema, verifies counts
and hashes, and rejects reuse. It never returns row contents or copies the admin
allowlist. Its three synthetic protection/repeat tests passed. The cloud operator
alone executes production backup after checking the exact project connection.

1. Before COMMIT: an SQL error aborts the atomic release; explicitly ROLLBACK
   and verify catalog/old-row invariants. If the COMMIT response is lost, inspect
   state first; do not rerun an initial installer blindly. Enrollment is separate
   and must not be assumed rolled back with the release.
2. After COMMIT with provably no use: keep writers paused. Prefer forward repair.
   A full down operation needs a separately reviewed exact current/baseline
   comparison; this package contains no approved automatic full down script.
3. After any new member/reservation/audit: retain V7 tables, local assignments,
   IDs, usage/outcomes, companion safety records, snapshots and both guards.
   Contain writes at server RPC permissions under the maintenance lock, preserve
   read/support access, and repair forward. Review the exact current signatures
   and ACL before any containment SQL; do not run historical drafts unchanged.
4. Do not deploy an old UI alone: it cannot manage new cohorts and could leave
   valid records inaccessible. Do not drop V7 tables, remove legacy-write guards,
   restore anonymous admin access, delete/recreate members, or restore an old
   database snapshot over later reservations. Preserve exact30 and old40/50/NULL.

The enrollment-only reversal, if approved, disables that exact allowlist row;
it does not delete Auth or restore old public permissions. No reversal executed.
Public completion, actual member login/reservation, existing-member invariants
and Yoga conflict boundaries still require limited coordinated production tests.
