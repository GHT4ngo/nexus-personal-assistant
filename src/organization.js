export const latestOrganizationDecision = (reviews, recordId) =>
  reviews
    .filter((review) => review.subjectRecordId === recordId)
    .sort((left, right) => left.decidedAt.localeCompare(right.decidedAt))
    .at(-1)?.decision || "";

export const organizeTodayItems = (items, reviews) => {
  const organized = items.map((item) => ({
    ...item,
    organization: latestOrganizationDecision(reviews, item.recordId)
  }));
  const visible = organized
    .filter((item) => !["dismiss", "review-later"].includes(item.organization))
    .sort((left, right) => {
      if ((left.organization === "pin") !== (right.organization === "pin")) {
        return left.organization === "pin" ? -1 : 1;
      }
      return new Date(left.sortAt || 0) - new Date(right.sortAt || 0);
    });
  return {
    visible,
    reviewLater: organized.filter((item) => item.organization === "review-later"),
    dismissed: organized.filter((item) => item.organization === "dismiss")
  };
};
