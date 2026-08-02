# Iteration 001 - Nexus Personal Command Center

## Goal

Create the first working Nexus screen that can be opened locally and tested on a Samsung-sized viewport.

## Scope

Included:

- Mobile-first Today view.
- Important inbox sample data.
- Goal tracker sample data.
- Event folder sample data.
- Read-only Google Calendar and Gmail connection path.
- Local-only Gmail message cache.
- Capacitor Android wrapper.

Not included yet:

- Automatic mail classification.
- Sender or domain learning.
- AI engine calls.
- Login accounts.
- Gmail cleanup actions.
- Calendar write actions.

## Verification

Open `index.html` in a browser and check:

- The Today view appears.
- Tabs switch between Today, Inbox, Goals, and Events.
- Text fits on a narrow mobile viewport.
- No real private data is included.

## Next Candidates

- Complete Google sign-in test.
- Define an evaluation dataset and classification quality thresholds.
- Add a review queue that clearly separates suggestions from facts.
- Turn calendar and mail signals into Today items.
