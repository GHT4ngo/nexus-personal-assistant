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
