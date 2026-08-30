import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import dayjs from "dayjs";
import { calendarAvailabilityCellItems, datePickerValueToDateString, filterHrRecords, groupCalendarAvailabilityByDate, HrRecordFilterControls, leavePolicyTableConfig, paginateHrRecords, payPeriodDefaults, payPeriodFromValues, shouldShowOptionalMcUpload, withHrRecordFilterValue } from "./HrSalaryPage";

describe("HR record list helpers", () => {
  const records = [
    { label: "Alicia Tan annual leave", status: "Pending" },
    { label: "Ben Lim medical leave", status: "Approved" },
    { label: "Alicia Tan attendance", status: "Present" }
  ];

  it("applies keyword and status filters to the same record set", () => {
    expect(filterHrRecords(records, { keyword: " alicia " }, (record) => record.label, (record) => record.status))
      .toEqual([records[0], records[2]]);
    expect(filterHrRecords(records, { keyword: "leave", status: "Approved" }, (record) => record.label, (record) => record.status))
      .toEqual([records[1]]);
  });

  it("clamps an out-of-range page and returns eight records per page by default", () => {
    const page = paginateHrRecords(Array.from({ length: 10 }, (_, index) => index + 1), 9);

    expect(page.current).toBe(2);
    expect(page.items).toEqual([9, 10]);
    expect(paginateHrRecords(records, 0).current).toBe(1);
  });

  it("preserves spaces while a multi-word keyword is being typed", () => {
    expect(withHrRecordFilterValue({}, "keyword", "Alicia ")).toEqual({ keyword: "Alicia " });
    expect(withHrRecordFilterValue({ keyword: "Alicia " }, "keyword", "Alicia T")).toEqual({ keyword: "Alicia T" });
  });

  it("keeps the keyword input visible and connected to the filtered count", () => {
    const markup = renderToStaticMarkup(createElement(HrRecordFilterControls, {
      filters: { keyword: "Alicia" },
      total: 3,
      filtered: 2,
      keywordPlaceholder: "Search staff or date",
      statusOptions: [{ value: "Present", label: "Present" }],
      onKeywordChange: () => {},
      onStatusChange: () => {},
      onClear: () => {}
    }));

    expect(markup).toContain('placeholder="Search staff or date"');
    expect(markup).toContain("2 of 3 matching");
    expect(markup).toContain("Clear filters");
  });

  it("keeps policy editing to the existing rows and disables row creation", () => {
    expect(leavePolicyTableConfig).toEqual({
      search: false,
      options: false,
      pagination: false,
      recordCreatorProps: false
    });
  });

  it("formats month and date picker values into the existing pay-period contract", () => {
    const period = payPeriodFromValues({
      payPeriod: dayjs("2026-06-01"),
      startDate: dayjs("2026-06-01"),
      endDate: dayjs("2026-06-30"),
      workingDays: 22
    });

    expect(period).toMatchObject({
      name: "June 2026",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      workingDays: 22
    });
    expect(datePickerValueToDateString("2026-07-01")).toBe("2026-07-01");
  });

  it("fills the selected month's boundaries and Monday-to-Friday working days", () => {
    const defaults = payPeriodDefaults(dayjs("2026-02-14"));

    expect(defaults.payPeriod.format("YYYY-MM-DD")).toBe("2026-02-01");
    expect(defaults.startDate.format("YYYY-MM-DD")).toBe("2026-02-01");
    expect(defaults.endDate.format("YYYY-MM-DD")).toBe("2026-02-28");
    expect(defaults.workingDays).toBe(20);
  });

  it("shows the optional MC picker only for medical leave", () => {
    expect(shouldShowOptionalMcUpload("MedicalLeave")).toBe(true);
    expect(shouldShowOptionalMcUpload("AnnualLeave")).toBe(false);
  });

  it("groups multiple unavailable staff into the same calendar date", () => {
    const grouped = groupCalendarAvailabilityByDate([
      { staffUserId: "staff-1", staffName: "Jason Tan", date: "2026-08-05", status: "Unavailable" },
      { staffUserId: "staff-2", staffName: "Mei Ling", date: "2026-08-05", status: "Unavailable" },
      { staffUserId: "staff-1", staffName: "Jason Tan", date: "2026-08-12", status: "Unavailable" }
    ]);

    expect(grouped.get("2026-08-05")?.map((event) => event.staffName)).toEqual(["Jason Tan", "Mei Ling"]);
    expect(grouped.get("2026-08-12")?.map((event) => event.staffName)).toEqual(["Jason Tan"]);
  });

  it("caps calendar cell content and reports additional unavailable staff", () => {
    const events = [
      { staffUserId: "staff-1", staffName: "Jason Tan", date: "2026-08-05", status: "Unavailable" as const },
      { staffUserId: "staff-2", staffName: "Mei Ling", date: "2026-08-05", status: "Unavailable" as const },
      { staffUserId: "staff-3", staffName: "Ah Ming", date: "2026-08-05", status: "Unavailable" as const }
    ];

    expect(calendarAvailabilityCellItems(events)).toEqual({
      visibleEvents: events.slice(0, 2),
      remainingCount: 1
    });
  });
});
