import assert from "node:assert/strict";
import test from "node:test";

import {
  createClassifierReviewDomAdapter
} from "../scripts/browser/classifier-review-dom.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.id = "";
    this.value = "";
    this._textContent = "";
    this.listeners = new Map();
    this.innerHtmlWrites = 0;
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join("");
  }

  set innerHTML(_value) {
    this.innerHtmlWrites += 1;
    throw new Error("innerHTML must not be used");
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
    this._textContent = "";
  }

  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name, listener) {
    const listeners = this.listeners.get(name) || [];
    this.listeners.set(name, listeners.filter((item) => item !== listener));
  }

  dispatch(name, event) {
    for (const listener of this.listeners.get(name) || []) {
      listener(event);
    }
  }
}

const document = {
  created: [],
  createElement(tagName) {
    const element = new FakeElement(tagName);
    this.created.push(element);
    return element;
  }
};

const walk = (element) => [
  element,
  ...element.children.flatMap((child) => walk(child))
];

const MODEL = {
  heading: "Classifier review",
  description: "Suggestions remain separate from decisions.",
  summary: { total: 2, pending: 1, abstained: 1, resolved: 0 },
  sections: [
    {
      key: "pending",
      heading: "Suggestions to review",
      description: "Awaiting a decision.",
      count: 1,
      items: [{
        itemId: "classifier-review-item-1",
        suggestionType: "topic",
        value: "school",
        confidence: "94% confidence",
        evidence: "Supporting evidence is available",
        status: "pending",
        effectiveValue: null,
        actions: [
          { decision: "accept", label: "Accept suggestion", requiresValue: false },
          { decision: "correct", label: "Correct suggestion", requiresValue: true },
          { decision: "dismiss", label: "Dismiss suggestion", requiresValue: false },
          {
            decision: "not-enough-information",
            label: "Not enough information",
            requiresValue: false
          }
        ]
      }]
    },
    {
      key: "abstained",
      heading: "Not enough information",
      description: "The classifier did not guess.",
      count: 1,
      items: [{
        itemId: "classifier-review-item-2",
        suggestionType: "urgency",
        value: "No value suggested",
        confidence: "0% confidence",
        evidence: "No supporting evidence is available",
        status: "abstained",
        effectiveValue: null,
        actions: [
          { decision: "correct", label: "Correct suggestion", requiresValue: true },
          { decision: "dismiss", label: "Dismiss suggestion", requiresValue: false },
          {
            decision: "not-enough-information",
            label: "Not enough information",
            requiresValue: false
          }
        ]
      }]
    },
    {
      key: "resolved",
      heading: "Reviewed suggestions",
      description: "Prior decisions.",
      count: 0,
      items: []
    }
  ]
};

const createHarness = ({ onAction = async () => {} } = {}) => {
  document.created = [];
  const root = new FakeElement("main");
  const calls = [];
  const adapter = createClassifierReviewDomAdapter({
    document,
    root,
    onAction: async (action) => {
      calls.push(action);
      return await onAction(action);
    }
  });
  return { adapter, root, calls };
};

test("creates labelled native controls and live status without innerHTML", () => {
  const { adapter, root } = createHarness();
  adapter.render(MODEL);
  const elements = walk(root);

  assert.equal(elements.filter((element) => element.tagName === "H1").length, 1);
  assert.equal(elements.filter((element) => element.tagName === "H2").length, 3);
  assert.equal(elements.filter((element) => element.tagName === "FORM").length, 2);
  assert.equal(elements.filter((element) => element.tagName === "INPUT").length, 2);
  assert.equal(elements.filter((element) => element.tagName === "BUTTON").length, 7);
  assert.equal(
    elements.every((element) => element.innerHtmlWrites === 0),
    true
  );
  for (const button of elements.filter((element) => element.tagName === "BUTTON")) {
    assert.equal(button.getAttribute("type"), "submit");
  }
  for (const input of elements.filter((element) => element.tagName === "INPUT")) {
    const label = elements.find((element) =>
      element.tagName === "LABEL"
      && element.getAttribute("for") === input.id);
    assert.ok(label);
    assert.equal(input.getAttribute("type"), "text");
    assert.equal(input.getAttribute("autocomplete"), "off");
  }
  const live = elements.find((element) =>
    element.getAttribute("aria-live") === "polite");
  assert.ok(live);
  assert.equal(live.getAttribute("role"), "status");
  assert.equal(root.listeners.get("submit").length, 1);
});

test("treats hostile values as text and never creates injected elements", () => {
  const { adapter, root } = createHarness();
  const hostile = structuredClone(MODEL);
  hostile.sections[0].items[0].value =
    "<img src=x onerror=globalThis.compromised=true>";
  hostile.sections[0].items[0].actions[0].label =
    "<script>globalThis.compromised=true</script>";
  adapter.render(hostile);
  const elements = walk(root);

  assert.equal(elements.some((element) => element.tagName === "IMG"), false);
  assert.equal(elements.some((element) => element.tagName === "SCRIPT"), false);
  assert.match(root.textContent, /<img src=x onerror=/);
  assert.match(root.textContent, /<script>globalThis\.compromised/);
  assert.equal(
    elements.every((element) => element.innerHtmlWrites === 0),
    true
  );
});

test("delegates native form submissions with private mapped actions", async () => {
  const { adapter, root, calls } = createHarness();
  adapter.render(MODEL);
  const elements = walk(root);
  const form = elements.find((element) =>
    element.tagName === "FORM"
    && element.getAttribute("aria-label") === "Review topic suggestion");
  const input = form.children.find((element) => element.tagName === "INPUT");
  const correct = walk(form).find((element) =>
    element.tagName === "BUTTON"
    && element.textContent === "Correct suggestion");
  input.value = "study";
  let prevented = false;
  root.dispatch("submit", {
    target: form,
    submitter: correct,
    preventDefault: () => {
      prevented = true;
    }
  });
  await Promise.resolve();

  assert.equal(prevented, true);
  assert.deepEqual(calls, [{
    itemId: "classifier-review-item-1",
    decision: "correct",
    correctedValue: "study"
  }]);
});

test("ignores forged and stale event targets", async () => {
  const { adapter, root, calls } = createHarness();
  adapter.render(MODEL);
  let prevented = false;
  root.dispatch("submit", {
    target: new FakeElement("form"),
    submitter: new FakeElement("button"),
    preventDefault: () => {
      prevented = true;
    }
  });
  await Promise.resolve();

  assert.equal(prevented, false);
  assert.deepEqual(calls, []);
});

test("replaces prior rendering without accumulating delegated listeners", () => {
  const { adapter, root } = createHarness();
  adapter.render(MODEL);
  const firstContainer = root.children[0];
  adapter.render(MODEL);

  assert.equal(root.children.length, 1);
  assert.notEqual(root.children[0], firstContainer);
  assert.equal(root.listeners.get("submit").length, 1);
});

test("announces sanitized status and action failures in a live region", async () => {
  const { adapter, root } = createHarness({
    onAction: async () => {
      throw new Error("private provider detail");
    }
  });
  adapter.render(MODEL);
  adapter.announce("Review decision saved.", "status");
  let elements = walk(root);
  let live = elements.find((element) =>
    element.getAttribute("class") === "classifier-review-announcement");
  assert.equal(live.textContent, "Review decision saved.");
  assert.equal(live.getAttribute("role"), "status");

  const form = elements.find((element) => element.tagName === "FORM");
  const button = walk(form).find((element) => element.tagName === "BUTTON");
  root.dispatch("submit", {
    target: form,
    submitter: button,
    preventDefault() {}
  });
  await new Promise((resolve) => setImmediate(resolve));
  elements = walk(root);
  live = elements.find((element) =>
    element.getAttribute("class") === "classifier-review-announcement");
  assert.equal(live.textContent, "The review action could not be completed.");
  assert.equal(live.getAttribute("role"), "alert");
  assert.equal(root.textContent.includes("private provider detail"), false);
});

test("sanitizes synchronous action-handler exceptions", () => {
  const root = new FakeElement("main");
  const adapter = createClassifierReviewDomAdapter({
    document,
    root,
    onAction: () => {
      throw new Error("private synchronous detail");
    }
  });
  adapter.render(MODEL);
  const elements = walk(root);
  const form = elements.find((element) => element.tagName === "FORM");
  const button = walk(form).find((element) => element.tagName === "BUTTON");

  assert.doesNotThrow(() => root.dispatch("submit", {
    target: form,
    submitter: button,
    preventDefault() {}
  }));
  const live = walk(root).find((element) =>
    element.getAttribute("class") === "classifier-review-announcement");
  assert.equal(live.textContent, "The review action could not be completed.");
  assert.equal(root.textContent.includes("private synchronous detail"), false);
});

test("clear removes content, mappings, and the delegated listener idempotently", async () => {
  const { adapter, root, calls } = createHarness();
  adapter.render(MODEL);
  const elements = walk(root);
  const form = elements.find((element) => element.tagName === "FORM");
  const button = walk(form).find((element) => element.tagName === "BUTTON");
  adapter.clear();
  adapter.clear();
  root.dispatch("submit", {
    target: form,
    submitter: button,
    preventDefault() {}
  });
  await Promise.resolve();

  assert.equal(root.children.length, 0);
  assert.equal(root.listeners.get("submit").length, 0);
  assert.deepEqual(calls, []);
});

test("requires explicit document, root, and action adapters", () => {
  assert.throws(
    () => createClassifierReviewDomAdapter(),
    /requires a document/
  );
  assert.throws(
    () => createClassifierReviewDomAdapter({ document }),
    /root element/
  );
  assert.throws(
    () => createClassifierReviewDomAdapter({
      document,
      root: new FakeElement("main")
    }),
    /action handler/
  );
});
