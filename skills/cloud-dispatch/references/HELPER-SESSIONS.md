# Helper sessions — dispatching a helper cloud session end to end

A helper is a `create_session` child: a whole cloud session that does one lane while the parent keeps talking to the operator. The parent reads this once, top to bottom, when it sends a lane out (`cloud-dispatch` § Capacity before dispatch). The standing rules for helpers (the brief opener, the sweep cadence, answering a blocked helper, the archive trigger) are `routing` HARD-RULES 19 and are not restated here; this page is the steps around them.

## 1. Before creating it

- **Your own id.** `get_session` with no `session_id` returns this session's id; it goes in the brief.
- **Source repo.** `source_url` is the one repo the helper builds in (a product repo, or this plugin repo); it is cloned fresh at `source_revision` (default branch). The brief names the branch to create from it. Pass `blob_limit_kb` / `sparse_checkout_paths` only for a very large repo.
- **Other repos.** The helper attaches each with `add_repo` and then clones it itself: one clone at a time, a generous timeout (about 10 minutes), then `register_repo_root`. The vault is read-only unless the brief says otherwise, and a vault write gets its own worktree (output style, "Parent routes").
- **Model.** Pass `model` explicitly. Pick it per `model-routing` (job shape × complexity), never by inheriting the parent's by accident.
- **Environment.** Omit `environment_id` to inherit the parent's.
- **Title and tags.** The title follows the session-titles ruling (`session-titles-2026-10-15`, in the output style). Tag the lane (`set_session_tags`, or `tags` on create), for example `helper` and the lane name.
- **Brief.** `dispatch-brief` shape, opening and closing as HARD-RULES 19 says. It names the contract, the branch, the gates, and where the return goes. It also says, in its first lines, that every read-back and the final return go to the parent with `send_message` using the parent id above, and that the helper's own transcript is not a channel to the parent. Ask for a read-back and a wait for "go" only when the lane needs one (a contested or system-size lane); the default is to start.

## 2. What the helper does

1. Starts at once. On a brief that asks for a read-back, it sends the read-back to the parent with `send_message` (`session_id` = the parent id above) and stops until the parent's "go" arrives (`ReadNotifications`). A read-back written only in its transcript does not reach the parent.
2. **Reports the plugin version it loaded** in its read-back or first return (the highest version directory under `~/.claude/plugins/cache/discipline/discipline/`, or `installed_plugins.json`; "not found" is an answer). A cloud container has loaded an older version than main before; this is how the parent learns it.
3. Builds on the branch the brief names. It pushes to that branch only, never main, and opens one draft PR.
4. **Posts its return on the PR** as a comment (PR link, head sha, the ledger the brief asked for, the suite tail) **and sends the same return to the parent with `send_message`**. The PR comment is the banked result; the message is what tells the parent it is ready. If a turn ends with a return and no `send_message`, the Stop hook `parent-return-stop.mjs` holds it once and asks for the send (a one-line ack under 200 characters with no `next: parent` is let through).

## 3. How the parent sweeps it

- **Backstop.** Arm one `send_later` about 50 minutes out per dispatch (HARD-RULES 19); delete it when the return arrives.
- `get_session` shows `status_bucket`: `working`, `blocked`, `review_ready`, `completed` or `failed` (`failed` means its last turn errored). Cadence and blocked helpers: HARD-RULES 19.
- To see what a helper is doing, `list_events` with `kinds: ["user", "assistant", "result"]` and `limit: 100`.
- Redirect a running helper with `send_message` on that one channel (HARD-RULES 20); never a second helper for the same lane.

## 4. Landing

Read the PR comment, bank the result, then `archive_session` as HARD-RULES 19 says. At wrap, archive any helper whose work has landed (`wrap` CLOSING-CHECKS 6).
