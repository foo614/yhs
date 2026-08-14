import { describe, expect, it } from "vitest";
import { filterHrRecords, paginateHrRecords, withHrRecordFilterValue } from "./HrSalaryPage";

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
});
