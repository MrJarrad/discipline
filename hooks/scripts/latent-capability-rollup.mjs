#!/usr/bin/env node
/* latent-capability-rollup — aggregates capture-figma's per-node
   latentCapabilities[] (schema v2 — see figma-plugin/capture-figma/
   schema-v2-transform.mjs's buildLatentCapabilities) up to component level
   for human-readable reporting.

   The raw array stays one entry per bound-but-hidden paint per NODE — that
   granularity is load-bearing for capture-listener.mjs's diffLatentCapabilities,
   which tracks one specific node's visibility/binding over time. This module
   never touches that array or the wire schema; it's a read-only presentation
   layer over it, grouping by the capability's own `name` (the schema's
   documented capability identity, e.g. "NavigationHeader" — see
   schema-v2-transform.mjs line ~257's LATENT CAPABILITY comment) crossed with
   `binding` (the token it's bound to), reporting "component: capability (n
   instances)" instead of one row per node. Every grouped instance's id and
   visible flag is kept nested under its rollup entry — aggregation is
   presentation, never deletion; every instance stays locatable. */
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const UNKNOWN_COMPONENT = "(unknown component)";
const UNBOUND_CAPABILITY = "(unbound)";

function buildLatentCapabilityRollup(latentCapabilities) {
  const groups = new Map();
  for (const cap of latentCapabilities || []) {
    const component = cap && cap.name ? cap.name : UNKNOWN_COMPONENT;
    const capability = cap && cap.binding ? cap.binding : UNBOUND_CAPABILITY;
    const key = component + "\u241E" + capability;
    if (!groups.has(key)) {
      groups.set(key, { component, capability, count: 0, instances: [] });
    }
    const group = groups.get(key);
    group.count += 1;
    group.instances.push({ id: cap ? cap.id : undefined, visible: cap ? cap.visible : undefined });
  }
  return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}

export { buildLatentCapabilityRollup };

// ---- CLI ----------------------------------------------------------------

// realpath-normalizes both sides before comparing: import.meta.url resolves
// symlinks (e.g. macOS's /tmp -> /private/tmp) while process.argv[1] does
// not, so a script invoked through a symlinked path used to fail this check
// and silently no-op its CLI block. Falls back to the raw path if realpath
// itself fails (e.g. a path that no longer exists).
function isMainModule() {
  const realpath = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };
  const invoked = process.argv[1];
  return Boolean(invoked) && realpath(fileURLToPath(import.meta.url)) === realpath(invoked);
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const getArg = (flag, fallback) => {
    const idx = args.indexOf(flag);
    return idx === -1 ? fallback : args[idx + 1];
  };
  const capturePath = getArg(
    "--capture",
    join(process.env.HOME, "JHD", "figma-plugins", "main", "capture-figma", "captures", "live", "jhd-spec-designsystem-variables-styles.json")
  );

  try {
    const parsed = JSON.parse(readFileSync(capturePath, "utf8"));
    const latentCapabilities = Array.isArray(parsed.latentCapabilities) ? parsed.latentCapabilities : [];
    const rollup = buildLatentCapabilityRollup(latentCapabilities);
    const total = rollup.reduce((sum, g) => sum + g.count, 0);
    console.log(`Latent capability rollup: ${rollup.length} component/capability entries from ${latentCapabilities.length} raw instances (rollup total: ${total}).`);
    for (const g of rollup) {
      console.log(`  ${g.component}: ${g.capability} (${g.count} instance${g.count === 1 ? "" : "s"})`);
    }
  } catch (err) {
    console.error(`[latent-capability-rollup] ${err.message}`);
    process.exit(2);
  }
}
