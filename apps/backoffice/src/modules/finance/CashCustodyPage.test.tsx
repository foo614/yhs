import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CashCustodyPage } from "./CashCustodyPage";

const emptyProps = {
  currentUser: null,
  customers: [],
  handovers: [],
  paymentLookup: [],
  onCreate: async () => {},
  onRequestHandover: async () => {},
  onRecordHandover: async () => {},
  onAccept: async () => {},
  onReject: async () => {}
};

describe("Cash custody register", () => {
  it("shows the register search, status filter, matching-count area, and empty state", () => {
    const markup = renderToStaticMarkup(createElement(CashCustodyPage, emptyProps));

    expect(markup).toContain("Search plate, customer, invoice, or reference");
    expect(markup).toContain("All statuses");
    expect(markup).toContain("0 records");
    expect(markup).toContain("No cash handovers yet.");
    expect(markup).toContain("Custody Register / ");
  });
});
