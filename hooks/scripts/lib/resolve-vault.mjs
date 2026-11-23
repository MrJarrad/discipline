/* resolveVault() — the one vault lookup the outcome checks share (DISC-351 slice 1).
   Order: DISCIPLINE_VAULT_ROOT (set but not a vault, e.g. "none", means off) -> ~/JHD/vault/main (the Mac container layout), ~/JHD/vault -> /home/user/jhd-vault (the cloud clone).
   A vault is a directory holding `projects/` (`need` overrides, commit-gate passes "" to keep its older any-directory rule). `via` is "env" or "fallback"; only a fallback hit is warn-only until DEFAULT_MODE flips. */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CLOUD_VAULT = "/home/user/jhd-vault";
export const DEFAULT_MODE = "warn"; // slice 1 ships warn-only for one session; flip to "block" after (DISCIPLINE_OUTCOME_CHECKS=block does it per run)

const isVault = (r, exists, need) => !!r && exists(join(r, need));

export function resolveVault({ env = process.env, home = homedir(), exists = existsSync, need = "projects" } = {}) {
  if (env.DISCIPLINE_VAULT_ROOT !== undefined) return isVault(env.DISCIPLINE_VAULT_ROOT, exists, need) ? { root: env.DISCIPLINE_VAULT_ROOT, via: "env" } : null;
  for (const root of [join(home, "JHD", "vault", "main"), join(home, "JHD", "vault"), CLOUD_VAULT]) if (isVault(root, exists, need)) return { root, via: "fallback" };
  return null;
}

/* The Stop-hook verdict: block when the vault was named by env (as before) or mode is block; otherwise a visible warning that does not hold the turn. */
export function stopVerdict(reason, via, env = process.env) {
  const mode = env.DISCIPLINE_OUTCOME_CHECKS || DEFAULT_MODE;
  if (via === "env" || mode === "block") return { decision: "block", reason };
  return { systemMessage: `[warn-only, DISC-351: this check blocks from the next release] ${reason}` };
}
