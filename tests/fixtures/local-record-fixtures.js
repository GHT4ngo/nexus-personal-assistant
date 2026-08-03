export const LOCAL_NOW = "2026-08-03T19:00:00.000Z";
export const MESSAGE_RECORD_ID = "gmail:synthetic-message-001";

export const signalFixture = {
  sourceId: "signal-synthetic-deadline",
  title: "Synthetic deadline signal",
  subjectRecordId: MESSAGE_RECORD_ID,
  signalType: "date",
  evidence: ["The invented assignment is due on 6 August."],
  value: "2026-08-06",
  observedAt: LOCAL_NOW,
  normalizedAt: LOCAL_NOW
};

export const taskFixture = {
  sourceId: "task-synthetic-reading",
  title: "Read the synthetic chapter",
  dueAt: "2026-08-06T16:00:00.000Z",
  relatedRecordIds: [MESSAGE_RECORD_ID],
  createdAt: LOCAL_NOW,
  normalizedAt: LOCAL_NOW
};

export const goalFixture = {
  sourceId: "goal-synthetic-semester",
  title: "Prepare for the synthetic semester",
  targetAt: "2026-08-20T08:00:00.000Z",
  relatedRecordIds: [],
  createdAt: LOCAL_NOW,
  normalizedAt: LOCAL_NOW
};

export const reviewDecisionFixture = {
  sourceId: "review-synthetic-deadline",
  title: "Review synthetic deadline",
  subjectRecordId: "nexus:signal-synthetic-deadline",
  decision: "accept",
  decidedAt: LOCAL_NOW,
  normalizedAt: LOCAL_NOW
};

export const approvalRequestFixture = {
  sourceId: "approval-synthetic-task",
  title: "Approve synthetic task update",
  targetRecordId: "local:task-synthetic-reading",
  actionType: "task.complete",
  status: "pending",
  requestedAt: LOCAL_NOW,
  normalizedAt: LOCAL_NOW
};

export const actionHistoryFixture = {
  sourceId: "action-synthetic-task",
  title: "Synthetic task update completed",
  targetRecordId: "local:task-synthetic-reading",
  actionType: "task.complete",
  outcome: "succeeded",
  reversible: true,
  occurredAt: LOCAL_NOW,
  normalizedAt: LOCAL_NOW
};
