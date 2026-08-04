export const plainTextMime = [
  "From: Synthetic Sender <sender@example.test>",
  "To: recipient@example.test",
  "Subject: Synthetic plain message",
  "Date: Mon, 03 Aug 2026 10:00:00 +0000",
  "List-Unsubscribe: <https://example.test/unsubscribe/synthetic-private-token>",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "This is a synthetic plain-text message."
].join("\r\n");

export const htmlMime = [
  "From: HTML Sender <html@example.test>",
  "To: recipient@example.test",
  "Subject: Synthetic HTML message",
  "Date: Mon, 03 Aug 2026 11:00:00 +0000",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<html><body><p>Synthetic <strong>HTML</strong> content.</p></body></html>"
].join("\r\n");

export const attachmentMime = [
  "From: Attachment Sender <attachment@example.test>",
  "To: recipient@example.test",
  "Subject: Synthetic attachment",
  "Date: Mon, 03 Aug 2026 12:00:00 +0000",
  "Content-Type: multipart/mixed; boundary=\"synthetic-boundary\"",
  "",
  "--synthetic-boundary",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "A synthetic attachment is included.",
  "--synthetic-boundary",
  "Content-Type: application/pdf; name=\"synthetic.pdf\"",
  "Content-Disposition: attachment; filename=\"synthetic.pdf\"",
  "Content-Transfer-Encoding: base64",
  "",
  "U3ludGhldGljIGZpbGU=",
  "--synthetic-boundary--"
].join("\r\n");
