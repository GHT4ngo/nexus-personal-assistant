# Nexus Phone Setup

Nexus is being prepared as a mobile-first web app. The first phone path is a PWA: it runs from the local Nexus server and can be installed from Chrome on Android.

## Recommended Local Phone Path

Use USB port forwarding so the phone opens Nexus through `localhost`. This avoids Wi-Fi firewall issues and gives Chrome a trusted local address for PWA features.

1. Install Android platform tools on Windows if `adb` is not available.
2. Enable Developer Options on the Samsung phone.
3. Enable USB debugging.
4. Connect the phone with USB and accept the debugging prompt.
5. Start Nexus on the computer:

```powershell
npm start
```

6. Forward the port:

```powershell
adb reverse tcp:8050 tcp:8050
```

7. On the phone, open Chrome:

```text
http://127.0.0.1:8050
```

8. Use Chrome menu > Add to Home screen or Install app.

## Later Phone Paths

- PWA hosted on a private HTTPS URL.
- Android wrapper using Capacitor.
- Native Android app when phone integrations such as notifications become important.
