import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createManualV7Membership,
  createV7ReservationOutcome,
  normalizeAkwLegacyReservationForConflict,
  recordV7VisitOutcome,
  resolveV7ResourceScope,
  V7_REQUIRED_RESOURCE_SOURCES,
  V7_STORAGE_CANDIDATE,
} from "./member-cohort-v7-storage.mjs";
import {
  V7_AGREEMENT_VERSION,
  V7_AGREEMENT_URL,
  V7_BOOKING_RULES,
  V7_PLANS,
  V7_RPC_CONTRACT,
  canBookMember,
  countActiveReservations,
  countDailyConsumedVisits,
  countMonthlyConsumedVisits,
  evaluateV7Booking,
  getReservationDurationMinutes,
  hasV7ActivationGates,
  hasV7ReservationBufferConflict,
  hasV7YogaBufferConflict,
  isV7ServerEnforcementReady,
  isV7AdminProxyReady,
  isBeforeV7BookingCutoff,
  isV7CancellationOnTime,
  isWithinV7BookingWindow,
  resolveBookingPolicy,
  resolveMemberPolicyContext,
  setVisitOutcomeOnce,
  tokyoDateKey,
  tokyoMonthKey,
  validateV7Companions,
} from "./member-cohort-policy.mjs";

const legacyStandard = Object.freeze({
  monthlyPriceYen: 4800,
  durationMinutes: 40,
  monthlyQuota: 6,
  bookingDays: 14,
  concurrentLimit: 2,
  dailyLimit: 1,
});

const completeGates = Object.freeze({
  agreementAccepted: true,
  paymentCompleted: true,
  identityAndSafetyPassed: true,
  operatorApproved: true,
});

const memberScreen = readFileSync(new URL("./member-cohort-v7-ui.mjs", import.meta.url), "utf8");
const adminScreen = readFileSync(new URL("./admin-cohort-v7-ui.mjs", import.meta.url), "utf8");
const memberClient = readFileSync(new URL("./fs-member-supabase.js", import.meta.url), "utf8");
const adminClient = readFileSync(new URL("./admin-script.js", import.meta.url), "utf8");
const adminProxy = readFileSync(new URL("./admin-schedule-proxy-v1.js", import.meta.url), "utf8");
const memberEntry = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const adminEntry = readFileSync(new URL("./admin.html", import.meta.url), "utf8");
const yogaEntry = readFileSync(new URL("../yoga-private-booking/yoga-private.html", import.meta.url), "utf8");
const yogaClient = readFileSync(new URL("../yoga-private-booking/yoga-gym24-central-v2.js", import.meta.url), "utf8");
const yogaAvailabilitySql = readFileSync(new URL("./supabase-yoga-server-available-starts.sql", import.meta.url), "utf8");
const legacyAdminRules = readFileSync(new URL("./admin-confirmed-rules.js", import.meta.url), "utf8");
const exactYogaBufferSql = readFileSync(new URL("./supabase-exact-mutual-30min-buffer.sql", import.meta.url), "utf8");
const v7CandidateSql = readFileSync(new URL("./supabase-manual-plan-rules-candidate.sql", import.meta.url), "utf8");
const atomicYogaSql = readFileSync(new URL("./supabase-yoga-gym24-atomic-sync.sql", import.meta.url), "utf8");

function readyBooking(overrides = {}) {
  return {
    membershipCohort: "paid_v7",
    agreementVersion: V7_AGREEMENT_VERSION,
    planCode: "standard",
    memberStatus: "active",
    activationGates: completeGates,
    availabilitySnapshotReady: true,
    now: "2026-10-13T12:00:00.000Z",
    bookingDate: "2026-10-14",
    startMinute: 600,
    companions: { memberPresent: true, adults: [], children: [], childrenSupervised: true },
    ...overrides,
  };
}

test("v7 plans match the published plan limits and use separate policy keys", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(V7_PLANS).map(([code, plan]) => [code, [plan.policyKey, plan.monthlyPriceYen, plan.durationMinutes, plan.monthlyQuota]])),
    {
      free: ["v7_light", 4980, 50, 4],
      standard: ["v7_standard", 7980, 50, 8],
      premium: ["v7_premium", 11980, 50, 12],
    }
  );
});

test("member and admin v7 screens show the agreement's current fees and booking rules", () => {
  for (const screen of [memberScreen, adminScreen]) {
    for (const phrase of ["4,980円", "7,980円", "11,980円", "前日22時まで", "各10分", "前後30分以上", "30分ちょうど", "毎月26日", "前々月末日", "人数制限なく同伴", "故意または重過失"]) {
      assert.ok(screen.includes(phrase), `screen copy must include ${phrase}`);
    }
    assert.doesNotMatch(screen, /25分|月6回|2週間先|2名まで登録/);
  }
});

test("agreement, member, admin, and individual Yoga entry points share the v7 contract", () => {
  assert.equal(V7_AGREEMENT_URL, "https://gyotoku-gym24-agreement.vercel.app/");
  assert.match(memberEntry, /member-cohort-v7-ui\.mjs/);
  assert.match(adminEntry, /admin-cohort-v7-ui\.mjs/);
  assert.match(memberScreen, /同意書v7の全文/);
  assert.match(adminScreen, /同意書v7の全文/);
  assert.match(yogaEntry, /yoga-gym24-central-v2\.js/);
  assert.match(memberClient, /fs_v7_member_create_reservation/);
  assert.match(memberClient, /fs_v7_member_cancel_reservation/);
  assert.match(memberScreen, /gyotokuMemberV7CreateReservation/);
  assert.doesNotMatch(memberScreen, /fs_member_create_reservation_v2|fs_member_cancel_reservation/);
  assert.match(adminProxy, /V7_RPC_CONTRACT\.adminCreate/);
  assert.match(adminScreen, /V7_RPC_CONTRACT\.adminCancel/);
  assert.match(adminProxy, /else\s*\{\s*await rpc\('fs_admin_create_reservation_v2'/);
  assert.match(yogaClient, /fs_yoga_available_starts/);
  assert.match(yogaClient, /fs_yoga_private_create_central/);
  assert.match(yogaClient, /r\.use_minutes\|\|40/);
  assert.match(memberScreen, /supervisionCheckbox\.checked\s*=\s*false/);
  assert.match(atomicYogaSql, /'use_minutes',coalesce\(r\.use_minutes_snapshot,40\)/);
  assert.match(yogaAvailabilitySql, /r\.start_minute\+coalesce\(r\.use_minutes_snapshot,40\)\+30/);
  assert.match(yogaAvailabilitySql, /r\.start_minute-30/);
  assert.match(exactYogaBufferSql, /p_start_minute-30/);
  assert.match(exactYogaBufferSql, /p_end_minute\+30/);
});

test("v7 admin member cards suppress the legacy two-adult editor", () => {
  assert.match(adminScreen, /card\.querySelector\("\[data-companions\]"\)\?\.remove\(\)/);
  assert.match(legacyAdminRules, /membership_cohort==='paid_v7'\|\|member\.agreement_version==='agreement-2026-10-13-paid-v7'\)return/);
  assert.match(adminScreen, /旧会員向けの「大人2名」登録機能は使いません/);
  assert.match(adminScreen, /data-v7-companion-policy/);
});

test("administrator manually creates members without a consent bridge", () => {
 assert.ok(!adminEntry.includes("linkV7MemberForm"));
 assert.ok(!adminClient.includes("/api/v7/member-link"));
 assert.ok(adminClient.includes("fs_v7_admin_create_member"));
 assert.ok(v7CandidateSql.includes("fs_v7_admin_create_member"));
 assert.ok(!v7CandidateSql.includes("agreement_registration_id"));
 assert.ok(!v7CandidateSql.includes("payment_completed"));
});

test("V7 adult companion registration is one-only and requires admin safety approval", () => {
  assert.equal(V7_RPC_CONTRACT.memberAddCompanion, "fs_v7_member_add_companion");
  assert.match(memberClient, /fs_v7_member_add_companion/);
  assert.match(memberScreen, /id="v7CompanionForm"/);
  assert.match(memberScreen, /運営者の本人確認・安全確認が完了するまで予約時に選択できません/);
  assert.match(v7CandidateSql, /function public\.fs_v7_member_add_companion/);
  assert.match(v7CandidateSql, /registered_users where member_id=m\.id and not is_contract_holder/);
  assert.match(v7CandidateSql, /'safety_check_passed',false\)/);
  assert.match(v7CandidateSql, /fs_v7_guard_legacy_companion_write_trg/);
  assert.match(v7CandidateSql, /fs_v7_guard_legacy_reservation_delete_trg/);
});

test("the same plan code resolves by explicit cohort and agreement version", () => {
  const legacy = resolveBookingPolicy({ membershipCohort: "legacy", planCode: "standard", legacyPolicy: legacyStandard });
  const v7 = resolveBookingPolicy({
    membershipCohort: "paid_v7",
    agreementVersion: V7_AGREEMENT_VERSION,
    planCode: "standard",
    legacyPolicy: legacyStandard,
  });

  assert.equal(legacy.cohort, "legacy");
  assert.equal(legacy.policy, legacyStandard);
  assert.equal(legacy.policy.durationMinutes, 40);
  assert.equal(legacy.policy.monthlyQuota, 6);
  assert.equal(v7.cohort, "v7");
  assert.equal(v7.policyKey, "v7_standard");
  assert.equal(v7.policy.durationMinutes, 50);
  assert.equal(v7.policy.monthlyQuota, 8);
});

test("legacy free records retain their existing persisted settings", () => {
  const persistedFree = Object.freeze({ durationMinutes: 25, monthlyQuota: 4, bookingDays: 7 });
  const selected = resolveBookingPolicy({ membershipCohort: "legacy", planCode: "free", legacyPolicy: persistedFree });
  const unmarkedExistingMember = resolveBookingPolicy({ planCode: "standard", legacyPolicy: legacyStandard });
  assert.equal(selected.cohort, "legacy");
  assert.equal(selected.policy, persistedFree);
  assert.equal(selected.policy.durationMinutes, 25);
  assert.equal(unmarkedExistingMember.cohort, "legacy");
  assert.equal(unmarkedExistingMember.policy, legacyStandard);
});

test("unknown versions and v7 plans fail closed instead of falling back to legacy", () => {
  assert.equal(resolveBookingPolicy({ membershipCohort: "paid_v7", agreementVersion: "unknown-v8", planCode: "standard", legacyPolicy: legacyStandard }), null);
  assert.equal(resolveBookingPolicy({ membershipCohort: "paid_v7", agreementVersion: V7_AGREEMENT_VERSION, planCode: "unknown", legacyPolicy: legacyStandard }), null);
  assert.equal(resolveBookingPolicy({ agreementVersion: V7_AGREEMENT_VERSION, planCode: "standard", legacyPolicy: legacyStandard }), null);
  assert.equal(resolveBookingPolicy({ membershipCohort: "unrecognized", planCode: "standard", legacyPolicy: legacyStandard }), null);
  assert.equal(resolveBookingPolicy({ membershipCohort: "legacy", agreementVersion: "agreement-legacy-v4", planCode: "standard", legacyPolicy: legacyStandard }).cohort, "legacy");
  assert.equal(resolveBookingPolicy({ membershipCohort: "legacy", planCode: "standard", legacyPolicy: legacyStandard }).cohort, "legacy");
  assert.equal(resolveBookingPolicy({ planCode: "standard" }), null);
});

test("manual operator assignment needs no consent or payment integration", () => {
 assert.equal(hasV7ActivationGates({operatorApproved:true}),true);
 assert.equal(hasV7ActivationGates({operatorApproved:false}),false);
 assert.equal(canBookMember({cohort:"v7",memberStatus:"active",activationGates:{operatorApproved:true}}),true);
 assert.equal(canBookMember({cohort:"v7",memberStatus:"suspended",activationGates:{operatorApproved:true}}),false);
 assert.equal(canBookMember({cohort:"legacy",memberStatus:"active"}),true);
});

test("adding a synthetic v7 registration leaves legacy members and reservations unchanged", () => {
  const legacyMembers = [{ id: "synthetic-legacy-01", planCode: "standard", status: "active", durationMinutes: 40 }];
  const legacyReservations = [{ id: "synthetic-reservation-01", memberId: "synthetic-legacy-01", useMinutesSnapshot: 40 }];
  const before = JSON.stringify({ legacyMembers, legacyReservations });
  const newRegistration = { id: "synthetic-v7-01", agreementVersion: V7_AGREEMENT_VERSION, planCode: "standard", status: "pending" };

  assert.equal(resolveBookingPolicy({ membershipCohort: "paid_v7", agreementVersion: newRegistration.agreementVersion, planCode: newRegistration.planCode, legacyPolicy: legacyStandard }).policy.durationMinutes, 50);
  assert.equal(newRegistration.status, "pending");
  assert.equal(JSON.stringify({ legacyMembers, legacyReservations }), before);
});

test("manual membership contains no consent lookup or payment data", () => {
 const record=createManualV7Membership({memberId:"new-manual-member",agreementVersion:V7_AGREEMENT_VERSION,planCode:"standard",operatorApproved:true});
 assert.equal(record.status,"active");
 assert.deepEqual(record.activation_gates,{operatorApproved:true});
 assert.equal(V7_STORAGE_CANDIDATE.automaticallyLinksConsent,false);
 assert.equal(V7_STORAGE_CANDIDATE.matchesAccountsByEmail,false);
 assert.equal(V7_STORAGE_CANDIDATE.storesPaymentCredentials,false);
 assert.deepEqual(V7_STORAGE_CANDIDATE.membershipUniqueKeys,["policy_assignment_id","member_id"]);
 assert.throws(()=>createManualV7Membership({memberId:"m",agreementVersion:V7_AGREEMENT_VERSION,planCode:"free",operatorApproved:false}),/Explicit administrator/);
});

test("unknown booking resource scopes stay closed until each source is explicitly resolved", () => {
  const resolved = V7_REQUIRED_RESOURCE_SOURCES.map((source_key) => ({
    source_key,
    scope_status: "separate",
    integration_status: "unsupported",
  }));
  assert.deepEqual(resolveV7ResourceScope([]).complete, false);
  assert.deepEqual(resolveV7ResourceScope(resolved).unresolved, []);
  assert.equal(resolveV7ResourceScope(resolved).complete, true);
  assert.equal(resolveV7ResourceScope(resolved.map((row) => row.source_key === "blossom_private_bookings"
    ? { ...row, scope_status: "unconfirmed" }
    : row)).complete, false);
  assert.equal(resolveV7ResourceScope(resolved.map((row) => row.source_key === "blossom_private_bookings"
    ? { ...row, scope_status: "shared" }
    : row)).complete, false);
  assert.equal(resolveV7ResourceScope(resolved.map((row) => row.source_key === "blossom_private_bookings"
    ? { ...row, scope_status: "shared", integration_status: "ready" }
    : row)).complete, false);
  assert.equal(resolveV7ResourceScope(resolved.slice(1)).complete, false);
});

test("v7 reservation outcomes preserve one 50-minute use and cannot be double counted", () => {
  const reserved = createV7ReservationOutcome({
    reservationId: "reservation-v7-01",
    memberId: "member-v7-01",
    agreementVersion: V7_AGREEMENT_VERSION,
  });
  assert.equal(reserved.duration_minutes, 50);
  assert.equal(reserved.visit_outcome, "reserved");
  assert.equal(reserved.consumes_visit, true);
  assert.equal(recordV7VisitOutcome(reserved, "late_cancelled").consumes_visit, true);
  assert.equal(recordV7VisitOutcome(reserved, "no_show").consumes_visit, true);

  const onTime = recordV7VisitOutcome(reserved, "on_time_cancelled");
  assert.equal(onTime.consumes_visit, false);
  assert.equal(recordV7VisitOutcome(onTime, "on_time_cancelled"), onTime);
  assert.throws(() => recordV7VisitOutcome(onTime, "late_cancelled"), /immutable/);
  assert.throws(() => recordV7VisitOutcome(reserved, "reserved"), /Unknown terminal/);
  assert.throws(() => createV7ReservationOutcome({
    reservationId: "reservation-v7-old-version",
    memberId: "member-v7-01",
    agreementVersion: "unknown",
  }), /Unknown agreement version/);
});

test("member policy resolution requires both explicit v7 cohort and agreement version", () => {
  const legacyMember = { plan: "free", agreement_version: "agreement-legacy-v4" };
  const legacy = resolveMemberPolicyContext({ member: legacyMember, legacyPolicy: { durationMinutes: 25, monthlyQuota: 4 } });
  assert.equal(legacy.cohort, "legacy");
  assert.equal(legacy.isPaidV7, false);
  assert.equal(legacy.policy.durationMinutes, 25);

  const paidLight = resolveMemberPolicyContext({
    member: { plan: "free", membership_cohort: "paid_v7", agreement_version: V7_AGREEMENT_VERSION },
    legacyPolicy: { durationMinutes: 25, monthlyQuota: 4 },
  });
  assert.equal(paidLight.cohort, "v7");
  assert.equal(paidLight.policy.displayName, "ライトプラン");
  assert.equal(paidLight.policy.monthlyPriceYen, 4980);
  assert.equal(paidLight.policy.durationMinutes, 50);
  assert.equal(paidLight.policy.monthlyQuota, 4);

  const mismatched = resolveMemberPolicyContext({
    member: { plan: "standard", membership_cohort: "paid_v7", agreement_version: "agreement-legacy-v4" },
    legacyPolicy: legacyStandard,
  });
  assert.equal(mismatched.isPaidV7, true);
  assert.equal(mismatched.valid, false);
});

test("v7 booking stays disabled until the server attests policy, gates, one shared store, and complete availability", () => {
  assert.equal(isV7ServerEnforcementReady({}), false);
  const readySnapshot = {
    booking_policy: {
      cohort: "paid_v7",
      agreement_version: V7_AGREEMENT_VERSION,
      rpc_contract_version: V7_RPC_CONTRACT.version,
      member_snapshot_rpc: V7_RPC_CONTRACT.memberSnapshot,
      admin_snapshot_rpc: V7_RPC_CONTRACT.adminSnapshot,
      admin_create_member_rpc: V7_RPC_CONTRACT.adminCreateMember,
      admin_update_plan_rpc: V7_RPC_CONTRACT.adminUpdatePlan,
      admin_confirm_companion_safety_rpc: V7_RPC_CONTRACT.adminConfirmCompanionSafety,
      member_add_companion_rpc: V7_RPC_CONTRACT.memberAddCompanion,
      member_create_rpc: V7_RPC_CONTRACT.memberCreate,
      member_cancel_rpc: V7_RPC_CONTRACT.memberCancel,
      admin_create_rpc: V7_RPC_CONTRACT.adminCreate,
      admin_cancel_rpc: V7_RPC_CONTRACT.adminCancel,
      server_enforced: true,
      activation_gates_enforced: true,
      late_cancellation_consumption_enforced: true,
      shared_booking_store: "single_database",
      cross_system_yoga_gym_buffer_enforced: true,
      availability: {
        complete: true,
        all_reservations: [],
        yoga_blocks: [],
        closed_slots: [],
        external_blocks: [],
      },
    },
  };
  assert.equal(isV7ServerEnforcementReady(readySnapshot), true);
  assert.equal(isV7ServerEnforcementReady({
    ...readySnapshot,
    booking_policy: { ...readySnapshot.booking_policy, shared_booking_store: "separate_databases" },
  }), false);
  assert.equal(isV7ServerEnforcementReady({
    ...readySnapshot,
    booking_policy: { ...readySnapshot.booking_policy, cross_system_yoga_gym_buffer_enforced: false },
  }), false);
  assert.equal(isV7ServerEnforcementReady({
    ...readySnapshot,
    booking_policy: { ...readySnapshot.booking_policy, member_create_rpc: "fs_member_create_reservation_v2" },
  }), false);
  assert.equal(isV7ServerEnforcementReady({
    ...readySnapshot,
    booking_policy: { ...readySnapshot.booking_policy, rpc_contract_version: "legacy" },
  }), false);
  assert.equal(isV7ServerEnforcementReady({
    booking_policy: {
      cohort: "paid_v7",
      agreement_version: V7_AGREEMENT_VERSION,
      rpc_contract_version: V7_RPC_CONTRACT.version,
      member_snapshot_rpc: V7_RPC_CONTRACT.memberSnapshot,
      admin_snapshot_rpc: V7_RPC_CONTRACT.adminSnapshot,
      admin_create_member_rpc: V7_RPC_CONTRACT.adminCreateMember,
      admin_update_plan_rpc: V7_RPC_CONTRACT.adminUpdatePlan,
      admin_confirm_companion_safety_rpc: V7_RPC_CONTRACT.adminConfirmCompanionSafety,
      member_add_companion_rpc: V7_RPC_CONTRACT.memberAddCompanion,
      member_create_rpc: V7_RPC_CONTRACT.memberCreate,
      member_cancel_rpc: V7_RPC_CONTRACT.memberCancel,
      admin_create_rpc: V7_RPC_CONTRACT.adminCreate,
      admin_cancel_rpc: V7_RPC_CONTRACT.adminCancel,
      server_enforced: true,
      activation_gates_enforced: true,
      late_cancellation_consumption_enforced: true,
      shared_booking_store: "single_database",
      cross_system_yoga_gym_buffer_enforced: true,
      availability: { complete: true, all_reservations: [], yoga_blocks: [], closed_slots: [] },
    },
  }), false);
});

test("admin proxy bookings stay disabled until server usage and companion checks are attested", () => {
  const snapshot = {
    booking_policy: {
      cohort: "paid_v7",
      agreement_version: V7_AGREEMENT_VERSION,
      rpc_contract_version: V7_RPC_CONTRACT.version,
      member_snapshot_rpc: V7_RPC_CONTRACT.memberSnapshot,
      admin_snapshot_rpc: V7_RPC_CONTRACT.adminSnapshot,
      admin_create_member_rpc: V7_RPC_CONTRACT.adminCreateMember,
      admin_update_plan_rpc: V7_RPC_CONTRACT.adminUpdatePlan,
      admin_confirm_companion_safety_rpc: V7_RPC_CONTRACT.adminConfirmCompanionSafety,
      member_add_companion_rpc: V7_RPC_CONTRACT.memberAddCompanion,
      member_create_rpc: V7_RPC_CONTRACT.memberCreate,
      member_cancel_rpc: V7_RPC_CONTRACT.memberCancel,
      admin_create_rpc: V7_RPC_CONTRACT.adminCreate,
      admin_cancel_rpc: V7_RPC_CONTRACT.adminCancel,
      server_enforced: true,
      activation_gates_enforced: true,
      late_cancellation_consumption_enforced: true,
      shared_booking_store: "single_database",
      cross_system_yoga_gym_buffer_enforced: true,
      availability: {
        complete: true,
        all_reservations: [],
        yoga_blocks: [],
        closed_slots: [],
        external_blocks: [],
      },
    },
  };
  assert.equal(isV7AdminProxyReady(snapshot), false);
  snapshot.booking_policy.admin_proxy_server_enforced = true;
  snapshot.booking_policy.member_usage_complete = true;
  snapshot.booking_policy.companion_safety_enforced = true;
  assert.equal(isV7AdminProxyReady(snapshot), true);
});

test("v7 booking cutoffs and buffer rules match the published terms", () => {
  assert.equal(V7_BOOKING_RULES.dailyLimit, 1);
  assert.equal(V7_BOOKING_RULES.bookingDays, 14);
  assert.equal(V7_BOOKING_RULES.startIntervalMinutes, 10);
  assert.equal(V7_BOOKING_RULES.bookingCutoffPreviousDayMinute, 1320);
  assert.equal(V7_BOOKING_RULES.sameDayBookingAllowed, false);
  assert.equal(V7_BOOKING_RULES.cancellationCutoffPreviousDayMinute, 1320);
  assert.equal(V7_BOOKING_RULES.lateCancellationConsumesVisit, true);
  assert.equal(V7_BOOKING_RULES.bufferMinutesBefore, 10);
  assert.equal(V7_BOOKING_RULES.bufferMinutesAfter, 10);
  assert.equal(V7_PLANS.free.maxChildren, null);
  assert.equal(V7_PLANS.standard.maxChildren, null);
  assert.equal(V7_PLANS.premium.maxChildren, null);
  assert.equal(V7_PLANS.standard.accompanyingAdults, 1);
  assert.equal(V7_PLANS.premium.accompanyingAdultMustBeRegistered, true);
});

test("JST month changes at midnight and month usage follows the reserved date", () => {
  assert.equal(tokyoDateKey("2026-10-31T14:59:59.999Z"), "2026-10-31");
  assert.equal(tokyoDateKey("2026-10-31T15:00:00.000Z"), "2026-11-01");
  assert.equal(tokyoMonthKey("2026-10-31T15:00:00.000Z"), "2026-11");

  const octoberVisits = Array.from({ length: 4 }, (_, index) => ({
    id: `synthetic-oct-${index}`,
    date: `2026-10-${String(index + 1).padStart(2, "0")}`,
    visitOutcome: "attended",
  }));
  assert.equal(countMonthlyConsumedVisits(octoberVisits, "2026-10-31"), 4);
  assert.equal(countMonthlyConsumedVisits(octoberVisits, "2026-11-01"), 0);

  const novemberBooking = evaluateV7Booking(readyBooking({
    planCode: "free",
    now: "2026-10-31T12:59:00.000Z",
    bookingDate: "2026-11-01",
    reservations: octoberVisits,
  }));
  assert.equal(novemberBooking.allowed, true);
});

test("14-day booking horizon is inclusive, but same-day and day 15 are rejected", () => {
  const now = "2026-10-01T00:00:00.000Z";
  assert.equal(isWithinV7BookingWindow({ now, bookingDate: "2026-10-02" }), true);
  assert.equal(isWithinV7BookingWindow({ now, bookingDate: "2026-10-15" }), true);
  assert.equal(isWithinV7BookingWindow({ now, bookingDate: "2026-10-16" }), false);
  assert.equal(isWithinV7BookingWindow({ now, bookingDate: "2026-10-01" }), false);
  assert.equal(evaluateV7Booking(readyBooking({ bookingDate: "2026-10-13" })).reason, "outside_booking_window");
});

test("v7 booking fails closed until all availability inputs have been loaded", () => {
  const { availabilitySnapshotReady: _loaded, ...missingSnapshot } = readyBooking();
  assert.equal(evaluateV7Booking(missingSnapshot).reason, "availability_unavailable");
  assert.equal(evaluateV7Booking({ ...readyBooking(), availabilitySnapshotReady: false }).reason, "availability_unavailable");
  assert.equal(evaluateV7Booking(readyBooking()).allowed, true);
});

test("booking and cancellation cutoff is strictly before 22:00 JST the previous day", () => {
  const bookingDate = "2026-10-14";
  assert.equal(isBeforeV7BookingCutoff({ now: "2026-10-13T12:59:59.999Z", bookingDate }), true);
  assert.equal(isBeforeV7BookingCutoff({ now: "2026-10-13T13:00:00.000Z", bookingDate }), false);
  assert.equal(isBeforeV7BookingCutoff({ now: "2026-10-13T13:00:00.001Z", bookingDate }), false);
  assert.equal(isV7CancellationOnTime({
    membershipCohort: "paid_v7",
    agreementVersion: V7_AGREEMENT_VERSION,
    now: "2026-10-13T12:59:59.999Z",
    bookingDate,
  }), true);
  assert.equal(isV7CancellationOnTime({
    membershipCohort: "paid_v7",
    agreementVersion: V7_AGREEMENT_VERSION,
    now: "2026-10-13T13:00:00.000Z",
    bookingDate,
  }), false);
  assert.equal(evaluateV7Booking(readyBooking({ now: "2026-10-13T13:00:00.000Z" })).reason, "booking_cutoff_passed");
});

test("monthly, daily, and concurrent limits count different synthetic boundaries", () => {
  const fullLightMonth = Array.from({ length: 4 }, (_, index) => ({
    id: `synthetic-light-${index}`,
    date: `2026-10-${String(index + 1).padStart(2, "0")}`,
    visitOutcome: "attended",
  }));
  assert.equal(evaluateV7Booking(readyBooking({ planCode: "free", reservations: fullLightMonth })).reason, "monthly_quota_reached");

  const sameDay = [{
    id: "synthetic-same-day",
    date: "2026-10-14",
    startMinute: 480,
    use_minutes_snapshot: 50,
    visitOutcome: "reserved",
  }];
  assert.equal(countDailyConsumedVisits(sameDay, "2026-10-14"), 1);
  assert.equal(evaluateV7Booking(readyBooking({ reservations: sameDay })).reason, "daily_limit_reached");

  const futureReservations = ["2026-10-15", "2026-10-16"].map((date, index) => ({
    id: `synthetic-future-${index}`,
    date,
    startMinute: 600,
    use_minutes_snapshot: 50,
    visitOutcome: "reserved",
  }));
  assert.equal(countActiveReservations(futureReservations, "2026-10-13T12:00:00.000Z"), 2);
  assert.equal(evaluateV7Booking(readyBooking({ reservations: futureReservations })).reason, "concurrent_limit_reached");
});

test("late cancellation and no-show consume once; an on-time cancellation releases the visit", () => {
  const reservation = [{ id: "synthetic-visit-1", date: "2026-10-14", visitOutcome: "reserved" }];
  const late = setVisitOutcomeOnce(reservation, "synthetic-visit-1", "late_cancelled");
  const duplicateLateEvent = setVisitOutcomeOnce(late, "synthetic-visit-1", "late_cancelled");
  const conflictingSecondEvent = setVisitOutcomeOnce(late, "synthetic-visit-1", "no_show");

  assert.equal(countMonthlyConsumedVisits(late, "2026-10-14"), 1);
  assert.equal(countDailyConsumedVisits(late, "2026-10-14"), 1);
  assert.equal(late[0].cancelled, true);
  assert.equal(countActiveReservations(late, "2026-10-13T12:00:00.000Z"), 0);
  assert.deepEqual(duplicateLateEvent, late);
  assert.deepEqual(conflictingSecondEvent, late);

  const onTime = setVisitOutcomeOnce(reservation, "synthetic-visit-1", "on_time_cancelled");
  assert.equal(countMonthlyConsumedVisits(onTime, "2026-10-14"), 0);
  assert.equal(countDailyConsumedVisits(onTime, "2026-10-14"), 0);
  const previouslyCancelled = [{ id: "synthetic-cancelled", date: "2026-10-14", cancelled: true }];
  assert.deepEqual(setVisitOutcomeOnce(previouslyCancelled, "synthetic-cancelled", "late_cancelled"), previouslyCancelled);
});

test("synthetic historical FPLV duration snapshots stay 40 minutes while v7 policy is 50 minutes", () => {
  const legacyReservation = { id: "synthetic-legacy-reservation", use_minutes_snapshot: 40 };
  const before = structuredClone(legacyReservation);
  const v7 = resolveBookingPolicy({
    membershipCohort: "paid_v7",
    agreementVersion: V7_AGREEMENT_VERSION,
    planCode: "standard",
  });

  assert.equal(getReservationDurationMinutes(legacyReservation), 40);
  assert.equal(v7.policy.durationMinutes, 50);
  assert.equal(getReservationDurationMinutes({ id: "synthetic-v7-reservation", use_minutes_snapshot: 50 }), 50);
  assert.deepEqual(legacyReservation, before);
});

test("synthetic historical FPLV 10-minute booking buffers preserve the stored snapshot length", () => {
  const legacy40 = [{ id: "synthetic-legacy-40", date: "2026-10-14", startMinute: 540, use_minutes_snapshot: 40 }];
  const v7_50 = [{ id: "synthetic-v7-50", date: "2026-10-14", startMinute: 540, use_minutes_snapshot: 50 }];

  assert.equal(hasV7ReservationBufferConflict("2026-10-14", 600, 50, legacy40), false);
  assert.equal(hasV7ReservationBufferConflict("2026-10-14", 600, 50, v7_50), true);
  assert.equal(hasV7ReservationBufferConflict("2026-10-14", 610, 50, v7_50), false);
  assert.equal(hasV7ReservationBufferConflict("2026-10-14", 600, 50, [{ id: "synthetic-unknown-length", date: "2026-10-14", startMinute: 540 }]), true);
});

test("confirmed Akw legacy reservation rows without a duration snapshot use the current fixed 50 minutes", () => {
  const akwRow = {
    id: "akw-reservation-01",
    member_id: "akw-member-01",
    date: "2026-10-16",
    start_minute: 600,
    people: "member",
    note: null,
    created_by: "member",
    cancelled: false,
    created_at: "2026-10-15T01:00:00.000Z",
    cancelled_at: null,
  };
  const before = structuredClone(akwRow);
  assert.equal(Object.hasOwn(akwRow, "use_minutes_snapshot"), false);
  assert.equal(getReservationDurationMinutes(akwRow), null);
  assert.equal(normalizeAkwLegacyReservationForConflict(akwRow).use_minutes_snapshot, 50);
  assert.deepEqual(akwRow, before);
  assert.equal(normalizeAkwLegacyReservationForConflict({ ...akwRow, use_minutes_snapshot: 40 }).use_minutes_snapshot, 40);
});

test("synthetic Gym booking flow honors exact 30-minute Yoga separation in both directions", () => {
  const yoga = [{ date: "2026-10-14", startMinute: 600, endMinute: 650 }];
  const conflictForGap = (gap) => gap < 30;

  for (const gap of [29, 30, 31]) {
    const gymBeforeYoga = 600 - 50 - gap;
    const gymAfterYoga = 650 + gap;
    assert.equal(hasV7YogaBufferConflict("2026-10-14", gymBeforeYoga, 50, yoga), conflictForGap(gap), `Gym before Yoga, ${gap}-minute gap`);
    assert.equal(hasV7YogaBufferConflict("2026-10-14", gymAfterYoga, 50, yoga), conflictForGap(gap), `Gym after Yoga, ${gap}-minute gap`);
  }

  assert.equal(evaluateV7Booking(readyBooking({ startMinute: 520, yogaBlocks: yoga })).allowed, true);
  assert.equal(evaluateV7Booking(readyBooking({ startMinute: 530, yogaBlocks: yoga })).reason, "yoga_buffer_conflict");
  assert.equal(evaluateV7Booking(readyBooking({ startMinute: 670, yogaBlocks: yoga })).reason, "yoga_buffer_conflict");
  assert.equal(evaluateV7Booking(readyBooking({ startMinute: 680, yogaBlocks: yoga })).allowed, true);

  const nextDayYoga = [{ date: "2026-10-15", startMinute: 30, endMinute: 60 }];
  assert.equal(hasV7YogaBufferConflict("2026-10-14", 1390, 50, nextDayYoga), false);
  assert.equal(hasV7YogaBufferConflict("2026-10-14", 1400, 50, nextDayYoga), true);
});

test("local exact-buffer candidate covers central confirmed Yoga without silently merging unknown stores", () => {
  assert.match(exactYogaBufferSql, /public\.fs_yoga_private_reservations/);
  assert.doesNotMatch(exactYogaBufferSql, /public\.blossom_private_bookings/);
  assert.doesNotMatch(exactYogaBufferSql, /public\.fs_external_blocks/);
  assert.match(exactYogaBufferSql, /p_start_minute-30/);
  assert.match(exactYogaBufferSql, /p_end_minute\+30/);
  assert.match(adminScreen, /sharedYogaConflict/);
  assert.match(adminProxy, /closedSlots:\[\.\.\.\(availability\?\.closed_slots\|\|\[\]\),\.\.\.fixedBlocks\]/);
  assert.match(exactYogaBufferSql, /y\.date::timestamp \+ make_interval\(mins=>y\.end_minute\+30\)/);
  assert.match(exactYogaBufferSql, /y\.date::timestamp \+ make_interval\(mins=>y\.start_minute-30\)/);
  assert.doesNotMatch(exactYogaBufferSql, /r\.start_minute-10|r\.start_minute\+coalesce\(r\.use_minutes_snapshot,40\)\+10/);

  const yogaCreateIndex = atomicYogaSql.indexOf("if public.fs_yoga_conflicts_gym(");
  const yogaInsertIndex = atomicYogaSql.indexOf("insert into public.fs_yoga_private_reservations", yogaCreateIndex);
  assert.ok(yogaCreateIndex >= 0 && yogaInsertIndex > yogaCreateIndex, "Yoga create checks Gym conflicts before inserting");
  assert.match(atomicYogaSql, /create trigger fs_reservations_yoga_guard_trg before insert or update of date,start_minute,cancelled,use_minutes_snapshot\s+on public\.fs_reservations/);
  assert.match(atomicYogaSql, /if public\.fs_gym_conflicts_yoga\(new\.date,new\.start_minute,use_mins\) then/);
  assert.match(exactYogaBufferSql, /fs_yoga_private_reservations_gym_guard\(\)\s+returns trigger/);
  assert.match(exactYogaBufferSql, /before insert or update of date,start_minute,end_minute,cancelled\s+on public\.fs_yoga_private_reservations/);
  assert.equal((exactYogaBufferSql.match(/shared-booking:global/g) || []).length, 2);
  assert.match(exactYogaBufferSql, /create trigger fs_reservations_yoga_guard_trg\s+before insert or update of date,start_minute,cancelled,use_minutes_snapshot\s+on public\.fs_reservations[\s\S]*?execute function public\.fs_reservations_yoga_guard\(\)/);
  assert.match(exactYogaBufferSql, /create trigger fs_yoga_private_reservations_gym_guard_trg\s+before insert or update of date,start_minute,end_minute,cancelled\s+on public\.fs_yoga_private_reservations[\s\S]*?execute function public\.fs_yoga_private_reservations_gym_guard\(\)/);
  const gymWriteGuard = exactYogaBufferSql.match(/function public\.fs_reservations_yoga_guard\(\)([\s\S]*?)\$\$;/)?.[1] || "";
  const yogaWriteGuardExact = exactYogaBufferSql.match(/function public\.fs_yoga_private_reservations_gym_guard\(\)([\s\S]*?)\$\$;/)?.[1] || "";
  assert.ok(gymWriteGuard.indexOf("pg_advisory_xact_lock") < gymWriteGuard.indexOf("from public.fs_yoga_private_reservations"));
  assert.ok(yogaWriteGuardExact.indexOf("pg_advisory_xact_lock") < yogaWriteGuardExact.indexOf("from public.fs_reservations"));
  assert.match(gymWriteGuard, /from public\.fs_yoga_private_reservations[\s\S]*?y\.end_minute\+30[\s\S]*?y\.start_minute-30/);
  assert.match(yogaWriteGuardExact, /new\.start_minute-30\)[\s\S]*?<\s*r\.date::timestamp\+make_interval\(mins=>r\.start_minute\+coalesce\(r\.use_minutes_snapshot,40\)\)[\s\S]*?r\.date::timestamp\+make_interval\(mins=>r\.start_minute\)[\s\S]*?<\s*new\.date::timestamp\+make_interval\(mins=>new\.end_minute\+30\)/);
  assert.doesNotMatch(yogaWriteGuardExact, /new\.start_minute-30\)[\s\S]*?<\s*new\.date::timestamp\+make_interval\(mins=>new\.end_minute\)/);
  assert.match(exactYogaBufferSql, /revoke all on function public\.fs_yoga_conflicts_gym\(date,integer,integer,uuid\) from PUBLIC, anon, authenticated/);
  const yogaWriteGuard = exactYogaBufferSql.match(/function public\.fs_yoga_private_reservations_gym_guard\(\)([\s\S]*?)\$\$;/)?.[1] || "";
  const sameYogaCheck = yogaWriteGuard.slice(0, yogaWriteGuard.indexOf("-- Recheck Gym rows"));
  assert.match(sameYogaCheck, /y\.id\s+is distinct from\s+new\.id/);
  assert.match(sameYogaCheck, /new\.start_minute\)[\s\S]*?<\s*y\.date::timestamp\+make_interval\(mins=>y\.end_minute\)/);
  assert.match(sameYogaCheck, /y\.start_minute\)[\s\S]*?<\s*new\.date::timestamp\+make_interval\(mins=>new\.end_minute\)/);
  assert.doesNotMatch(sameYogaCheck, /new\.start_minute-30|new\.end_minute\+30|y\.start_minute-30|y\.end_minute\+30/);
});

test("manual policy assignment protects new members without linking a consent record", () => {
  assert.match(v7CandidateSql, /policy_assignment_id uuid primary key/);
  assert.match(v7CandidateSql, /member_id uuid not null unique references public\.fs_members/);
  assert.doesNotMatch(v7CandidateSql, /agreement_registration_id|create_member_from_consent/);
  assert.match(v7CandidateSql, /not public\.fs_v7_write_authorized\(old\.member_id\)/);
  assert.doesNotMatch(v7CandidateSql, /current_setting\('app\.gym24_v7_write'/);
  assert.match(v7CandidateSql, /before update of status,plan,member_code,name,email,pin on public\.fs_members/);
  assert.match(v7CandidateSql, /where request_id=p_request_id/);
  assert.match(v7CandidateSql, /grant execute on function public\.fs_v7_admin_create_member[\s\S]*to authenticated/);
  assert.match(v7CandidateSql, /revoke all on public\.fs_v7_resource_scope[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(v7CandidateSql, /select .*email.*from public\.fs_members/i);
});

test("candidate Gym-Yoga interval model preserves 40/50/null snapshots and permits exactly 30 minutes across midnight", () => {
  const dayOrdinal = (date) => Date.parse(`${date}T00:00:00Z`) / 60000;
  const overlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;
  const gymYogaConflict = ({ gymDate, gymStart, snapshot, privateDate, privateStart, privateDuration = 50 }) => {
    const gymDuration = snapshot ?? 40;
    const gymStartAbsolute = dayOrdinal(gymDate) + gymStart;
    const privateStartAbsolute = dayOrdinal(privateDate) + privateStart;
    return overlap(
      privateStartAbsolute,
      privateStartAbsolute + privateDuration,
      gymStartAbsolute - 30,
      gymStartAbsolute + gymDuration + 30,
    );
  };

  for (const snapshot of [null, 40, 50]) {
    const duration = snapshot ?? 40;
    const gymEnd = 600 + duration;
    assert.equal(gymYogaConflict({ gymDate: "2026-10-14", gymStart: 600, snapshot, privateDate: "2026-10-14", privateStart: gymEnd + 20 }), true);
    assert.equal(gymYogaConflict({ gymDate: "2026-10-14", gymStart: 600, snapshot, privateDate: "2026-10-14", privateStart: gymEnd + 30 }), false);
    assert.equal(gymYogaConflict({ gymDate: "2026-10-14", gymStart: 600, snapshot, privateDate: "2026-10-14", privateStart: gymEnd + 40 }), false);
  }

  assert.equal(gymYogaConflict({ gymDate: "2026-10-14", gymStart: 1400, snapshot: 40, privateDate: "2026-10-15", privateStart: 20 }), true);
  assert.equal(gymYogaConflict({ gymDate: "2026-10-14", gymStart: 1400, snapshot: 40, privateDate: "2026-10-15", privateStart: 30 }), false);
  assert.equal(gymYogaConflict({ gymDate: "2026-10-15", gymStart: 10, snapshot: 50, privateDate: "2026-10-14", privateStart: 1390 }), true);
  assert.equal(gymYogaConflict({ gymDate: "2026-10-15", gymStart: 30, snapshot: 50, privateDate: "2026-10-14", privateStart: 1390 }), false);
});

test("synthetic shared-lock model admits only one conflicting Gym-Yoga write in either order", async () => {
  const dayOrdinal = (date) => Date.parse(`${date}T00:00:00Z`) / 60000;
  const overlapsWithBuffer = (candidate, existing) =>
    candidate.start < existing.end + 30 && existing.start - 30 < candidate.end;
  const run = async (order) => {
    const bookings = [];
    let lock = Promise.resolve();
    const write = (booking) => {
      const previous = lock;
      let release;
      lock = new Promise((resolve) => { release = resolve; });
      return (async () => {
        await previous;
        try {
          if (bookings.some((existing) => overlapsWithBuffer(booking, existing))) return false;
          bookings.push(booking);
          return true;
        } finally {
          release();
        }
      })();
    };
    const candidates = {
      gym: { type: "gym", start: dayOrdinal("2026-10-14") + 1400, end: dayOrdinal("2026-10-14") + 1440 },
      yoga: { type: "yoga", start: dayOrdinal("2026-10-15") + 20, end: dayOrdinal("2026-10-15") + 70 },
    };
    const results = await Promise.all(order.map((kind) => write(candidates[kind])));
    return { results, bookings };
  };

  for (const order of [["gym", "yoga"], ["yoga", "gym"]]) {
    const { results, bookings } = await run(order);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(bookings.length, 1);
  }
});

test("all non-central resource stores are guarded by explicit shared/separate confirmations", () => {
  for (const name of ["fs_external_blocks", "blossom_private_bookings", "g24_reservations"]) {
    assert.match(v7CandidateSql, new RegExp(`\\('${name}','unsupported'`));
  }
  assert.match(v7CandidateSql, /scope_status='unconfirmed'/);
  assert.match(v7CandidateSql, /resource_scope_unconfirmed/);
  assert.match(v7CandidateSql, /with required\(source_key\) as \(values[\s\S]*\('fs_reservations'\)[\s\S]*\('g24_reservations'\)/);
  assert.match(v7CandidateSql, /r\.source_key in \('fs_external_blocks','blossom_private_bookings','g24_reservations'\)/);
  assert.doesNotMatch(exactYogaBufferSql, /blossom_private_bookings/);
});

test("V7 companions require member attendance and one registered safety-cleared adult", () => {
  const childOnly = {
    planCode: "free",
    memberPresent: true,
    adults: [],
    children: [{ id: "synthetic-child-1" }, { id: "synthetic-child-2" }],
    childrenSupervised: true,
  };
  const clearedAdult = { id: "synthetic-adult-1", registered: true, safetyCheckPassed: true };

  assert.equal(validateV7Companions(childOnly), true);
  assert.equal(validateV7Companions({ ...childOnly, adults: [clearedAdult] }), false);
  assert.equal(validateV7Companions({ planCode: "standard", memberPresent: true, adults: [clearedAdult] }), true);
  assert.equal(validateV7Companions({ planCode: "premium", memberPresent: false, adults: [clearedAdult] }), false);
  assert.equal(validateV7Companions({ planCode: "standard", adults: [{ ...clearedAdult, safetyCheckPassed: false }] }), false);
  assert.equal(validateV7Companions({ planCode: "standard", adults: [clearedAdult, { ...clearedAdult, id: "synthetic-adult-2" }] }), false);
  assert.equal(validateV7Companions({ ...childOnly, childrenSupervised: false }), false);
});

test("closed and external blocks are checked against v7's protected interval", () => {
  const closed = [{ date: "2026-10-14", startMinute: 600, blockMinutes: 50 }];
  const external = [{ date: "2026-10-14", startMinute: 600, endMinute: 660 }];

  assert.equal(evaluateV7Booking(readyBooking({ startMinute: 560, closedSlots: closed })).reason, "closed_slot_conflict");
  assert.equal(evaluateV7Booking(readyBooking({ startMinute: 560, externalBlocks: external })).reason, "external_block_conflict");
  assert.equal(evaluateV7Booking(readyBooking({ startMinute: 1430 })).reason, "invalid_start_time");
});
