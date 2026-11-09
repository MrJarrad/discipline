# Keyframes on a layer

A brief made from a link carries the layer's prototype transitions (their duration and easing) and its
notes. It does not carry **keyframe timelines**: Figma's REST API, which the link route reads the layer
from, has none. The Design handoff plugin, run in Figma on the layer, does write them. When the layer you
are building has keyframes, or the person says it is animated, read them from Figma's own motion reader.

1. **Call `get_motion_context`** on the animated layer, or on the top-level frame that holds it, with
   `recursive: true` (it returns every animated descendant, up to 500 layers). It needs Figma's MCP; read
   Figma's `figma-implement-motion` skill for the details of merging the result.
2. **Use the snippets as given.** Each animated node comes with `codeSnippets` (CSS `@keyframes` and
   motion.dev). Use them as they are; do not rebuild them from the tracks, which loses custom curves and
   springs. Only a node with no snippet is built from its keyframe tracks and summary.
3. **Merge by node id.** The structure of the build comes from the brief; the motion values come from
   `get_motion_context`. Put each snippet on the element for the same node id, wrapping or converting the
   element where the snippet needs it. Where motion and design disagree on timing or easing, motion's value is built, and each disagreement is a deviation row naming both values.
4. **A layer with no keyframes has no keyframe animation.** No keyframes means no keyframe animation; its prototype transition from the brief still applies. Do not borrow a duration or an easing from another layer
   or animate it because its neighbours move.
5. **Honour `prefers-reduced-motion`.** Under it, render the resting state or cut the duration to nearly
   nothing.
6. **Name the design system's motion tokens.** If a keyframe's duration or easing equals one of the brief's
   motion tokens, build with the token. One that is on no token is a row in the deviation table, not a
   silent literal.
7. **If Figma's MCP is not connected, say so and ask** for it. Do not guess keyframes from the resting
   frame or a screenshot, which shows only the resting state.
8. **Return each animated node as a row in the deviation table**: layer name and id, the properties
   animated, duration, easing, and that it came from `get_motion_context`.
