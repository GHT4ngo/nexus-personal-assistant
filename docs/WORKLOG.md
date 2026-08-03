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
