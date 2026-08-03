export const formatSyncAge = (value, now = Date.now()) => {
  if (!value) {
    return "never";
  }
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "unknown";
  }
  const elapsed = Math.max(0, now - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
};

export const sourceHealthSummary = (sources) => {
  const values = Object.values(sources);
  if (values.some((source) =>
    ["offline", "error", "disconnected", "setup-needed"].includes(source.status))) {
    return "Attention";
  }
  if (values.some((source) => ["checking", "not-loaded"].includes(source.status))) {
    return "Checking";
  }
  return "Healthy";
};
