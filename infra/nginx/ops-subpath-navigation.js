(() => {
  "use strict";

  const opsBasePath = "/ops";
  const dashboardRouteRoots = [
    "/resources",
    "/consolelogs",
    "/structuredlogs",
    "/traces",
    "/metrics"
  ];

  function isDashboardPath(pathname) {
    return pathname === "/" || dashboardRouteRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
  }

  function rebaseDashboardUrl(value) {
    if (value === null || value === undefined) {
      return value;
    }

    const originalValue = String(value);
    let url;
    try {
      url = new URL(originalValue, window.location.href);
    } catch {
      return value;
    }

    if (url.origin !== window.location.origin || url.pathname === opsBasePath || url.pathname.startsWith(`${opsBasePath}/`) || !isDashboardPath(url.pathname)) {
      return value;
    }

    return `${opsBasePath}${url.pathname}${url.search}${url.hash}`;
  }

  for (const methodName of ["pushState", "replaceState"]) {
    const originalMethod = window.history[methodName].bind(window.history);
    window.history[methodName] = (state, unused, url) => originalMethod(state, unused, rebaseDashboardUrl(url));
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const anchor = event.target.closest?.("a[href]");
    if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) {
      return;
    }

    const originalHref = anchor.getAttribute("href");
    const rebasedHref = rebaseDashboardUrl(originalHref);
    if (rebasedHref !== originalHref) {
      anchor.setAttribute("href", rebasedHref);
    }
  }, true);
})();
