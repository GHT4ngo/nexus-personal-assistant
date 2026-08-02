# Google Setup

Nexus starts with read-only Google access.

## Current Scopes

- Google Calendar read-only: `https://www.googleapis.com/auth/calendar.readonly`
- Gmail read-only: `https://www.googleapis.com/auth/gmail.readonly`

These scopes let Nexus read upcoming calendar events and recent Gmail message summaries. Nexus does not create, delete, send, archive, or modify anything yet.

## Google Cloud Steps

1. Open Google Cloud Console.
2. Create or select a project for Nexus.
3. Enable these APIs:
   - Google Calendar API
   - Gmail API
4. Configure the OAuth consent screen.
   - Use External for a personal Gmail account.
   - Keep the app in Testing while Nexus is local.
   - Add your Gmail address under Test users.
5. Create OAuth credentials for a web application.
6. Add this authorized redirect URI:

```text
http://localhost:8050/api/google/callback
```

7. Copy `.env.example` to `.env`.
8. Fill in:

```text
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8050/api/google/callback
```

9. Restart the local Nexus server:

```powershell
node scripts/local-server.mjs 8050
```

10. In Nexus, use the Google panel to connect.

## Fix 403 Access Denied

If Google says Nexus has not completed verification and only approved testers can access it, add your Gmail account as a test user:

1. Open Google Cloud Console.
2. Select the Nexus project.
3. Go to Google Auth Platform.
4. Open Audience.
5. Find Test users.
6. Add the exact Google account you are signing in with.

Use the full Gmail address, for example:

```text
you@example.com
```

After saving, wait a minute, then try Connect Google again in Nexus.

## Private Data

Google tokens are stored locally in:

```text
data/private/google-token.json
```

The `data/private/` folder is ignored by Git.
