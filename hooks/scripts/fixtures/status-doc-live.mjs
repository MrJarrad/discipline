import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
/* A trimmed copy of the live Status doc read (rev 312), in the real Claude Docs xml shape. */
export const LIVE = readFileSync(fileURLToPath(new URL("./status-doc-live.xml", import.meta.url)), "utf8");
