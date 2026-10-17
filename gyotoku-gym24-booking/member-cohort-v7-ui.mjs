import * as policy from "./member-cohort-policy.mjs?v=3";

const AGREEMENT_VERSION = policy.V7_AGREEMENT_VERSION;
const AGREEMENT_URL = policy.V7_AGREEMENT_URL;

function escape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function newRequestId(target) {
  if (typeof target.crypto?.randomUUID !== "function") throw new Error("安全な予約IDを作成できません。ページを再読み込みしてください。");
  return target.crypto.randomUUID();
}

function rawContext(target, baseRule) {
  const snapshot = target.gyotokuMemberSnapshot;
  const member = snapshot?.member;
  return policy.resolveMemberPolicyContext({
    member,
    snapshot,
    legacyPolicy: typeof baseRule === "function" ? baseRule() : null,
  });
}

function needsPolicyReview(context) {
  return context.isPaidV7 || !context.valid;
}

function v7PlanCode(context) {
  return context.policy ? String(targetPlan(context)).toLowerCase() : "";
}

function targetPlan(context) {
  return context.policyKey === "v7_light" ? "free"
    : context.policyKey === "v7_standard" ? "standard"
      : context.policyKey === "v7_premium" ? "premium" : "";
}

function planRule(context) {
  if (!context.valid || !context.policy) return null;
  const planCode = v7PlanCode(context);
  const plan = context.policy;
  return {
    plan_code: planCode,
    label: plan.displayName,
    monthly_price_yen: plan.monthlyPriceYen,
    use_minutes: plan.durationMinutes,
    monthly_quota: plan.monthlyQuota,
    concurrent_limit: plan.concurrentLimit,
    daily_limit: plan.dailyLimit,
    booking_days: plan.bookingDays,
    booking_deadline_minutes: 0,
    cancellation_deadline_minutes: 0,
    is_configured: true,
    paid_v7: true,
  };
}

function v7Ready(target, context) {
  const snapshot = target.gyotokuMemberSnapshot;
  const member = snapshot?.member;
  const gates = member?.activation_gates ?? snapshot?.booking_policy?.activation_gates;
  return context.valid
    && context.isPaidV7
    && Array.isArray(snapshot?.reservations)
    && policy.isV7ServerEnforcementReady(snapshot)
    && typeof target.gyotokuMemberV7CreateReservation === "function"
    && typeof target.gyotokuMemberV7CancelReservation === "function"
    && policy.canBookMember({
      cohort: "v7",
      memberStatus: member?.status ?? member?.member_status,
      activationGates: gates,
    });
}

function evaluateSlot(target, context, date, startMinute, companions) {
  if (!v7Ready(target, context)) return { allowed: false, reason: "v7_backend_not_ready" };
  const snapshot = target.gyotokuMemberSnapshot;
  const member = snapshot.member;
  const availability = snapshot.booking_policy.availability;
  if (!availability.fixed_schedule_days?.includes(date)) return { allowed: false, reason: "fixed_schedule_unavailable" };
  return policy.evaluateV7Booking({
    membershipCohort: context.membershipCohort,
    agreementVersion: context.agreementVersion,
    planCode: member.plan,
    memberStatus: member.status ?? member.member_status,
    activationGates: member.activation_gates ?? snapshot.booking_policy.activation_gates,
    availabilitySnapshotReady: availability.complete === true,
    now: new Date(),
    bookingDate: date,
    startMinute,
    reservations: snapshot.reservations,
    conflictReservations: availability.all_reservations,
    yogaBlocks: availability.yoga_blocks,
    closedSlots: [...availability.closed_slots, ...(availability.fixed_blocks || [])],
    externalBlocks: availability.external_blocks,
    companions: companions ?? {
      planCode: member.plan,
      memberPresent: true,
      adults: [],
      children: [],
      childrenSupervised: true,
    },
  });
}

function renderV7CompanionManager(target, member) {
  const manager = target.document.querySelector("#companionManager");
  const list = target.document.querySelector("#companionList");
  if (!manager || !list) return;
  const eligiblePlan = ["standard", "premium"].includes(member?.plan);
  const active = member?.status === "active" && member?.member_status === "active";
  manager.classList.toggle("hidden", !eligiblePlan || !active);
  if (!eligiblePlan || !active) return;

  const title = manager.querySelector("h2");
  const description = manager.querySelector(".small");
  if (title) title.textContent = "大人の同伴者登録";
  if (description) description.textContent = "スタンダード・プレミアムは、事前登録と運営者の安全確認が完了した大人1名まで同伴できます。契約者本人も予約に参加してください。";

  const users = (target.gyotokuMemberSnapshot?.registered_users || [])
    .filter((user) => !user.is_contract_holder);
  const existing = users[0];
  if (existing) {
    list.innerHTML = `<article class="res"><h3>${escape(existing.name)}</h3><p>${existing.safety_check_passed === true ? "運営者の安全確認済み。予約時に選択できます。" : "登録済みです。運営者の本人確認・安全確認が完了するまで予約時に選択できません。"}</p></article>`;
    return;
  }
  list.innerHTML = `<form class="res" id="v7CompanionForm"><label>同伴する大人の氏名<input name="name" maxlength="80" autocomplete="name" required></label><p class="small">登録後、運営者が本人確認・安全確認を行います。確認前は予約に追加できません。</p><button class="btn" type="submit">同伴者を登録する</button></form>`;
}

function guideMarkup() {
  return `<section class="panel" id="paidV7Guide" aria-labelledby="paidV7GuideTitle">
    <p class="eyebrow">新規有料会員・同意書v7</p>
    <h2 id="paidV7GuideTitle">プランと予約条件</h2>
    <p><strong>ライト</strong>：月額4,980円（税込）、1回50分、月4回まで、同時予約1件、1日1回まで、14日先まで。会員本人のみ利用できます。週1回ペースの目安です。</p>
    <p><strong>スタンダード</strong>：月額7,980円（税込）、1回50分、月8回まで、同時予約2件、1日1回まで、14日先まで。登録・安全確認済みの大人1名まで同伴できます。週2回ペースにおすすめです。</p>
    <p><strong>プレミアム</strong>：月額11,980円（税込）、1回50分、月12回まで、同時予約2件、1日1回まで、14日先まで。登録・安全確認済みの大人1名まで同伴できます。週3回ペースの目安です。</p>
    <p>スタンダード・プレミアムも会員本人の同伴が必要です。お子様は人数制限なく同伴できます。安全管理と監督は会員の責任で行い、利用中はお子様から目を離さないでください。店舗は監督・保護を行わず、店舗に故意または重過失がある場合を除き、お子様の事故・怪我等の損害について責任を負いません。</p>
    <p>予約は利用日前日の22時まで。当日予約はできません。キャンセルも前日22時までで、期限後のキャンセルと無断欠席は月の利用回数を1回分消化します。</p>
    <p>予約の前後に各10分の間隔を確保します。この間隔は施設を利用できる時間には含まれません。入室は予約開始時刻ちょうどから、退出は予約終了時刻までです。利用できる時間は予約画面に表示された枠をご確認ください。施設運営上、個別の事前連絡なく予約可能枠を変更・停止する場合があります。</p>
    <p>個別Yoga予約とGym24予約の間は、前後に30分以上の間隔を確保します。30分ちょうどの間隔は予約できます。</p>
    <p>課金期間は毎月1日から末日までです。初回は初月の日割り分と翌月分の2か月分をお支払いいただき、入会月を1か月目として3か月目から毎月26日にクレジットカード決済します。口座振替には対応していません。利用停止は停止月の前々月末日までに公式LINEからご連絡ください（例：11月1日から停止する場合は9月30日まで）。</p>
    <p>本人確認後に管理者が会員登録と加入プランを設定し、公式LINEで利用情報をご案内します。既存会員の契約条件は変更しません。</p>
    <p><a href="${AGREEMENT_URL}" target="_blank" rel="noopener noreferrer">同意書v7の全文・入会手続きはこちら</a></p>
    <p class="notice" id="availabilityNotice">施設運営上、個別の事前連絡なく予約可能枠を変更・停止する場合があります。最新の予約可能枠は予約画面でご確認ください。</p>
    <p class="notice" role="status">この案内は新規有料会員向けです。管理者が設定したプランと予約条件をサーバーで確認できるまで、予約は利用できません。既存会員には現在の契約条件が適用されます。</p>
  </section>`;
}

export function initMemberCohortV7(target = window) {
  target.gyotokuMemberPolicy = policy;
  const baseRule = target.rule;
  const baseRender = target.render;
  const baseRenderLogin = target.renderLogin;
  const baseRenderCalendar = target.renderCalendar;
  const baseRenderDays = target.renderDays;
  const baseCanBook = target.canBook;
  const baseCanCancel = target.canCancel;
  const baseAvailable = target.available;
  const baseOpenDialog = target.openDialog;
  const baseReservationItem = target.reservationItem;

  const context = () => rawContext(target, baseRule);
  const reviewed = () => needsPolicyReview(context());
  const currentRule = () => {
    const state = context();
    if (!needsPolicyReview(state)) return baseRule();
    const v7 = planRule(state);
    return v7 || {
      ...(typeof baseRule === "function" ? baseRule() : {}),
      label: "同意書と予約条件を確認できません",
      is_configured: false,
      paid_v7: true,
    };
  };

  target.rule = currentRule;
  target.gyotokuMemberV7ServerReady = false;

  function renderGuide() {
    const login = target.document.querySelector("#loginView");
    if (login && !target.document.querySelector("#paidV7Guide")) {
      login.insertAdjacentHTML("afterend", guideMarkup());
    }
    const guide = target.document.querySelector("#paidV7Guide");
    if (guide) guide.classList.toggle("hidden", !target.document.querySelector("#appView")?.classList.contains("hidden"));
    const brand = target.document.querySelector(".brand p");
    if (brand) brand.textContent = "完全予約制・貸切型セルフジム";
    const intro = target.document.querySelector("#loginView .hero-copy p:not(.eyebrow)");
    if (intro) intro.textContent = "予約可能な枠から、開始時刻を10分単位で選んでください。";
    const booking = target.document.querySelector("#bookingTab");
    if (booking && !target.document.querySelector("#bookingAvailabilityNotice")) {
      booking.insertAdjacentHTML("afterbegin", `<p class="notice" id="bookingAvailabilityNotice">施設運営上、個別の事前連絡なく予約可能枠を変更・停止する場合があります。最新の予約可能枠をご確認ください。</p>`);
    }
    const calendar = target.document.querySelector("#calendar");
    if (calendar && !target.document.querySelector("#v7BookingStatus")) {
      calendar.insertAdjacentHTML("beforebegin", `<p class="notice hidden" id="v7BookingStatus" role="status"></p>`);
    }
  }

  function renderV7Details() {
    const state = context();
    const member = target.gyotokuMemberSnapshot?.member;
    const rules = target.document.querySelector(".rules");
    const status = target.document.querySelector("#v7BookingStatus");
    if (!needsPolicyReview(state)) {
      target.gyotokuMemberV7ServerReady = false;
      if (status) status.classList.add("hidden");
      return;
    }

    const ready = v7Ready(target, state);
    target.gyotokuMemberV7ServerReady = ready;
    renderV7CompanionManager(target, member);
    const plan = planRule(state);
    if (rules) {
      rules.innerHTML = plan
        ? `<p><strong>プラン・月額</strong>：${escape(plan.label)}・${plan.monthly_price_yen.toLocaleString("ja-JP")}円（税込）</p><p><strong>利用時間・回数</strong>：1回${plan.use_minutes}分（月${plan.monthly_quota}回まで、1日1回まで）。準備・片付け・清掃・着替え・退出を含み、未利用回数は翌月に繰り越せません。</p><p><strong>予約数・期間</strong>：同時${plan.concurrent_limit}件まで、14日先まで。開始時刻は10分単位で選べます。当日予約はできません。</p><p><strong>受付・キャンセル</strong>：利用日前日の22時まで予約・キャンセルできます。期限後キャンセルと無断欠席は1回分消化します。店舗都合のキャンセルは原則消化しません。予約の延長・譲渡・代理利用はできません。</p><p><strong>利用間隔</strong>：予約の前後に各10分を確保し、この間は施設を利用できません。個別Yoga予約とGym24予約の間は前後30分以上を空け、30分ちょうどは予約できます。入室は開始時刻ちょうどから、退出は終了時刻までです。</p><p><strong>同伴</strong>：${plan.plan_code === "free" ? "本人のみ。お子様は人数制限なく同伴できます。" : "登録・安全確認済みの大人1名まで。契約者本人の同伴が必要です。お子様は人数制限なく同伴できます。"} お子様の監督・安全管理は会員の責任で、店舗に故意または重過失がある場合を除き、事故・怪我等の損害について店舗は責任を負いません。</p><p><strong>お支払い・利用停止</strong>：初回は初月の日割り分と翌月分の2か月分。入会月を1か月目として3か月目から毎月26日にクレジットカード決済します。利用停止は停止月の前々月末日までに公式LINEへご連絡ください。</p><p><a href="${AGREEMENT_URL}" target="_blank" rel="noopener noreferrer">同意書v7の全文を確認する</a></p>`
        : `<p>会員区分または同意書バージョンを確認できないため、予約条件を決められません。</p>`;
    }
    if (plan && target.gyotokuMemberSnapshot?.reservations) {
      const bookingDate = typeof target.selectedDate === "function" ? target.dateKey(target.selectedDate()) : policy.tokyoDateKey(new Date());
      const usage = policy.countMonthlyConsumedVisits(target.gyotokuMemberSnapshot.reservations, bookingDate);
      const usageText = target.document.querySelector("#usageText");
      const usageBar = target.document.querySelector("#usageBar");
      if (usageText) usageText.textContent = `${bookingDate.slice(0, 7)}：${usage} / ${plan.monthly_quota}`;
      const usageLabel = usageBar?.parentElement?.previousElementSibling?.querySelector("span");
      if (usageLabel) usageLabel.textContent = "予約対象月の予約回数";
      if (usageBar) usageBar.style.width = `${Math.min(100, Math.round((usage / Math.max(1, plan.monthly_quota)) * 100))}%`;
    }
    if (status) {
      status.classList.remove("hidden");
      status.textContent = ready
        ? "同意書v7の予約条件を確認しました。予約可能枠のみ表示しています。"
        : "同意書v7の会員区分・有効化状態・予約サーバーの対応が確認できないため、予約とキャンセルを停止しています。契約条件を旧プランへ読み替えません。公式LINEへお問い合わせください。";
    }
    const guide = target.document.querySelector("#paidV7Guide");
    if (guide) guide.classList.add("hidden");
  }

  target.render = function () {
    const result = baseRender.apply(this, arguments);
    renderGuide();
    renderV7Details();
    if (v7Ready(target, context())) target.renderDays();
    return result;
  };
  target.renderLogin = function () {
    const result = baseRenderLogin.apply(this, arguments);
    renderGuide();
    return result;
  };

  target.available = function (date, start) {
    const state = context();
    if (!needsPolicyReview(state)) return baseAvailable.call(this, date, start);
    if (!state.isPaidV7 || !state.valid) return false;
    return evaluateSlot(target, state, date, start).allowed;
  };
  target.canBook = function (date, start) {
    const state = context();
    if (!needsPolicyReview(state)) return baseCanBook.call(this, date, start);
    if (!state.isPaidV7 || !state.valid || !v7Ready(target, state)) return false;
    return policy.isWithinV7BookingWindow({ now: new Date(), bookingDate: date })
      && policy.isBeforeV7BookingCutoff({ now: new Date(), bookingDate: date });
  };
  target.canCancel = function (reservation) {
    const state = context();
    if (!needsPolicyReview(state)) return baseCanCancel.call(this, reservation);
    if (!state.isPaidV7 || !state.valid || !v7Ready(target, state)) return false;
    return !reservation.cancelled && new Date(`${reservation.date}T00:00:00+09:00`).getTime()
      + Number(reservation.start_minute) * 60000 > Date.now();
  };
  target.renderDays = function () {
    const result = baseRenderDays.apply(this, arguments);
    const state = context();
    if (!needsPolicyReview(state) || !state.isPaidV7 || !state.valid || typeof target.weekStart !== "function") return result;
    const start = target.weekStart();
    target.document.querySelectorAll("#days .day[data-day]").forEach((button) => {
      const day = new Date(start);
      day.setDate(start.getDate() + Number(button.dataset.day));
      button.disabled = !policy.isWithinV7BookingWindow({ now: new Date(), bookingDate: target.dateKey(day) });
    });
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const next = target.document.querySelector("#nextWeek");
    if (next) next.disabled = policy.bookingDayOffset(new Date(), target.dateKey(end)) >= 14;
    return result;
  };
  target.document.addEventListener("click", (event) => {
    const button = event.target.closest("#nextWeek,#prevWeek");
    if (!button || button.disabled || !v7Ready(target, context())) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    target.gyotokuMemberMoveV7Week(button.id === "nextWeek" ? 1 : -1);
  }, true);
  target.renderCalendar = function () {
    const state = context();
    if (needsPolicyReview(state)) {
      renderV7Details();
      if (!state.isPaidV7 || !state.valid || !v7Ready(target, state)) {
        const calendar = target.document.querySelector("#calendar");
        if (calendar) calendar.innerHTML = `<article class="res"><h3>予約受付を停止しています</h3><p>同意書v7の条件を予約サーバーで確認できるまで、予約可能時間を表示しません。</p></article>`;
        return;
      }
    }
    return baseRenderCalendar.apply(this, arguments);
  };
  target.openDialog = function (date, start) {
    const state = context();
    if (needsPolicyReview(state) && (!state.isPaidV7 || !state.valid || !v7Ready(target, state))) {
      target.toast("同意書v7の予約サーバー対応が確認できないため、予約を受け付けていません。");
      return;
    }
    const result = baseOpenDialog.apply(this, arguments);
    if (!needsPolicyReview(state)) return result;
    const childWrap = target.document.querySelector("#childWrap");
    if (childWrap && !target.document.querySelector("#childSupervisionWrap")) {
      childWrap.insertAdjacentHTML("afterend", `<label id="childSupervisionWrap"><input type="checkbox" name="childrenSupervised"> お子様の安全管理と監督を行います</label>`);
    }
    const member = target.gyotokuMemberSnapshot.member;
    const plan = planRule(state);
    const users = target.gyotokuMemberSnapshot.registered_users || [];
    const holder = users.find((user) => user.is_contract_holder);
    const eligible = users.filter((user) => user.is_contract_holder || (user.is_active === true && user.safety_check_passed === true));
    const options = eligible.map((user) => `<option value="${escape(user.id)}">${escape(user.name)}${user.is_contract_holder ? "（契約者）" : "（安全確認済み）"}</option>`).join("");
    target.document.querySelector("#user1Select").innerHTML = options;
    target.document.querySelector("#user2Select").innerHTML = options;
    target.document.querySelector("#user1Select").value = holder?.id || "";
    const people = target.document.querySelector("#peopleSelect");
    people.disabled = plan.plan_code === "free";
    if (plan.plan_code === "free") people.value = "1";
    target.document.querySelector("#childWrap")?.classList.remove("hidden");
    const supervision = target.document.querySelector("#childSupervisionWrap");
    supervision?.classList.remove("hidden");
    const supervisionCheckbox = supervision?.querySelector("input");
    if (supervisionCheckbox) supervisionCheckbox.checked = false;
    return result;
  };
  target.reservationItem = function (reservation) {
    const state = context();
    if (!needsPolicyReview(state)) return baseReservationItem.call(this, reservation);
    const ready = state.isPaidV7 && state.valid && v7Ready(target, state);
    if (ready && !reservation.cancelled) return baseReservationItem.call(this, reservation);
    if (ready && reservation.cancelled) {
      const outcome = reservation.visit_outcome;
      return `<article class="res"><h3>${escape(target.fullRange(reservation.date, reservation.start_minute))}</h3><p>${outcome === "store_cancelled" ? "店舗都合で取消済み（回数消化なし）" : outcome === "late_cancelled" ? "期限後キャンセル済み（1回分消化）" : "キャンセル済み（回数消化なし）"}</p></article>`;
    }
    const names = [reservation.user1_name_snapshot, reservation.user2_name_snapshot].filter(Boolean).join("・");
    const end = Number(reservation.start_minute) + Number(reservation.use_minutes_snapshot || 50);
    return `<article class="res"><h3>${escape(target.fullRange(reservation.date, reservation.start_minute))}</h3><p>利用者：${escape(names || reservation.people)}</p><p>${escape(reservation.use_minutes_snapshot || 50)}分利用</p>${reservation.child_accompanied ? "<p>小さなお子様同伴</p>" : ""}<p class="small">v7予約・キャンセルのサーバー処理が未確認のため、変更操作を停止しています。</p><span hidden>${end}</span></article>`;
  };

  target.document.addEventListener("submit", async (event) => {
    const companionForm = event.target;
    if (companionForm?.id !== "v7CompanionForm") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const button = companionForm.querySelector("button[type=submit]");
    const name = String(new FormData(companionForm).get("name") || "").trim();
    if (!name || typeof target.gyotokuMemberV7AddCompanion !== "function") {
      target.toast("同伴者登録サーバーを確認できないため、登録できません。");
      return;
    }
    if (button) button.disabled = true;
    try {
      const result = await target.gyotokuMemberV7AddCompanion(name);
      if (!result?.ok) throw new Error(result?.error || "同伴者を登録できませんでした。");
      await target.gyotokuMemberLoad?.();
      target.toast("同伴者を登録しました。運営者の安全確認後に予約で選択できます。");
    } catch (error) {
      target.toast(error?.message || "同伴者を登録できませんでした。");
    } finally {
      if (button) button.disabled = false;
    }
  }, true);

  target.document.addEventListener("submit", async (event) => {
    if (event.target?.id !== "bookingForm") return;
    const state = context();
    if (!needsPolicyReview(state)) return;
    if (!state.isPaidV7 || !state.valid || !v7Ready(target, state)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      target.toast("同意書v7の予約条件をサーバーで確認できないため、予約を受け付けていません。");
      return;
    }
    const member = target.gyotokuMemberSnapshot.member;
    const users = target.gyotokuMemberSnapshot.registered_users || [];
    const holder = users.find((user) => user.is_contract_holder);
    const selectedIds = [target.document.querySelector("#user1Select")?.value];
    if (Number(target.document.querySelector("#peopleSelect")?.value) === 2) selectedIds.push(target.document.querySelector("#user2Select")?.value);
    const adults = selectedIds.filter((id) => id && id !== holder?.id).map((id) => {
      const user = users.find((item) => item.id === id);
      return { id, registered: user?.is_active === true, safetyCheckPassed: user?.safety_check_passed === true };
    });
    const childSelected = Boolean(target.document.querySelector("#childWrap input")?.checked);
    const supervised = Boolean(target.document.querySelector("#childSupervisionWrap input")?.checked);
    const companionState = {
      planCode: member.plan,
      memberPresent: Boolean(holder && selectedIds.includes(holder.id)),
      adults,
      children: childSelected ? [{ id: "child-present" }] : [],
      childrenSupervised: childSelected ? supervised : true,
    };
    const date = target.dateKey(target.selectedDate());
    const start = Number(target.document.querySelector("#startSelect")?.value);
    const result = evaluateSlot(target, state, date, start, companionState);
    if (!result.allowed) {
      event.preventDefault();
      event.stopImmediatePropagation();
      target.toast(result.reason === "companion_not_allowed" ? "同伴者は同意書v7の登録・安全確認条件をご確認ください。" : "この予約枠は同意書v7の条件を満たしていません。");
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      const response = await target.gyotokuMemberV7CreateReservation({
        p_date: date,
        p_start_minute: start,
        p_adult_user_ids: selectedIds.filter(Boolean),
        p_children_accompanied: childSelected,
        p_children_supervised: childSelected ? supervised : true,
        p_note: target.document.querySelector("#bookingForm [name=note]")?.value || "",
        p_request_id: newRequestId(target),
      });
      if (!response?.ok) throw new Error(response?.error || "予約に失敗しました。");
      target.document.querySelector("#dialog")?.close();
      await target.gyotokuMemberLoad?.();
      target.toast("予約が完了しました。");
    } catch (error) {
      target.toast(error?.message || "予約に失敗しました。");
    }
  }, true);

  target.document.addEventListener("click", async (event) => {
    const cancel = event.target.closest("[data-cancel]");
    if (!cancel) return;
    const state = context();
    if (!needsPolicyReview(state)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!state.isPaidV7 || !state.valid || !v7Ready(target, state)) {
      target.toast("同意書v7のキャンセル処理を予約サーバーで確認できないため、変更を受け付けていません。");
      return;
    }
    const reservation = target.gyotokuMemberSnapshot.reservations.find((item) => item.id === cancel.dataset.cancel);
    if (!reservation) {
      target.toast("予約情報を確認できませんでした。画面を再読み込みしてください。");
      return;
    }
    const onTime = policy.isV7CancellationOnTime({
      membershipCohort: state.membershipCohort,
      agreementVersion: state.agreementVersion,
      now: new Date(),
      bookingDate: reservation.date,
    });
    if (!onTime && !target.confirm("利用日前日の22時を過ぎたキャンセルは、月の利用回数を1回分消化します。キャンセルしますか？")) return;
    try {
      const response = await target.gyotokuMemberV7CancelReservation(reservation.id);
      if (!response?.ok) throw new Error(response?.error || "キャンセルに失敗しました。");
      await target.gyotokuMemberLoad?.();
      target.toast("キャンセルしました。");
    } catch (error) {
      target.toast(error?.message || "キャンセルに失敗しました。");
    }
  }, true);

  renderGuide();
}
