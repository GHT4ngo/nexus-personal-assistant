# Clean baseline

The first experimental mail sorter has intentionally not been carried forward.

Removed:

- per-message training storage;
- learned sender and domain classifications;
- hard-coded content rules presented as AI;
- automatic sorting and bulk resorting;
- automatic cleanup of guessed importance labels;
- audit tools that depended on the failed labels.

Preserved:

- the mobile-first interface and visual direction;
- read-only Google OAuth scopes;
- Gmail retrieval and MIME parsing;
- Google Calendar retrieval;
- local private message caching;
- calendar-date candidate detection, which never writes to Google;
- resource diagnostics;
- PWA and Capacitor Android packaging;
- Windows setup and launch helpers.

Any future classifier must be isolated from the Google connection layer, return an explicit
confidence and explanation, abstain when uncertain, and pass a versioned evaluation dataset
before it can affect the Today or Attention views.
