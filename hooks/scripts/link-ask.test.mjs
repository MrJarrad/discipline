// DISC-272 recall (review #152 AMBER-3): question, no-determiner, possessive and noun-first asks are caught;
// the round-1 negatives stay uncaught. Run: node --test hooks/scripts/link-ask.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { isLinkAsk } from "./lib/link-ask.mjs";

test("hand-over asks in every form are caught", () => {
  for (const t of [
    "Send the links to your case-study Figma files", // determiner form (round 1)
    "One Figma tick, then re-export (HB-301 404 round 3)",
    "Drop the Sakara media in Drop media/projects/sakara/",
    "Create the Umami account and give me the Website ID",
    "Can you share the Yardsale export?",
    "Could you send the Figma link for Sakara?",
    "Would you please upload the Wild files?",
    "Send me Sakara's Figma link",
    "Send Figma links for the case studies",
    "Upload Sakara media to Drop media/projects/sakara/",
    "Figma link for the Wild case study — paste it here",
    "Sakara export, please send it",
  ]) assert.equal(isLinkAsk(t), true, t);
});

test("rows that only mention a link, file or Figma are not asks (round-1 negatives)", () => {
  for (const t of [
    "Check the link to the case study opens in the same tab",
    "Review the case-study links for Wild — open the preview link and say yes",
    "we need the share image to be 1200x630 — confirm the files follow that",
    "Pressed look: what should a button do while it's held down? Alternative: give pressed its own fill, which you'd define in Figma",
    "Recommended: drop it from Figma for now",
    "Drop them from Figma and rebuild",
    "I will fix the component and send you the node to check", // PF-1358: the parent sends, not the operator
    "Export: the lighter stroke you approved is already in Figma",
    "Can you confirm the link opens in the same tab?",
    "Could you check the Figma file matches the preview?",
  ]) assert.equal(isLinkAsk(t), false, t);
});
