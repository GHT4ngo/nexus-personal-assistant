# Nexus evaluation labeling guide

## Purpose

This guide defines human labels for classifier evaluation. Labels describe only the
message in front of the reviewer. They do not learn permanent rules about a sender or
domain, and they never authorize provider actions.

Use `null` when the supplied message does not contain enough information for a reliable
label. Abstention is preferable to inventing context.

## Labels

### `needsReply`

Use `true` when the sender directly asks the recipient to answer, confirm, choose, call,
or provide requested information. Use `false` for FYI messages, automated notices,
receipts, and instructions completed somewhere other than a reply.

A classifier predicting `true` must return a short evidence excerpt containing the request.

### `hasDeadline`

Use `true` when the recipient must complete an action by an explicit date or time. A date
describing a meeting, departure, appointment, publication, or sale is not automatically a
deadline.

A classifier predicting `true` must return evidence containing both the required action
and the limiting date or time.

### `calendarCandidate`

Use `true` for an event the recipient may reasonably place on a calendar: meetings,
appointments, departures, arrivals, lessons, or social plans with a usable date or time.
Do not label a task deadline as a calendar event unless the message separately describes
an event.

### `urgent`

Use `true` only when delayed attention could cause meaningful near-term harm or when a
trusted human explicitly communicates a genuine immediate need. Marketing urgency,
countdowns, capitalization, and the word “urgent” alone are insufficient.

### `topic`

Choose one broad topic only when the message provides enough evidence:

- `study`: courses, assignments, school administration, or learning;
- `work`: employment, projects, colleagues, reports, or professional administration;
- `finance`: invoices, payments, banking, taxes, or budgets;
- `travel`: transport, accommodation, itineraries, or trips;
- `health`: appointments, care, medication, or wellbeing;
- `personal`: family, friends, household, or social plans;
- `other`: clear content that does not fit the categories above;
- `null`: not enough context for a reliable topic.

### `automated`

Use `true` for system-generated notices, receipts, reminders, newsletters, list mail, and
transactional messages that were not individually written to the recipient. Use `false`
for person-to-person messages. A role address alone is supporting evidence, not proof.

## Review process

1. Read only the supplied synthetic or explicitly sanitized fixture.
2. Label each field independently.
3. Use `null` when context is insufficient.
4. Do not infer behavior from previous messages by the sender.
5. Resolve disagreements by updating this guide before changing expected labels.
6. Increment the dataset version when labels or fixture text change.

## Privacy

Public fixtures must use invented content, reserved example domains, invented identifiers,
and no copied private message fragments. Private evaluation datasets belong under ignored
paths and must never be committed.
