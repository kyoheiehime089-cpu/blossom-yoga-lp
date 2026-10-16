export const V7_AGREEMENT_VERSION = "agreement-2026-10-13-paid-v7";
export const V7_AGREEMENT_URL = "https://gyotoku-gym24-agreement.vercel.app/";
export const V7_RPC_CONTRACT = Object.freeze({
  version: "paid-v7-booking-v1",
  memberSnapshot: "fs_v7_member_snapshot",
  adminSnapshot: "fs_v7_admin_snapshot",
  adminCreateMember: "fs_v7_admin_create_member",
  adminUpdatePlan: "fs_v7_admin_update_plan",
  adminConfirmCompanionSafety: "fs_v7_admin_confirm_companion_safety",
  memberAddCompanion: "fs_v7_member_add_companion",
  memberCreate: "fs_v7_member_create_reservation",
  memberCancel: "fs_v7_member_cancel_reservation",
  adminCreate: "fs_v7_admin_create_reservation",
  adminCancel: "fs_v7_admin_cancel_reservation",
});

export const V7_PLANS = Object.freeze({
  free: Object.freeze({
    policyKey: "v7_light",
    displayName: "ライトプラン",
    monthlyPriceYen: 4980,
    durationMinutes: 50,
    monthlyQuota: 4,
    bookingDays: 14,
    concurrentLimit: 1,
    dailyLimit: 1,
    accompanyingAdults: 0,
    maxChildren: null,
    childrenAllowed: true,
    memberMustAttend: true,
  }),
  standard: Object.freeze({
    policyKey: "v7_standard",
    displayName: "スタンダードプラン",
    monthlyPriceYen: 7980,
    durationMinutes: 50,
    monthlyQuota: 8,
    bookingDays: 14,
    concurrentLimit: 2,
    dailyLimit: 1,
    accompanyingAdults: 1,
    accompanyingAdultMustBeRegistered: true,
    accompanyingAdultMustPassSafetyCheck: true,
    maxChildren: null,
    childrenAllowed: true,
    memberMustAttend: true,
  }),
  premium: Object.freeze({
    policyKey: "v7_premium",
    displayName: "プレミアムプラン",
    monthlyPriceYen: 11980,
    durationMinutes: 50,
    monthlyQuota: 12,
    bookingDays: 14,
    concurrentLimit: 2,
    dailyLimit: 1,
    accompanyingAdults: 1,
    accompanyingAdultMustBeRegistered: true,
    accompanyingAdultMustPassSafetyCheck: true,
    maxChildren: null,
    childrenAllowed: true,
    memberMustAttend: true,
  }),
});

export const V7_BOOKING_RULES = Object.freeze({
  dailyLimit: 1,
  bookingDays: 14,
  startIntervalMinutes: 10,
  bookingCutoffPreviousDayMinute: 22 * 60,
  sameDayBookingAllowed: false,
  cancellationCutoffPreviousDayMinute: 22 * 60,
  lateCancellationConsumesVisit: true,
  bufferMinutesBefore: 10,
  bufferMinutesAfter: 10,
  entryAllowedBeforeStartMinutes: 0,
  exitDeadlineAfterEndMinutes: 0,
});

const REQUIRED_ACTIVATION_GATES = Object.freeze([
  "operatorApproved",
]);

const TOKYO_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const VISIT_OUTCOMES = new Set([
  "reserved",
  "attended",
  "late_cancelled",
  "no_show",
  "on_time_cancelled",
]);

export function resolveBookingPolicy({ membershipCohort, agreementVersion, planCode, legacyPolicy }) {
  if (membershipCohort === "paid_v7" && agreementVersion === V7_AGREEMENT_VERSION) {
    const policy = V7_PLANS[planCode];
    return policy ? { cohort: "v7", policyKey: policy.policyKey, policy } : null;
  }

  if (agreementVersion === V7_AGREEMENT_VERSION || membershipCohort === "paid_v7") return null;
  if (membershipCohort != null && membershipCohort !== "legacy") return null;
  if (!legacyPolicy) return null;

  return { cohort: "legacy", policyKey: null, policy: legacyPolicy };
}

export function resolveMemberPolicyContext({ member, snapshot, legacyPolicy }) {
  const membershipCohort = member?.membership_cohort
    ?? member?.membershipCohort
    ?? snapshot?.membership_cohort
    ?? snapshot?.membershipCohort;
  const agreementVersion = member?.agreement_version
    ?? member?.agreementVersion
    ?? snapshot?.agreement_version
    ?? snapshot?.agreementVersion;
  const isPaidV7 = membershipCohort === "paid_v7" || agreementVersion === V7_AGREEMENT_VERSION;
  const resolved = resolveBookingPolicy({
    membershipCohort,
    agreementVersion,
    planCode: member?.plan,
    legacyPolicy,
  });

  return {
    membershipCohort: membershipCohort ?? null,
    agreementVersion: agreementVersion ?? null,
    isPaidV7,
    valid: resolved != null,
    ...resolved,
  };
}

export function isV7ServerEnforcementReady(snapshot) {
  const policy = snapshot?.booking_policy;
  const availability = policy?.availability;
  return policy?.cohort === "paid_v7"
    && policy?.agreement_version === V7_AGREEMENT_VERSION
    && policy?.rpc_contract_version === V7_RPC_CONTRACT.version
    && policy?.member_snapshot_rpc === V7_RPC_CONTRACT.memberSnapshot
    && policy?.admin_snapshot_rpc === V7_RPC_CONTRACT.adminSnapshot
    && policy?.admin_create_member_rpc === V7_RPC_CONTRACT.adminCreateMember
    && policy?.admin_update_plan_rpc === V7_RPC_CONTRACT.adminUpdatePlan
    && policy?.admin_confirm_companion_safety_rpc === V7_RPC_CONTRACT.adminConfirmCompanionSafety
    && policy?.member_add_companion_rpc === V7_RPC_CONTRACT.memberAddCompanion
    && policy?.member_create_rpc === V7_RPC_CONTRACT.memberCreate
    && policy?.member_cancel_rpc === V7_RPC_CONTRACT.memberCancel
    && policy?.admin_create_rpc === V7_RPC_CONTRACT.adminCreate
    && policy?.admin_cancel_rpc === V7_RPC_CONTRACT.adminCancel
    && policy?.server_enforced === true
    && policy?.activation_gates_enforced === true
    && policy?.late_cancellation_consumption_enforced === true
    && policy?.shared_booking_store === "single_database"
    && policy?.cross_system_yoga_gym_buffer_enforced === true
    && availability?.complete === true
    && Array.isArray(availability.all_reservations)
    && Array.isArray(availability.yoga_blocks)
    && Array.isArray(availability.closed_slots)
    && Array.isArray(availability.external_blocks);
}

export function isV7AdminProxyReady(snapshot) {
  const policy = snapshot?.booking_policy;
  return isV7ServerEnforcementReady(snapshot)
    && policy?.admin_proxy_server_enforced === true
    && policy?.member_usage_complete === true
    && policy?.companion_safety_enforced === true;
}

export function hasV7ActivationGates(gates) {
  return REQUIRED_ACTIVATION_GATES.every((gate) => gates?.[gate] === true);
}

export function canBookMember({ cohort, memberStatus, activationGates }) {
  if (memberStatus !== "active") return false;
  if (cohort === "legacy") return true;
  if (cohort === "v7") return hasV7ActivationGates(activationGates);
  return false;
}

export function tokyoDateKey(value) {
  if (typeof value === "string") {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) return isValidDateParts(dateOnly) ? value : null;
  }

  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = Object.fromEntries(
    TOKYO_DATE_FORMATTER.formatToParts(instant).map(({ type, value: part }) => [type, part])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function tokyoMonthKey(value) {
  return tokyoDateKey(value)?.slice(0, 7) ?? null;
}

export function getReservationDurationMinutes(reservation) {
  const snapshot = Number(
    reservation?.useMinutesSnapshot ?? reservation?.use_minutes_snapshot ?? reservation?.use_minutes
  );
  if (Number.isFinite(snapshot) && snapshot > 0) return snapshot;
  return null;
}

export function bookingDayOffset(now, bookingDate) {
  const todayKey = tokyoDateKey(now);
  const targetKey = tokyoDateKey(bookingDate);
  const today = dateOrdinal(todayKey);
  const target = dateOrdinal(targetKey);
  return today == null || target == null ? null : target - today;
}

export function isWithinV7BookingWindow({ now, bookingDate, bookingDays = V7_BOOKING_RULES.bookingDays }) {
  const offset = bookingDayOffset(now, bookingDate);
  return offset != null && offset >= 1 && offset <= bookingDays;
}

export function v7CutoffInstant(bookingDate) {
  const dateKey = tokyoDateKey(bookingDate);
  const previousDate = addDateDays(dateKey, -1);
  return previousDate ? tokyoInstant(previousDate, V7_BOOKING_RULES.bookingCutoffPreviousDayMinute) : null;
}

export function isBeforeV7BookingCutoff({ now, bookingDate }) {
  const cutoff = v7CutoffInstant(bookingDate);
  const nowMs = new Date(now).getTime();
  return cutoff != null && Number.isFinite(nowMs) && nowMs < cutoff.getTime();
}

export function isV7CancellationOnTime({ membershipCohort, agreementVersion, now, bookingDate }) {
  if (membershipCohort !== "paid_v7" || agreementVersion !== V7_AGREEMENT_VERSION) return false;
  return isWithinV7BookingWindow({ now, bookingDate }) && isBeforeV7BookingCutoff({ now, bookingDate });
}

export function validateV7Companions({ planCode, memberPresent = true, adults = [], children = [], childrenSupervised = false }) {
  const plan = V7_PLANS[planCode];
  if (!plan || !memberPresent || !Array.isArray(adults) || !Array.isArray(children)) return false;
  if (adults.length > plan.accompanyingAdults) return false;
  if (children.length > 0 && (!plan.childrenAllowed || !childrenSupervised)) return false;

  const adultIds = new Set();
  for (const adult of adults) {
    if (!adult?.id || adultIds.has(adult.id) || adult.registered !== true || adult.safetyCheckPassed !== true) {
      return false;
    }
    adultIds.add(adult.id);
  }
  return true;
}

export function countMonthlyConsumedVisits(reservations, dateInMonth) {
  const month = tokyoMonthKey(dateInMonth);
  if (!month || !Array.isArray(reservations)) return 0;
  return uniqueReservations(reservations).filter((reservation) =>
    tokyoMonthKey(reservation.date) === month && consumesVisit(reservation)
  ).length;
}

export function countDailyConsumedVisits(reservations, date) {
  const dateKey = tokyoDateKey(date);
  if (!dateKey || !Array.isArray(reservations)) return 0;
  return uniqueReservations(reservations).filter((reservation) =>
    tokyoDateKey(reservation.date) === dateKey && consumesVisit(reservation)
  ).length;
}

export function countActiveReservations(reservations, now) {
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs) || !Array.isArray(reservations)) return 0;
  return uniqueReservations(reservations).filter((reservation) => {
    if (!isActiveReservation(reservation)) return false;
    const date = tokyoDateKey(reservation.date);
    const start = Number(reservation.startMinute ?? reservation.start_minute);
    const duration = getReservationDurationMinutes(reservation);
    if (!date || !Number.isInteger(start) || duration == null) return true;
    return tokyoInstant(date, start + duration).getTime() > nowMs;
  }).length;
}

export function setVisitOutcomeOnce(reservations, reservationId, outcome) {
  if (!VISIT_OUTCOMES.has(outcome)) throw new TypeError("Unknown visit outcome");
  if (!Array.isArray(reservations)) return reservations;
  const existing = reservations.find((reservation) => reservation.id === reservationId);
  if (!existing) return reservations;
  const previous = existing.visitOutcome ?? existing.visit_outcome;
  if (previous != null && previous !== "reserved") return reservations;
  if (existing.cancelled === true && previous !== "late_cancelled" && previous !== "no_show") return reservations;
  return reservations.map((reservation) => reservation.id === reservationId
    ? {
      ...reservation,
      visitOutcome: outcome,
      ...(outcome === "late_cancelled" || outcome === "on_time_cancelled" ? { cancelled: true } : {}),
    }
    : reservation
  );
}

export function hasV7ReservationBufferConflict(date, startMinute, durationMinutes, reservations) {
  const dateKey = tokyoDateKey(date);
  const start = Number(startMinute);
  const duration = Number(durationMinutes);
  if (!dateKey || !Number.isInteger(start) || !Number.isFinite(duration) || duration <= 0) return true;
  return (reservations || []).some((reservation) => overlapsBufferedReservations(
    dateKey,
    start,
    duration,
    reservation
  ));
}

export function hasV7YogaBufferConflict(date, startMinute, durationMinutes, yogaBlocks) {
  const dateKey = tokyoDateKey(date);
  const start = Number(startMinute);
  const duration = Number(durationMinutes);
  if (!dateKey || !Number.isInteger(start) || !Number.isFinite(duration) || duration <= 0) return true;
  return (yogaBlocks || []).some((block) => overlapsYogaBlock(
    dateKey,
    start,
    duration,
    block
  ));
}

export function evaluateV7Booking({
  membershipCohort,
  agreementVersion,
  planCode,
  memberStatus,
  activationGates,
  availabilitySnapshotReady = false,
  now,
  bookingDate,
  startMinute,
  reservations = [],
  conflictReservations = reservations,
  yogaBlocks = [],
  closedSlots = [],
  externalBlocks = [],
  companions = {},
}) {
  const resolved = resolveBookingPolicy({ membershipCohort, agreementVersion, planCode });
  if (!resolved || resolved.cohort !== "v7") return { allowed: false, reason: "unknown_cohort_or_agreement" };
  if (!canBookMember({ cohort: "v7", memberStatus, activationGates })) {
    return { allowed: false, reason: "member_not_activated", policy: resolved.policy };
  }
  if (availabilitySnapshotReady !== true) {
    return { allowed: false, reason: "availability_unavailable", policy: resolved.policy };
  }
  if (!validateV7Companions({ planCode, ...companions })) {
    return { allowed: false, reason: "companion_not_allowed", policy: resolved.policy };
  }
  if (!isWithinV7BookingWindow({ now, bookingDate })) {
    return { allowed: false, reason: "outside_booking_window", policy: resolved.policy };
  }
  if (!isBeforeV7BookingCutoff({ now, bookingDate })) {
    return { allowed: false, reason: "booking_cutoff_passed", policy: resolved.policy };
  }

  const start = Number(startMinute);
  const duration = resolved.policy.durationMinutes;
  if (!Number.isInteger(start) || start < 0 || start > 1430 || start % V7_BOOKING_RULES.startIntervalMinutes !== 0 || start + duration > 1440) {
    return { allowed: false, reason: "invalid_start_time", policy: resolved.policy };
  }

  const bookingKey = tokyoDateKey(bookingDate);
  const monthUsage = countMonthlyConsumedVisits(reservations, bookingKey);
  if (resolved.policy.monthlyQuota != null && monthUsage >= resolved.policy.monthlyQuota) {
    return { allowed: false, reason: "monthly_quota_reached", policy: resolved.policy };
  }
  if (countDailyConsumedVisits(reservations, bookingKey) >= resolved.policy.dailyLimit) {
    return { allowed: false, reason: "daily_limit_reached", policy: resolved.policy };
  }
  if (countActiveReservations(reservations, now) >= resolved.policy.concurrentLimit) {
    return { allowed: false, reason: "concurrent_limit_reached", policy: resolved.policy };
  }

  if (!Array.isArray(conflictReservations)
    || hasV7ReservationBufferConflict(bookingKey, start, duration, conflictReservations)) {
    return { allowed: false, reason: "reservation_buffer_conflict", policy: resolved.policy };
  }
  if (hasV7YogaBufferConflict(bookingKey, start, duration, yogaBlocks)) {
    return { allowed: false, reason: "yoga_buffer_conflict", policy: resolved.policy };
  }
  if (closedSlots.some((block) => overlapsFacilityBlock(bookingKey, start, duration, block, 10, 10))) {
    return { allowed: false, reason: "closed_slot_conflict", policy: resolved.policy };
  }
  if (externalBlocks.some((block) => overlapsFacilityBlock(bookingKey, start, duration, block, 10, 10))) {
    return { allowed: false, reason: "external_block_conflict", policy: resolved.policy };
  }
  return { allowed: true, reason: null, policy: resolved.policy };
}

function isValidDateParts(match) {
  const [, year, month, day] = match;
  const check = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return check.getUTCFullYear() === Number(year)
    && check.getUTCMonth() === Number(month) - 1
    && check.getUTCDate() === Number(day);
}

function dateOrdinal(dateKey) {
  if (!dateKey) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!parts || !isValidDateParts(parts)) return null;
  return Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])) / 86400000;
}

function addDateDays(dateKey, days) {
  const ordinal = dateOrdinal(dateKey);
  if (ordinal == null) return null;
  const date = new Date((ordinal + days) * 86400000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function tokyoInstant(dateKey, minute) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!parts || !isValidDateParts(parts)) return null;
  return new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])) + (Number(minute) - 540) * 60000);
}

function uniqueReservations(reservations) {
  const seen = new Set();
  return reservations.filter((reservation, index) => {
    if (!reservation) return false;
    const key = reservation.id == null ? `row:${index}` : `id:${reservation.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function visitOutcome(reservation) {
  return reservation.visitOutcome
    ?? reservation.visit_outcome
    ?? (reservation.cancelled === true ? "on_time_cancelled" : "reserved");
}

function consumesVisit(reservation) {
  return visitOutcome(reservation) !== "on_time_cancelled";
}

function isActiveReservation(reservation) {
  if (reservation.cancelled === true) return false;
  const outcome = reservation.visitOutcome ?? reservation.visit_outcome;
  return !["attended", "late_cancelled", "no_show", "on_time_cancelled"].includes(outcome);
}

function overlapsBufferedReservations(dateKey, start, duration, reservation) {
  if (!isActiveReservation(reservation)) return false;
  const otherDate = tokyoDateKey(reservation.date);
  const otherStart = Number(reservation.startMinute ?? reservation.start_minute);
  const otherDuration = getReservationDurationMinutes(reservation);
  if (!otherDate || !Number.isInteger(otherStart) || otherDuration == null) return true;
  const candidateStart = tokyoInstant(dateKey, start - V7_BOOKING_RULES.bufferMinutesBefore).getTime();
  const candidateEnd = tokyoInstant(dateKey, start + duration + V7_BOOKING_RULES.bufferMinutesAfter).getTime();
  const otherIntervalStart = tokyoInstant(otherDate, otherStart - V7_BOOKING_RULES.bufferMinutesBefore).getTime();
  const otherIntervalEnd = tokyoInstant(otherDate, otherStart + otherDuration + V7_BOOKING_RULES.bufferMinutesAfter).getTime();
  return candidateStart < otherIntervalEnd && otherIntervalStart < candidateEnd;
}

function overlapsYogaBlock(dateKey, start, duration, block) {
  const yogaDate = tokyoDateKey(block?.date);
  const yogaStart = Number(block?.startMinute ?? block?.start_minute);
  const yogaEnd = Number(block?.endMinute ?? block?.end_minute);
  if (!yogaDate || !Number.isInteger(yogaStart) || !Number.isInteger(yogaEnd) || yogaEnd <= yogaStart) return true;
  const gymStart = tokyoInstant(dateKey, start).getTime();
  const gymEnd = tokyoInstant(dateKey, start + duration).getTime();
  const yogaWindowStart = tokyoInstant(yogaDate, yogaStart - 30).getTime();
  const yogaWindowEnd = tokyoInstant(yogaDate, yogaEnd + 30).getTime();
  return gymStart < yogaWindowEnd && yogaWindowStart < gymEnd;
}

function overlapsFacilityBlock(dateKey, start, duration, block, beforeMinutes, afterMinutes) {
  const blockDate = tokyoDateKey(block?.date);
  const blockStart = Number(block?.startMinute ?? block?.start_minute);
  const blockEnd = Number(block?.endMinute ?? block?.end_minute);
  const blockDuration = Number(block?.blockMinutes ?? block?.block_minutes ?? block?.durationMinutes ?? (blockEnd - blockStart));
  if (!blockDate || !Number.isInteger(blockStart) || !Number.isFinite(blockDuration) || blockDuration <= 0) return true;
  const requestStart = tokyoInstant(dateKey, start - beforeMinutes).getTime();
  const requestEnd = tokyoInstant(dateKey, start + duration + afterMinutes).getTime();
  const blockedStart = tokyoInstant(blockDate, blockStart).getTime();
  const blockedEnd = tokyoInstant(blockDate, blockStart + blockDuration).getTime();
  return requestStart < blockedEnd && blockedStart < requestEnd;
}
