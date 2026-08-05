# Nexus classifier boundary

The classifier is an optional suggestion provider. It does not authorize tasks, calendar
events, Gmail changes, prioritization, or automatic learning.

## Default state

`createClassifierAdapter()` starts disabled. While disabled:

- the provider is not invoked;
- no content hash is computed;
- no cache is read or written;
- every label abstains;
- Gmail, Calendar, tasks, goals, and manual organization remain independent.

Enabling the adapter requires an explicit `setEnabled(true)` call or `enabled: true`
construction option. Nexus routes and UI do not currently perform either action.

## Minimum input

Only these fields cross the adapter:

- title;
- text;
- sender string;
- received timestamp;
- whether a List-Unsubscribe header was present.

Record IDs, source URLs, attachment names, processing metadata, and raw unsubscribe values
are excluded.

## Cache

The default cache is an in-memory `Map`. Its key is:

```text
classifier-version:sha256(canonical-minimum-input)
```

The cache stores classifier results, including evidence excerpts, only for the current
process. It has no disk writer. Version changes invalidate keys automatically, and
`clearCache()` removes all entries. Returned results are defensive copies.

## Provider contract

A provider receives the minimum input and must return:

```text
{
  suggestions,
  confidence,
  evidence,
  abstained,
  values,
  modelVersion
}
```

The returned `modelVersion` must exactly match the adapter version. A mismatch fails and is
not cached.

## Batch pipeline

`createClassificationPipeline()` also defaults to a disabled adapter. It:

- accepts normalized records and classifies valid message records only;
- skips invalid and non-message records;
- isolates one classifier failure without failing the remaining batch;
- returns suggestion records in memory;
- does not mutate input records;
- does not import storage, routes, UI, or provider-action code.

Diagnostics contain only a record ID and stable code (`record.not-message`,
`record.invalid`, or `classifier.failed`). Provider errors and message content are not
returned.

## Private persistence boundary

`createClassifierStore({ filePath })` requires an explicit path. It has no default path and
is not imported by the batch pipeline, server, routes, or UI. A caller may choose the
Git-ignored `data/private/` area when product integration is explicitly added later.

The store:

- accepts validated classifier suggestions and classifier review decisions only;
- treats an identical record ID and value as an idempotent retry;
- rejects a reused record ID with different content instead of overwriting history;
- appends review decisions and never replaces an earlier decision;
- writes through a unique sibling temporary file and atomic rename;
- applies `0700` to its directory and `0600` to its file;
- fails closed when existing JSON or stored records are invalid.

Rejected-record diagnostics contain collection, array index, record ID, and stable code
only. They do not contain titles, message bodies, evidence, corrected values, or parser
errors. The store is process-local and does not claim concurrent-writer locking.

## Persistence orchestration

`createClassificationPersistenceService({ pipeline, store })` is the only boundary that
connects batch output to classifier storage. It is still default-off because its default
pipeline is default-off. While disabled, `processRecords()` returns a disabled summary
without invoking the pipeline or touching storage.

When explicitly enabled, the service classifies the supplied normalized records and passes
only suggestion records to `appendSuggestions()`. Its result contains counts, storage
status, and diagnostic-code counts. It does not return suggestions, record IDs, message
content, evidence, or exception messages. Known store errors retain their stable
`store.*` code; unexpected errors become `store.failed`.

This service has no default store, file path, route, scheduled job, Gmail connection, or UI
integration. It does not persist reviews or create actions.

## Read-only review view

`createClassifierReviewViewService({ store })` reads the explicit classifier store and
applies the latest-review projection. It returns pending, abstained, and resolved queues
containing only:

- opaque stable review and subject keys;
- suggestion type, proposed value, and optional extracted value;
- confidence, abstention, and whether evidence exists;
- projected status and effective reviewed value.

The view excludes stored record IDs, Gmail/provider IDs, titles, text, evidence excerpts,
source metadata, timestamps, model versions, and classifier content hashes. Its opaque
keys are derived in a separate review-view namespace, so the private identifiers are not
returned while suggestions for one subject can still be grouped.

Store failures return empty queues plus a stable `store.*` or `store.failed` code. The
service does not classify, write, import routes, or perform actions.

## Explicit review commands

`createClassifierReviewCommandService({ store })` is the only boundary that turns a
review-view choice into a stored classifier review. Each command requires:

- the opaque review key;
- the projected status the user saw;
- a caller-generated UUID command ID;
- accept, correct, dismiss, or not-enough-information;
- a corrected value only for correct.

The service resolves the opaque key inside private storage and compares the expected status
with the latest projection before writing. Unknown keys and changed statuses are rejected.
The UUID makes an exact retry idempotent; reusing it for a different decision is rejected
as a conflict.

Successful commands append one validated `review-decision`. Responses contain only
accepted/rejected/failed status, a stable code, and an idempotent flag. They contain no
suggestion, decision record, provider ID, corrected value, or exception message. The
service does not create tasks, calendar events, approvals, actions, classifier rules, or
training data, and it has no HTTP or UI integration.

## Isolated HTTP handlers

`createClassifierReviewRouteHandler(...)` defines two unmounted endpoints through injected
view, command, body-reader, and JSON-response adapters:

- `GET /api/classifier/reviews` returns the privacy-safe review view;
- `POST /api/classifier/reviews/commands` submits one explicit review command.

The view path rejects other methods. The command path requires `application/json`, allows
only the five command fields, passes a 4 KiB limit to the request reader, verifies the
actual UTF-8 byte length, and rejects query parameters. Malformed, non-object, unknown-field,
oversized, and unreadable bodies receive stable codes without echoed input.

Service results map to stable HTTP statuses: created, idempotent success, invalid, unknown,
stale/conflict, or unavailable. The handler has no default services or filesystem path and
is not imported by `local-server.mjs`; therefore these paths are not live in the product.

## Fail-closed composition

`createClassifierReviewComposition(...)` assembles the store, read view, command service,
and HTTP handler only when `enabled === true`. Other values—including the string
`"true"`—return a disabled handler that declines every request and creates no file.

Enabled composition requires:

- an explicit absolute `privateFilePath`;
- an injected bounded request-body reader;
- an injected JSON response writer.

There is no default path or environment-variable parsing. The returned surface contains
only `enabled` and `handleRequest`; it does not expose the private store or services.
Composition does not import or enable the classifier pipeline. It remains unmounted from
`local-server.mjs`.

## Request guard

Enabled composition wraps the review handler in
`createClassifierReviewRequestGuard(...)`. The guard requires:

- an exact origin from an explicit, unique allowlist;
- a review session token of at least 32 UTF-8 bytes on every review read and command.

Origins are normalized and must contain only scheme, host, and optional port. Missing,
opaque (`null`), malformed, path-bearing, duplicated, and unlisted origins are rejected.
This is the browser/WebView cross-origin boundary; it is not treated as authentication.

The token travels in `X-Nexus-Review-Token`. Both candidate and expected tokens are
SHA-256 digested and compared with a constant-time primitive. Missing and incorrect tokens
receive the same response. Denials occur before the route handler, body reader, or private
store is reached and return only `request.origin.denied` or `request.token.denied`.

There are no default allowed origins or token. Unrelated paths pass through without this
guard. Cross-origin preflight is defined below; trusted runtime token delivery remains a
prerequisite before the composition can be mounted.

## Server integration contract

`createClassifierReviewServerIntegration(...)` remains unmounted but defines the only safe
server configuration path:

- `NEXUS_CLASSIFIER_REVIEWS` must equal the exact string `1`;
- enabled integration accepts only `127.0.0.1` or `::1` server binding;
- private path and comma-separated allowed origins remain explicit;
- an injected token is used when configured, otherwise 32 random bytes produce an
  in-memory base64url token;
- the token remains inside the composed services; the frozen trusted-bootstrap surface can
  issue or clear one-time codes but cannot read the token.

The request guard handles origin-approved `OPTIONS` preflight. It permits only the
endpoint's GET or POST method and only Content-Type plus X-Nexus-Review-Token headers.
Explicit-origin actual and preflight responses receive exact-origin CORS, `Vary: Origin`,
and `Cache-Control: no-store`.

Browsers may omit `Origin` on a same-origin GET. For non-OPTIONS requests only, the guard
therefore accepts an absent—not malformed or `null`—Origin when the request URL origin is
explicitly allowlisted and the browser-protected `Sec-Fetch-Site` header equals the exact
value `same-origin`. No CORS headers are needed for that path. Missing fetch metadata,
`none`, `same-site`, `cross-site`, a mismatched URL origin, or Origin-less preflight remains
denied before token handling. The strong private token is still required afterward.

This follows the W3C Fetch Metadata algorithm: `same-origin` is emitted only when the
entire request URL chain remains same-origin, and `Sec-` metadata cannot be modified by
page JavaScript. Non-browser clients can forge metadata but still cannot pass without the
private token.

`createBoundedRequestBodyReader()` counts bytes per incoming chunk before buffering. The
route's 4 KiB command limit cannot exceed the reader's server-wide maximum. Oversized and
stream-error responses are sanitized.

The current `local-server.mjs` binds `0.0.0.0`, so it cannot mount this integration without
first changing to loopback. Runtime bootstrap must deliberately deliver `clientAccess` to
the trusted browser/WebView without logging or embedding it in public build assets.

## Ephemeral runtime bootstrap

`createClassifierReviewBootstrapService(...)` separates trusted issuance from browser
redemption. The desktop renderer or Android native bridge calls `issue(origin)`, receiving
a random one-time code with a 60-second default lifetime. Only its SHA-256 hash and expiry
remain in memory. Issuing again for the same origin invalidates the prior code, and
redemption succeeds once for that origin. Restart or `clear()` invalidates all codes.

Wrong-origin, wrong-code, expired, replayed, and cleared attempts all return
`bootstrap.denied`. The service logs and persists neither codes nor tokens.

The unmounted `POST /api/classifier/reviews/bootstrap` handler accepts one origin-approved,
bounded JSON code and supports Content-Type-only preflight. A successful redemption returns
the review token with no-store CORS. The client must keep it in JavaScript memory only—not
localStorage, sessionStorage, URLs, static assets, or logs.

`createClassifierReviewDesktopHandoff(...)` now provides the unmounted desktop delivery
boundary. Trusted server code supplies an HTML template and allowed origin. The renderer
issues a new code and inserts one inert `application/json` element immediately before the
single configured marker. It returns an in-memory response descriptor with no-store,
no-cache, no-referrer, nosniff, and explicit HTML content-type headers.

The renderer escapes HTML-active JSON characters, includes only the code, expiry, and
fixed bootstrap path, and rejects invalid templates, duplicate/missing markers, denied
origins, and malformed issuance. It never receives the review token. The page must remove
the handoff element immediately after reading it and redeem the code once.

This renderer remains unmounted. Static desktop files, copied mobile assets, and the
Android native bridge remain unchanged.

`createClassifierReviewBootstrapClient(...)` is the matching unmounted browser boundary.
It reads the exact inert element, copies its text, clears and removes the element before
any network call, then validates the exact payload fields, fixed relative path, minimum
code strength, and future expiry. Invalid or expired handoffs cause no request.

Successful redemption must return the exact ready response and a strong token. The token
is retained only in a private closure: it is not returned by initialization and is not an
object property. The closure can authorize only GET review-view requests and POST review
commands, always forcing no-store, same-origin credentials, no-referrer, and the private
token header. `clear()` destroys this capability. Failed initialization cannot retry the
removed handoff, and errors return content-free stable codes.

The client lives outside `src/`, is not imported by the application, and is not copied
into the current Android bundle.

`createClassifierReviewRuntime(...)` owns that client for a trusted browser module. It
requires explicit client and lifecycle adapters and stores neither on global state. Its
frozen surface exposes initialization, privacy-safe view reads, explicit review commands,
sanitized status, and clear—never the token or unrestricted fetch.

The runtime accepts only the exact review-view shape and an allowlist of privacy-safe item
fields. View JSON is capped at 64 KiB; command-result JSON is capped at 8 KiB. Content type,
declared length, actual UTF-8 length, JSON shape, and command fields are validated before
data is returned or sent. Unknown fields and malformed or oversized responses fail with
stable content-free codes.

`pagehide` and `beforeunload` both clear the private client capability and detach lifecycle
listeners. Explicit clear is idempotent. Failed initialization consumes and clears the
client, sanitizes unknown failure codes, and cannot retry the removed handoff.

The synthetic full desktop flow now uses this runtime for initialization, pending-view
read, explicit accept, resolved-view read, and pagehide cleanup. The runtime remains
unmounted and is not referenced by application or mobile assets.

`classifier-review-entry.js` adds a module-scoped owner above the runtime. Importing the
module is inert and creates no global property. Explicit `start(...)` constructs the
client/runtime exactly once; concurrent and duplicate starts share that result. Trusted
module imports receive only controlled start, view, command, status, and clear functions.
The client and runtime objects remain closure-private.

Start-before-use, clear-before-start, construction failure, initialization failure, and
duplicate-start behavior all return stable outcomes. A clear during asynchronous bootstrap
cannot restore the session when initialization later resolves. Runtime lifecycle teardown
also prevents subsequent entrypoint reads or commands.

The synthetic full desktop flow now starts through a fresh entrypoint factory rather than
constructing the client or runtime directly. The module is still neither injected nor
served by the HTTP application.

Dynamic module delivery is now an explicit optional HTTP-app configuration. The caller
must provide exactly four non-empty sources: activation, bootstrap client, entrypoint, and
runtime. Extra/missing modules, empty sources, or a configured review token embedded in a
source fail construction. Sources are copied into an immutable in-memory route snapshot,
so later caller mutation cannot change served code.

When that graph is configured, the dynamic handoff inserts one fixed same-origin module
URL after the inert bootstrap JSON. The tiny activation module imports the entrypoint and
starts it; it exports nothing and creates no global capability. The remaining relative
imports resolve within the fixed isolated module directory.

Only exact allowlisted module paths are served. They require the document origin, GET, and
no query string, and return JavaScript content type with no-store, no-referrer, and nosniff
headers. Wrong origin, query, or method returns stable safe JSON; unknown paths pass
through. Without explicit sources, no activation tag is injected and no module route is
handled.

The real loopback HTTP test loads the production source files into this explicit graph,
verifies the injected activation URL, retrieves every byte-identical module, and checks
security headers. It does not yet execute the graph in a real browser.

The complete desktop path is covered by one synthetic test using the real renderer,
client, redemption route, origin/token guard, review view, command service, and private
store. It reads one pending suggestion, accepts it explicitly, observes one resolved item
and one append-only review, clears the session, and confirms further access is unavailable.
Its POST requests use the approved `Origin`; its GET requests exercise the allowlisted URL
origin plus `Sec-Fetch-Site: same-origin` fallback.

A second integration test runs the same lifecycle through a real Node HTTP server bound to
`127.0.0.1` on an operating-system-assigned port. It exercises real incoming request
streams, bounded body reading, URL/Host-derived origin checks, response writing, dynamic
HTML delivery, bootstrap redemption, review reads, command submission, and session clear.
The harness also verifies:

- dynamic HTML uses no-store, no-referrer, and nosniff headers;
- bootstrap and explicit-Origin commands return exact-origin CORS;
- Origin-less same-origin GET responses do not add CORS;
- JSON responses remain no-store and nosniff;
- missing-token and cross-site requests receive sanitized denial;
- an oversized streamed bootstrap body is rejected.

The harness is test-only and closes its ephemeral listener. It does not modify or mount
`local-server.mjs`.

`createClassifierReviewHttpApp(...)` extracts the proven Node HTTP behavior from that
harness without creating a listener. Exact flag value `1` is required; disabled creation
validates nothing and handles nothing. Enabled creation requires the loopback server
contract, an explicit document origin, and an in-memory desktop HTML template.

The app owns strict JSON, empty, CORS, and dynamic-document responses. It handles only the
review API paths plus exact `/` document requests. Wrong document origin, queries, methods,
and unavailable handoffs receive stable no-store JSON failures; unrelated routes pass
through. Its frozen public surface contains only `enabled` and `handleRequest`. The token,
renderer, and trusted-bootstrap controls remain private.

The real loopback test now consumes this composition directly. Network listening, static
file reading, browser-module activation, and production mounting remain outside it.

The loopback server integration now composes this lifecycle. Its public integration surface
contains `handleRequest` and frozen `trustedBootstrap.issue(origin)`/`clear()` functions;
it no longer exposes the review token directly. Bootstrap redemption is routed before the
token-guarded view and command handlers. Trusted issuance remains outside HTTP.
