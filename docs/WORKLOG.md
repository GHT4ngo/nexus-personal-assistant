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
