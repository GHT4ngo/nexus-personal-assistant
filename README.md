# Nexus Personal Assistant

Nexus is a mobile-first personal command center. It brings read-only Gmail and Google
Calendar data into one local interface, with room to add tasks, goals, and carefully
evaluated assistance.

## Current status

The project contains a working local web app and Capacitor Android wrapper. Google access is
read-only: Nexus can load calendar events and Gmail messages, but it cannot send, archive,
delete, label, or modify them.

The original experimental mail sorter was removed because its sender-based learning and
hard-coded guesses were not reliable. No old labels or learning data are included. Until a
replacement is evaluated against a representative test set, messages are displayed in
delivery order without automatic classification.

## Local Run

```powershell
npm start
```

Then open:

```text
http://127.0.0.1:8050
```

Google Calendar and Gmail setup is documented in [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md).
The implementation roadmap is in [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md).

## Validation

```powershell
npm run check
```

This validates the browser application and local server scripts without accessing private
accounts.

## Privacy

OAuth tokens, cached mail, imports, Google Takeout exports, logs, local environment files,
dependencies, and generated mobile builds are excluded from Git. See
[PROJECT_GUIDELINES.md](PROJECT_GUIDELINES.md) for the safety and product principles.
