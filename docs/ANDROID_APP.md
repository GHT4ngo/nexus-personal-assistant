# Nexus Android App

Nexus can be packaged as an Android app with Capacitor. This gives you a real app icon and phone-first testing while keeping the current web code.

## What the App Contains

- The Nexus interface runs inside the Android app.
- Gmail and Calendar still use the Nexus server from `scripts/local-server.mjs`.
- The app has a `Nexus server URL` field in the Google Link panel. On desktop you can leave it empty. On phone, set it to the address where the phone can reach the Nexus server.

## Setup Once

1. Install Android Studio.
2. Install the Android SDK when Android Studio asks.
3. In this project, install the mobile packages:

```powershell
npm install --cache .npm-cache
```

If npm cannot reach the registry, the Android app cannot be generated yet. Try again from a normal PowerShell window, or allow Node/npm through firewall/security software.

## Create the Android Project

```powershell
npm run mobile:add:android
```

This creates the `android/` folder.

## Open Android Studio

```powershell
npm run mobile:open
```

Android Studio can then build and install Nexus on the phone.

If a command says Java is missing, use Android Studio's bundled Java for that terminal:

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
```

The first Android build may need to download Android build packages. If Codex cannot do that because network access is blocked, run the build from Android Studio or from your normal PowerShell window.

If Gradle crashes with `FileAlreadyExistsException` for `problems-report.html`, run the build without the experimental problems report:

```powershell
cd C:\path\to\nexus-personal-assistant\android
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
.\gradlew.bat assembleDebug --no-problems-report
```

If that still complains, close Android Studio and run:

```powershell
.\gradlew.bat --stop
Remove-Item -LiteralPath .\build\reports\problems -Recurse -Force
Remove-Item "$env:USERPROFILE\.gradle\.tmp\problems-report*.html" -Force
.\gradlew.bat assembleDebug --no-problems-report
```

## Daily Testing Loop

After changing Nexus:

```powershell
npm run mobile:sync
```

Then rebuild/run from Android Studio.

## Server URL on Phone

The phone app needs a reachable Nexus server for Gmail/calendar sync. Start the server on the PC:

```powershell
npm start
```

Then in the app, set `Nexus server URL` to one of these:

- `http://YOUR_PC_IP:8050` if local Wi-Fi works.
- A Tailscale address if we set that up later.
- A private hosted URL if we move the server online later.

USB is only needed to install/debug the app. It should not be needed just to open the installed app, as long as the app can reach the Nexus server over the network.
