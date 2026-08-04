# Nexus classifier quality gates

These thresholds were written before selecting an AI model or prompt. Passing them permits
further product review; it does not authorize automatic Gmail or Calendar actions.

## Required thresholds

| Label | Precision | Recall | Reason |
|---|---:|---:|---|
| Needs reply | 0.80 | 0.90 | Missing genuine requests is costly, but excessive reply prompts also erode trust. |
| Deadline | 0.85 | 0.95 | Deadline recall is critical; dates that are merely events must not become tasks. |
| Calendar candidate | 0.85 | 0.90 | Suggestions should be useful without flooding Review. |
| Urgent | 0.80 | 1.00 | The locked set permits no missed urgent cases. |
| Automated | 0.95 | 0.90 | Personal mail must rarely be mistaken for automation. |

Additional gates:

- zero false urgent results on the locked public fixture set;
- zero missed urgent results;
- zero positive reply/deadline predictions without evidence;
- topic coverage of at least 0.70;
- topic accuracy of at least 0.80 on non-abstained predictions.

## Safety gates outside the score

- No classifier may hide, archive, delete, send, or modify provider data.
- Low-confidence or insufficient-context results must abstain.
- Every report identifies the dataset and classifier versions.
- A committed report is required before a classifier can enter the UI.
- Private evaluation content must remain ignored and local.
- User corrections remain review history and do not become automatic learning rules.

## Weak baseline

`nexus-weak-keywords/1` is intentionally simplistic. It demonstrates the evaluator and
provides a comparison floor, not a product candidate. Keyword matching is expected to
misread marketing urgency, confuse some dates, and over-rely on sender or body terms.
