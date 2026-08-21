import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const adapterSource = fs.readFileSync(new URL("./nginx/ops-subpath-navigation.js", import.meta.url), "utf8");
const historyCalls = [];
const listeners = new Map();
const mutationObservers = [];
const history = {
  pushState(...args) {
    historyCalls.push(["pushState", ...args]);
  },
  replaceState(...args) {
    historyCalls.push(["replaceState", ...args]);
  }
};
const location = {
  href: "https://yshenghub.com.my/traces/detail/initial-trace?spanId=initial-span",
  origin: "https://yshenghub.com.my"
};
const dispatchedEvents = [];
const document = {
  documentElement: {},
  querySelectorAll() {
    return [];
  }
};
const window = {
  addEventListener(type, listener, capture) {
    listeners.set(type, { listener, capture });
  },
  dispatchEvent(event) {
    dispatchedEvents.push(event);
  },
  history,
  location
};
class PopStateEvent {
  constructor(type, init) {
    this.state = init.state;
    this.type = type;
  }
}
class MutationObserver {
  constructor(callback) {
    this.callback = callback;
    mutationObservers.push(this);
  }

  observe(target, options) {
    this.target = target;
    this.options = options;
  }
}

vm.runInNewContext(adapterSource, { MutationObserver, PopStateEvent, URL, document, history, window });
assert.deepEqual(historyCalls[0], ["replaceState", null, "", "/ops/traces/detail/initial-trace?spanId=initial-span"]);

for (const [route, expected] of [
  ["/", "/ops/"],
  ["/resources/api", "/ops/resources/api"],
  ["/consolelogs/api", "/ops/consolelogs/api"],
  ["/structuredlogs", "/ops/structuredlogs"],
  ["/traces/detail/trace-id?spanId=span-id#waterfall", "/ops/traces/detail/trace-id?spanId=span-id#waterfall"],
  ["/metrics", "/ops/metrics"]
]) {
  history.pushState(null, "", route);
  assert.equal(historyCalls.at(-1)[3], expected);
}

history.pushState(null, "", "/ops/metrics");
assert.equal(historyCalls.at(-1)[3], "/ops/metrics");

history.pushState(null, "", "/api/auth/me");
assert.equal(historyCalls.at(-1)[3], "/api/auth/me");

history.replaceState(null, "", "/dashboard");
assert.equal(historyCalls.at(-1)[3], "/dashboard");

history.pushState(null, "", "https://example.com/traces");
assert.equal(historyCalls.at(-1)[3], "https://example.com/traces");

const traceAnchor = {
  href: "/traces/detail/trace-id",
  target: "",
  getAttribute(name) {
    return name === "href" ? this.href : null;
  },
  hasAttribute() {
    return false;
  },
  setAttribute(name, value) {
    if (name === "href") {
      this.href = value;
    }
  }
};
assert.equal(mutationObservers.length, 1);
assert.equal(mutationObservers[0].target, document.documentElement);
assert.equal(mutationObservers[0].options.attributes, true);
assert.equal(mutationObservers[0].options.childList, true);
assert.equal(mutationObservers[0].options.subtree, true);
mutationObservers[0].callback([{
  addedNodes: [{
    matches: () => true,
    getAttribute: traceAnchor.getAttribute.bind(traceAnchor),
    setAttribute: traceAnchor.setAttribute.bind(traceAnchor)
  }],
  type: "childList"
}]);
assert.equal(traceAnchor.href, "/ops/traces/detail/trace-id");
traceAnchor.href = "/traces/detail/trace-id";

const clickRegistration = listeners.get("click");
assert.equal(clickRegistration.capture, true);
let clickPrevented = false;
let clickStopped = false;
clickRegistration.listener({
  altKey: false,
  button: 0,
  ctrlKey: false,
  defaultPrevented: true,
  metaKey: false,
  preventDefault() {
    clickPrevented = true;
  },
  shiftKey: false,
  stopImmediatePropagation() {
    clickStopped = true;
  },
  target: { closest: () => traceAnchor }
});
assert.equal(traceAnchor.href, "/ops/traces/detail/trace-id");
assert.equal(clickPrevented, true);
assert.equal(clickStopped, true);
assert.equal(historyCalls.at(-1)[3], "/ops/traces/detail/trace-id");
assert.equal(dispatchedEvents.at(-1).type, "popstate");
assert.equal(dispatchedEvents.at(-1).state, null);

clickRegistration.listener({
  altKey: false,
  button: 0,
  ctrlKey: false,
  defaultPrevented: false,
  metaKey: false,
  preventDefault() {},
  shiftKey: false,
  stopImmediatePropagation() {},
  target: { closest: () => traceAnchor }
});
assert.equal(historyCalls.at(-1)[3], "/ops/traces/detail/trace-id");
assert.equal(dispatchedEvents.at(-1).type, "popstate");

console.log("Aspire /ops subpath navigation adapter tests passed.");
