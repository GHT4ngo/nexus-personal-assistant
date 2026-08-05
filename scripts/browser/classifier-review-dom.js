const createTextElement = (document, tagName, text, className = null) => {
  const element = document.createElement(tagName);
  element.textContent = String(text);
  if (className) {
    element.setAttribute("class", className);
  }
  return element;
};

const setLabel = (document, input, text) => {
  const label = document.createElement("label");
  label.setAttribute("for", input.id);
  label.textContent = text;
  return label;
};

export const createClassifierReviewDomAdapter = ({
  document,
  root,
  onAction
} = {}) => {
  if (!document || typeof document.createElement !== "function") {
    throw new TypeError("Review DOM adapter requires a document.");
  }
  if (!root
    || typeof root.replaceChildren !== "function"
    || typeof root.addEventListener !== "function"
    || typeof root.removeEventListener !== "function") {
    throw new TypeError("Review DOM adapter requires a root element.");
  }
  if (typeof onAction !== "function") {
    throw new TypeError("Review DOM adapter requires an action handler.");
  }

  let attached = false;
  let liveRegion = null;
  let formItems = new WeakMap();
  let buttonActions = new WeakMap();
  let correctionInputs = new WeakMap();

  const announce = (message, role = "status") => {
    if (!liveRegion) {
      liveRegion = document.createElement("p");
      liveRegion.setAttribute("aria-live", "polite");
      liveRegion.setAttribute("aria-atomic", "true");
      root.append(liveRegion);
    }
    liveRegion.setAttribute("role", role === "error" ? "alert" : "status");
    liveRegion.setAttribute("data-tone", role === "error" ? "error" : "status");
    liveRegion.textContent = String(message);
  };

  const submit = (event) => {
    const target = formItems.get(event.target);
    const action = buttonActions.get(event.submitter);
    if (!target || !action) {
      return;
    }
    event.preventDefault();
    const correctionInput = correctionInputs.get(event.target);
    const correctedValue = action.decision === "correct"
      ? correctionInput?.value ?? null
      : null;
    let actionResult;
    try {
      actionResult = onAction({
        itemId: target.itemId,
        decision: action.decision,
        correctedValue
      });
    } catch {
      announce("The review action could not be completed.", "error");
      return;
    }
    Promise.resolve(actionResult).catch(() => {
      announce("The review action could not be completed.", "error");
    });
  };

  const attach = () => {
    if (attached) {
      return;
    }
    root.addEventListener("submit", submit);
    attached = true;
  };

  const actionForm = (item) => {
    const form = document.createElement("form");
    form.setAttribute("class", "classifier-review-actions");
    form.setAttribute("aria-label", `Review ${item.suggestionType} suggestion`);
    formItems.set(form, { itemId: item.itemId });

    const correction = item.actions.some((action) => action.requiresValue);
    if (correction) {
      const input = document.createElement("input");
      input.id = `${item.itemId}-correction`;
      input.setAttribute("name", "correctedValue");
      input.setAttribute("type", "text");
      input.setAttribute("autocomplete", "off");
      input.setAttribute("maxlength", "256");
      input.setAttribute("class", "classifier-review-correction");
      correctionInputs.set(form, input);
      form.append(setLabel(document, input, "Corrected value"), input);
    }

    const controls = document.createElement("div");
    controls.setAttribute("class", "classifier-review-controls");
    for (const action of item.actions) {
      const button = document.createElement("button");
      button.setAttribute("type", "submit");
      button.setAttribute("class", "classifier-review-action");
      button.textContent = action.label;
      buttonActions.set(button, { decision: action.decision });
      controls.append(button);
    }
    form.append(controls);
    return form;
  };

  const renderItem = (item) => {
    const article = document.createElement("article");
    article.setAttribute("class", "classifier-review-item");
    article.setAttribute("data-status", item.status);

    const heading = createTextElement(
      document,
      "h3",
      `${item.suggestionType}: ${item.value}`
    );
    const metadata = document.createElement("dl");
    metadata.setAttribute("class", "classifier-review-metadata");
    for (const [term, value] of [
      ["Confidence", item.confidence],
      ["Evidence", item.evidence],
      ["Status", item.status]
    ]) {
      metadata.append(
        createTextElement(document, "dt", term),
        createTextElement(document, "dd", value)
      );
    }
    if (item.effectiveValue !== null && item.effectiveValue !== undefined) {
      metadata.append(
        createTextElement(document, "dt", "Effective value"),
        createTextElement(document, "dd", item.effectiveValue)
      );
    }
    article.append(heading, metadata);
    if (item.actions.length > 0) {
      article.append(actionForm(item));
    }
    return article;
  };

  const render = (model) => {
    attach();
    formItems = new WeakMap();
    buttonActions = new WeakMap();
    correctionInputs = new WeakMap();

    const container = document.createElement("section");
    container.setAttribute("class", "classifier-review");
    container.setAttribute("aria-labelledby", "classifier-review-heading");
    const heading = createTextElement(document, "h1", model.heading);
    heading.id = "classifier-review-heading";
    const description = createTextElement(document, "p", model.description);
    const summary = createTextElement(
      document,
      "p",
      `${model.summary.pending} pending, ${model.summary.abstained} uncertain, `
        + `${model.summary.resolved} reviewed`,
      "classifier-review-summary"
    );
    container.append(heading, description, summary);

    for (const section of model.sections) {
      const sectionElement = document.createElement("section");
      const headingId = `classifier-review-${section.key}-heading`;
      sectionElement.setAttribute("aria-labelledby", headingId);
      const sectionHeading = createTextElement(
        document,
        "h2",
        `${section.heading} (${section.count})`
      );
      sectionHeading.id = headingId;
      sectionElement.append(
        sectionHeading,
        createTextElement(document, "p", section.description)
      );
      for (const item of section.items) {
        sectionElement.append(renderItem(item));
      }
      container.append(sectionElement);
    }

    liveRegion = document.createElement("p");
    liveRegion.setAttribute("role", "status");
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("aria-atomic", "true");
    liveRegion.setAttribute("class", "classifier-review-announcement");
    container.append(liveRegion);
    root.replaceChildren(container);
  };

  const clear = () => {
    if (attached) {
      root.removeEventListener("submit", submit);
      attached = false;
    }
    formItems = new WeakMap();
    buttonActions = new WeakMap();
    correctionInputs = new WeakMap();
    liveRegion = null;
    root.replaceChildren();
  };

  return Object.freeze({
    render,
    announce,
    clear
  });
};
