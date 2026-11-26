// Shared shell-command walker for the git PreToolUse gates (commit-gate, stash-gate): splits a Bash command
// into segments, follows cd/pushd, `git -C`, subshells, bash -c, eval and pipes into a shell, and reports
// the directory a given git subcommand would run in.
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";

// The directory a `git <sub>` command targets (sub: (words, k) => boolean, k at the subcommand word), or null
// when the command does not run it. The command is split into shell segments (&&, ||, ;, |, &, newline,
// subshell parens) with quotes respected, then walked in order: `cd`/`pushd`
// move the working directory (a `( … )` subshell restores it on exit), and a
// segment whose command is `git [-C <path>] commit` is the target. `git commit`
// appearing only as an argument (`grep 'git commit'`, `echo …`) is not a
// commit, and `bash -c '…'` bodies are parsed the same way. Audit finding 1.
function expand(raw) {
  return raw === "~" || raw.startsWith("~/") ? join(homedir(), raw.slice(1)) : raw;
}

function splitSegments(command) {
  const out = []; // { words: string[], open: number, close: number }
  let words = [], word = "", has = false, open = 0, close = 0;
  const heredocs = []; // delimiters whose bodies start after the next newline
  let pipeNext = false; // the next pushed segment reads the previous one's output
  const endWord = () => { if (has) words.push(word); word = ""; has = false; };
  const endSeg = () => { endWord(); if (words.length || open || close) { out.push({ words, open, close, piped: pipeNext }); pipeNext = false; } words = []; open = 0; close = 0; };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === "'") { const j = command.indexOf("'", i + 1); const end = j < 0 ? command.length : j; word += command.slice(i + 1, end); has = true; i = end; }
    else if (ch === '"') {
      has = true; i++;
      for (; i < command.length && command[i] !== '"'; i++) {
        if (command[i] === "\\" && i + 1 < command.length) i++;
        word += command[i];
      }
    }
    else if (ch === "\\" && command[i + 1] === "\n") i++; // line continuation
    else if (ch === "\\" && i + 1 < command.length) { word += command[++i]; has = true; }
    else if (ch === "#" && !has) { while (i < command.length && command[i] !== "\n") i++; i--; }
    else if (ch === "<" && command.startsWith("<<<", i)) { endWord(); words.push("<<<"); i += 2; } // here-string: the next word is the text
    else if (ch === "<" && command[i + 1] === "<") {
      const m = /^<<-?\s*(?:'([^']*)'|"([^"]*)"|([^\s;&|()<>]+))/.exec(command.slice(i));
      if (m) { heredocs.push(m[1] ?? m[2] ?? m[3]); endWord(); i += m[0].length - 1; }
    }
    else if (/\s/.test(ch)) {
      if (ch === "\n") {
        endSeg();
        // skip heredoc bodies: they are data, not commands
        for (const delim of heredocs.splice(0)) {
          let j = i + 1;
          while (j < command.length) {
            let e = command.indexOf("\n", j); if (e < 0) e = command.length;
            const line = command.slice(j, e).trim();
            j = e + 1;
            if (line === delim) break;
          }
          i = j - 1;
        }
      } else endWord();
    }
    else if (ch === ";" || ch === "|" || ch === "&" || ch === "`") {
      endSeg();
      if (ch !== "`" && command[i + 1] === ch) i++;
      else if (ch === "|") pipeNext = true;
    }
    else if (ch === "(") { endSeg(); open++; }
    else if (ch === ")") { endSeg(); out.push({ words: [], open: 0, close: 1 }); }
    else { word += ch; has = true; }
  }
  endSeg();
  return out;
}

// Words that sit before the real command and are skipped; the value is the set of
// options that take a separate value (`sudo -u me`, `env -C dir`, `xargs -n 1`).
const LEADERS = {
  "!": [], "{": [], "}": [], if: [], while: [], until: [], then: [], do: [], else: [], elif: [],
  time: [], command: [], exec: [], builtin: [], nohup: [],
  sudo: ["-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T", "-U"],
  env: ["-C", "-u", "-S"],
  timeout: ["-s", "-k"],
  xargs: ["-n", "-I", "-P", "-L", "-s", "-d", "-E", "-a"],
  nice: ["-n"],
};
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);

// `git [global opts] <sub>` starting at words[i]? → true when it is that subcommand.
function gitSubAt(w, i, cur, sub) {
  let at = cur, k = i + 1;
  while (k < w.length && w[k].startsWith("-")) {
    if (w[k] === "-C" && w[k + 1] !== undefined) { at = resolve(at, expand(w[k + 1])); k += 2; }
    else if (w[k] === "-c" || w[k] === "--git-dir" || w[k] === "--work-tree" || w[k] === "--namespace") k += 2;
    else k++;
  }
  return k < w.length && sub(w, k) ? at : null;
}

// Fails closed: an unquoted `git … commit` anywhere in a segment's words counts, even
// behind a wrapper this parser does not know (`xargs`, `timeout`, `sudo -u me`, an
// absolute `/usr/bin/git`) — gated at the working directory the walk has reached.
export function gitTarget(command, baseCwd, sub, depth = 0) {
  let cur = baseCwd;
  const stack = [];
  let chain = ""; // words of the segments piped into the current one
  for (const seg of splitSegments(command)) {
    if (!seg.piped) chain = "";
    for (let k = 0; k < seg.open; k++) stack.push(cur);
    let w = seg.words;
    // strip leaders (control words, wrappers and their options, VAR=value)
    for (;;) {
      if (!w.length) break;
      if (/^[A-Za-z_]\w*=/.test(w[0])) { w = w.slice(1); continue; }
      const lead = w[0] in LEADERS ? LEADERS[w[0]] : null;
      if (!lead) break;
      const name = w[0];
      w = w.slice(1);
      while (w.length && w[0].startsWith("-") && w[0] !== "-") {
        if (name === "env" && w[0] === "-C" && w[1] !== undefined) cur = resolve(cur, expand(w[1]));
        if (name === "env" && w[0] === "-S" && w[1] !== undefined && depth < 3) {
          const inner = gitTarget(w[1], cur, sub, depth + 1);
          if (inner) return inner;
        }
        const takesValue = lead.includes(w[0]);
        w = w.slice(takesValue ? 2 : 1);
      }
      if (name === "timeout" && w.length && /^[\d.]+[smhd]?$/.test(w[0])) w = w.slice(1);
    }
    const cmd = w.length ? basename(w[0]) : "";
    if (cmd === "cd" || cmd === "pushd") {
      const arg = w.slice(1).find((x) => !x.startsWith("-") || x === "-");
      if (arg && arg !== "-") cur = resolve(cur, expand(arg));
    } else if (cmd === "eval" && depth < 3) {
      const inner = gitTarget(w.slice(1).join(" "), cur, sub, depth + 1);
      if (inner) return inner;
    } else if (SHELLS.has(cmd) && depth < 3) {
      const c = w.findIndex((x, n) => n > 0 && /^-[a-z]*c[a-z]*$/.test(x));
      if (c > 0 && w[c + 1] !== undefined) {
        const inner = gitTarget(w[c + 1], cur, sub, depth + 1);
        if (inner) return inner;
      } else if (c < 0) {
        // A shell with no -c and no script argument reads commands from stdin: the
        // text piped into it, or its here-string, is a command line (fail closed).
        const hs = w.indexOf("<<<");
        const rest = w.slice(1).filter((x, n) => !x.startsWith("-") && n + 1 !== hs && n !== hs);
        if (rest.length === 0) {
          for (const src of [seg.piped ? chain : "", hs > 0 ? w[hs + 1] ?? "" : ""]) {
            const inner = src ? gitTarget(src, cur, sub, depth + 1) : null;
            if (inner) return inner;
          }
        }
      }
    }
    for (let i = 0; i < w.length; i++) {
      if (basename(w[i]) !== "git") continue;
      const at = gitSubAt(w, i, cur, sub);
      if (at) return at;
    }
    chain += " " + seg.words.join(" ");
    for (let k = 0; k < seg.close; k++) if (stack.length) cur = stack.pop();
  }
  return null;
}

