import {
  formatSyncAge,
  sourceHealthSummary
} from "./source-health.js";

const sampleData = {
  suggestions: [
    {
      title: "Build a trustworthy review queue",
      detail: "The previous learning sorter has been removed. A replacement must be evaluated before it can influence priorities.",
      action: "Planned"
    }
  ],
  emails: [
    {
      id: "sample-1",
      from: "School portal",
      subject: "Internship information session",
      detail: "Sample message shown until Gmail is connected."
    }
  ],
  events: [
    {
      title: "Nexus rebuild",
      detail: "Preserve useful integrations while replacing the failed sorting approach.",
      status: "Active"
    }
  ]
};

let liveGoogleCalendar = [];
let liveGoogleMail = [];
let liveTasks = [];
let liveGoals = [];
let nextGmailPageToken = "";
let googleLoadInProgress = false;
let localRecordState = "loading";
let calendarState = "not-loaded";
const lastGoogleSyncAt = localStorage.getItem("nexus-google-sync-at");
const sourceHealth = {
  server: { label: "Nexus server", status: "checking", updatedAt: null },
  google: { label: "Google link", status: "checking", updatedAt: lastGoogleSyncAt },
  calendar: { label: "Calendar", status: "not-loaded", updatedAt: lastGoogleSyncAt },
  gmail: { label: "Gmail cache", status: "checking", updatedAt: null },
  local: { label: "Tasks & goals", status: "checking", updatedAt: null }
};
const MAIL_RENDER_LIMIT = 60;

const viewTitles = {
  today: "Today",
  calendar: "Calendar",
  inbox: "Inbox",
  goals: "Goals",
  events: "Events"
};

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);

const badge = (text) => `<span class="badge">${escapeHtml(text)}</span>`;

const renderList = (targetId, items, template) => {
  const target = document.getElementById(targetId);
  if (target) {
    target.innerHTML = items.map(template).join("");
  }
};

const renderSourceHealth = () => {
  document.getElementById("source-health-summary").textContent = sourceHealthSummary(sourceHealth);
  renderList("source-health-list", Object.values(sourceHealth), (source) => `
    <div class="source-health-item">
      <strong>${escapeHtml(source.label)}</strong>
      <span>${escapeHtml(source.status)} · ${escapeHtml(formatSyncAge(source.updatedAt))}</span>
    </div>
  `);
};

const setSourceHealth = (source, status, updatedAt = sourceHealth[source]?.updatedAt || null) => {
  sourceHealth[source] = { ...sourceHealth[source], status, updatedAt };
  renderSourceHealth();
};

const normalizeApiBase = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
};

const isNativeApp = () => Boolean(window.Capacitor?.isNativePlatform?.());
const getApiBase = () => normalizeApiBase(
  localStorage.getItem("nexus-api-base") || (isNativeApp() ? "http://localhost:8050" : "")
);
const apiUrl = (path) => getApiBase() ? `${getApiBase()}${path}` : path;
const apiFetch = (path, options) => fetch(apiUrl(path), options);

const readApiJson = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Nexus received an unreadable response. Check the Nexus server URL.");
  }
};

const applyTheme = (theme) => {
  const nextTheme = theme === "neon" ? "neon" : "matrix";
  document.body.dataset.theme = nextTheme;
  document.getElementById("theme-toggle").querySelector("span").textContent =
    nextTheme === "matrix" ? "M" : "N";
  localStorage.setItem("nexus-theme", nextTheme);
};

const startMatrixRain = () => {
  const canvas = document.getElementById("matrix-rain");
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const context = canvas.getContext("2d");
  const glyphs = "01アイウエオカキクケコサシスセソ";
  let columns = [];

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    columns = Array.from({ length: Math.ceil(window.innerWidth / 20) }, (_, index) => ({
      x: index * 20,
      y: Math.random() * -window.innerHeight,
      speed: 1 + Math.random() * 2
    }));
  };

  const draw = () => {
    if (!document.hidden && document.body.dataset.theme === "matrix") {
      context.fillStyle = "rgba(0, 0, 0, 0.16)";
      context.fillRect(0, 0, window.innerWidth, window.innerHeight);
      context.font = "15px Consolas, monospace";
      for (const column of columns) {
        context.fillStyle = "rgba(45, 255, 110, 0.72)";
        context.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], column.x, column.y);
        column.y += column.speed;
        if (column.y > window.innerHeight + 30) {
          column.y = Math.random() * -200;
        }
      }
    }
    requestAnimationFrame(draw);
  };

  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(draw);
};

const mergeMailItems = (existingItems, incomingItems) => {
  const byId = new Map(existingItems.map((item) => [item.id, item]));
  for (const item of incomingItems) {
    if (item?.id) {
      byId.set(item.id, { ...byId.get(item.id), ...item });
    }
  }
  return [...byId.values()].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
};

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value || "Soon"
    : date.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
};

const formatTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

const formatMailDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value || "unknown"
    : date.toLocaleString(undefined, {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
};

const detectCalendarCandidate = (message) => {
  const text = `${message.subject || ""}. ${message.snippet || ""} ${message.bodyPreview || ""}`;
  const patterns = [
    /\b(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?\b/,
    /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})(?:\s+(\d{1,2}:\d{2}))?\b/,
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,\s*(20\d{2}))?/i
  ];
  const match = patterns.map((pattern) => text.match(pattern)).find(Boolean);
  return match
    ? { title: message.subject || "Mail event", dateText: match[0] }
    : null;
};

const renderToday = () => {
  const tasks = liveTasks
    .filter((item) => ["todo", "doing"].includes(item.status))
    .map((item) => ({
      sortAt: item.dueAt || item.createdAt,
      time: item.dueAt ? formatDate(item.dueAt) : "Open",
      title: item.title,
      detail: item.dueAt
        ? `Due ${formatMailDate(item.dueAt)}`
        : item.text || "No due date set.",
      tag: item.status,
      recordType: "task",
      sourceId: item.sourceId
    }));
  const events = liveGoogleCalendar.map((item) => ({
    sortAt: item.start,
    time: formatTime(item.start) || formatDate(item.start),
    title: item.title,
    detail: item.location || "Google Calendar event",
    tag: "calendar",
    recordType: "calendar-event"
  }));
  const items = [...tasks, ...events]
    .sort((left, right) => new Date(left.sortAt || 0) - new Date(right.sortAt || 0))
    .slice(0, 12);

  document.getElementById("metric-actions").textContent = String(tasks.length);
  document.getElementById("local-status").textContent = {
    loading: "Loading",
    ready: "Local",
    offline: "Offline",
    error: "Error"
  }[localRecordState] || "Local";

  if (!items.length) {
    const message = localRecordState === "loading"
      ? "Loading private tasks and goals."
      : localRecordState === "offline"
        ? "The Nexus server is offline. Local tasks and goals are unavailable."
        : calendarState === "not-loaded"
          ? "No active tasks. Load Google data to include upcoming Calendar events."
          : "No active tasks or upcoming Calendar events.";
    document.getElementById("today-list").innerHTML = `
      <article class="list-item empty-state"><div><h3>Nothing queued</h3><p>${escapeHtml(message)}</p></div></article>
    `;
  } else {
    renderList("today-list", items, (item) => `
    <article class="list-item">
      <div class="time-chip">${escapeHtml(item.time)}</div>
      <div>
        <div class="item-title-row">
          <h3>${escapeHtml(item.title)}</h3>
          ${badge(item.tag)}
        </div>
        <p>${escapeHtml(item.detail)}</p>
        ${item.recordType === "task" ? `
          <div class="item-actions">
            <button class="secondary-action local-status-action" type="button"
              data-collection="tasks" data-source-id="${escapeHtml(item.sourceId)}" data-status="done">Complete</button>
          </div>
        ` : ""}
      </div>
    </article>
    `);
  }

  document.getElementById("attention-count").textContent = "Not active";
  document.getElementById("attention-list").innerHTML = `
    <article class="list-item mail-item">
      <div>
        <h3>Classification intentionally disabled</h3>
        <p>The failed learning sorter was removed. Messages remain available in Inbox while a tested replacement is built.</p>
      </div>
    </article>
  `;
};

const renderSuggestions = () => {
  renderList("suggestion-list", sampleData.suggestions, (item) => `
    <article class="list-item action-item">
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.detail)}</p>
      </div>
      <button class="secondary-action" type="button">${escapeHtml(item.action)}</button>
    </article>
  `);
};

const renderCalendar = () => {
  const items = liveGoogleCalendar.map((item) => ({
        date: formatDate(item.start),
        time: formatTime(item.start),
        title: item.title,
        detail: item.location ? `Location: ${item.location}` : "Google Calendar event",
        tag: "Google"
      }));

  document.getElementById("calendar-source").textContent =
    calendarState === "ready" ? "Google" : calendarState === "error" ? "Unavailable" : "Not loaded";
  document.getElementById("metric-events").textContent = String(items.length);

  if (!items.length) {
    document.getElementById("calendar-list").innerHTML = `
      <article class="list-item empty-state"><div><h3>No calendar events loaded</h3>
      <p>${calendarState === "error"
        ? "Calendar could not be loaded."
        : "Connect Google and load data to show upcoming events."}</p></div></article>
    `;
    return;
  }
  renderList("calendar-list", items, (item) => `
    <article class="list-item">
      <div class="time-chip">${escapeHtml(item.date)}</div>
      <div>
        <div class="item-title-row">
          <h3>${escapeHtml(item.title)}</h3>
          ${badge(item.tag)}
        </div>
        <p><strong>${escapeHtml(item.time)}</strong> | ${escapeHtml(item.detail)}</p>
      </div>
    </article>
  `);
};

const getEmailItems = () =>
  liveGoogleMail.length
    ? liveGoogleMail.map((item) => ({
        id: item.id,
        from: item.from,
        subject: item.subject,
        detail: item.snippet || item.bodyPreview || "No preview text available.",
        date: item.date,
        gmailUrl: item.gmailUrl,
        parser: item.parser,
        parserError: item.parserError,
        calendarCandidate: detectCalendarCandidate(item)
      }))
    : sampleData.emails;

const renderMail = () => {
  const items = getEmailItems();
  const visibleItems = items.slice(0, MAIL_RENDER_LIMIT);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  document.getElementById("mail-source").textContent = liveGoogleMail.length
    ? `Gmail: showing ${visibleItems.length} of ${items.length} loaded messages`
    : "Sample data";
  document.getElementById("metric-important").textContent = "—";
  document.getElementById("mail-summary").textContent = hiddenCount
    ? `${hiddenCount} more messages are hidden for phone performance. No automatic classification is active.`
    : "No automatic classification is active. Messages are shown in delivery order.";

  renderList("email-list", visibleItems, (item) => `
    <article class="list-item mail-item">
      <div>
        <h3>${escapeHtml(item.subject)}</h3>
        <p>
          <strong>${escapeHtml(item.from)}</strong>
          ${item.date ? ` | delivered ${escapeHtml(formatMailDate(item.date))}` : ""}
          | ${escapeHtml(item.detail)}
        </p>
        ${item.calendarCandidate ? `
          <p class="calendar-candidate">Possible date: ${escapeHtml(item.calendarCandidate.dateText)}</p>
          <button class="secondary-action queue-calendar" type="button" data-message-id="${escapeHtml(item.id)}">Queue calendar suggestion</button>
        ` : ""}
        ${item.parser ? `<p class="parser-note">mail.parser = ${escapeHtml(item.parser)}${item.parserError ? ` | ${escapeHtml(item.parserError)}` : ""}</p>` : ""}
        ${item.gmailUrl ? `<a class="secondary-action link-action" href="${escapeHtml(item.gmailUrl)}" target="_blank" rel="noreferrer">Open in Gmail</a>` : ""}
      </div>
    </article>
  `);
};

const renderGoals = () => {
  const activeGoals = liveGoals.filter((item) => item.status !== "dismissed");
  document.getElementById("goal-count").textContent =
    `${liveGoals.filter((item) => item.status === "active").length} active`;
  if (!activeGoals.length) {
    document.getElementById("goal-list").innerHTML = `
      <article class="list-item empty-state"><div><h3>No goals saved</h3>
      <p>${localRecordState === "offline"
        ? "Start the Nexus server to access private local goals."
        : "Add a goal above. Goals remain private on the Nexus server."}</p></div></article>
    `;
    renderFocus();
    return;
  }
  renderList("goal-list", activeGoals, (item) => `
    <article class="list-item">
      <div>
        <div class="item-title-row">
          <h3>${escapeHtml(item.title)}</h3>
          ${badge(item.status)}
        </div>
        <p>${escapeHtml(item.targetAt
          ? `Target ${formatMailDate(item.targetAt)}`
          : item.text || "No target date set.")}</p>
        <div class="item-actions">
          ${item.status === "active" ? `
            <button class="secondary-action local-status-action" type="button"
              data-collection="goals" data-source-id="${escapeHtml(item.sourceId)}" data-status="paused">Pause</button>
          ` : ""}
          ${item.status === "paused" ? `
            <button class="secondary-action local-status-action" type="button"
              data-collection="goals" data-source-id="${escapeHtml(item.sourceId)}" data-status="active">Resume</button>
          ` : ""}
          ${item.status !== "completed" ? `
            <button class="secondary-action local-status-action" type="button"
              data-collection="goals" data-source-id="${escapeHtml(item.sourceId)}" data-status="completed">Complete</button>
          ` : ""}
        </div>
      </div>
    </article>
  `);
  renderFocus();
};

const renderFocus = () => {
  const goal = liveGoals.find((item) => item.status === "active");
  document.getElementById("focus-title").textContent = goal?.title || "No active goal";
  document.getElementById("focus-detail").textContent = goal
    ? goal.targetAt
      ? `Target ${formatMailDate(goal.targetAt)}.`
      : goal.text || "This goal has no target date."
    : localRecordState === "offline"
      ? "Start the Nexus server to load private goals."
      : "Add a goal to choose the direction for your daily plan.";
};

const renderEvents = () => {
  renderList("event-list", sampleData.events, (item) => `
    <article class="list-item">
      <div>
        <div class="item-title-row">
          <h3>${escapeHtml(item.title)}</h3>
          ${badge(item.status)}
        </div>
        <p>${escapeHtml(item.detail)}</p>
      </div>
    </article>
  `);
};

const renderCalendarGrid = () => {
  const today = new Date();
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return date;
  });

  document.getElementById("calendar-grid").innerHTML = days.map((date) => `
    <button class="calendar-day" type="button">
      <span>${date.toLocaleDateString(undefined, { weekday: "short" })}</span>
      <strong>${date.getDate()}</strong>
    </button>
  `).join("");
};

const setGooglePanel = (status, message) => {
  document.getElementById("google-status").textContent = status;
  document.getElementById("google-message").textContent = message;
};

const updateGoogleMonitor = ({ state = "active", label, detail, percent = 0 }) => {
  document.getElementById("google-monitor").className = `operation-monitor ${state}`;
  document.getElementById("google-monitor-label").textContent = label;
  document.getElementById("google-monitor-detail").textContent = detail;
  document.getElementById("google-monitor-percent").textContent = `${percent}%`;
  document.getElementById("google-progress").style.width = `${percent}%`;
};

const refreshResourceStatus = async () => {
  const monitor = document.getElementById("resource-monitor");
  try {
    const response = await apiFetch("/api/system/resources");
    const data = await readApiJson(response);
    if (!response.ok) {
      throw new Error(data.message || "Resource check failed.");
    }
    const system = data.current?.system || {};
    const nexus = data.current?.nexus || {};
    setSourceHealth("server", "healthy", data.current?.timestamp || new Date().toISOString());
    monitor.className = "operation-monitor done";
    document.getElementById("resource-monitor-label").textContent =
      `system.health = ${system.memoryUsedPercent ?? "?"}% memory`;
    document.getElementById("resource-monitor-detail").textContent =
      `PC free ${system.memoryFreeMb ?? "?"} MB. Nexus uses ${nexus.rssMb ?? "?"} MB.`;
  } catch (error) {
    setSourceHealth("server", "offline");
    monitor.className = "operation-monitor error";
    document.getElementById("resource-monitor-label").textContent = "system.health = unavailable";
    document.getElementById("resource-monitor-detail").textContent = error.message;
  }
};

const checkGoogleStatus = async () => {
  try {
    const response = await apiFetch("/api/google/status");
    const data = await readApiJson(response);
    if (!data.configured) {
      setSourceHealth("google", "setup-needed");
      setGooglePanel("Setup needed", "Add Google OAuth credentials to .env.");
    } else if (!data.connected) {
      setSourceHealth("google", "disconnected");
      setGooglePanel("Ready", "Google credentials found. Connect your account.");
    } else {
      setSourceHealth("google", "connected");
      setGooglePanel("Connected", "Google is connected in read-only mode.");
    }
  } catch {
    setSourceHealth("google", "offline");
    setGooglePanel("Offline", "Start the Nexus server or check the saved server URL.");
  }
};

const connectGoogle = async () => {
  try {
    const response = await apiFetch("/api/google/auth-url");
    const data = await readApiJson(response);
    if (!response.ok) {
      setGooglePanel("Setup needed", data.message || "Google credentials are missing.");
      return;
    }
    window.location.href = data.url;
  } catch {
    setGooglePanel("Offline", "Start the Nexus server and check the saved server URL.");
  }
};

const saveMailCache = async (items, records = []) => {
  if (!items.length) {
    return;
  }
  await apiFetch("/api/mail/cache", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, records })
  });
};

const loadMailCache = async () => {
  try {
    const response = await apiFetch("/api/mail/cache");
    if (!response.ok) {
      return;
    }
    const data = await readApiJson(response);
    liveGoogleMail = data.items || [];
    setSourceHealth(
      "gmail",
      liveGoogleMail.length ? "cached" : "empty",
      data.updatedAt || lastGoogleSyncAt
    );
    renderMail();
  } catch {
    setSourceHealth("gmail", "offline");
    // A missing local server should not prevent the sample UI from loading.
  }
};

const applyLocalRecords = (data) => {
  liveTasks = Array.isArray(data.tasks) ? data.tasks : [];
  liveGoals = Array.isArray(data.goals) ? data.goals : [];
  localRecordState = "ready";
  setSourceHealth("local", "healthy", data.updatedAt);
  renderToday();
  renderGoals();
};

const loadLocalRecords = async () => {
  try {
    const response = await apiFetch("/api/local/records");
    const data = await readApiJson(response);
    if (!response.ok) {
      throw new Error(data.message || "Could not load local records.");
    }
    applyLocalRecords(data);
  } catch {
    localRecordState = "offline";
    setSourceHealth("local", "offline");
    renderToday();
    renderGoals();
  }
};

const inputTimestamp = (value) => {
  if (!value) {
    return null;
  }
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new TypeError("Enter a valid date and time.");
  }
  return timestamp.toISOString();
};

const submitLocalRecord = async (collection, form, messageElement) => {
  const formData = new FormData(form);
  messageElement.textContent = "Saving locally…";
  try {
    const body = {
      title: String(formData.get("title") || "").trim()
    };
    const dateField = collection === "tasks" ? "dueAt" : "targetAt";
    body[dateField] = inputTimestamp(formData.get(dateField));
    const response = await apiFetch(`/api/local/${collection}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await readApiJson(response);
    if (!response.ok) {
      throw new Error(data.errors?.[0]?.message || data.message || "Could not save local record.");
    }
    applyLocalRecords(data);
    form.reset();
    messageElement.textContent = collection === "tasks" ? "Task saved locally." : "Goal saved locally.";
  } catch (error) {
    localRecordState = "error";
    messageElement.textContent = error.message;
    renderToday();
  }
};

const updateLocalRecordStatus = async (collection, sourceId, status) => {
  const response = await apiFetch(
    `/api/local/${collection}/${encodeURIComponent(sourceId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    }
  );
  const data = await readApiJson(response);
  if (!response.ok) {
    throw new Error(data.errors?.[0]?.message || data.message || "Could not update local record.");
  }
  applyLocalRecords(data);
};

const loadGoogleData = async () => {
  if (googleLoadInProgress) {
    return;
  }

  googleLoadInProgress = true;
  const limit = document.getElementById("gmail-limit").value;
  const windowValue = document.getElementById("gmail-window").value;
  try {
    updateGoogleMonitor({
      label: "google.sync = loading",
      detail: "Reading Calendar and Gmail in read-only mode.",
      percent: 20
    });
    const [calendarResponse, gmailResponse] = await Promise.all([
      apiFetch("/api/google/calendar"),
      apiFetch(`/api/google/gmail?limit=${encodeURIComponent(limit)}&window=${encodeURIComponent(windowValue)}`)
    ]);
    const calendarData = await readApiJson(calendarResponse);
    const gmailData = await readApiJson(gmailResponse);
    if (!calendarResponse.ok || !gmailResponse.ok) {
      throw new Error(calendarData.message || gmailData.message || "Google sync failed.");
    }

    liveGoogleCalendar = calendarData.items || [];
    calendarState = "ready";
    const syncedAt = new Date().toISOString();
    localStorage.setItem("nexus-google-sync-at", syncedAt);
    setSourceHealth("google", "connected", syncedAt);
    setSourceHealth("calendar", liveGoogleCalendar.length ? "synced" : "empty", syncedAt);
    const incomingMail = gmailData.items || [];
    liveGoogleMail = mergeMailItems(liveGoogleMail, incomingMail);
    nextGmailPageToken = gmailData.nextPageToken || "";
    await saveMailCache(incomingMail, gmailData.records || []);
    setSourceHealth("gmail", incomingMail.length ? "synced" : "empty", syncedAt);
    renderCalendar();
    renderToday();
    renderMail();
    setGooglePanel("Loaded", `Loaded ${liveGoogleCalendar.length} events and ${liveGoogleMail.length} messages.`);
    updateGoogleMonitor({
      state: "done",
      label: "google.sync = complete",
      detail: "Google data loaded without automatic classification.",
      percent: 100
    });
  } catch (error) {
    calendarState = "error";
    setSourceHealth("calendar", "error");
    setSourceHealth("gmail", "error");
    renderCalendar();
    renderToday();
    updateGoogleMonitor({
      state: "error",
      label: "google.sync = failed",
      detail: error.message,
      percent: 100
    });
  } finally {
    googleLoadInProgress = false;
  }
};

const loadNextGmailBatch = async () => {
  if (googleLoadInProgress || !nextGmailPageToken) {
    return;
  }

  googleLoadInProgress = true;
  const limit = document.getElementById("gmail-limit").value;
  const windowValue = document.getElementById("gmail-window").value;
  try {
    const response = await apiFetch(
      `/api/google/gmail?limit=${encodeURIComponent(limit)}&window=${encodeURIComponent(windowValue)}&pageToken=${encodeURIComponent(nextGmailPageToken)}`
    );
    const data = await readApiJson(response);
    if (!response.ok) {
      throw new Error(data.message || "Could not load the next Gmail batch.");
    }
    const incoming = data.items || [];
    liveGoogleMail = mergeMailItems(liveGoogleMail, incoming);
    nextGmailPageToken = data.nextPageToken || "";
    await saveMailCache(incoming, data.records || []);
    renderMail();
  } finally {
    googleLoadInProgress = false;
  }
};

const queueCalendarCandidate = (messageId) => {
  const message = liveGoogleMail.find((item) => item.id === messageId);
  const candidate = message ? detectCalendarCandidate(message) : null;
  if (!candidate) {
    return;
  }
  sampleData.suggestions.unshift({
    title: `Possible calendar item: ${candidate.title}`,
    detail: `Nexus found "${candidate.dateText}". Calendar write access is disabled, so nothing was changed.`,
    action: "Review"
  });
  renderSuggestions();
};

const initApiBaseSetting = () => {
  const input = document.getElementById("nexus-api-base");
  input.value = getApiBase();
  document.getElementById("nexus-api-save").addEventListener("click", async () => {
    const nextBase = normalizeApiBase(input.value);
    input.value = nextBase;
    if (nextBase) {
      localStorage.setItem("nexus-api-base", nextBase);
    } else {
      localStorage.removeItem("nexus-api-base");
    }
    await checkGoogleStatus();
  });
};

const activateView = (view) => {
  document.querySelectorAll(".tab").forEach((item) =>
    item.classList.toggle("active", item.dataset.view === view));
  document.querySelectorAll(".view").forEach((item) =>
    item.classList.toggle("active", item.id === `view-${view}`));
  document.getElementById("page-title").textContent = viewTitles[view];
};

applyTheme(localStorage.getItem("nexus-theme") || "matrix");
startMatrixRain();
initApiBaseSetting();
renderToday();
renderSuggestions();
renderCalendar();
renderMail();
renderGoals();
renderEvents();
renderCalendarGrid();
renderSourceHealth();
checkGoogleStatus();
refreshResourceStatus();
loadMailCache();
loadLocalRecords();
window.setInterval(renderSourceHealth, 60_000);

document.getElementById("google-connect").addEventListener("click", connectGoogle);
document.getElementById("google-load").addEventListener("click", loadGoogleData);
document.getElementById("google-load-next").addEventListener("click", loadNextGmailBatch);
document.getElementById("resource-refresh").addEventListener("click", refreshResourceStatus);
document.getElementById("task-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submitLocalRecord("tasks", event.currentTarget, document.getElementById("task-message"));
});
document.getElementById("goal-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submitLocalRecord("goals", event.currentTarget, document.getElementById("goal-message"));
});
document.getElementById("focus-action").addEventListener("click", () => activateView("goals"));
document.getElementById("theme-toggle").addEventListener("click", () =>
  applyTheme(document.body.dataset.theme === "matrix" ? "neon" : "matrix"));
document.querySelector(".app-shell").addEventListener("click", async (event) => {
  const button = event.target.closest(".local-status-action");
  if (!button) {
    return;
  }
  button.disabled = true;
  try {
    await updateLocalRecordStatus(
      button.dataset.collection,
      button.dataset.sourceId,
      button.dataset.status
    );
  } catch (error) {
    localRecordState = "error";
    document.getElementById("task-message").textContent = error.message;
    renderToday();
    renderGoals();
  } finally {
    button.disabled = false;
  }
});
document.getElementById("email-list").addEventListener("click", (event) => {
  const button = event.target.closest(".queue-calendar");
  if (button) {
    queueCalendarCandidate(button.dataset.messageId);
  }
});
document.querySelectorAll(".tab").forEach((tab) =>
  tab.addEventListener("click", () => activateView(tab.dataset.view)));

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (isNativeApp()) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .then(() => window.caches?.keys())
        .then((keys = []) => Promise.all(keys.map((key) => window.caches.delete(key))))
        .catch(() => {
          // Native assets still load directly when cache cleanup is unavailable.
        });
      return;
    }

    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // Nexus remains usable without offline installation support.
    });
  });
}
