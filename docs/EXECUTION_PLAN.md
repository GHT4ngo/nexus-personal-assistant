# Nexus execution plan

## Outcome

Nexus should become a trustworthy daily briefing system that collects information from
explicitly supported sources, extracts useful signals, and presents them without hiding
uncertainty. It should help answer:

- What needs attention today?
- What may require a reply?
- Which deadlines and events are approaching?
- What is uncertain and needs manual review?

The finished product is not an autonomous inbox manager. External changes remain
approval-based, logged, and reversible where the provider supports reversal.

## Starting point

The clean `0.2.0` codebase already provides:

| Capability | Current implementation | Status |
|---|---|---|
| Mobile web interface | `index.html`, `src/app.js`, `src/styles.css` | Working baseline |
| Local API and static server | `scripts/local-server.mjs` | Working baseline |
| Gmail connection | Read-only OAuth, retrieval, MIME parsing, pagination | Preserved |
| Calendar connection | Read-only Google Calendar retrieval | Preserved |
| Local mail cache | `data/private/mail-cache.json`, ignored by Git | Preserved |
| Date candidates | Read-only date detection from message text | Preserved |
| Mobile packaging | PWA and Capacitor Android wrapper | Preserved |
| Diagnostics | Gmail, mail parsing, and resource tools | Preserved |
| Mail classification | Old system removed | Intentionally absent |
| Persistent tasks and goals | Sample data only | Not implemented |
| Approval queue and action log | Presentation placeholder only | Not implemented |
| Automated tests and CI | Node 22/24 checks and Android debug build | Working baseline |

See [CLEAN_BASELINE.md](CLEAN_BASELINE.md) for the removed behavior.

## Architecture direction

Keep source collection separate from interpretation:

```text
Google providers
      |
      v
Read-only connectors  ->  normalized local records  ->  deterministic extraction
                                                        |
                                                        v
                                              optional classifier interface
                                                        |
                                      +-----------------+-----------------+
                                      |                                   |
                               confident suggestion                review required
                                      |                                   |
                                      +-----------------+-----------------+
                                                        |
                                                        v
                                                daily briefing UI
```

Rules:

1. Connectors return provider data and never classify it.
2. Normalization produces a stable internal record format.
3. Extraction identifies observable facts such as dates and direct questions.
4. Classification is optional, replaceable, and unable to mutate provider data.
5. Every suggestion includes evidence, confidence, classifier version, and timestamp.
6. An uncertain result is a valid result and goes to review.

## Milestone 0 — Publish the clean baseline

Goal: establish the recovered code as a safe, reproducible repository.

Status (2026-08-03): complete. The clean baseline is published, CI and Android are verified,
read-only Google access is tested, and the repository is licensed under MIT.

Work:

- [x] Review the complete copied file set.
- [x] Add repository CI for syntax checks and Android debug builds.
- [x] Add the MIT license.
- [x] Verify setup from a fresh install with `npm ci`.
- [x] Verify read-only Gmail and Calendar OAuth using a local account.
- [x] Build the Android debug package in CI.
- [x] Install and open the Android debug package on a physical Samsung device.
- [x] Commit and push the clean `0.2.0` baseline.

Exit criteria:

- No private data or credentials are tracked.
- `npm ci`, `npm run check`, and `npm run mobile:prepare` pass.
- Gmail and Calendar load in read-only mode.
- The Android app displays the same clean baseline.

## Milestone 1 — Stable internal data model

Goal: stop the UI and connectors from passing loosely structured objects directly.

Status (2026-08-03): all record contracts, server-boundary, connector-transport, and
Gmail-parser slices are complete. OAuth, provider retrieval, Gmail pagination, and MIME
parsing live behind injected connector modules with synthetic tests. Remaining work is to
finish reducing HTTP routing to request/response orchestration.

First implementation slice:

1. [x] Create `src/domain/records.js` with constructors or factories for messages and calendar
   events.
2. [x] Create `src/domain/validation.js` with explicit validation results and errors.
3. [x] Add synthetic provider fixtures under `tests/fixtures/`.
4. [x] Add unit tests for valid, incomplete, duplicate, malformed, and all-day records.
5. [x] Add Gmail and Calendar normalization adapters without changing the UI.

Next implementation slice:

1. [x] Move Google provider requests and response mapping behind connector modules.
2. [x] Normalize and validate records before cache storage.
3. [x] Return explicit per-record normalization failures without failing a complete batch.
4. [x] Add batch tests for mixed valid, invalid, and duplicate provider results.

Connector transport slice:

1. [x] Extract OAuth token refresh and authenticated fetch into the Google connector boundary.
2. [x] Extract Gmail list/pagination and Calendar retrieval from `local-server.mjs`.
3. [ ] Keep HTTP routing responsible only for request validation and response formatting.
4. [x] Add connector tests using injected synthetic fetch responses.

Gmail parser slice:

1. [x] Extract Gmail raw/full fallback and MIME parsing into a message parser module.
2. [x] Add synthetic raw MIME fixtures for plain text, HTML fallback, attachments, and malformed
   content.
3. [x] Return parser diagnostics without including message content.
4. [x] Reduce the Gmail HTTP route to connector invocation, normalization, and response formatting.

Next implementation slice:

1. [x] Define records and validation for extracted signals, tasks, goals, review decisions,
   approval requests, and action history.
2. [x] Add synthetic fixtures for every record type.
3. [x] Add deterministic persistence tests for user-owned records.
4. [x] Keep all new records local and classification-free.

Final implementation slice:

1. Extract Google HTTP handlers from the static server into a route module.
2. Keep request parsing and response formatting at the route boundary.
3. Add isolated route tests for connected, disconnected, and provider-error responses.
4. Confirm the browser and Android clients retain the existing API contract.

Create:

- `src/domain/` for shared record definitions and validation.
- `scripts/connectors/google/` for OAuth, Gmail, and Calendar provider code.
- `scripts/storage/` for private local persistence.
- `tests/fixtures/` containing synthetic data only.

Define records for:

- incoming messages;
- calendar events;
- extracted signals;
- tasks;
- goals;
- review decisions;
- approval requests;
- action history.

Important fields include source ID, source type, received time, normalized text, source link,
processing version, and data-retention timestamps.

Exit criteria:

- Connector output is validated before storage.
- Duplicate Gmail and Calendar records are handled deterministically.
- Invalid and incomplete records produce explicit errors.
- Unit tests use synthetic fixtures and never real account data.

## Milestone 2 — Useful read-only Today view

Goal: make Nexus useful without classification.

Work:

- Replace hard-coded Today data with normalized calendar events, tasks, and goals.
- Add local task and goal persistence.
- Show synchronization age and source health.
- Add manual pin, dismiss, and “review later” behavior.
- Keep the Inbox chronological.
- Add clear empty, loading, offline, and error states.
- Test on a Samsung-sized viewport and in the Android wrapper.

Exit criteria:

- Today works when Google is connected, disconnected, or temporarily unavailable.
- A user can understand the next calendar items and chosen tasks in under one minute.
- No item is called important unless the user explicitly marked it or a later evaluated
  classifier supplied a visible recommendation.

## Milestone 3 — Evaluation framework

Goal: measure classification before adding it to the product.

Build:

- A private, ignored evaluation dataset created from sanitized or synthetic messages.
- A versioned public fixture set containing no personal information.
- A labeling guide for:
  - needs reply;
  - has deadline;
  - calendar candidate;
  - urgency;
  - broad topic;
  - newsletter or automated notification.
- A command that scores a classifier against expected labels.
- Reports for precision, recall, false urgent results, missed urgent results, abstention,
  and confidence calibration.

Initial quality gates:

- No classifier may automatically hide, archive, or deprioritize mail.
- Deadline and reply suggestions require evidence snippets.
- Low-confidence results must abstain.
- A classifier cannot enter the UI unless its versioned evaluation report is committed.
- “Needs attention” prioritizes low false-negative risk; newsletters and noise prioritize
  low false-positive risk.

Exit criteria:

- The same evaluation command produces repeatable results.
- A deliberately weak baseline is documented for comparison.
- Quality thresholds are written before choosing a model or prompt.

## Milestone 4 — Suggestion engine

Goal: introduce assistance without restoring the failed learning system.

Interface:

```text
classify(normalizedRecord) -> {
  suggestions,
  confidence,
  evidence,
  abstained,
  modelVersion
}
```

Work:

- Start with deterministic fact extraction for dates, direct questions, sender type, and
  list-mail headers.
- Put any AI provider behind one internal adapter.
- Send the minimum necessary content.
- Cache results by content hash and classifier version.
- Never infer future messages solely from a sender or domain.
- Display suggestions separately from user decisions.
- Add accept, correct, dismiss, and “not enough information” review actions.

Corrections are review history, not automatic training. They may later inform explicit,
auditable personal rules after enough repeated evidence.

Exit criteria:

- Every visible recommendation states why it exists.
- Abstentions appear in Review rather than receiving a guessed label.
- Turning the classifier off leaves Gmail, Calendar, Inbox, tasks, and goals functional.
- The classifier passes the Milestone 3 gates.

## Milestone 5 — Daily briefing and approvals

Goal: assemble the supported information into a short daily plan.

Briefing sections:

1. Must handle today.
2. Possible replies.
3. Upcoming deadlines.
4. Calendar schedule.
5. Chosen goals and next actions.
6. Uncertain items for review.

Add:

- Morning briefing generation.
- “What changed since last briefing?”
- Approval queue for proposed tasks and calendar events.
- Immutable action history.
- Provider actions only after a separate permission review.
- Undo where the provider offers a reliable inverse operation.

Exit criteria:

- A briefing remains useful with the classifier disabled.
- Suggestions and confirmed facts are visually distinct.
- No email is sent and no provider record is changed without explicit approval.
- Every attempted external action is recorded with outcome and error details.

## Milestone 6 — Finished `1.0` product

Goal: make Nexus dependable for regular personal use and presentable as a portfolio project.

Deliver:

- Installable mobile web app and tested Android build.
- Secure account connection and disconnection.
- Gmail and Calendar connectors with incremental synchronization.
- Persistent tasks, goals, event folders, reviews, and action history.
- Evaluated suggestion engine with a provider-independent interface.
- Daily briefings and approval-based actions.
- Data export, retention controls, and local deletion.
- Automated tests, CI, backup/recovery documentation, and operational health reporting.
- Public demonstration mode containing synthetic data only.
- Architecture, privacy, threat-model, and evaluation documentation.

Release criteria:

- Fresh installation succeeds from the README.
- Supported Android and desktop flows pass their test checklists.
- No secrets or personal content exist in Git history or demo assets.
- Evaluation thresholds pass on a locked test set.
- Failure of Google, storage, or the classifier degrades visibly and safely.
- External mutations require approval and are auditable.

## Explicitly deferred

- Automatic email deletion.
- Automatically sending AI-written replies.
- Full access to every Android application or notification.
- SMS ingestion until Android permission and privacy constraints are reviewed.
- Outlook and IMAP until the Google workflow is dependable.
- Cloud hosting until local data handling and authentication are mature.
- Autonomous rules created from user corrections.

## Working method

For every milestone:

1. Define one user-visible outcome.
2. Record included and excluded scope.
3. Add tests before integrating private data.
4. Verify on a narrow viewport.
5. Review privacy and permissions.
6. Update this plan with evidence and remaining risks.
7. Commit a small, coherent change.

## Resume point

The next working session starts at Milestone 1, item 1. Milestone 0 should not be repeated
unless a regression is observed. Read [WORKLOG.md](WORKLOG.md) for the completed recovery
and verification evidence.
