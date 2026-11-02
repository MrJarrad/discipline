# Page titles and meta descriptions

Metadata is copy and follows `brand-voice` § Drafting method like any other surface. This file adds what search
does with it, from Google Search Central. The tags themselves and head hygiene are `markup-standard`'s.

## What a meta description does
- It is a candidate for the snippet, the text under a search result. Google "primarily uses the content on the
  page to automatically determine the appropriate snippet" and "sometimes uses the meta description HTML element
  if it might give users a more accurate description of the page"
  ([Search Central, snippets](https://developers.google.com/search/docs/appearance/snippet)).
- It does not affect ranking: "we still don't use the description meta tag in our ranking"
  ([Search Central blog, 2009](https://developers.google.com/search/blog/2009/09/google-does-not-use-keywords-meta-tag)).
- It is not a route into AI answers: "There are no additional requirements to appear in AI Overviews or AI Mode,
  nor other special optimizations necessary"
  ([Search Central, AI features](https://developers.google.com/search/docs/appearance/ai-features)).
  The visible page copy is what search and AI tools quote.

So the job of a meta description is one: make the result read well enough to earn the click.

## How to write one
- **Lead with what the page offers the reader.** Front-load it: the snippet "is truncated in Google Search results
  as needed, typically to fit the device width" (snippets page), so a phone shows the start.
- **Length is a working target, never a rule.** "There's no limit on how long a meta description can be"
  (snippets page); around 150 characters fits most desktop results. No line is padded or cut to hit a range.
- **One page, one description.** "Identical or similar descriptions on every page of a site aren't helpful";
  "Use site-level descriptions on the main home page or other aggregation pages" (snippets page). Each page's
  line is about that page.
- **Plain sentences, never a keyword list.** Google warns against "long strings of keywords" (snippets page):
  one or two sentences, never a list of disciplines.
- **No fixed shape across a set.** Lines in a set vary how they open and move (HOUSE-VOICE rule 6); a brief never
  prescribes a sentence formula or a mandatory ending (`prompt-craft`).

## Structured data
Marked-up facts are visible on the page: "Your structured data must be a true representation of the page
content" and "Don't mark up content that is not visible to readers of the page"
([structured data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)).
