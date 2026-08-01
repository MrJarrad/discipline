# Figma plugin constraints — learned from live failures

Absorbed 2026-07-31 from the retired figma-agent-plugin-brief; each constraint cost a live failure. Any Figma plugin work in the capture pipeline follows these exactly:

1. manifest networkAccess.allowedDomains must be ["http://localhost:4411"] ONLY — Figma rejects IP literals like 127.0.0.1 — and the networkAccess object MUST include a "reasoning" field or the manifest is rejected.
2. The plugin main thread has NO fetch/browser APIs. All network calls happen in the UI iframe: main thread posts JSON to the UI via postMessage; the UI fetches and posts the result back.
3. With documentAccess "dynamic-page", you MUST await figma.loadAllPagesAsync() before registering figma.on('documentchange', ...). Show a "loading all pages…" status while it runs.
4. Live sync: on documentchange, debounce 5 seconds trailing, then re-export and POST. Handle listener-down gracefully (status message, retry on next change, never crash). Sync only runs while the panel is open — no background execution in Figma.
5. Use the async variable/style APIs with defensive fallbacks: figma.variables.getLocalVariableCollectionsAsync / getLocalVariablesAsync / getVariableByIdAsync; figma.getLocalTextStylesAsync / getLocalPaintStylesAsync / getLocalEffectStylesAsync / getLocalGridStylesAsync.
6. Determinism is the point: same file state → byte-identical export. No timestamps except header.exportedAt; no random ids; stable ordering throughout.
7. Version-stamp on sync START only (figma.saveVersionHistoryAsync), never per debounced change — version history floods otherwise. Await it, surface failures in the status line without blocking sync, include the returned id as optional header.versionStampId.
