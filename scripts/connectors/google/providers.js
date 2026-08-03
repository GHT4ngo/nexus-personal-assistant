const gmailWindowQuery = (window) => ({
  "14d": "newer_than:14d",
  "30d": "newer_than:30d",
  "90d": "newer_than:90d",
  all: ""
})[window] || "newer_than:14d";

const mapWithConcurrency = async (items, limit, task) => {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await task(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
};

export const fetchGoogleCalendarEvents = async ({
  googleFetch,
  now = new Date(),
  maxResults = 10
}) => {
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("timeMin", now.toISOString());

  const result = await googleFetch(url);
  if (result.status >= 400) {
    return result;
  }

  return {
    status: result.status,
    data: result.data,
    items: (result.data.items || []).map((item) => ({
      id: item.id,
      title: item.summary || "Untitled event",
      description: item.description || "",
      start: item.start?.dateTime || item.start?.date,
      end: item.end?.dateTime || item.end?.date,
      location: item.location || "",
      htmlLink: item.htmlLink || null,
      source: "google-calendar"
    }))
  };
};

export const fetchGmailMessages = async ({
  googleFetch,
  requestedLimit,
  fetchLimit,
  pageToken,
  window = "14d",
  concurrency = 2,
  mapMessage
}) => {
  const maxResults = Math.min(Math.max(requestedLimit, 10), fetchLimit);
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("q", `${gmailWindowQuery(window)} -category:promotions -in:chats`.trim());
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }

  const result = await googleFetch(url);
  if (result.status >= 400) {
    return { ...result, maxResults, messages: [] };
  }

  const providerMessages = (result.data.messages || []).slice(0, maxResults);
  const messages = await mapWithConcurrency(
    providerMessages,
    Math.max(1, concurrency),
    mapMessage
  );
  return {
    status: result.status,
    data: result.data,
    maxResults,
    messages,
    nextPageToken: result.data.nextPageToken || ""
  };
};
