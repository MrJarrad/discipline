// 1.152.2: the reviewer's ambers AM1-AM5 on #114 — more bypasses of the force-push, kill-by-name and Mac-job gates,
// and two pointer lines that dropped clauses of their lessons. Seams: the Bash gate's exported checks and the skill text.
// Run: node --test hooks/scripts/session39-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBashKillByName, checkBashForcePush, checkBashMacJob } from "../bin/agent-dispatch-gate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const has = (p, text) => assert.ok(flat(p).includes(text), `${p} is missing: ${text}`);
const push = (command) => checkBashForcePush({ command }).ok;
const kill = (command) => checkBashKillByName({ command }).ok;

function badJobDir() {
  const d = mkdtempSync(join(realpathSync(tmpdir()), "jobs-"));
  mkdirSync(join(d, "queue", "mac", "pending"), { recursive: true });
  writeFileSync(join(d, "queue", "mac", "pending", "bad.md"), "---\nrepo: ~\n---\nx\n");
  return d;
}

// --- AM1: a substitution inside double quotes still runs ---------------------------

test("AM1: $(…) and backticks inside double quotes are read as commands", () => {
  for (const c of ['echo "$(git push -f)"', 'x="$(git push -f)"', 'git commit -m "$(git push -f)"', 'echo "`git push -f`"', 'echo "a $(echo $(git push --force)) b"', 'cd x && echo "$(git push -f)"'])
    assert.equal(push(c), false, c);
  for (const c of ['echo "$(pkill x)"', 'x="`killall node`"'])
    assert.equal(kill(c), false, c);
  assert.equal(checkBashMacJob({ command: 'echo "$(git add queue/mac/pending/bad.md)"' }, badJobDir()).ok, false);
});
test("AM1: plain double-quoted text, single-quoted substitutions and harmless substitutions stay allowed", () => {
  for (const c of ['echo "git push -f"', "echo '$(git push -f)'", 'git commit -m "fix $(date +%F)"', 'echo "$(git rev-parse HEAD)"', 'git push origin "$(git branch --show-current)"', 'echo "cost: $5 (approx)"'])
    assert.equal(push(c), true, c);
});

// --- AM2: a heredoc fed to a shell or eval is code --------------------------------

test("AM2: a heredoc into a shell or eval is read as commands", () => {
  for (const c of ["bash <<'EOF'\ngit push -f\nEOF", "sh <<EOF\ngit push --force origin x\nEOF", "bash -s <<'EOF'\n(git push -f)\nEOF", "cat <<'EOF' | bash\ngit push -f\nEOF", "bash - <<EOF\ncd x\ngit push -f\nEOF"])
    assert.equal(push(c), false, c);
  assert.equal(kill("bash <<'EOF'\npkill x\nEOF"), false);
  assert.equal(checkBashMacJob({ command: "bash <<'EOF'\ngit add queue/mac/pending/bad.md\nEOF" }, badJobDir()).ok, false);
});
test("AM2: a heredoc that is only text stays allowed", () => {
  for (const c of ["cat <<'EOF'\ngit push -f\nEOF", "git commit -F - <<'EOF'\nnever git push -f\nEOF", "gh pr create --body-file - <<'EOF'\n(git push -f) is blocked\nEOF", "bash script.sh <<'EOF'\ngit push -f\nEOF", "cat <<'EOF' > notes.md\ngit push -f\nEOF"])
    assert.equal(push(c), true, c);
  assert.equal(kill("cat <<'EOF'\npkill x\nEOF"), true);
});

// --- AM4: wrappers whose options take a value ---------------------------------------

test("AM4: sudo/doas/env/nice/timeout/stdbuf/xargs valued options consume their value", () => {
  for (const c of [
    "sudo -u bob git push -f", "sudo --user bob git push -f", "sudo -g wheel -u bob git push -f", "doas -u bob git push -f", "env -u HOME git push -f",
    "env -C /tmp git push -f", "nice -n 10 git push -f", "timeout -k 5 10 git push -f", "timeout -s KILL 5 git push -f", "stdbuf -o L git push -f",
    "xargs -n 1 git push -f", "ionice -c 3 git push -f",
  ])
    assert.equal(push(c), false, c);
  for (const c of ["sudo -u bob pkill x", "doas -u bob killall node", "env -u HOME pkill x", "nice -n 10 pkill x", "timeout -k 5 10 pkill x"])
    assert.equal(kill(c), false, c);
  assert.equal(checkBashMacJob({ command: "sudo -u bob git add queue/mac/pending/bad.md" }, badJobDir()).ok, false);
});
test("AM4: the same wrappers around ordinary commands stay allowed", () => {
  for (const c of ["sudo -u bob git push origin x", "env -u HOME git push -u origin x", "nice -n 10 git push", "timeout -k 5 10 git push origin x", "timeout 5 git push", "sudo -u bob git status"])
    assert.equal(push(c), true, c);
  for (const c of ["sudo -u bob ls", "nice -n 10 npm test", "env -u HOME node x.mjs"]) assert.equal(kill(c), true, c);
});

// --- AM3: what the readers cannot see is stated, not implied ---------------------------

test("AM3: the comment and CHANGED say expansions are unreadable for push and kill (no behaviour change)", () => {
  has("hooks/bin/agent-dispatch-gate.mjs", "A command built by an expansion (`$G push -f`, `git push $FORCE`) cannot be read");
  assert.equal(push("G=git; $G push -f"), true); // unchanged: documented, not blocked
  assert.equal(push("git push $FORCE"), true);
  const top = readFileSync(join(root, "CHANGED.txt"), "utf8").split("\n\n").find((e) => e.startsWith("1.152.2 — "));
  assert.match(top, /expansion/);
  assert.match(top, /\| bash/); // the pipe-into-a-shell gap stays named
});

// --- AM5: the pointer lines carry every clause of their lessons --------------------------

test("AM5: vault-recall carries all three checks and the wrap-merges rule; research-synthesis carries the brief rule", () => {
  has("skills/vault-recall/SKILL.md", "product-repo branches newer than the handover");
  has("skills/vault-recall/SKILL.md", "wrap merges its vault branch");
  has("skills/research-synthesis/SKILL.md", "does not frame the answer around our current parts");
  has("skills/research-synthesis/SKILL.md", "neutral-briefs-never-steer");
});
