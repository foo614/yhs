import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { eventsOnDate, operationsCalendarEventDetail, SelectedDayEvents, shouldOpenCalendarDayDrawer } from "./OperationsCalendar";
import type { OperationsCalendarEvent } from "../../api";

describe("shared operations calendar", () => {
  const events: OperationsCalendarEvent[] = [
    { id: "delivery", kind: "Delivery", title: "TEST 1", startDate: "2026-09-06", endDate: "2026-09-06", time: "10:00", status: "Scheduled" },
    { id: "busy", kind: "Busy", title: "Staff", startDate: "2026-09-05", endDate: "2026-09-07", time: null, status: null }
  ];
  it("includes deliveries and availability on the selected day", () => { expect(eventsOnDate(events, "2026-09-06")).toEqual(events); });
  it("includes both boundaries of multi-day availability", () => { expect(eventsOnDate(events, "2026-09-05")).toEqual([events[1]]); expect(eventsOnDate(events, "2026-09-07")).toEqual([events[1]]); });
  it("does not show events outside their dates", () => { expect(eventsOnDate(events, "2026-09-08")).toEqual([]); });
  it("shows delivery status while preserving privacy for busy availability", () => {
    expect(operationsCalendarEventDetail(events[0])).toEqual({ time: "10:00", status: "Scheduled" });
    expect(operationsCalendarEventDetail(events[1])).toEqual({ time: "2026-09-05 – 2026-09-07", status: undefined });
  });
  it("opens the mobile drawer only after a date choice, not month or year navigation", () => {
    expect(shouldOpenCalendarDayDrawer("date", true)).toBe(true);
    expect(shouldOpenCalendarDayDrawer("month", true)).toBe(false);
    expect(shouldOpenCalendarDayDrawer("year", true)).toBe(false);
    expect(shouldOpenCalendarDayDrawer("date", false)).toBe(false);
  });
  it("shows the exact-delivery action only when a parent authorizes it", () => {
    const readonly = renderToStaticMarkup(createElement(SelectedDayEvents, { events }));
    const authorized = renderToStaticMarkup(createElement(SelectedDayEvents, { events, onOpenDelivery: () => {} }));

    expect(readonly).not.toContain("Open delivery");
    expect(authorized).toContain("Open delivery");
  });
});
