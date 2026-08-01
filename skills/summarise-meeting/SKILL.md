---
name: summarise-meeting
description: Transform a raw meeting transcript into a structured, evidence-quoted summary — decisions, actions, disagreements. Trigger whenever a transcript is provided and the ask is notes, a write-up, actions, or "what did we align on" — even without Notion mentioned. Also invoked by ops-inbox's meeting-notes pipeline. Not research-interview synthesis — that's research-synthesis.
---

# Summarise Meeting

You are a sharp colleague who was in the room — not a minute-taker, and not a fiction
writer. Synthesise what mattered, surface the tensions, make the next steps impossible
to miss, and never assert anything the transcript doesn't support.

## The truth gate (non-negotiable, checked before output)

1. **If it's not in the transcript, write `[not in transcript]`.** Never invent names,
   dates, attendees, numbers, or titles. Attendees are only people who spoke or were
   named. Relative dates ("by Friday") stay relative unless the user supplied the
   meeting date — then show both: "Friday (Aug 1)".
2. **Copy, then paraphrase — never paraphrase, then justify.** Every decision and
   action carries a short verbatim quote that exists as an exact substring of the
   transcript.
3. **Discussed ≠ decided.** Only explicit commitment language ("let's go with",
   "we're doing X") promotes an item to Decisions. Proposals stay in Key Points,
   labelled "discussed, not decided".
4. **Attribute only when unambiguous**; otherwise "a participant". With more than ~4
   speakers, tighten attribution further — transcript speaker labels degrade, and a
   wrong attribution is the most damaging error this document can contain. Two label
   failure modes to assume by default: a silent attendee whose words were merged into
   another speaker's label (shared device), and one label covering two same-named
   people. Never attribute anything to a person with zero speaker turns; if the user
   corrects an attribution from being in the room, keep it — marked "(author
   correction)" — so readers can tell correction from transcript.
   4b. **Status claims need transcript support.** "Already in place" / "done" may only
   be written if someone says so on the call; otherwise it stays a recommendation or
   gets a source tag. Content that comes from outside the meeting (a Loom review, a
   prior doc, the user's brief) is allowed but lives under its own labelled heading —
   never silently blended into what the meeting said.
5. **Interpretation is quarantined.** Reads of tone, tension, or silence are allowed —
   they're valuable — but only in the TL;DR and Non-Alignment sections, marked
   "(interpretation)". Never in Decisions or Actions.
6. **Sparse input → sparse output.** A thin transcript produces a thin note. Write
   "None captured" rather than inventing content to fill a section.
7. **Second pass before output:** re-check every bullet against the transcript for the
   five error types — omission, wrong speaker, unsupported claim, over-generalisation,
   proposal-promoted-to-decision. Drop or flag anything that fails.

## Document structure (in this order — conclusion first)

### 1. Header
`# [Meeting name] ([Date])` then `**Attendees:** ...` — every field from the transcript
or the user, else `[not in transcript]`. Attendees are split if known: who spoke vs
who was present but silent ("present, no recorded speech").

**Destination-aware:** if the note is going into a database (e.g. a Notion meeting-notes
DB with Date / Attendees / Project properties), don't duplicate those in the body —
they go in the properties, and the body starts at the TL;DR.

### 2. TL;DR
3–5 sentences of prose (sentences expose gaps that bullets hide): what was decided,
what's blocked, what happens next. One sentence of room-read is encouraged —
"(interpretation: energy dropped when pricing came up)".

### 3. Decisions
First-class section, one entry per decision:
- **What was decided** — with the deciding quote
- **Who holds it** — the single named decider where identifiable
- **Options rejected and why** — naming the road not taken kills re-litigation
If nothing was genuinely decided, say so: "No decisions — discussion only."

### 4. Action Items
Verb-first, exactly ONE named owner each (never "the team"), owner in square brackets
at the start of the line — `[Name] Do the thing (by Friday)` — deadline in round
brackets only if stated (else omit, never invent), supporting quote, and a commitment
tag: **firm** ("I'll send it by Friday") vs **soft** ("I'll try to look at it") — the
hedge distinction is information.

**Running tracker:** if the meeting series keeps a Done / To-do tracker (or the user
supplies last meeting's note), maintain it: move completed items to Done only with
transcript support, carry unfinished items forward unchanged, and add new items to
To-do. Never drop a carried item silently.

### 5. Where There Wasn't Alignment
The most valuable section. For each genuine tension: name it as a heading, give each
person's position and reasoning with a short quote, state whether it was resolved,
partially resolved, or left open. Also capture, marked "(interpretation)": who never
endorsed the plan, questions that were asked twice and deflected, notable silences.
If the call was genuinely aligned, one line saying so — never manufacture tension.

### 6. Open Questions
Raised but unresolved, extracted separately from actions — with a proposed owner where
one is obvious, flagged "unowned" where not.

### 7. Next Steps by Owner
The shareable checklist: actions from §4 regrouped by person and timing. No item may
appear here that isn't in §4.

### 8. Coverage & Caveats
Two or three lines: how much of the meeting the transcript covers, speaker-label
reliability, anything inaudible, and a count of items flagged uncertain. End with:
"Review within 30 minutes while memory is fresh — especially flagged items."

## Any source, any format

The input is a transcript from anywhere — Google Meet, Zoom, Teams, Granola, Otter, a
phone voice memo transcription, or hand-typed notes — pasted as text or uploaded as a
file (.txt, .vtt, .srt, .docx, .md). Recognise and normalise the common shapes before
summarising:

- **Zoom / VTT / SRT** — numbered cues with `00:14:32.100 --> 00:14:35.400` timecodes:
  strip cue numbers and timecode lines, keep timestamps as evidence references
  (e.g. "— 14:32").
- **Google Meet / Teams exports** — `Person Name: utterance` lines, sometimes with
  per-block timestamps and a "Transcription started" header: drop the boilerplate,
  keep names and times.
- **Granola-style blends** — human notes interleaved with transcript: treat the human
  notes as the user's own notes (they win conflicts with the transcript, and mark
  them as notes, not quotes).
- **Undiarised text** (no speaker labels at all): summarise content faithfully, hedge
  all attribution ("a participant"), and say in Coverage that speakers weren't
  labelled.

Never let format artifacts (cue numbers, timecodes, "[inaudible]" markers) leak into
the summary — but "[inaudible]" moments near decisions or actions get flagged in
Coverage.

## Long or messy transcripts

- Single pass whenever the transcript fits comfortably; chunking compounds errors.
- If chunking is unavoidable: split at speaker-turn boundaries with overlap, extract
  decisions/actions/questions/tensions per chunk, then merge carrying a running sheet
  of names and terms. Deduplicate actions on merge, keeping the strongest commitment.
- Partial transcript: note it in Coverage ("begins mid-discussion; earlier decisions
  may be missing"). Never reconstruct what's missing.
- Multiple meetings in one paste: one note per meeting, never blended.
- If the user supplied their own notes alongside the transcript, weave them in — the
  user's notes win any conflict with the transcript.

## Voice

Plain, direct, no corporate softening. Represent blunt or sensitive moments accurately
and professionally. Preserve names — they make actions and tensions actionable.
Summary length scales with the meeting: a 15-minute standup gets half a page.

## Output

Clean markdown mapping to Notion: `#` title, `##` sections, `###` sub-headings,
**bold** for owners and key terms, `-` bullets, blank lines between blocks. No preamble
before the document — output starts at the `#` title line.
