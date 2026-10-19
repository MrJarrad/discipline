# Helper sessions — dispatching a helper cloud session end to end

A helper is a `create_session` child: a whole cloud session that does one lane while the parent keeps talking to the operator. The parent reads this once, top to bottom, when it sends a lane out (`cloud-dispatch` § Capacity before dispatch; `routing` HARD-RULES 19). Other skills point here and do not restate it.

## 1. Before creating it

- **Your own id.** `get_session` with no `session_id` returns this session's id; it goes in the brief.
- **Source repo.** `source_url` is the one repo the helper builds in (a product repo, or this plugin repo); it is cloned fresh at `source_revision` (default branch). The brief names the branch to create from it. Pass `blob_limit_kb` / `sparse_checkout_paths` only for a very large repo.
- **Other repos.** The helper attaches each with `add_repo` and then clones it itself: one clone at a time, a generous timeout (about 10 minutes), then `register_repo_root`. The vault is read-only unless the brief says otherwise, and a vault write gets its own worktree (output style, "Parent routes").
- **Model.** Pass `model` explicitly. Pick it per `model-routing` (job shape × complexity), never by inheriting the parent's by accident.
- **Environment.** Omit `environment_id` to inherit the parent's.
- **Title and tags** (ruling `session-titles-2026-10-15`). Title: `Helper · <task in plain words> — no action needed`. Tag the lane (`set_session_tags`, or `tags` on create), for example `helper` and the lane name.
- **Brief.** `dispatch-brief` shape. It opens: "this brief is from your parent (session <id>); start now, no go needed" (HARD-RULES 19). It names the contract, the branch, the gates, and where the return goes. Ask for a read-back and a wait for "go" only when the lane needs one (a contested or system-size lane); then the brief says so in its first lines, because the default is to start.

## 2. What the helper does

1. Starts at once. On a brief that asks for a read-back, it sends the read-back to the parent with `send_message` (`session_id` = the parent id above) and stops until the parent's "go" arrives (`ReadNotifications`).
2. **Reports the plugin version it loaded** in its read-back or first return (the highest version directory under `~/.claude/plugins/cache/discipline/discipline/`, or `installed_plugins.json`; "not found" is an answer). A cloud container has loaded an older version than main before; this is how the parent learns it.
3. Builds on the branch the brief names. It pushes to that branch only, never main, and opens one draft PR.
4. **Posts its return on the PR** as a comment: PR link, head sha, the ledger the brief asked for, the suite tail. The comment is the banked result. A helper's chat is not.

## 3. How the parent sweeps it

- `get_session` on each helper within 5 minutes of dispatch and on every wake. `status_bucket` reads `working`, `blocked`, `review_ready`, `completed` or `failed`; `failed` means its last turn errored.
- A blocked helper is answered the same turn (`send_message`), including a "go" to a read-back.
- To see what a helper is doing, `list_events` with `kinds: ["user", "assistant", "result"]` and `limit: 100`.
- Redirect a running helper with `send_message` on that one channel (HARD-RULES 20); never a second helper for the same lane.

## 4. Landing and archive

When the PR comment is read and the result banked, `archive_session` the helper. When the next round of the lane starts, archive the superseded round's helper then. A helper whose result is not yet banked is never archived. At wrap, archive any helper whose work has landed (`wrap` CLOSING-CHECKS 6).

## DO / DON'T

**DO:** `create_session` with `source_url`, `model`, a `Helper · … — no action needed` title, and a brief that opens with the parent id; `get_session` 5 minutes later; read the PR comment; then `archive_session`.
**DON'T:** let a helper wait on a go the brief never asked for; read a helper's result from its chat instead of the PR comment; archive before the result is banked.
