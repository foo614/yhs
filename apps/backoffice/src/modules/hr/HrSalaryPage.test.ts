import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import { datePickerValueToDateString, filterHrRecords, leavePolicyTableConfig, paginateHrRecords, payPeriodFromValues, withHrRecordFilterValue } from "./HrSalaryPage";

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
});
