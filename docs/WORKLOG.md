# Nexus worklog

## 2026-08-02 to 2026-08-03 — Recovery and Milestone 0

### Outcome

Recovered the useful Nexus code into a clean public repository and completed Milestone 0.
The current baseline is intentionally read-only and contains no automatic mail
classification.

### Completed

- Reviewed the original project and copied only the required application, server, PWA, and
  Android source.
- Removed the failed sender-learning and hard-coded mail-classification paths.
- Excluded old learning data, private mail data, OAuth tokens, caches, logs, generated
  builds, and machine-specific configuration from Git.
- Preserved read-only Gmail and Google Calendar connections, MIME parsing, pagination,
  local private caching, date candidates, PWA support, and the Capacitor Android wrapper.
- Added clean-baseline documentation and a milestone-based execution plan.
- Updated dependencies within the existing Capacitor major version.
- Verified a fresh `npm ci`, syntax checks, mobile asset preparation, and zero reported npm
  vulnerabilities.
- Added GitHub Actions validation for Node 22, Node 24, Capacitor synchronization, and an
  Android debug build.
- Fixed CI asset preparation, Gradle working-directory, and Java toolchain issues. The full
  workflow passed.
- Restored local Google credentials and token files only in ignored, owner-readable paths.
- Renewed OAuth authorization and verified read-only Gmail and Calendar responses without
  printing private content.
- Built, signed, installed, and launched Nexus on a physical Samsung Android device.
- Restored the Matrix theme as the clean native default.
- Removed stale native service-worker data that exposed obsolete UI.
- Connected the Android app to the local Nexus server over an ADB USB reverse bridge.
- Removed the duplicate Chrome-installed Nexus web app after verifying the native Matrix
  build.
- Added the MIT License.
- Configured future repository commits to use the GitHub `noreply` identity.

### Verified state

- Repository: clean and synchronized with `main`.
- Release baseline: `0.2.0`.
- GitHub Actions: Node validation and Android debug build pass.
- Google scopes: Gmail read-only and Calendar read-only.
- Android: one native Nexus package installed; Matrix UI opens without the removed sorter.
- Secrets: `.env`, OAuth tokens, cached messages, diagnostic output, and build products are
  ignored.

### Operational note

The Android app currently reaches the local server through:

```text
adb reverse tcp:8050 tcp:8050
```

This bridge must be recreated after reconnecting or restarting the phone. A durable,
secure backend connection is deferred until the local data model and connector boundaries
are stable.

### Next session

Start Milestone 1 with the stable internal record model:

1. Define message and calendar event records.
2. Add explicit validation.
3. Add synthetic Gmail and Calendar fixtures.
4. Test malformed, incomplete, and duplicate inputs.
5. Normalize connector output into validated records.

Do not add classification, private fixtures, or provider mutations during this slice.

## 2026-08-03 — Milestone 1 foundation

### Completed

- Added versioned message and calendar-event record factories under `src/domain/`.
- Added explicit validation results and structured validation errors.
- Added processing-version, normalization-time, source, source ID, source URL, and retention
  metadata.
- Preserved all-day Calendar events explicitly instead of treating them as timed events.
- Added deterministic duplicate handling that keeps the first validated record and reports
  later duplicates.
- Added Gmail and Google Calendar normalization adapters.
- Added synthetic fixtures using reserved example domains and invented IDs.
- Added seven Node unit tests covering valid Gmail, timed events, all-day events, incomplete
  messages, malformed dates, reversed event times, and duplicates.
- Added the unit suite to GitHub Actions.

### Verification

- `npm run check` passes.
- `npm test` passes: 7 tests, 0 failures.
- `npm run mobile:prepare` passes.
- No UI behavior, private account data, classification, or provider permissions changed.

### Next slice

Wire provider requests through connector modules, validate normalized output before local
cache storage, and test batches containing valid, invalid, and duplicate provider records.

## 2026-08-03 — Milestone 1 server boundary

### Completed

- Added safe batch normalization that keeps valid records when neighboring provider items
  are invalid.
- Added sanitized per-record failures containing indexes, source IDs, and validation errors
  without message bodies or event descriptions.
- Added explicit duplicate reports.
- Added a normalized record store that rejects invalid records and deterministically keeps
  the newest normalization for an existing record ID.
- Extended Gmail and Calendar responses with `records` and normalization summaries while
  retaining legacy `items` for the current UI.
- Extended the private mail cache format with validated records.
- Updated the browser cache request to send server-produced records when available.
- Added mixed-batch, redacted-failure, storage-rejection, update-order, and isolated HTTP
  cache-route tests.

### Verification

- `npm run check` passes.
- `npm test` passes: 12 tests, 0 failures.
- `npm run mobile:prepare` passes.
- Isolated cache-route testing uses a temporary directory and never touches private data.
- Read-only live smoke test: Gmail produced 10 items and 10 validated records with zero
  failures; Calendar produced a valid empty batch.
- No UI fields, classification behavior, OAuth scopes, or provider mutations changed.

### Next slice

Extract OAuth refresh, authenticated Google fetch, Gmail retrieval, and Calendar retrieval
from `local-server.mjs` into connector modules with injected-fetch tests.

## 2026-08-03 — Milestone 1 connector transport

### Completed

- Extracted Google authorization URL creation, authorization-code exchange, token refresh,
  and authenticated JSON requests into an injected client module.
- Extracted Calendar query construction and provider-response mapping.
- Extracted Gmail search-window queries, limits, pagination, ordered concurrent mapping,
  and provider-error passthrough.
- Kept token persistence private and injected from the server.
- Preserved the existing HTTP response contract and read-only scopes.
- Added seven connector tests with synthetic tokens, URLs, provider responses, and injected
  fetch functions.

### Verification

- `npm run check` passes.
- `npm test` passes: 19 tests, 0 failures.
- `npm run mobile:prepare` passes.
- Read-only live smoke test: Gmail produced 10 validated records with zero failures;
  Calendar produced a valid empty batch.
- No real tokens, provider content, or credentials appear in fixtures or test output.

### Next slice

Extract Gmail raw/full fallback and MIME parsing into a dedicated module with synthetic MIME
fixtures, then reduce the Gmail HTTP route to orchestration and response formatting.

## 2026-08-03 — Milestone 1 Gmail parser

### Completed

- Extracted Gmail raw-message retrieval, PostalMime parsing, full-message fallback, header
  decoding, body selection, attachment discovery, and safe previews into a dedicated
  connector parser.
- Reused the parser in both the normal Gmail route and the bounded diagnostic route.
- Preserved structured-text fallbacks and subject inference for order, booking, and
  attachment messages.
- Added synthetic plain-text, HTML-only, attachment, fallback, and malformed MIME coverage.
- Sanitized parser failures so diagnostics cannot include message content.
- Removed more than 400 lines of MIME implementation detail from the HTTP server.

### Verification

- `npm run check` passes.
- `npm test` passes: 24 tests, 0 failures.
- `npm run mobile:prepare` passes.
- Read-only live smoke test: Google reported connected; Gmail returned a parsed bounded
  sample; Calendar returned a valid empty result.
- The smoke test recorded only status and counts. No provider content, identity data,
  credentials, or tokens were printed or added to fixtures.

### Next slice

Define and validate the remaining local record contracts: extracted signals, tasks, goals,
review decisions, approval requests, and action history. Add synthetic persistence tests
without introducing classification or provider mutations.

## 2026-08-03 — Milestone 1 local record contracts

### Completed

- Added factories and explicit validation for extracted signals, tasks, goals, review
  decisions, approval requests, and action history.
- Required extracted signals to retain observable evidence and a source-record link.
- Added task and goal lifecycle states, optional target timestamps, and related-record links.
- Added review decisions without treating corrections as automatic training data.
- Added approval state consistency checks and separate action outcomes for auditable history.
- Added synthetic fixtures for every new record type.
- Verified that the shared record store accepts mixed types, keeps the newest normalization,
  and rejects invalid records without copying record text into rejection metadata.

### Verification

- `npm run check` passes.
- `npm test` passes: 30 tests, 0 failures.
- `npm run mobile:prepare` passes.
- Fixtures contain invented local IDs and synthetic text only.
- No classification, external action, OAuth scope, UI behavior, or provider permission changed.

### Next slice

Extract the Google HTTP handlers into a route module, add isolated API-contract tests, and
leave the static server responsible for request dispatch and response formatting.

## 2026-08-03 — Milestone 1 Google route boundary

### Outcome

Completed Milestone 1. Nexus now has validated internal records and separated boundaries
for Google transport, provider retrieval, Gmail parsing, normalization, persistence, and
HTTP routing.

### Completed

- Extracted Google status, authorization, callback, Calendar, Gmail, and bounded diagnostic
  handlers into an injected route module.
- Reduced the main local server by more than 200 additional lines.
- Preserved the existing JSON and HTML response contracts used by the browser and Android
  clients.
- Added isolated route tests for non-Google dispatch, disconnected status, Calendar success,
  Gmail success and pagination, Calendar provider errors, and Gmail provider errors.
- Kept resource failure metadata free of provider error text.

### Verification

- `npm run check` passes.
- `npm test` passes: 36 tests, 0 failures.
- `npm run mobile:prepare` passes.
- Read-only live smoke test: Google reported connected; Calendar returned a valid empty
  normalized batch; Gmail returned 10 items and 10 validated records.
- The live check recorded status and counts only.
- No private data, credentials, OAuth scopes, provider permissions, classification, or
  external mutations changed.

### Next milestone

Start Milestone 2 with local task and goal persistence, then replace the hard-coded Today
content with normalized calendar events and user-owned tasks and goals. Preserve explicit
loading, disconnected, empty, and error states before adding any classifier.

## 2026-08-03 — Milestone 2 persistent Today foundation

### Outcome

Nexus now has a classification-free Today view backed by private local tasks and goals plus
read-only Google Calendar events. Hard-coded Today, Calendar, and goal sample records were
removed.

### Completed

- Added a private `data/private/local-records.json` store, covered by the existing Git ignore
  rule.
- Added local APIs to list records, create tasks and goals, and update their lifecycle status.
- Validated every write through the Milestone 1 task and goal record contracts.
- Added local task completion and goal pause, resume, and completion controls.
- Added task and goal forms to the Matrix interface.
- Rebuilt Today from active local tasks and loaded Google Calendar events.
- Made the focus strip reflect the first active goal instead of hard-coded personal content.
- Added explicit loading, local, offline, error, empty, and Calendar-not-loaded states.
- Added isolated route tests and a temporary-directory HTTP persistence test.

### Verification

- `npm run check` passes.
- `npm test` passes: 42 tests, 0 failures.
- `npm run mobile:prepare` passes and the generated Android web assets contain the new forms
  and local record actions.
- Live read-only checks: the updated page served with the task form; the real private store
  reported zero tasks and zero goals; Google remained connected; Calendar returned a valid
  empty batch.
- No synthetic records were written to the real private store.
- Privacy scanning found no personal content, credentials, or new secrets.
- Gmail and Calendar scopes remain read-only; no provider mutation was added.

### Next slice

Show synchronization age and source health in Today, then add explicit manual pin, dismiss,
and review-later behavior. Verify the resulting layout in the Android wrapper on the Samsung
device.

## 2026-08-03 — Milestone 2 source health

### Completed

- Added a Today health panel for the Nexus server, Google connection, Calendar, Gmail cache,
  and private task/goal store.
- Added synchronization-age formatting for fresh, minute-old, hour-old, day-old, missing,
  invalid, and future timestamps.
- Derived source state from existing read-only status, resource, cache, and local-record
  responses.
- Stored only the last successful Google synchronization timestamp in browser-local storage.
- Made disconnected, setup-required, offline, and error sources raise an Attention summary.
- Converted the browser entry script to a module and added the health helper to the PWA
  application shell.

### Verification

- `npm run check` passes.
- `npm test` passes: 44 tests, 0 failures.
- `npm run mobile:prepare` passes and includes the health panel, module import, and updated
  PWA cache.
- Live checks confirmed the page, health helper, resource timestamp, empty private store,
  and connected Google status all load successfully.
- Live output contained status, timestamps, and counts only.
- Privacy scanning found no personal content, credentials, or new secrets.

### Next slice

Add explicit manual pin, dismiss, and review-later behavior using local auditable records,
then verify the complete Today flow in the Android wrapper on the Samsung device.

## 2026-08-03 — Milestone 2 manual organization

### Completed

- Extended review-decision validation with explicit pin, unpin, dismiss, and review-later
  choices.
- Added an append-only local review API; organization decisions do not modify their task or
  Calendar source records.
- Added Pin, Unpin, Review later, and Dismiss controls to Today items.
- Made pinned items sort first.
- Moved manually deferred items into the Attention Queue.
- Allowed a later Pin decision to restore an item from Review later.
- Kept dismissed items out of Today while retaining their source and decision history.
- Added pure organization logic so “latest decision wins” behavior is deterministic and
  independently tested.
- Updated the PWA application shell for the new organization module.

### Verification

- `npm run check` passes.
- `npm test` passes: 50 tests, 0 failures.
- `npm run mobile:prepare` passes.
- Live checks confirmed the organization module, empty real review/task/goal store, and
  connected Google status load successfully.
- No synthetic decisions were written to the real private store.
- Privacy scanning found no personal content, credentials, or new secrets.
- The available Android bridge is a Windows `adb.exe`, which this Linux execution
  environment cannot run. Physical Samsung verification remains pending; Android CI still
  validates the build.

### Next slice

Reopen a compatible ADB session, install the current Android debug build, and verify task
creation, goal creation, pin, review-later, restore, dismiss, offline state, and Google
read-only loading on the Samsung-sized interface.

## 2026-08-03 — Milestone 2 Samsung verification

### Outcome

Completed Milestone 2. The current Nexus Android build is installed and running on a
physical Samsung SM-S916B through a USB reverse bridge to the private local server.

### Completed

- Installed Linux ADB and verified that the Samsung is authorized over USB.
- Made the Gradle Java 21 daemon requirement vendor-neutral.
- Added CI artifact publication for the Android debug APK.
- Downloaded and checksummed the exact APK produced by GitHub Actions.
- Replaced the signature-incompatible legacy debug package with the current build.
- Restored `adb reverse tcp:8050 tcp:8050` and launched `com.tango.nexus`.
- Found a real-device status-bar overlap not visible in CI.
- Traced the failed first fix to a later Matrix-theme padding override.
- Corrected the Matrix mobile inset, rebuilt, reinstalled, and visually verified the fix.

### Physical verification

- Device: Samsung SM-S916B.
- Current activity: `com.tango.nexus/com.tango.nexus.MainActivity`.
- Matrix theme renders correctly and clears the system status bar.
- Today heading, goal focus, navigation, and Google Link are readable at the device width.
- Google reports connected in read-only mode through the USB bridge.
- Task form, optional due-time control, Save Task button, empty Next Up state, and manual
  Attention Queue render with usable touch targets.
- Scrolling remains functional across the long Today view.
- No synthetic tasks, goals, reviews, Gmail mutations, or Calendar mutations were created.

### Verification

- `npm run check` passes.
- `npm test` passes: 50 tests, 0 failures.
- `npm run mobile:prepare` passes.
- GitHub Actions passes on Node 22, Node 24, and Android.
- CI now publishes `nexus-debug-apk` for repeatable device testing.

### Remaining release hardening

CI debug APKs use ephemeral signing keys, so packages from separate runs cannot update one
another in place. Configure a stable protected signing key before release distribution.

### Next milestone

Start Milestone 3 with a synthetic evaluation fixture format, labeling guide, repeatable
scoring command, deliberately weak baseline, and written quality gates before adding any
classifier to the product.

## Session handoff — 2026-08-03

### Stable state

- Milestones 0, 1, and 2 are complete.
- The current Android build is installed on the Samsung SM-S916B.
- Linux ADB and OpenJDK 21 are installed for future device work.
- CI publishes the `nexus-debug-apk` artifact.
- Google remains read-only.
- Real private task, goal, and review stores remain empty.
- The temporary USB reverse bridge and local verification server are intentionally stopped
  at session end and must be recreated for the next phone session.

### Tomorrow's exact resume point

Start Milestone 3 without touching private Gmail content:

1. Define a versioned synthetic evaluation fixture schema.
2. Write the labeling guide for reply, deadline, calendar candidate, urgency, topic, and
   automated/newsletter signals.
3. Implement a repeatable scoring command.
4. Add a deliberately weak deterministic baseline.
5. Write quality gates before considering any AI model or prompt.

Do not add classification to Today or Inbox yet. Do not create learning rules from review
history. Do not request additional Google permissions.

## 2026-08-04 — Milestone 3 evaluation framework

### Outcome

Completed the evaluation foundation without reading private Gmail content, connecting an
AI model, or changing the Nexus product UI.

### Completed

- Added versioned dataset `nexus-public-synthetic-v1` with 12 entirely invented messages.
- Defined reply, deadline, calendar-candidate, urgency, topic, and automated labels.
- Added a labeling guide with explicit null, abstention, and evidence rules.
- Added deterministic scoring for precision, recall, F1, abstention, Brier score,
  calibration, topic coverage/accuracy, false urgent, and missed urgent results.
- Added written quality gates before selecting a model or prompt.
- Added a deliberately weak keyword baseline and committed its versioned report.
- Added ignored private evaluation paths for any future locally held material.
- Made CI reproduce the committed evaluation report and reject report drift.

### Evidence

- `npm run check` passes.
- `npm test` passes: 55 tests, 0 failures.
- `npm run mobile:prepare` passes.
- Two consecutive report generations produced SHA-256
  `61bf8e7ce1e66ba6f1c04431bf486784983072ec191f7e756aef5fc272b0b8f2`.
- The weak baseline correctly fails the release gates: urgent precision is `0.6667` because
  it mistakes marketing urgency for real urgency, and calendar-candidate recall is `0.75`.
- No fixture contains a real address; synthetic addresses use the reserved
  `example.test` domain.

### Next milestone

Start Milestone 4 with deterministic fact extraction for deadline and calendar evidence.
Keep predictions out of Today and Inbox, require abstention for uncertain results, and
compare every candidate against the committed evaluation gates before considering AI.

## 2026-08-04 — Milestone 4 deterministic date slice

### Outcome

Added the first suggestion-engine implementation for deadline and calendar-candidate
facts. It operates only in source tests and public synthetic evaluation; Gmail, Today, and
Inbox remain unchanged.

### Safety boundary

- Every positive suggestion includes the source text that caused it.
- Unsupported, incomplete, malformed, and impossible dates abstain instead of guessing.
- Written date/time values remain timezone-unresolved; the extractor does not invent UTC.
- Labels outside deadline and calendar responsibility always abstain.
- Suggestions are not user decisions and do not create tasks or calendar events.

### Evidence

- Deadline precision and recall: `1.0` on the 12-message synthetic fixture set.
- Calendar-candidate precision and recall: `1.0` on the same set.
- Direct-question, urgency, automation, and topic labels abstain completely in this slice.
- The full release gate remains intentionally closed because those labels are not yet
  implemented.
- The deterministic report reproduces with SHA-256
  `83a74e8744aed3976411c3f05726ad32115d9970391a865f0c3aa2657581a405`.

### Next slice

Add deterministic direct-question detection and sender/list-mail evidence behind the same
interface. Re-evaluate using only synthetic fixtures before considering any UI connection.

## 2026-08-04 — Milestone 4 deterministic message-signal slice

### Outcome

Added evidence-backed direct-reply and automated/list-mail suggestions, then composed them
with deterministic date extraction in a versioned core evaluation adapter. The core still
does not run on private Gmail content or appear in the product UI.

### Safety boundary

- Direct requests need an explicit phrase and return the containing sentence as evidence.
- Explicit “no reply needed” language overrides a question mark.
- Ambiguous questions abstain instead of being marked non-actionable.
- A role sender alone is insufficient to classify automation; supporting transactional
  content is required.
- List mail retains only a `hasListUnsubscribe` boolean. Header URLs and tokens are neither
  normalized nor returned as evidence.
- No rule learns from sender history or assigns future behavior to a domain.

### Evidence

- The 12-message public fixture set reports precision and recall `1.0` for reply, deadline,
  calendar-candidate, and automated labels.
- Urgency and topic remain complete abstentions, keeping the overall release gate closed.
- `npm test` passes: 70 tests, 0 failures.
- The deterministic-core report reproduces with SHA-256
  `a67da26d67a3af7cf3be767fe4ec88bbedecb8d51bd9db7347d8bce29ea2486f`.
- Existing weak-baseline and deterministic-date reports still reproduce unchanged.

### Next slice

Expand the public evaluation dataset with adversarial, ambiguous, and near-miss cases
before implementing urgency or topic. The current perfect metric is useful but the dataset
is too small to support product integration.

## 2026-08-04 — Milestone 4 adversarial evaluation v2

### Outcome

Expanded the public synthetic evaluation set from 12 to 28 messages without changing the
classifier rules. The new locked cases expose genuine weaknesses instead of preserving a
misleading perfect score.

### Added coverage

- Indirect and quoted questions that are not reply requests.
- Explicit no-reply language and direct requests without question marks.
- Role-address ambiguity and neutral list mail.
- Generic automated receipts without convenient sender keywords.
- Publication dates that are neither deadlines nor calendar events.
- Incomplete and impossible dates that must abstain.
- A message containing both a separate meeting and a separate deadline.
- Additional marketing and genuine human urgency examples.
- Topic-insufficient content.

### Quality-gate hardening

- Added per-label maximum abstention rates so precision cannot be inflated by declining
  difficult scorable messages.
- Version selection rejects path traversal and dataset inheritance rejects cycles.
- V2 extends v1, preserving the original locked fixtures and unique IDs.

### Honest baseline

- Reply precision/recall: `1.0`; abstention rate: `0.037`.
- Deadline precision/recall: `1.0`.
- Calendar precision: `1.0`; recall falls to `0.80` on the separate-event/deadline case.
- Automated precision: `1.0`; recall falls to `0.9091` on a generic generated receipt.
- Urgency and topic remain unimplemented abstentions.
- The overall release gate remains closed.

### Verification

- `npm run check` passes.
- `npm test` passes: 72 tests, 0 failures.
- All evaluation reports regenerate deterministically.
- The v2 core report SHA-256 is
  `75e1953d0e4013accf62ce883bf30063b21d8dc23eebdd1986c633b83bb0ef21`.
- Existing report hashes changed intentionally because the new abstention gates are now
  included in every quality-gate assessment; classifier predictions did not change.

### Next slice

Improve the general extraction structure so a message can independently produce a meeting
and a deadline, then add explicit generated-message evidence for receipts. Avoid adding
one-off phrases solely to satisfy individual fixtures.

## 2026-08-04 — Milestone 4 deterministic core v2

### Outcome

Resolved both structural failures exposed by the locked adversarial dataset without
altering fixture labels or adding sender-history rules.

### Changes

- Temporal expressions are evaluated independently within sentence boundaries.
- A message may now suggest both a calendar event and a separate deadline.
- Event wording from one sentence cannot leak into a later deadline sentence.
- Explicit statements such as “automatically generated” provide automation evidence even
  when the sender address is generic.
- Classifier versions advanced to deterministic dates v2, message signals v2, and core v2.
- Previous reports remain committed as historical snapshots; new filenames identify both
  classifier v2 and dataset v2.

### Results on 28 synthetic messages

- Reply precision/recall: `1.0`; abstention rate: `0.037`.
- Deadline precision/recall: `1.0`.
- Calendar-candidate precision/recall: `1.0`.
- Automated precision/recall: `1.0`.
- Urgency and topic remain unimplemented, so the overall release gate remains closed.
- `npm test` passes: 75 tests, 0 failures.
- Date-v2 report SHA-256:
  `27cbfe2dfe5469166336a0c9f7ba97fc7e39980f987878b483fe93b50427be5e`.
- Core-v2 report SHA-256:
  `3c14ab44a163159a53d4e8c2cfdd416d8031a166b8ad6550e7cdba31bebc43f1`.

### Next slice

Define conservative urgency evidence using genuine near-term harm plus immediacy. The word
“urgent,” countdowns, sales, and list-mail marketing must never be sufficient by
themselves.

## 2026-08-04 — Milestone 4 conservative urgency

### Outcome

Added deterministic urgency suggestions using separate evidence for concrete near-term
harm and immediacy. Core classifier v3 now passes every binary quality gate on the locked
v2 dataset; topic remains unimplemented and keeps the overall release gate closed.

### Safety boundary

- Positive urgency requires both a concrete harm cue and an immediacy cue.
- The word “urgent,” capitalization, countdowns, and time pressure alone are insufficient.
- Promotional/list-mail framing forces a non-urgent result even when it uses emergency
  vocabulary.
- Concrete harm without reliable timing abstains rather than guessing.
- Positive urgency reports the evidence sentence or sentences supporting both conditions.
- The evaluator now requires evidence for every positive binary suggestion.

### Results

- Urgent true positives: `3`; false positives: `0`; false negatives: `0`.
- Urgent precision/recall: `1.0`; abstention rate on locked scorable fixtures: `0`.
- Reply, deadline, calendar-candidate, automated, and urgent all pass their v2 thresholds.
- Topic coverage remains `0`, so no classifier is approved for UI integration.
- `npm test` passes: 80 tests, 0 failures.
- Core-v3 report SHA-256:
  `f712539434f381ee62e0d840dd10c047ed7c61597d0f545c6de6d7fcc8636a31`.
- Weak and date report hashes changed intentionally because their evaluation reports now
  count evidence across every positive binary label; predictions did not change.

### Next slice

Add conservative broad-topic suggestions using current-message content only. Ambiguous
content and overlapping topics must abstain; sender and domain history remain prohibited.

## 2026-08-04 — Milestone 4 deterministic topic and passing evaluation

### Outcome

Added evidence-scored broad topics to deterministic core v4. For the first time, the
classifier passes every written quality gate on the locked 28-message v2 dataset. It
remains deliberately disconnected from private Gmail content and the Nexus UI.

### Topic boundary

- Rules inspect the current subject/body only.
- Sender addresses, domains, and previous messages are excluded.
- The unique strongest topic wins; tied or absent evidence abstains.
- Evidence contains only the matched current-message terms.
- Multiple cues may outweigh a single incidental word, such as work-oriented review/draft
  language outweighing one invoice mention.

### Results

- Topic coverage: `0.88`, above the `0.70` gate.
- Topic accuracy: `1.0`, above the `0.80` gate.
- Three topic results abstain.
- All binary precision/recall, abstention, false/missed urgent, evidence, and topic gates
  pass.
- The evaluator now also rejects topic suggestions without evidence.
- `npm test` passes: 85 tests, 0 failures.
- Core-v4 report SHA-256:
  `ac989e7b569e2236315a0c813f5a8d0802ddf951cab7e353a454f6cbaef1229f`.

### Remaining integration boundary

Passing synthetic evaluation is necessary but not sufficient for product use. Nexus still
needs one internal adapter, versioned content-hash caching, a tested classifier off switch,
and explicit review-history separation before any UI connection.

### Next slice

Build the internal classifier adapter, deterministic content hash/cache key, and off switch
with synthetic tests only. Do not connect the adapter to Gmail routes or UI rendering yet.

## 2026-08-04 — Milestone 4 classifier adapter boundary

### Outcome

Created the production deterministic-core composition and one internal classifier adapter.
The adapter remains disconnected from Gmail routes and UI rendering and defaults to off.

### Safety properties

- Disabled adapters do not invoke providers, hash content, or touch cache entries.
- Only title, text, sender, received time, and list-header presence cross the boundary.
- Record IDs, source URLs, attachments, processing metadata, and raw header values are
  excluded.
- Cache keys combine classifier version with SHA-256 of canonical minimum input.
- The default cache is memory-only and has no disk writer.
- Results are defensively copied before storage and return.
- Classifier version mismatches fail without populating the cache.
- Turning the adapter off bypasses existing cache entries; re-enabling may safely reuse the
  same versioned entry.

### Verification

- `npm run check` passes.
- `npm test` passes: 91 tests, 0 failures.
- The core-v4 evaluation report remains byte-identical after moving composition into
  production source.
- Classifier routes, Gmail processing, and Nexus UI imports remain unchanged.

### Next slice

Define classifier suggestions as records distinct from human review decisions. Add
synthetic persistence tests for accept, correct, dismiss, and
not-enough-information—without provider actions or UI integration.

## 2026-08-04 — Milestone 4 suggestion/review record separation

### Outcome

Added a dedicated `classifier-suggestion` record and restricted classifier review
decisions. Suggestions, abstentions, and human judgments now persist as distinct auditable
records without creating actions.

### Suggestion provenance

- Each record identifies its subject message, label, value, confidence, evidence,
  abstention state, classifier version, and content hash.
- One enabled classification produces one record for each supported label.
- Abstentions persist with null values and no guessed evidence.
- Deterministic IDs make the same classifier/content/label combination idempotent.
- Disabled classifications create no suggestion records.

### Review boundary

- Classifier reviews support accept, correct, dismiss, and not-enough-information.
- Corrections require an explicit corrected value.
- Non-correction decisions cannot carry corrected values.
- Manual organization decisions remain compatible.
- Organization-only actions such as pin are rejected as classifier reviews.
- Review creation does not create tasks, calendar events, approvals, or action history.

### Verification

- `npm run check` passes.
- `npm test` passes: 98 tests, 0 failures.
- Synthetic storage contains six suggestions and four separate review decisions with zero
  rejected records and zero action-bearing records.
- Gmail routes, provider actions, and UI rendering remain unchanged.

### Next slice

Build a pure projection that applies the latest human review decision to immutable
classifier suggestions and produces pending/abstained review queues. Do not add provider
actions or UI rendering yet.

## 2026-08-04 — Milestone 4 review projection

### Outcome

Added a pure latest-decision projection over immutable classifier suggestions and
classifier review history.

### Projection behavior

- Unreviewed non-abstained suggestions enter the pending queue.
- Unreviewed abstentions enter a separate abstained queue.
- Accepted, corrected, dismissed, and not-enough-information items enter resolved.
- Accept exposes the original suggested value.
- Correct exposes the explicit corrected value.
- Dismiss and not-enough-information expose no effective value.
- The latest decision wins by decision time with deterministic record-ID tie-breaking.
- Manual organization reviews and reviews for absent suggestions are ignored.
- Source records remain unchanged and no new record or action is created.

### Verification

- `npm run check` passes.
- `npm test` passes: 104 tests, 0 failures.
- Queue counts, latest-decision replacement, corrections, dismissals, insufficient
  information, unrelated reviews, and input immutability are covered.
- Gmail routes, provider actions, and UI rendering remain unchanged.

### Next slice

Create a default-off batch classification pipeline over normalized records. It may return
suggestion records in memory but must not write routes, provider actions, or UI state.

## 2026-08-04 — Milestone 4 default-off batch pipeline

### Outcome

Added a pure batch orchestrator over normalized records. It returns classifier suggestion
records in memory and remains disconnected from storage, routes, provider actions, and UI.

### Behavior

- The pipeline defaults to the disabled classifier adapter.
- Disabled processing invokes no classifier and returns no suggestions.
- Only valid normalized message records are classified.
- Calendar and other record types are skipped.
- Invalid records are skipped before classification.
- One classifier failure does not fail the remaining batch.
- Diagnostics include only record ID and a stable code, never provider errors or message
  content.
- Inputs remain unchanged.
- Identical message content shares a content hash but produces distinct suggestion IDs for
  distinct subject records.
- Output contains no task, calendar-event, approval-request, or action-history records.

### Verification

- `npm run check` passes.
- `npm test` passes: 110 tests, 0 failures.
- Enabled two-message processing returns 12 distinct in-memory suggestion records.
- Default-off processing returns zero suggestions.
- Core evaluation remains byte-identical and all v2 gates pass.

### Next slice

Add a private local suggestion/review store boundary under the ignored data directory.
Keep reviews append-only, suggestions idempotent, classifier default-off, and routes/UI out
of scope.

## 2026-08-04 — Milestone 4 private classifier store

### Outcome

Added an explicit-path file store for classifier suggestions and human classifier reviews.
It remains disconnected from the batch pipeline, server, routes, Gmail, and UI.

### Storage behavior

- Missing storage reads as an empty versioned store.
- Suggestions are immutable by record ID: exact retries are idempotent and conflicting
  content is rejected without replacing the original.
- Classifier reviews are append-only; earlier decisions remain available for audit and
  latest-decision projection.
- Manual-organization reviews and action-bearing record types are rejected.
- Writes use a unique sibling temporary file followed by atomic rename.
- The private directory is `0700` and the file is `0600`.
- Malformed JSON or invalid stored records fail closed and are not overwritten.
- Rejection diagnostics contain identifiers and stable codes, not record content.
- No default filesystem location is embedded; callers must supply an explicit private
  path.

### Verification

- Focused classifier-store tests pass: 7 tests, 0 failures.
- Full regression passes: 117 tests, 0 failures.
- `npm run check` passes.
- Tests use generated synthetic records and isolated temporary directories only.
- Gmail routes, provider actions, automatic classification, and UI remain unchanged.

### Next slice

Add an opt-in service orchestration boundary between the default-off batch pipeline and
the explicit private store. Keep routes/UI out of scope, write nothing while disabled, and
return sanitized counts/codes only.

## 2026-08-04 — Milestone 4 opt-in persistence orchestration

### Outcome

Added a service boundary that can pass enabled batch-classifier suggestions to the
explicit private store. It has no route, Gmail, scheduler, or UI integration.

### Behavior

- The service inherits the pipeline's default-off state.
- Disabled processing short-circuits before invoking the batch pipeline or storage.
- Enabling requires an explicit `setEnabled(true)` call or an explicitly enabled injected
  pipeline.
- Enabled runs persist classifier suggestions only.
- Exact repeat runs are idempotent.
- Results contain summary counts, storage status, and diagnostic-code counts only.
- Pipeline record IDs, suggestion records, evidence, message content, and exception
  messages are not returned.
- Known storage errors retain stable `store.*` codes; unexpected failures become
  `store.failed`.
- Storage failures do not create partial action records or human reviews.

### Verification

- Focused persistence-orchestration tests pass: 8 tests, 0 failures.
- Full regression passes: 125 tests, 0 failures.
- Disabled spies confirm zero pipeline and zero storage calls.
- Enabled synthetic processing persists 12 suggestions for two distinct messages.
- Repeat synthetic processing reports six idempotent suggestions and no duplicates.
- Failure and invalid-record results contain no synthetic private-like content.
- Routes, Gmail retrieval, provider actions, review writes, and UI remain unchanged.

### Next slice

Add a pure read service over the private classifier store and latest-review projection.
Return a sanitized review-view model without raw message content, and keep HTTP routes,
classifier execution, actions, and UI out of scope.

## 2026-08-04 — Milestone 4 privacy-safe review view

### Outcome

Added a read-only service that projects private classifier suggestions and review history
into minimal pending, abstained, and resolved queues. It has no HTTP route or UI consumer.

### View boundary

- Stored suggestions and reviews pass through the existing latest-decision projection.
- Each item exposes opaque stable review and subject keys.
- Subject keys group labels belonging to the same private message without exposing its
  provider ID.
- Items expose suggestion type/value, optional extracted value, confidence, abstention,
  evidence availability, status, and effective reviewed value.
- Items exclude record IDs, provider IDs, titles, record text, evidence excerpts, source
  metadata, timestamps, model versions, and classifier content hashes.
- Missing storage produces empty ready queues.
- Known and unknown storage failures produce empty queues with sanitized stable codes.
- Reading invokes no classifier and no suggestion/review writes.

### Verification

- Focused review-view tests pass: 7 tests, 0 failures.
- Full regression passes: 132 tests, 0 failures.
- Queue projection covers pending, abstained, and latest corrected state.
- Opaque keys are stable, unique per suggestion, and shared per subject where appropriate.
- Synthetic private-like content and provenance are absent from serialized results.
- Store failure messages are absent from serialized results.
- Routes, classifier execution, provider actions, storage mutation, and UI remain
  unchanged.

### Next slice

Add an explicit review-command service that resolves opaque review keys privately and
appends validated accept, correct, dismiss, or not-enough-information decisions. Reject
unknown/stale keys and keep routes, UI, actions, and learning out of scope.

## 2026-08-04 — Milestone 4 explicit review commands

### Outcome

Added a command service that privately resolves an opaque review key and appends one
validated classifier review decision. It remains disconnected from HTTP routes and UI.

### Command boundary

- Commands require an opaque review key, expected projected status, UUID command ID, and
  one supported classifier decision.
- Correct requires a boolean or string corrected value.
- Other decisions reject corrected values.
- Unknown opaque keys are rejected.
- The expected status is compared with the latest private projection; changed state is
  rejected as stale.
- Exact UUID command retries are idempotent and do not append duplicate history.
- UUID reuse for different command content is rejected as a conflict.
- Success and failure responses expose status, stable code, and idempotency only.
- Read/write exception messages and private stored values are never returned.
- Accepted commands append only `review-decision` records with
  `reviewKind: classifier-suggestion`.
- No task, event, approval, action, classifier-rule, or training record is created.

### Verification

- Focused command and review-view suites pass: 16 tests, 0 failures.
- Full regression passes: 141 tests, 0 failures.
- All four supported decisions persist with the correct correction boundary.
- Idempotent retry, command conflict, unknown key, invalid input, stale status, and
  sanitized store failures are covered.
- Stored history remains append-only.
- Routes, Gmail, classifier execution, provider actions, learning, and UI remain
  unchanged.

### Next slice

Add synthetic-only HTTP handlers for reading the review view and submitting review
commands through injected services. Require safe methods, JSON content type, bounded
bodies, and sanitized responses; do not connect a real private path, Gmail, classifier
execution, actions, or UI.

## 2026-08-04 — Milestone 4 isolated review HTTP handlers

### Outcome

Added dependency-injected HTTP handlers for the privacy-safe review view and explicit
review commands. They are not imported or mounted by the running local server.

### HTTP boundary

- `GET /api/classifier/reviews` reads the sanitized view and rejects other methods.
- `POST /api/classifier/reviews/commands` submits one command and rejects other methods.
- Command requests require `application/json`, optionally with UTF-8 charset.
- Only reviewKey, expectedStatus, commandId, decision, and correctedValue are allowed.
- The injected reader receives a 4 KiB maximum and the handler independently checks actual
  UTF-8 byte length.
- Query strings are rejected on both paths.
- Malformed JSON, arrays/scalars, unknown fields, oversized bodies, and reader failures
  produce stable codes without echoing input.
- Accepted, idempotent, unknown, stale/conflicting, invalid, and storage-failure service
  results map to stable HTTP statuses.
- Unrelated paths remain outside the handler.
- No default store, filesystem path, classifier, Gmail connector, or provider action is
  created.

### Verification

- Focused route tests pass: 8 tests, 0 failures.
- Full regression passes: 149 tests, 0 failures.
- GET method isolation and storage-unavailable mapping are covered.
- POST content type, exact fields, 4 KiB reader contract, actual byte limit, and status
  mapping are covered.
- Synthetic private-like query, body, and exception content is absent from responses.
- `local-server.mjs`, Gmail, classifier execution, provider actions, learning, and UI
  remain unchanged.

### Next slice

Add a composition factory that creates the classifier store, review services, and route
handler only when supplied both an explicit private path and enabled review feature flag.
Keep it unmounted from `local-server.mjs`; do not enable classifier execution or UI.

## 2026-08-04 — Milestone 4 fail-closed review composition

### Outcome

Added a composition factory for the private classifier store, read view, review commands,
and isolated HTTP handler. It remains unmounted from the running server.

### Composition boundary

- Composition defaults disabled.
- Only literal boolean true enables it; truthy strings and numbers remain disabled.
- Disabled composition requires no path or HTTP adapters.
- Disabled composition declines every request and creates no private file.
- Enabled composition requires an explicit absolute private file path.
- Enabled composition requires injected request-body and JSON-response adapters.
- No default path or environment-variable parsing exists.
- The returned object exposes only enabled state and the request handler.
- The classifier pipeline is neither imported nor enabled.
- Corrupt private storage returns a sanitized unavailable response without its path or
  content.

### Verification

- Focused composition tests pass: 7 tests, 0 failures.
- Full regression passes: 156 tests, 0 failures.
- Disabled/no-path, non-boolean flag, no-file creation, relative-path rejection, and
  missing-adapter cases are covered.
- Enabled synthetic view-command-view integration moves one suggestion from pending to
  accepted and appends one review.
- Corrupt synthetic storage exposes neither the private path nor malformed content.
- `local-server.mjs`, Gmail, classifier execution, provider actions, learning, and UI
  remain unchanged.

### Next slice

Add an injected request-origin and command-token guard suitable for localhost and Android
WebView requests. Verify denied requests never read or write private storage before any
review route is mounted in the running server.

## 2026-08-04 — Milestone 4 guarded review access

### Outcome

Added an origin and review-session-token guard around enabled review composition. The
composition remains unmounted from the running server.

### Security boundary

- Every review view read and command requires an exact explicitly allowed origin.
- Every review view read and command also requires `X-Nexus-Review-Token`.
- The token must be at least 32 UTF-8 bytes.
- Origin entries must be unique URL origins without credentials, path, query, or fragment.
- Missing, `null`, malformed, and unlisted origins are denied.
- Missing and wrong tokens produce the same denial code.
- Candidate and expected tokens are SHA-256 digested and compared in constant time.
- Denials happen before route handling, body reading, private-store reading, or writing.
- Responses do not echo origins, tokens, paths, or underlying details.
- Unrelated routes pass through unchanged.
- No origin or token defaults are embedded.

Origin is retained as an anti-CSRF/WebView boundary, not authentication. The token is also
required for reads because the current local server binds to `0.0.0.0` and non-browser
clients can forge Origin.

### Verification

- Focused guard and composition suites pass: 14 tests, 0 failures.
- Full regression passes: 163 tests, 0 failures.
- Exact desktop localhost and Android WebView-style origins are covered through explicit
  test allowlists.
- Invalid allowlists, duplicate normalized origins, and short tokens fail construction.
- Missing/wrong origin and token requests never invoke the wrapped handler.
- Composition-level denials perform zero body reads and append zero review records.
- Private-like origin/token values are absent from responses.
- `local-server.mjs`, Gmail, classifier execution, provider actions, learning, and UI
  remain unchanged.

### Next slice

Define and test a server-integration factory covering bounded streaming bodies, exact
feature-flag parsing, ignored private path, runtime token provisioning, and browser/Android
origin and preflight behavior. Do not mount it in `local-server.mjs` yet.

## 2026-08-04 — Milestone 4 safe server-integration contract

### Outcome

Added an unmounted server-integration factory, CORS-aware preflight handling, and bounded
streaming request reader.

### Integration boundary

- Only exact environment value `NEXUS_CLASSIFIER_REVIEWS=1` enables integration.
- Disabled integration provisions no path, origins, token, store, or services.
- Enabled integration refuses server hosts other than `127.0.0.1` and `::1`.
- The private path and allowed origins remain explicit configuration.
- A configured strong token is preserved in memory; otherwise 32 random bytes generate a
  base64url runtime token.
- Runtime token and origins are exposed only through a frozen trusted-bootstrap object.
- No token is written, logged, or embedded in a static asset.
- Origin-approved OPTIONS supports only the endpoint method and required headers.
- CORS responses use the exact origin, Vary Origin, and no-store caching.
- The streaming body reader counts UTF-8 bytes before buffering and caps caller limits at
  its configured server maximum.
- Oversized bodies and stream failures return sanitized stable codes.

The running server still binds `0.0.0.0`, so the loopback requirement intentionally
prevents mounting this integration today.

### Verification

- Focused body-reader, guard, composition, route, and server-integration suites pass:
  33 tests, 0 failures.
- Full regression passes: 174 tests, 0 failures.
- Exact flag rejection, loopback enforcement, configured/generated token behavior,
  frozen runtime access, preflight allow/deny, multi-chunk UTF-8 limits, and stream failure
  sanitization are covered.
- The handler surface does not serialize the configured token.
- `local-server.mjs`, Gmail, classifier execution, provider actions, learning, and UI
  remain unchanged.

### Next slice

Design and test trusted runtime token bootstrap and lifecycle for desktop reloads and the
Android WebView. Do not change server binding or mount review routes until token delivery
is safe and non-static.

## 2026-08-04 — Milestone 4 ephemeral runtime bootstrap

### Outcome

Added a one-time origin-bound bootstrap service and isolated redemption handler. Neither is
mounted in the running server or mobile application.

### Lifecycle and verification

- Trusted renderer/native code issues a code for one allowed origin.
- Codes default to 60 seconds, store only a SHA-256 hash, and redeem once.
- New issuance replaces the prior outstanding code for that origin.
- Replay, expiry, wrong code/origin, and clear/restart fail uniformly.
- Redemption accepts one field in at most 256 bytes with origin-approved preflight.
- Codes and tokens are absent from URLs, static assets, browser storage, files, and logs.
- Focused bootstrap tests pass: 5 tests, 0 failures.
- Full regression passes: 179 tests, 0 failures.
- `local-server.mjs`, static/mobile assets, Gmail, classifier execution, actions, learning,
  and UI remain unchanged.

### Next slice

Compose trusted issuance and redemption into the unmounted loopback integration and test a
full bootstrap → review view → review command flow. Do not mount the server or UI.

## 2026-08-04 — Milestone 4 composed bootstrap integration

### Outcome

Composed trusted bootstrap issuance and HTTP redemption into the unmounted loopback review
integration. Removed the direct token-bearing client-access surface.

### Behavior and verification

- Enabled integration exposes only request handling plus frozen trusted issue/clear calls.
- Trusted issuance remains outside HTTP.
- Bootstrap redemption is evaluated before token-guarded review routes.
- The raw review token is not a property of the integration object.
- Focused bootstrap, guard, and server integration suites pass: 18 tests, 0 failures.
- Full regression passes: 180 tests, 0 failures.
- A synthetic end-to-end test issues and redeems one code, reads one pending suggestion,
  accepts it, reads one resolved item, and confirms one append-only stored review.
- Loopback, exact feature flag, origin, token, CORS, body bounds, and privacy boundaries
  remain intact.
- `local-server.mjs`, desktop/static/mobile assets, classifier execution, Gmail, actions,
  learning, and UI remain unchanged.

### Next slice

Design a dynamic desktop handoff that gives a one-time bootstrap code to the served page
without placing it in a URL, log, or static asset. Keep Android native handoff separate and
do not mount review routes yet.

## 2026-08-04 — Milestone 4 dynamic desktop handoff

### Outcome

Added an unmounted server-side desktop renderer that injects only an ephemeral bootstrap
code into an in-memory HTML response. The review token never enters the renderer.

### Behavior and verification

- The handoff contains only the one-time code, expiry, and fixed redemption path in an
  inert `application/json` element.
- HTML-active JSON characters are escaped before insertion.
- Responses are explicitly no-store, no-cache, no-referrer, nosniff, and HTML typed.
- Invalid documents, missing or duplicate markers, denied origins, and malformed issuance
  fail closed without returning a document.
- Reload replaces the previous outstanding code; the newest code redeems once and replay
  is denied.
- Five focused handoff tests pass.
- Full regression and syntax checks pass: 185 tests, 0 failures.
- `local-server.mjs`, desktop/mobile static assets, Android, Gmail, classifier execution,
  provider actions, learning, and UI remain unchanged.

### Next slice

Build a minimal tested desktop browser bootstrap client that reads and immediately removes
the inert handoff element, redeems once, and retains the review token in memory only. Keep
it unmounted and do not add review UI yet.

## 2026-08-04 — Milestone 4 in-memory desktop bootstrap client

### Outcome

Added an unmounted browser-compatible client that consumes the dynamic handoff, redeems it,
and keeps the review token only inside a private request closure.

### Behavior and verification

- The handoff text is copied, cleared, and removed from the document before redemption.
- Exact payload fields, fixed relative bootstrap path, code strength, and expiry are
  validated before any request.
- Initialization returns only ready/rejected status and never returns the token.
- The private session can authorize only the review GET and command POST endpoints.
- All authorized calls force no-store, same-origin credentials, and no-referrer behavior.
- Invalid, expired, replayed, malformed-response, and network-failure paths remain
  sanitized and cannot retry the consumed handoff.
- `clear()` destroys the session's request capability.
- Six focused client tests pass.
- Full regression and syntax checks pass: 191 tests, 0 failures.
- The client is outside `src/` and remains absent from the running application and Android
  bundle. Server binding, static/mobile assets, Gmail, classifier execution, actions,
  learning, and UI remain unchanged.

### Next slice

Add one synthetic end-to-end desktop composition test using the real renderer, client,
bootstrap route, guarded review view, and explicit command route. Keep every component
unmounted and verify clearing the client destroys access.

## 2026-08-04 — Milestone 4 complete synthetic desktop flow

### Outcome

Proved the complete unmounted desktop review lifecycle using the real production
boundaries and one synthetic private suggestion.

### Behavior and verification

- The real renderer issues and embeds one ephemeral code without the token.
- The real browser client removes the handoff and redeems through the composed route.
- The guarded view returns one privacy-safe pending suggestion.
- One explicit accept command creates exactly one append-only review.
- A second guarded view reports zero pending and one resolved suggestion.
- Clearing the client destroys subsequent review-request capability.
- The integration object and rendered HTML do not expose the synthetic token.
- Full regression and syntax checks pass: 192 tests, 0 failures.
- The test transport explicitly supplies the approved browser origin. Same-origin browser
  GET behavior remains a required live-contract check before mounting.
- Running server binding, static/mobile assets, Android, Gmail, classifier execution,
  provider actions, learning, and UI remain unchanged.

### Next slice

Audit and test the real HTTP/browser origin contract, especially same-origin GET requests.
Choose a safe server-derived same-origin fallback or an explicit cross-origin layout while
preserving the token requirement. Do not mount the integration yet.

## 2026-08-04 — Milestone 4 browser-origin contract

### Outcome

Defined and implemented a fail-closed path for legitimate same-origin browser requests
that omit the Origin header.

### Policy and verification

- Explicit allowlisted Origin behavior and exact-origin CORS remain unchanged.
- Origin-less non-preflight requests require both an allowlisted request URL origin and
  exact `Sec-Fetch-Site: same-origin`.
- Malformed/null Origin never falls back to fetch metadata.
- Missing metadata, `none`, `same-site`, `cross-site`, wrong URL origin, and Origin-less
  preflight are denied before token handling.
- The private token remains mandatory for accepted same-origin requests.
- Same-origin responses do not add unnecessary CORS headers.
- The synthetic desktop flow now models Origin-bearing POSTs and Origin-less same-origin
  GETs.
- The W3C Fetch Metadata specification confirms that `same-origin` covers the entire URL
  chain and `Sec-` metadata is not modifiable by page JavaScript.
- Full regression and syntax checks pass: 195 tests, 0 failures.
- Running server binding, static/mobile assets, Android, Gmail, classifier execution,
  provider actions, learning, and UI remain unchanged.

### Next slice

Exercise the complete flow through an unmounted real Node HTTP loopback harness, including
request streams, response headers, dynamic HTML, bootstrap, review reads, command, and
session clear. Do not mount the production server yet.

## 2026-08-04 — Milestone 4 real loopback HTTP proof

### Outcome

Proved the complete private desktop lifecycle through a real ephemeral Node HTTP server
bound only to `127.0.0.1`.

### Behavior and verification

- The operating system assigns the temporary port; the test closes it after completion.
- Dynamic HTML, bootstrap POST, Origin-less same-origin review GET, explicit-Origin command
  POST, resolved GET, and session clear all pass through real request/response streams.
- The default bounded body reader handles the streamed bootstrap and command bodies.
- Dynamic HTML returns no-store, no-referrer, nosniff, and explicit HTML content type.
- JSON responses return no-store, no-referrer, nosniff, and explicit JSON content type.
- Bootstrap and command responses return exact-origin CORS; same-origin GET does not.
- Missing-token, cross-site, and oversized-bootstrap requests are denied with stable codes.
- The rendered document and client surface do not expose the private token.
- Full regression and syntax checks pass: 196 tests, 0 failures.
- `local-server.mjs`, static/mobile assets, Android, Gmail, classifier execution, provider
  actions, learning, and UI remain unchanged.

### Next slice

Extract the strict HTTP response and dynamic document behavior into a reusable unmounted
review HTTP application composition. Keep network listening and production mounting out of
scope.

## 2026-08-04 — Milestone 4 strict review HTTP application

### Outcome

Extracted secure dynamic-document and review-route HTTP behavior into a reusable
composition without creating or binding a server.

### Behavior and verification

- Only exact `NEXUS_CLASSIFIER_REVIEWS=1` enables the application.
- Disabled creation provisions and validates nothing and handles no requests.
- Enabled creation requires loopback binding, explicit document origin, and desktop HTML.
- Strict no-store JSON, empty, CORS, and dynamic HTML responses are owned by the app.
- Only exact `/` plus the isolated review routes are handled; unrelated routes pass through.
- Wrong document origin, query, method, and malformed handoff fail with stable safe codes.
- The frozen public surface contains only `enabled` and `handleRequest`.
- Token, renderer, and trusted issuance controls remain private closure state.
- The real-loopback lifecycle test now uses this production composition.
- Four focused HTTP-app tests cover disabled behavior, configuration, document routing,
  secure headers, and secret-surface exclusion.
- Full regression and syntax checks pass: 200 tests, 0 failures.
- `local-server.mjs`, static/mobile assets, Android, Gmail, classifier execution, provider
  actions, learning, and UI remain unchanged.

### Next slice

Design and test a private desktop browser-runtime owner that initializes the bootstrap
client, exposes only sanitized status, retains request capability privately, and clears on
page lifecycle events. Keep it unmounted.

## 2026-08-05 — Milestone 4 private browser runtime owner

### Outcome

Added an unmounted browser runtime that owns the bootstrap client capability without
placing the token, client, fetch capability, or runtime object on global state.

### Behavior and verification

- Explicit client and lifecycle adapters are required.
- Initialization returns only stable ready/rejected status.
- Privacy-safe review views are field-allowlisted and capped at 64 KiB.
- Command results are shape-validated and capped at 8 KiB.
- Commands require exact allowed fields before the private client is called.
- Content type, declared length, actual UTF-8 length, JSON shape, and unexpected fields
  fail safely.
- Unknown bootstrap failures are converted to stable runtime codes.
- Pagehide, beforeunload, and explicit clear destroy the client capability and detach
  listeners idempotently.
- Seven focused runtime tests cover readiness, view, command, bounds, malformed data,
  failed initialization, lifecycle cleanup, and dependency validation.
- The synthetic pending → accepted → resolved flow now uses the runtime and pagehide clear.
- Full regression and syntax checks pass: 207 tests, 0 failures.
- HTTP app/listening, `local-server.mjs`, static/mobile assets, Android, Gmail, classifier
  execution, provider actions, learning, and UI remain unchanged.

### Next slice

Compose and test an unmounted module-scoped desktop entrypoint that constructs and starts
the runtime once without exporting anything to `window` or the DOM. Do not serve it yet.

## 2026-08-05 — Milestone 4 module-scoped desktop entrypoint

### Outcome

Added an inert module-scoped entrypoint that constructs the bootstrap client and private
runtime once without adding any capability to `window`, global state, or the DOM.

### Behavior and verification

- Importing the module has no startup or global side effect.
- Explicit start wires document, fetch, lifecycle, and clock adapters.
- Concurrent and duplicate starts create exactly one client and one runtime.
- Only controlled start, view, command, status, and clear functions are exposed.
- Client and runtime instances remain inside closure state.
- Reads and commands before start or after clear return stable unavailable outcomes.
- Construction and initialization failures are sanitized and cannot retry the consumed
  handoff.
- Clear during an in-progress bootstrap cannot be undone by late initialization.
- Six focused entrypoint tests cover one-time start, delegation, early clear, failures,
  global isolation, and dependency validation.
- The runtime suite adds a teardown-during-initialization race test.
- The synthetic pending → accepted → resolved lifecycle now starts through the entrypoint.
- Full regression and syntax checks pass: 214 tests, 0 failures.
- HTTP module delivery, production mounting, `local-server.mjs`, static/mobile assets,
  Android, Gmail, classifier execution, provider actions, learning, and UI remain unchanged.

### Next slice

Design and test dynamic delivery of a tiny activation module plus the isolated browser
module graph from the unmounted strict HTTP app. Do not change static/mobile assets.

## 2026-08-05 — Milestone 4 isolated browser module delivery

### Outcome

Added optional explicit delivery of the isolated browser module graph through the
unmounted strict HTTP app.

### Behavior and verification

- A tiny activation module imports and starts the entrypoint, exports nothing, and creates
  no global capability.
- Exactly four non-empty module sources are required when delivery is enabled.
- Missing, extra, empty, or configured-token-bearing source graphs fail construction.
- Sources are copied into an immutable in-memory snapshot.
- Dynamic HTML injects only one fixed same-origin activation-module URL.
- Exact module routes require document origin, GET, and no query.
- Module responses are JavaScript typed, no-store, no-referrer, and nosniff.
- Wrong origin, query, and method return stable safe failures; unknown modules pass through.
- Without explicit sources, module injection and delivery remain disabled.
- The real-loopback test supplies the actual production sources and verifies every served
  response byte-for-byte plus security headers.
- An activation import test confirms no exports and no global capability.
- Full regression and syntax checks pass: 218 tests, 0 failures.
- The graph is not yet browser-executed or production-mounted. `local-server.mjs`,
  static/mobile assets, Android, Gmail, classifier execution, provider actions, learning,
  and UI remain unchanged.

### Next slice

Inspect locally available headless Chromium tooling and, without adding a dependency,
execute the dynamic module graph against the ephemeral loopback app if possible. Verify
automatic bootstrap, controlled queue access, and teardown.

## 2026-08-05 — Milestone 4 real-browser lifecycle proof

### Outcome

Added a repeatable opt-in browser smoke runner and executed the isolated production review
graph successfully in Chromium 140 against an ephemeral loopback HTTP app.

### Behavior and verification

- Playwright and Chromium are supplied through explicit environment paths and are not
  application dependencies.
- The smoke run uses only a synthetic suggestion, temporary private store, temporary
  browser state, and an operating-system-assigned loopback port.
- The document's real activation module automatically redeems its one-time handoff.
- The module-scoped entrypoint reports ready without placing its capability on global state.
- A real browser read returns one privacy-safe pending suggestion.
- The subject key is a 64-character pseudonymized hash and never the raw Gmail identifier.
- Raw title content is absent from the projected item.
- Dispatching `pagehide` clears the entry session.
- Reads after teardown return the stable `entry.session.unavailable` outcome.
- The temporary browser smoke command passes.
- Production mounting, `local-server.mjs`, static/mobile assets, Android, Gmail,
  classifier execution, provider actions, learning, and UI remain unchanged.

### Next slice

Build an unmounted, DOM-adapter-driven review renderer over the privacy-safe projection.
Define accessible synthetic controls and keep command dispatch injected.

## 2026-08-05 — Milestone 4 unmounted review renderer

### Outcome

Added an adapter-driven review renderer over the privacy-safe projection without creating
or mounting product DOM.

### Behavior and verification

- Pending, abstained, and resolved records render as separate labelled sections.
- The model states that suggestions remain separate from user decisions and never become
  automatic actions.
- Confidence and evidence availability are visible without exposing raw evidence.
- Opaque review and subject keys remain in private closure state.
- DOM adapters receive only render-local item IDs and approved display fields.
- Pending items expose accessible accept, correct, dismiss, and
  not-enough-information labels.
- Abstained items cannot be accepted; resolved items have no actions.
- Corrections require a non-empty string or boolean and strings are trimmed.
- Commands include a generated ID and private expected-status guard.
- Successful decisions refresh the safe view.
- Invalid, stale, unavailable, and exception paths fail with stable codes and sanitized
  announcements.
- Clear drops command targets and removes rendered state idempotently.
- Eight focused renderer tests pass.
- The renderer remains outside the four-module served graph and is not product-mounted.
- Static/mobile assets, `local-server.mjs`, Android, Gmail, classifier execution, provider
  actions, and learning remain unchanged.

### Next slice

Build and test an unmounted concrete browser DOM adapter using safe element creation,
native accessible controls, delegated events, and listener cleanup.
