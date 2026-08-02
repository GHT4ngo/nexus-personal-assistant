# Nexus Windows Helpers

These files live in `tools/`.

## Daily Phone Testing

Run:

```text
tools\nexus-one-click-phone.bat
```

This stops old workers, builds Nexus, and installs it on the connected phone. Start the server separately with `tools\nexus-start.bat` so the PC is not building and serving at the same time.

## Build And Install Only

Run:

```text
tools\nexus-phone-build-install.bat
```

It syncs Nexus into Android, builds the APK, and installs it on the connected phone.

## Start Nexus Server

Run:

```text
tools\nexus-start.bat
```

Keep this window open while the phone app uses Gmail/calendar.
This also enables the resource monitor in Nexus. The app can show PC memory, Nexus server memory, disk space, and the last Gmail batch cost.

## Cool Everything Down

Run:

```text
tools\nexus-cooldown.bat
```

It stops Gradle workers and Node servers.
It also stops Android/Gradle Java workers that can keep the PC busy after a build.

## Emergency Memory Check

Run:

```text
tools\nexus-emergency-memory.bat
```

It saves a memory report to `logs\emergency-memory.txt`, then asks before stopping optional heavy apps like Ollama, VS Code, Discord, and local database servers.

## Allow Phone Access on Port 8050

Right-click and run as Administrator:

```text
tools\nexus-firewall-8050-admin.bat
```

This opens only TCP port `8050`. It does not turn off the firewall.
