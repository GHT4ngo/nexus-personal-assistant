# Nexus - Project Guidelines

## Vision

Build Nexus: a personal assistant app that helps connect everyday life, work, studies, family, email, calendar, tasks, travel, and important goals into one practical command center.

The app should work well on a Samsung phone and should grow in small, working steps. The goal is not to build a huge system all at once. The goal is to create a useful first version, then improve it through real use.

## Product Principles

1. Working version first
   - Every phase should produce something usable.
   - Avoid building large invisible systems before the user can try them.

2. Human approval before automation
   - The assistant may suggest actions.
   - The user should approve risky actions such as deleting email, sending messages, changing calendar events, or contacting people.
   - Automation can be increased later for trusted actions.

3. Privacy by design
   - Email, calendar, SMS, contacts, and personal documents are sensitive.
   - Store the minimum data needed.
   - Keep clear logs of what the assistant changed and why.
   - Prefer read-only access during early development.

4. Mobile-first
   - The main experience should be useful on a Samsung phone.
   - Screens should be clear, fast, and focused.
   - The app should not feel like a desktop dashboard squeezed onto a phone.
   - Navigation and controls should be thumb-friendly first: compact, readable, and usable on a narrow screen.
   - Avoid desktop-looking form controls, wide button grids, hover-only interactions, and controls that spill outside cards.
   - When a choice list gets long, prefer a mobile-friendly picker, bottom sheet, compact command menu, or clearly styled dark native control.

5. One trusted daily view
   - The app should help answer: "What matters right now?"
   - Important emails, calendar events, tasks, deadlines, travel, school, family, and work should be brought together in one place.

6. Incremental intelligence
   - Start with simple rules and clear categories.
   - Add AI once the basic workflow is useful.
   - AI should explain its reasoning when it recommends actions.

7. Multi-assistant collaboration
   - Codex, Claude Code, Lovable, and other tools may help build Nexus.
   - Each assistant should work on a clear, small task.
   - Avoid overlapping edits to the same files at the same time.
   - Important architectural decisions should be recorded in this document or a future decision log.
   - Generated code should be reviewed before it becomes part of the main app.

## Agile Workflow

We will work in short iterations.

Each iteration should include:

1. Goal
   - What useful thing should work by the end?

2. Scope
   - What is included?
   - What is intentionally not included yet?

3. Build
   - Implement the smallest version that proves the idea.

4. Test
   - Try it with realistic examples.
   - Confirm it works on a phone-sized screen when UI is involved.

5. Review
   - What worked?
   - What felt confusing?
   - What should be adjusted next?

6. Backlog update
   - Add new ideas.
   - Re-prioritize based on what is actually useful.

## Suggested MVP

### MVP Name

Nexus Personal Command Center

### MVP Goal

Create a first working assistant that can show important information and help manage focus without making risky changes automatically.

### MVP Features

1. Today view
   - Shows upcoming calendar items.
   - Shows priority tasks.
   - Shows important notes or goals.

2. Manual inbox import
   - Start by pasting or importing example emails.
   - Classify them as important, normal, spam, newsletter, travel, school, work, family, finance, or action needed.

3. Goal tracker
   - Track active goals such as "Find internship starting in December".
   - Break each goal into next actions.
   - Show reminders and follow-ups.

4. Event folder
   - Create focused event pages such as "Tunisia trip - March 21".
   - Store related tasks, emails, documents, links, dates, and reminders.

5. Assistant suggestions
   - Suggest what needs attention.
   - Suggest calendar events or tasks from imported emails.
   - Require approval before making changes.

## Later Features

These should come after the MVP is useful:

1. Real email connection
   - Gmail
   - Outlook
   - IMAP if needed

2. Real calendar connection
   - Google Calendar
   - Outlook Calendar

3. Android app
   - Native Android app or mobile web app wrapper.
   - Samsung-friendly layout and notifications.

4. SMS and app signals
   - Android permissions may limit this.
   - Start with notification sharing or manual forwarding if full SMS access is too restricted.

5. AI engine
   - Summarize important messages.
   - Extract dates and tasks.
   - Rank urgency.
   - Draft replies.
   - Build plans for goals like internship search.

6. Automation rules
   - Archive newsletters.
   - Label emails.
   - Create draft calendar events.
   - Follow up on tasks.
   - Delete spam only after strong confidence and user-approved rules.

## Safety Rules

1. No destructive actions without approval
   - Do not delete emails automatically in early versions.
   - Do not send messages automatically.
   - Do not change calendar events automatically.

2. Always keep an action history
   - Record what changed.
   - Record when it changed.
   - Record whether it was done by the user, a rule, or AI.

3. Separate suggestion from action
   - The app can say "I think this is spam."
   - The app should not silently delete it.

4. Make undo possible
   - Labels, archive actions, calendar changes, and task changes should be reversible when possible.

5. Protect secrets
   - Never commit API keys, tokens, passwords, or private account data.
   - Use environment variables or a secure local secrets store.

6. Be careful with AI-generated changes
   - Review changes from any AI assistant before committing.
   - Do not accept large rewrites unless they clearly serve the current iteration goal.
   - Prefer small pull requests or small commits with clear descriptions.

## Technical Direction

The exact stack can evolve, but the project should prefer:

1. Clear separation
   - Backend for assistant logic, integrations, data storage, and AI.
   - Frontend for the mobile-friendly user experience.

2. API-first design
   - The Android app, web app, and future tools should talk to the same backend API.

3. Local development first
   - Start simple on the local machine.
   - Add cloud hosting only when needed.

4. Testable modules
   - Email classification, calendar extraction, goal tracking, and event folders should be testable separately.

5. Replaceable AI provider
   - Do not lock the project too tightly to one AI engine.
   - Keep AI calls behind a small internal interface.

## Backlog

### Now

- Publish and verify the recovered clean `0.2.0` baseline.
- Add continuous integration for the existing syntax checks.
- Verify a fresh dependency install, read-only Google connection, and Android debug build.
- Define and test stable internal records for mail, calendar events, tasks, goals, reviews,
  approvals, and action history.

### Next

- Replace hard-coded Today data with persistent tasks, goals, and live calendar data.
- Build a synthetic/private evaluation fixture workflow before introducing classification.
- Add a review queue that distinguishes facts, suggestions, and uncertainty.

### Later

- Add an evaluated, provider-independent suggestion engine.
- Build daily briefings and approval-based provider actions.
- Add event folders, retention controls, data export, and recovery documentation.
- Add other providers only after the Google workflow is dependable.

The detailed sequence, exit criteria, and release gates are maintained in
[docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md).

## Definition of Done

A feature is done when:

1. It works with realistic example data.
2. It has a clear user path.
3. It does not expose secrets or private data.
4. It avoids risky automatic actions unless explicitly approved.
5. It fits the current mobile-first design.
6. It has enough tests or manual verification for the risk level.

## Decision Log

Use this section to record important decisions as the project grows.

### 2026-05-06

- Project will be built using an agile, incremental approach.
- Project name is Nexus.
- First focus is a useful working MVP, not full automation.
- Early versions should use sample or manually imported data before connecting live accounts.
- Risky actions require user approval.
- GitHub repository: https://github.com/GHT4ngo/nexus-personal-assistant.git
- Codex, Claude Code, and Lovable may assist, but changes should stay small, reviewed, and aligned with these guidelines.

### 2026-08-02

- Recovered the existing web, Google integration, PWA, and Android code into the repository clone.
- Removed the failed learned sender/domain sorter, its persisted labels, and automatic cleanup behavior.
- Retained Gmail and Calendar with read-only OAuth scopes.
- Classification must now pass a versioned evaluation workflow before affecting priorities.
- The implementation sequence is recorded in `docs/EXECUTION_PLAN.md`.
