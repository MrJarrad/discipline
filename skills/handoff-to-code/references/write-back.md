# Write a note back onto the layer

A brief's asks sometimes end with a note for the design: the person answers "I'll change the design"
(the ask's status is **waiting on Figma** and the line gives the note text), or the build needs a note
the design does not have, such as behaviour no property can say. This step writes that note onto the layer
in Figma through Figma's MCP, and reads it back. Nothing else in the skill writes to the file.

1. **Write only when the person has said to.** The note text is the person's to add; an agent adds it
   only when they have agreed — once per note, or once for a list of notes the person has seen. Without that, hand over the text and stop.
2. **Load Figma's own `figma-use` skill first**, then write with `use_figma`. Annotations are the
   `annotations` array of a layer; the file's categories come from `figma.annotations`.
3. **Write on the outermost instance, not an inner part.** A note written from the text a person is
   describing lands on the nearest instance of that text, often an inner part of a component (by
   convention named with a leading `.`). Walk up to the outermost instance the note is about, and
   write there.
4. **Use a category the file already has.** Read them with `figma.annotations.getAnnotationCategoriesAsync()`
   and pick the one that fits (interaction, motion, content, accessibility and the like, whatever the
   file calls them). Create one only if the file has none.
5. **Say only what properties cannot.** A component property is the home for anything it can express, so
   a note never restates or contradicts a property. What is left is behaviour, interaction, motion, how
   it responds, what is supplied by hand. Name the part or its role, never a visible label that can change
   (a button's words, a cursor word), and no ticket numbers or draft names. An order the person curates is
   stated as supplied, not as a rule derived from the content.
6. **Add to the layer's notes; never replace or remove one.** Append to the array the layer already has.
   A note the agent did not write is the person's. Do not write a note that says what an existing one
   already says. A note read from the layer carries both `label` and `labelMarkdown`, and Figma refuses
   a write that gives both ("Only one of label or labelMarkdown should be given"), so give each note
   back with one of them (`labelMarkdown` when it has one), plus its `categoryId` and `properties`.
7. **Read it back.** Read the layer's notes again (the live read, or the layer's `annotations`) and
   compare the text and category with what was written. A note that reads back different is fixed once;
   if it is still different, report it and stop, do not loop.
8. **Return each note as a row in the deviation table**: layer name and id, category, the text, and
   "written, read back". An ask that was **waiting on Figma** and is now written is reported as such.
