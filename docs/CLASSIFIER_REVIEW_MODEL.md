# Nexus classifier suggestion and review model

Classifier output and human judgment are different record types.

## Classifier suggestion

`classifier-suggestion` records contain:

- the normalized message record ID;
- one suggestion type and suggested value;
- an optional extracted date/time value;
- confidence and evidence;
- explicit abstention state;
- classifier version and content hash.

One classification produces one record for each supported label. Abstentions persist with
a null value, zero confidence, and no invented evidence. Deterministic IDs make writing
the same classifier version over the same content idempotent.

## Human review decision

Classifier reviews use separate `review-decision` records with
`reviewKind: classifier-suggestion`. Supported decisions are:

- `accept`;
- `correct`, which requires `correctedValue`;
- `dismiss`;
- `not-enough-information`.

Organization-only decisions such as pin and review-later are rejected for classifier
reviews. Existing manual organization decisions retain their prior behavior.

## No action or learning

Neither suggestion nor review creation:

- creates a task or calendar event;
- creates an approval request;
- writes provider action history;
- modifies Gmail or Calendar;
- changes classifier rules or weights.

Reviews are append-only audit history for later explicit product decisions. They are not
training examples and do not become sender/domain rules.

## Review projection

`projectClassifierReviews(records)` is a pure read over suggestions and decisions:

- the latest classifier review per suggestion wins;
- unresolved non-abstained suggestions enter `pending`;
- unresolved abstentions enter `abstained`;
- accepted, corrected, dismissed, and not-enough-information items enter `resolved`;
- accepted items expose the original suggestion value;
- corrected items expose only the explicit corrected value;
- dismissed and not-enough-information items have no effective value.

Manual organization reviews and reviews targeting absent suggestions are ignored. The
projection does not mutate inputs or create records/actions.

## Persistence

The optional classifier store preserves suggestions and reviews in separate arrays.
Suggestion IDs are immutable: exact retries are idempotent and conflicting reuse is
rejected. Every new classifier review is appended, so the projection can select the latest
decision without deleting the audit trail.

The store accepts neither manual-organization reviews nor task, calendar, approval, or
action-history records. It requires an explicit private file path, performs atomic
restrictive writes, and is not connected to routes or automatic classification.

The optional persistence service writes batch-produced suggestions only when its pipeline
has been explicitly enabled. It returns aggregate counts and stable codes rather than
records. Human review persistence remains a separate explicit store call; classification
cannot manufacture a review decision.

The read-only review-view service applies the latest-decision projection and maps records
to a smaller view model. Opaque review keys support later explicit review targeting, while
opaque subject keys allow grouping labels for one message. Raw identifiers, evidence
excerpts, provenance, model versions, and content hashes stay inside private storage.

The review-command service resolves one opaque key privately and appends one validated
human decision. It uses the status shown in the read view as an optimistic concurrency
check, so a decision based on stale state is rejected. A UUID command ID makes network
retries idempotent without deleting or replacing review history.

Isolated HTTP handlers preserve these service contracts without returning private storage
records. They are dependency-injected and currently unmounted, so adding the handler alone
does not expose a private store or enable classification.

The composition factory fails closed unless passed literal boolean true and an absolute
private path. Disabled composition constructs no storage or review service. Enabled
composition still performs review reads and explicit human commands only; it does not run
classification.

Enabled composition also requires an explicit origin allowlist and strong review-session
token. Both reads and writes require the token because the future server binds beyond
loopback; Origin alone is an anti-CSRF signal and can be forged by non-browser clients.
Denied requests reach neither storage nor the request-body reader.

The planned server integration is stricter: review enablement requires loopback binding,
exact string flag parsing, and runtime-only access material. Cross-origin WebView requests
use an origin-approved preflight; command bodies are bounded during streaming rather than
after full buffering.

Runtime access uses a short-lived one-time bootstrap code rather than embedding the review
token in static assets. A reload gets a new code and invalidates the prior unredeemed code
for that origin. On desktop, an unmounted dynamic renderer can place only this code,
expiry, and fixed redemption path in an inert JSON element in a no-store response. The
browser client removes that element before redemption and retains the redeemed token only
inside a private request closure. The closure is limited to review reads and commands and
can be explicitly cleared. A full synthetic desktop flow proves pending → accepted →
resolved without exposing the token through the client surface. Static/mobile assets never
contain either value.

A separate browser runtime owns the client capability without placing it on global state.
It validates bounded privacy-safe views and explicit commands, reports stable status only,
and clears the session on pagehide, beforeunload, or explicit teardown.

A module-scoped entrypoint constructs that runtime once and exposes controlled functions
only to trusted ES-module imports. Import alone has no side effect, duplicate starts do not
create duplicate sessions, and teardown during bootstrap cannot be reversed by a late
asynchronous completion.

The unmounted HTTP app can optionally inject a fixed activation-module URL and serve an
exact four-module source graph from an immutable in-memory snapshot. Modules are
same-origin, no-store, nosniff, and absent unless explicitly configured.

The production graph is browser-smoke-tested through explicit external Playwright and
Chromium paths. The real browser confirms one-time bootstrap, pseudonymized review
projection, and lifecycle teardown without mounting the app or adding a browser dependency.

The unmounted renderer further narrows that projection before it reaches a DOM adapter.
Review/subject keys remain private closure state and are replaced with render-local item
IDs. Suggestions, abstentions, and prior decisions are separate labelled sections.
Actions are explicit accessible labels; abstentions cannot be accepted and resolved items
cannot be acted on. Adapter announcements contain only stable user-facing messages.

The concrete DOM adapter parses no model value as markup. It uses labelled native forms,
inputs, and submit buttons, plus a live status region. Delegated events are authorized
through render-specific `WeakMap` identities rather than DOM data attributes. Re-render
replaces all prior nodes and clear removes its sole listener.

The unmounted UI composition owns the lifecycle across entrypoint, renderer, and adapter.
Actions are unavailable until both private bootstrap and initial safe-view rendering
succeed. Entry/view failure and explicit teardown clear all layers. Late asynchronous
reads or commands cannot recreate DOM or announcements after teardown.

Real Chromium verifies the full unmounted UI behavior with hostile synthetic text and a
native button submission. The accepted decision is persisted and the view refreshes from
pending to resolved; page lifecycle teardown removes the rendered UI and private session.
The three UI modules remain smoke-harness-only and outside strict production delivery.

Origin enforcement distinguishes explicit cross-origin CORS from same-origin browser
reads. An absent Origin is accepted only for a non-preflight request whose URL origin is
allowlisted and whose protected fetch metadata says exactly `same-origin`; the private
token remains mandatory.

The full pending → accepted → resolved lifecycle also passes through real ephemeral
loopback HTTP with streamed request bodies and verified no-store/CORS response behavior.
The reusable HTTP application composition owns these responses but does not listen on a
port. Its only public capability is request handling; token and issuance controls stay
inside the closure.
