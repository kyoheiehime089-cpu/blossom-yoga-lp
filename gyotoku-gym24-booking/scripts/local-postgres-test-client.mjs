import { spawn, spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

export const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function localClient(PGDATABASE = process.env.PGDATABASE) {
  const { PGHOST, PGUSER, PGPORT } = process.env;
  if (process.env.GYM24_LOCAL_TEST_ACK !== "I_HAVE_CREATED_DISPOSABLE_LOCAL_DB_NO_TUNNEL"
    || PGHOST !== "127.0.0.1" || !/^gym24_test_[a-z0-9_]{3,40}$/.test(PGDATABASE || "")
    || !PGUSER || !/^\d{1,5}$/.test(PGPORT || "")
    || process.env.PGPASSWORD || process.env.PGSERVICE || process.env.PGSERVICEFILE
    || (process.env.PGHOSTADDR && process.env.PGHOSTADDR !== "127.0.0.1")) {
    throw new Error("Safety stop: isolated loopback/disposable database required");
  }
  const args = ["-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", PGDATABASE];
  const options = { env: { ...process.env, PGCLIENTENCODING: "UTF8" }, encoding: "utf8",
    cwd: resolve(projectDir, "docs"), windowsHide: true, timeout: 30000, maxBuffer: 4_000_000 };
  function raw(input) {
    return spawnSync("psql", [...args, "-f", "-"], { ...options, input });
  }
  function sql(input) {
    const result = raw(input);
    if (result.error || result.status !== 0) throw new Error("Local synthetic SQL failed: " + (result.stderr || result.error?.message).slice(-6000));
    return result.stdout.trim();
  }
  function file(path) {
    return sql(readFileSync(resolve(projectDir, path), "utf8"));
  }
  function concurrent(input, appName) {
    const child = spawn("psql", [...args, "-f", "-"], {
      ...options, env: { ...options.env, PGAPPNAME: appName }, stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const done = new Promise((resolveDone, reject) => {
      child.once("error", reject);
      child.once("close", (status) => resolveDone({ status, stdout: stdout.trim(), stderr }));
    });
    child.stdin.end(input);
    return { child, done };
  }
  const identity = sql("select current_database()||'|'||host(inet_server_addr())||'|'||current_user||'|'||(select pg_get_userbyid(datdba) from pg_database where datname=current_database());");
  if (identity !== [PGDATABASE, "127.0.0.1", PGUSER, PGUSER].join("|")) throw new Error("Local database identity/owner mismatch");
  return { sql, raw, file, concurrent };
}
