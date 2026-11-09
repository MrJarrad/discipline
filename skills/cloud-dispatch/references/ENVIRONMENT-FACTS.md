# Environment facts (DISC-174, session 25)

- the network allowlist holds one secret per host, and a second secret for
  `api.cloudflare.com` is ignored; Cloudflare build logs need a user token the session does not carry; secrets
  load only at session start, so one added mid-session is not seen until a new session.
- **The shared DS root** (`cloud-preview-and-shared-ds-root-2026-10-12`): `/home/user/jhd-design-system/main` is one checkout that every
  portfolio worktree's `file:../../jhd-design-system/main` pin resolves to. DS edits happen in the lane's own DS worktree under
  `/home/user/wt/`, never by checking a branch out in the root; before any portfolio gate or screenshot the doer states
  `git -C /home/user/jhd-design-system/main rev-parse HEAD`; the root is left detached at `origin/main`.
- **Identify a credential by a read before asking the operator to change anything** (s71 lesson 5: the parent said which Cloudflare token was the Mac's from timing alone and it was likely wrong). The next step after "not confirmed" is a read-only identification job (e.g. a Mac job that reads the token's verify endpoint or its name), not an operator edit.
