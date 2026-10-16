// Administrator-only proposal. Member-code/PIN authentication is unchanged.
export function createAdminAuthController(client) {
  async function authorized() {
    const { data, error } = await client.rpc("gym24_admin_authorized", {});
    return !error && data === true;
  }
  return {
    async signIn({ email = "", password = "", code = "" } = {}) {
      if (password) {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error("メールアドレスとパスワードを確認してください。");
      }
      const { data, error } = await client.auth.getSession();
      if (error || !data?.session) throw new Error("管理者アカウントでログインしてください。");
      if (await authorized()) return { ok: true };
      const factors = await client.auth.mfa.listFactors();
      const factor = factors.data?.totp?.find((item) => item.status === "verified");
      if (!factors.error && factor) {
        if (!code) return { ok: false, challengeRequired: true };
        if (!/^[0-9]{6}$/.test(code)) throw new Error("認証アプリの6桁のコードを入力してください。");
        const challenge = await client.auth.mfa.challenge({ factorId: factor.id });
        if (challenge.error || !challenge.data?.id) throw new Error("追加認証を開始できませんでした。");
        const verified = await client.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.data.id, code });
        if (!verified.error && await authorized()) return { ok: true };
      }
      throw new Error("管理権限を確認できません。運営者へお問い合わせください。");
    },
    async requireToken() {
      if (!await authorized()) throw new Error("管理者ログインを確認してください。");
      const { data, error } = await client.auth.getSession();
      if (error || !data?.session?.access_token) throw new Error("管理者ログインを確認してください。");
      return data.session.access_token;
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw new Error("ログアウトできませんでした。");
    },
  };
}
