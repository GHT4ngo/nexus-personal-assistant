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
