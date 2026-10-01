---
id: no-loopback-fetch-from-user-url
observable: a link in a user's message can not make the app fetch its own machine or network and pass the content on
type: unreachable
priority: P1
site: harness:finally_pages (SUT: src/services/url-extractor.ts assertPublicUrl)
guard: Sometimes("a user's URL to an outside article was fetched and its content reached the model")
guard_site: harness:parallel_driver_urls
evidence: tests/unit/services/url-extractor.test.ts (assertPublicUrl)
---

# no-loopback-fetch-from-user-url

## Property

The classifier is never sent an article taken from a loopback address. The slice probes loopback only; the unit tests cover private, link-local and mapped addresses and a redirect.

## Assertion

The scripted model logs which host the article in its prompt came from.

## Vacuity guard

`Sometimes`: a user's URL to an outside article was fetched and its content reached the model. Without it the property can pass only because the dangerous moment never came.
