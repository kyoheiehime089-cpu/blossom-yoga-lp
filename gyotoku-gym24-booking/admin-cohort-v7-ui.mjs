import * as policy from "./member-cohort-policy.mjs?v=2";

const AGREEMENT_URL = policy.V7_AGREEMENT_URL;

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
})[char]);

function isPaidV7(member) {
  return member?.membership_cohort === "paid_v7"
    || member?.agreement_version === policy.V7_AGREEMENT_VERSION;
}

function planName(member) {
  if (isPaidV7(member)) {
    const resolved = policy.resolveBookingPolicy({
      membershipCohort: member?.membership_cohort,
      agreementVersion: member?.agreement_version,
      planCode: member?.plan,
    });
    if (!resolved || resolved.cohort !== "v7") return "契約条件要確認";
    return resolved.policy.displayName;
  }
  return window.planLabel(member?.plan);
}

function memberReady(snapshot, member) {
  const gates = member?.activation_gates ?? snapshot?.booking_policy?.activation_gates;
  const resolved = policy.resolveBookingPolicy({
    membershipCohort: member?.membership_cohort,
    agreementVersion: member?.agreement_version,
    planCode: member?.plan,
  });
  return resolved?.cohort === "v7"
    && policy.isV7ServerEnforcementReady(snapshot)
    && policy.canBookMember({
      cohort: "v7",
      memberStatus: member?.status ?? member?.member_status,
      activationGates: gates,
    });
}

function paidV7Range(date, startMinute, duration = 50) {
  const day = new Date(`${date}T00:00:00`);
  const time = (minute) => minute === 1440
    ? "24:00"
    : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  return `${day.getMonth() + 1}/${day.getDate()}（${"日月火水木金土"[day.getDay()]}） ${time(Number(startMinute))}〜${time(Number(startMinute) + duration)}`;
}

function sharedYogaConflict(snapshot, date, startMinute, duration = 40) {
  const source = snapshot?.booking_policy?.availability?.scope_sources
    ?.find((item) => item.source_key === "fs_yoga_private_reservations");
  if (source?.scope_status !== "shared" || source.integration_status !== "ready") return false;
  return policy.hasV7YogaBufferConflict(
    date,
    startMinute,
    duration,
    snapshot?.booking_policy?.availability?.yoga_blocks || [],
  );
}

function planGuideMarkup() {
  return `<section id="paidV7AdminGuide" aria-labelledby="paidV7AdminTitle">
    <p class="eyebrow">新プラン・管理者による手動登録</p>
    <h3 id="paidV7AdminTitle">プラン・利用条件</h3>
    <p><strong>ライト</strong>：月額4,980円、50分、月4回、同時1件、1日1回、14日先まで。本人のみ。お子様は人数制限なく同伴可。週1回ペースの目安。</p>
    <p><strong>スタンダード</strong>：月額7,980円、50分、月8回、同時2件、1日1回、14日先まで。事前登録・安全確認済み大人1名まで。契約者本人の同伴が必要です。週2回ペースにおすすめ。</p>
    <p><strong>プレミアム</strong>：月額11,980円、50分、月12回、同時2件、1日1回、14日先まで。事前登録・安全確認済み大人1名まで。契約者本人の同伴が必要です。週3回ペースの目安。</p>
    <p>50分には準備・片付け・清掃・着替え・退出を含み、未利用回数は翌月へ繰り越せません。開始時刻は10分単位です。当日予約不可、予約・通常キャンセルは前日22時まで。期限後キャンセル・無断欠席は1回分消化し、店舗都合のキャンセルは原則消化しません。予約の延長・譲渡・代理利用はできません。</p>
    <p>予約の前後各10分は利用時間に含まれません。予約開始時刻ちょうどから入室し、終了時刻までに退出します。</p>
    <p>個別Yoga予約とGym24予約の間は前後30分以上を確保し、30分ちょうどは予約できます。</p>
    <p>お子様は人数制限なく同伴できます。安全管理と監督は会員の責任で行い、店舗は監督・保護を行いません。店舗に故意または重過失がある場合を除き、お子様の事故・怪我等の損害について責任を負いません。</p>
    <p>課金期間は毎月1日から末日です。初回は初月の日割り分と翌月分の2か月分を支払い、入会月を1か月目として3か月目から毎月26日にクレジットカード決済します。口座振替不可。利用停止は停止月の前々月末日までに公式LINEで受付します（11月1日停止なら9月30日まで）。</p>
    <p>入会金0円、初月の利用回数・請求額、追加費用、決済の自動更新と失敗時の扱いは、実際の決済設定を確認するまで確定扱いにしません。</p>
    <p>会員登録と加入プランの設定は、本人確認後に管理者が手動で行います。利用情報は管理者から公式LINEでご案内します。施設名の「24」は24時間利用の保証ではありません。予約可能枠は運営状況により個別連絡なく変更・停止する場合があります。</p>
    <p><a href="${AGREEMENT_URL}" target="_blank" rel="noopener noreferrer">同意書v7の全文・入会手続きはこちら</a></p>
    <p class="notice" id="paidV7AdminBackendStatus" role="status">予約DBで新プランの手動登録・予約条件を確認できるまで、登録と代理予約は停止中です。既存会員向けの登録フォーム・ルールは変更しません。</p>
  </section>`;
}

function renderPanel(target) {
  const snapshot = target.gyotokuAdminSnapshot;
  const panel = target.document.querySelector("#paidV7AdminGuide");
  if (!panel) return;
  const status = panel.querySelector("#paidV7AdminBackendStatus");
  const v7Members = (snapshot?.members || []).filter(isPaidV7);
  const ready = v7Members.every((member) => memberReady(snapshot, member));
  const canCreate = policy.isV7AdminProxyReady(snapshot)
    && snapshot?.booking_policy?.member_creation_server_enforced === true
    && snapshot.booking_policy?.agreement_version === policy.V7_AGREEMENT_VERSION
    && snapshot.booking_policy?.activation_gates_enforced === true;

  if (status) {
    status.classList.toggle("ok", ready && canCreate);
    status.classList.toggle("danger", !(ready && canCreate));
    const unresolved = (snapshot?.booking_policy?.availability?.scope_sources || [])
      .filter((source) => policy.V7_BOOKING_SOURCES.includes(source.source_key)
        ? source.scope_status !== "shared" || source.integration_status !== "ready"
        : source.scope_status === "shared")
      .map((source) => source.source_key);
    status.textContent = unresolved.length
      ? `施設予約資源の共有範囲が未確認のためv7予約を停止中です：${unresolved.join("、")}`
      : ready && canCreate && policy.isV7ServerEnforcementReady(snapshot)
        ? `サーバーからv7条件と有効化ゲートを確認しました。v7会員${v7Members.length}名を管理できます。`
        : `予約DB/RPCで手動プラン設定と予約条件を確認できないため、新規v7会員登録と代理予約は停止中です。v7会員データ：${v7Members.length}名。既存会員${snapshot?.members?.length || 0}名の契約条件は変更していません。`;
  }

  v7Members.forEach((member) => {
    const card = [...target.document.querySelectorAll("[data-member-card]")].find((item) => item.dataset.memberCard === String(member.id));
    if (!card) return;
    const summary = card.querySelector("p");
    if (summary) summary.textContent = `${member.member_code || "ID未設定"} / ${planName(member)} / 同意書v7`;
    card.querySelector("[data-copy-login]")?.remove();
    card.querySelector("[data-companions]")?.remove();
    target.document.querySelectorAll("[data-companion-panel]").forEach((panel) => {
      if (panel.dataset.companionPanel === String(member.id)) panel.remove();
    });
    if (!card.querySelector("[data-v7-status]")) {
      const gates = member.activation_gates ?? snapshot?.booking_policy?.activation_gates ?? {};
      const gateLine = [
        ["operatorApproved", "運営承認"],
      ].map(([key, label]) => `${label}:${gates[key] === true ? "完了" : "未確認"}`).join(" / ");
      card.insertAdjacentHTML("beforeend", `<p data-v7-status>会員有効化：${escape(gateLine)}</p><p class="small">同意書版：${escape(member.agreement_version || "未確認")}</p><p class="small" data-v7-companion-policy>大人の同伴は事前登録・安全確認済みの1名までです。お子様は人数制限なしで同伴できます。旧会員向けの「大人2名」登録機能は使いません。</p>`);
    }
    card.querySelector("[data-v7-actions]")?.remove();
    const safetyButtons = (snapshot?.registered_users || [])
      .filter((user) => String(user.member_id) === String(member.id) && !user.is_contract_holder && user.is_active && user.safety_check_passed !== true)
      .map((user) => `<button class="ghost" type="button" data-v7-companion-safety="${escape(user.id)}" data-v7-member="${escape(member.id)}">安全確認済みにする：${escape(user.name)}</button>`)
      .join("");
    const actionBox = target.document.createElement("div");
    actionBox.dataset.v7Actions = "";
    actionBox.className = "two";
    const copyLogin = memberReady(snapshot, member) && policy.isV7AdminProxyReady(snapshot)
      ? `<button class="btn" type="button" data-v7-copy-login="${escape(member.id)}">利用開始案内をコピー</button>`
      : "";
    actionBox.innerHTML = `${gateActions(member)}${safetyButtons}${copyLogin}`;
    if (actionBox.innerHTML) card.appendChild(actionBox);
  });
}

function gateActions() { return ""; }

function v7LineMessage(member) {
  const url = `https://kyoheiehime089-cpu.github.io/blossom-yoga-lp/gyotoku-gym24-booking/?${new URLSearchParams({ mid: member.member_code, pin: member.pin })}`;
  return `行徳ジム24の会員登録と利用開始確認が完了しました。\n\n下記URLから会員予約画面へログインしてください。\n\n【会員用URL】\n${url}\n\n【会員ID】\n${member.member_code}\n\n【ログインPIN】\n${member.pin}\n\n【プラン】\n${planName(member)}\n\n予約可能枠と利用条件は、予約画面および利用同意書をご確認ください。`;
}

export function initAdminCohortV7(target = window) {
  target.gyotokuAdminPolicy = policy;
  const customers = target.document.querySelector("#customersTab");
  const dashboard = target.document.querySelector("#dashboardTab");
  const addForm = target.document.querySelector("#addMember");
  const previousLineMessage = target.lineMessage;
  target.lineMessage = (member) => isPaidV7(member) ? v7LineMessage(member) : previousLineMessage(member);
  if (dashboard && !target.document.querySelector("#paidV7AdminGuide")) {
    const summary = dashboard.querySelector("#summary");
    if (summary) summary.insertAdjacentHTML("beforebegin", planGuideMarkup());
  }
  if (customers && addForm && !target.document.querySelector("#legacyMemberFormNotice")) {
    addForm.insertAdjacentHTML("beforebegin", `<p class="small notice" id="legacyMemberFormNotice">本人確認後、加入プランを選んで手動登録してください。既存会員の保存条件は変更しません。同意書の登録IDや別サービスとの接続は不要です。</p>`);
  }

  const baseRenderAll = target.renderAll;
  if (typeof baseRenderAll === "function") {
    target.renderAll = function () {
      const result = baseRenderAll.apply(this, arguments);
      renderPanel(target);
      return result;
    };
  }

  const baseSlotRow = target.slotRow;
  if (typeof baseSlotRow === "function") {
    target.slotRow = function (date, startMinute) {
      if (sharedYogaConflict(target.gyotokuAdminSnapshot, date, startMinute)) {
        return `<article class='slot-row closed'><div class='time'>${escape(paidV7Range(date, Number(startMinute), 40).split(" ").at(-1))}</div><div><span class='pill closed'>予約不可</span> 個別Yoga予約の前後30分間隔</div><span>Yoga</span></article>`;
      }
      return baseSlotRow.apply(this, arguments);
    };
  }

  const baseReservationCard = target.reservationCard;
  if (typeof baseReservationCard === "function") {
    target.reservationCard = function (reservation) {
      const member = target.gyotokuAdminSnapshot?.members?.find((item) => String(item.id) === String(reservation.member_id));
      if (!isPaidV7(member)) return baseReservationCard.apply(this, arguments);
      const names = [reservation.user1_name_snapshot, reservation.user2_name_snapshot].filter(Boolean).join("・");
      const duration = Number(reservation.use_minutes_snapshot) || 50;
      return `<article class='res'><h3>${escape(paidV7Range(reservation.date, Number(reservation.start_minute), duration))}</h3><p>${escape(reservation.member_name)} / ${escape(planName(member))} / ${escape(names || reservation.people)}</p>${reservation.child_accompanied ? "<p>小さなお子様同伴</p>" : ""}<div class='two'><button class='ghost' data-detail='${escape(reservation.member_id)}'>会員を開く</button><button class='danger' data-cancel='${escape(reservation.id)}'>キャンセル</button></div></article>`;
    };
  }

  const baseOpenAdminSlot = target.openAdminSlot;
  if (typeof baseOpenAdminSlot === "function") {
    let selectedSlot = null;
    const updateV7SlotTitle = () => {
      if (!selectedSlot) return;
      const memberId = target.document.querySelector("#slotMemberSelect")?.value;
      const member = target.gyotokuAdminSnapshot?.members?.find((item) => String(item.id) === String(memberId));
      const title = target.document.querySelector("#adminSlotTitle");
      if (title && isPaidV7(member)) title.textContent = paidV7Range(selectedSlot.date, selectedSlot.start);
      else if (title && typeof target.fullRange === "function") title.textContent = target.fullRange(selectedSlot.date, selectedSlot.start);
      target.document.querySelectorAll("#slotMemberSelect option").forEach((option) => {
        const optionMember = target.gyotokuAdminSnapshot?.members?.find((item) => String(item.id) === String(option.value));
        if (isPaidV7(optionMember)) option.textContent = `${optionMember.name} / ${planName(optionMember)}`;
      });
    };
    target.openAdminSlot = function (date, startMinute) {
      selectedSlot = { date, start: Number(startMinute) };
      const result = baseOpenAdminSlot.apply(this, arguments);
      updateV7SlotTitle();
      return result;
    };
    target.document.addEventListener("change", (event) => {
      if (event.target?.id === "slotMemberSelect") updateV7SlotTitle();
    });
  }

  const baseOpenDetail = target.openDetail;
  if (typeof baseOpenDetail === "function") {
    target.openDetail = function (id) {
      const snapshot = target.gyotokuAdminSnapshot;
      const member = snapshot?.members?.find((item) => String(item.id) === String(id));
      if (!isPaidV7(member)) return baseOpenDetail.apply(this, arguments);
      const card = [...target.document.querySelectorAll("[data-member-card]")].find((item) => item.dataset.memberCard === String(id));
      if (!card) return;
      target.document.querySelectorAll("[data-member-detail]").forEach((element) => element.remove());
      const gates = member.activation_gates ?? snapshot?.booking_policy?.activation_gates ?? {};
      const gateRows = [
        ["operatorApproved", "運営承認"],
      ].map(([key, label]) => `<p>${label}：<strong>${gates[key] === true ? "完了" : "未確認"}</strong></p>`).join("");
      const detail = target.document.createElement("article");
      detail.className = "res";
      detail.dataset.memberDetail = String(id);
      detail.innerHTML = `<p class="eyebrow">手動登録した新プラン会員</p><h2>${escape(member.name)}</h2><p>${escape(member.member_code || "ID未設定")} / ${escape(planName(member))}</p><p>適用ルール版：${escape(member.agreement_version || "未確認")}</p>${gateRows}<form class="mini" id="editV7Plan" data-v7-edit-member="${escape(id)}"><label>加入プラン<select name="plan"><option value="free" ${member.plan === "free" ? "selected" : ""}>ライトプラン</option><option value="standard" ${member.plan === "standard" ? "selected" : ""}>スタンダードプラン</option><option value="premium" ${member.plan === "premium" ? "selected" : ""}>プレミアムプラン</option></select></label><label>利用状態<select name="status"><option value="active" ${member.status === "active" ? "selected" : ""}>利用可</option><option value="suspended" ${member.status === "suspended" ? "selected" : ""}>利用停止</option></select></label><button class="btn">プラン・利用状態を保存</button></form><p><a href="${AGREEMENT_URL}" target="_blank" rel="noopener noreferrer">同意書v7の全文を確認する</a></p><button class="ghost" type="button" data-close-detail>閉じる</button>`;
      card.insertAdjacentElement("afterend", detail);
    };
  }

  target.document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (form?.id !== "editV7Plan") return;
    event.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const values = new FormData(form);
      const result = await target.gyotokuAdminV7Rpc("fs_v7_admin_update_plan", {
        p_member_id: form.dataset.v7EditMember,
        p_plan: values.get("plan"),
        p_status: values.get("status"),
      });
      if (result.ok !== true) throw new Error(result.error || "プランを保存できませんでした。");
      await target.gyotokuAdminReloadSnapshot?.();
      target.toast("プラン・利用状態を保存しました。");
    } catch (error) {
      target.alert(error.message);
    } finally {
      button.disabled = false;
    }
  });

  target.document.addEventListener("submit", (event) => {
    const form = event.target;
    if (form?.id !== "adminSlotForm" || new FormData(form).get("action") !== "reserve") return;
    const member = target.gyotokuAdminSnapshot?.members?.find((item) => String(item.id) === String(new FormData(form).get("memberId")));
    if (!isPaidV7(member)) return;
    if (memberReady(target.gyotokuAdminSnapshot, member)
      && policy.isV7AdminProxyReady(target.gyotokuAdminSnapshot)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    target.alert("同意書v7の条件と有効化状態をサーバーで確認できないため、この会員の代理予約はできません。");
  }, true);

  target.document.addEventListener("click", async (event) => {
    const copyButton = event.target.closest("[data-v7-copy-login]");
    if (copyButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const snapshot = target.gyotokuAdminSnapshot;
      const member = snapshot?.members?.find((item) => String(item.id) === String(copyButton.dataset.v7CopyLogin));
      if (!member || !memberReady(snapshot, member) || !policy.isV7AdminProxyReady(snapshot)) {
        target.alert("有効化条件と予約資源の確認がすべて完了するまで、利用開始案内は作成できません。");
        return;
      }
      try {
        await target.copyText(v7LineMessage(member));
        target.toast("利用開始案内をコピーしました。");
      } catch (error) {
        target.alert(error?.message || "案内文をコピーできませんでした。");
      }
      return;
    }
    const safetyButton = event.target.closest("[data-v7-companion-safety]");
    if (!safetyButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const memberId = safetyButton.dataset.v7Member;
    if (!target.confirm("この登録済み同伴者の本人確認・安全確認が完了していることを確認しましたか？")) return;
    try {
      const result = await target.gyotokuAdminV7Rpc("fs_v7_admin_confirm_companion_safety", {
          p_member_id: memberId,
          p_registered_user_id: safetyButton.dataset.v7CompanionSafety,
        });
      if (!result?.ok) throw new Error(result?.error || "確認を保存できませんでした。");
      await target.gyotokuAdminReloadSnapshot?.();
    } catch (error) {
      target.alert(error?.message || "確認を保存できませんでした。");
    }
  });

  target.document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-cancel]");
    if (!button) return;
    const snapshot = target.gyotokuAdminSnapshot;
    const reservation = snapshot?.reservations?.find((item) => String(item.id) === String(button.dataset.cancel));
    const member = snapshot?.members?.find((item) => String(item.id) === String(reservation?.member_id));
    if (!isPaidV7(member)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!reservation || !memberReady(snapshot, member) || !policy.isV7AdminProxyReady(snapshot)) {
      target.alert("同意書v7のキャンセル処理がサーバーに反映されていないため、変更できません。");
      return;
    }
    const onTime = policy.isV7CancellationOnTime({
      membershipCohort: member.membership_cohort,
      agreementVersion: member.agreement_version,
      now: new Date(),
      bookingDate: reservation?.date,
    });
    if (!onTime && !target.confirm("期限後のキャンセルは月の利用回数を1回分消化します。キャンセルしますか？")) {
      return;
    }
    try {
      const result = await target.gyotokuAdminV7Rpc(policy.V7_RPC_CONTRACT.adminCancel, {
        p_reservation_id: reservation.id,
      });
      if (!result?.ok) throw new Error(result?.error || "キャンセルに失敗しました。");
      await target.gyotokuAdminReloadSnapshot?.();
    } catch (error) {
      target.alert(error?.message || "キャンセルに失敗しました。");
    }
  }, true);

  renderPanel(target);
}
