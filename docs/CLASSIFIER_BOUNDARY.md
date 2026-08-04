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
