import { V7_AGREEMENT_VERSION, V7_PLANS, V7_BOOKING_SOURCES } from "./member-cohort-policy.mjs";

export const V7_STORAGE_CANDIDATE = Object.freeze({
  membershipTable: "fs_v7_membership_links",
  reservationOutcomeTable: "fs_v7_reservation_details",
  resourceScopeTable: "fs_v7_resource_scope",
  membershipUniqueKeys: Object.freeze(["policy_assignment_id", "member_id"]),
  reservationOutcomeUniqueKeys: Object.freeze(["reservation_id"]),
  automaticallyLinksConsent: false,
  accountLookupKey: "member_id",
  matchesAccountsByEmail: false,
  storesPaymentCredentials: false,
  storesMemberProfileFields: false,
});

export const V7_REQUIRED_RESOURCE_SOURCES = V7_BOOKING_SOURCES;

const TERMINAL_OUTCOMES = new Set([
  "attended",
  "late_cancelled",
  "no_show",
  "on_time_cancelled",
  "store_cancelled",
]);

function requiredId(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} is required`);
  }
  return value.trim();
}

export function createManualV7Membership({ memberId, agreementVersion, planCode, operatorApproved }) {
  if (agreementVersion !== V7_AGREEMENT_VERSION) throw new TypeError("Unknown agreement version");
  if (!Object.prototype.hasOwnProperty.call(V7_PLANS, planCode)) throw new TypeError("Unknown V7 plan");
  if (operatorApproved !== true) throw new TypeError("Explicit administrator assignment is required");
  return Object.freeze({
    membership_cohort: "paid_v7", member_id: requiredId(memberId, "memberId"),
    agreement_version: agreementVersion, plan_code: planCode, status: "active",
    activation_gates: Object.freeze({ operatorApproved: true }),
  });
}

export function resolveV7ResourceScope(sourceRows) {
  if (!Array.isArray(sourceRows)) return { complete: false, unresolved: [...V7_REQUIRED_RESOURCE_SOURCES] };
  const byName = new Map(sourceRows.map((row) => [row.source_key, row]));
  const unresolved = V7_REQUIRED_RESOURCE_SOURCES.filter((source) => {
    const row = byName.get(source);
    return !row
      || row.scope_status !== "shared"
      || row.integration_status !== "ready";
  });
  for (const row of sourceRows) {
    if (!V7_REQUIRED_RESOURCE_SOURCES.includes(row.source_key) && row.scope_status === "shared") {
      unresolved.push(row.source_key);
    }
  }
  return { complete: unresolved.length === 0, unresolved };
}

export function createV7ReservationOutcome({ reservationId, memberId, agreementVersion }) {
  if (agreementVersion !== V7_AGREEMENT_VERSION) throw new TypeError("Unknown agreement version");
  return Object.freeze({
    reservation_id: requiredId(reservationId, "reservationId"),
    member_id: requiredId(memberId, "memberId"),
    membership_cohort: "paid_v7",
    agreement_version: agreementVersion,
    duration_minutes: 50,
    visit_outcome: "reserved",
    consumes_visit: true,
  });
}

export function recordV7VisitOutcome(record, outcome) {
  if (!TERMINAL_OUTCOMES.has(outcome)) throw new TypeError("Unknown terminal visit outcome");
  if (record?.membership_cohort !== "paid_v7" || record?.agreement_version !== V7_AGREEMENT_VERSION) {
    throw new TypeError("Reservation is not recognized as V7");
  }
  if (record.visit_outcome !== "reserved") {
    if (record.visit_outcome === outcome) return record;
    throw new Error("A V7 reservation outcome is immutable after it is recorded");
  }
  const consumesVisit = !["on_time_cancelled", "store_cancelled"].includes(outcome);
  return Object.freeze({ ...record, visit_outcome: outcome, consumes_visit: consumesVisit });
}

export function normalizeAkwLegacyReservationForConflict(reservation) {
  const duration = Number(reservation?.use_minutes_snapshot);
  return {
    ...reservation,
    use_minutes_snapshot: Number.isFinite(duration) && duration > 0 ? duration : 50,
  };
}
