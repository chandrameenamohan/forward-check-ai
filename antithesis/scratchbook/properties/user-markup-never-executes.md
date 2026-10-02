---
id: user-markup-never-executes
observable: markup in a user's message is shown as text, never run, on every page that shows the message
type: always
priority: P1
site: harness:finally_pages (SUT: src/server/views/live.ejs, verdict.ejs)
guard: Sometimes("a message carrying a script tag was shown on a page")
guard_site: harness:parallel_driver_markup
evidence: tests/unit/server/views/verdict-render.test.ts
---

# user-markup-never-executes

## Property

The live page and the verdict page contain the message's text but neither its script tag nor its img tag as markup.

## Assertion

A WhatsApp message (the chat strips tags, WhatsApp does not) is looked at on /live/:id while it runs and on /v/:id after.

## Vacuity guard

`Sometimes`: a message carrying a script tag was shown on a page. Without it the property can pass only because the dangerous moment never came.
