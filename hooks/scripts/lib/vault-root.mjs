/* resolveVaultRoot(path) — the vault checkout a `--vault` argument names. A container root
   (`<dir>/.bare` + `<dir>/main`, the Mac's ~/JHD/vault layout) resolves to `<dir>/main`; any other
   path is returned unchanged (DISC-230: Mac jobs passed ~/JHD/vault and every prefix was unknown). */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export function resolveVaultRoot(path) {
  const p = resolve(path);
  if (!existsSync(join(p, "projects")) && existsSync(join(p, ".bare")) && existsSync(join(p, "main", "projects"))) return join(p, "main");
  return p;
}
