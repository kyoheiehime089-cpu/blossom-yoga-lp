import { createAdminAuthController } from "./admin-auth-controller.mjs";

export function initAdminAuth(target = window) {
  const client = target.gym24AdminAuthClient ||= target.supabase.createClient(
    target.GYOTOKU_SUPABASE_URL, target.GYOTOKU_SUPABASE_ANON_KEY
  );
  const controller = createAdminAuthController(client);
  target.gym24AdminAuth = controller;
  const yogaView = target.document.querySelector("#yogaView");
  const existingYogaLogout = target.document.querySelector("#logoutYoga");
  if (existingYogaLogout && !target.document.querySelector("#adminSignOut")) existingYogaLogout.id = "adminSignOut";
  if (yogaView && !target.document.querySelector("#adminSignOut")) {
    const button = target.document.createElement("button");
    button.id = "adminSignOut"; button.type = "button"; button.className = "ghost";
    button.textContent = "ログアウト"; yogaView.prepend(button);
  }
  const clearSessionView = () => {
    target.sessionStorage.removeItem("gyotoku_admin_password");
    target.document.querySelector("#adminView")?.classList.add("hidden");
    target.document.querySelector("#yogaView")?.classList.add("hidden");
    target.document.querySelector("#loginView")?.classList.remove("hidden");
    for (const id of ["adminAccountPassword", "adminMfaCode"]) {
      const input = target.document.getElementById(id); if (input) input.value = "";
    }
    target.dispatchEvent(new target.Event("gym24-admin-signed-out"));
  };
  client.auth.onAuthStateChange?.((event) => { if (event === "SIGNED_OUT") clearSessionView(); });
  target.gym24AdminSignIn = async () => {
    const passwordInput = target.document.querySelector("#adminAccountPassword");
    let result;
    try {
      result = await controller.signIn({
        email: target.document.querySelector("#adminEmail")?.value || "",
        password: passwordInput?.value || "",
        code: target.document.querySelector("#adminMfaCode")?.value.trim() || "",
      });
    } finally { if (passwordInput) passwordInput.value = ""; }
    const challenge = target.document.querySelector("#adminMfaFields");
    if (challenge) challenge.hidden = !result.challengeRequired;
    if (result.challengeRequired) {
      target.document.querySelector("#adminMfaCode")?.focus();
      throw new Error("認証アプリのコードを入力して、もう一度ログインしてください。");
    }
    return result;
  };
  target.document.querySelector("#adminSignOut")?.addEventListener("click", async () => {
    try {
      await controller.signOut();
      clearSessionView();
    } catch { target.alert("ログアウトできませんでした。"); }
  });
  return controller;
}
initAdminAuth();
