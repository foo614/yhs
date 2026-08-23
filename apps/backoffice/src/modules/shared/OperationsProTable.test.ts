import { describe, expect, it } from "vitest";
import type { ColumnsType } from "antd/es/table";
import { ensureColumnFilters } from "./OperationsProTable";

type Row = {
  id: string;
  status: string;
  staff: { name: string };
  createdAt: string;
};

describe("ensureColumnFilters", () => {
  it("adds searchable client-side filters to operational data columns", () => {
    const columns: ColumnsType<Row> = [
      { title: "Status", dataIndex: "status" },
      { title: "Staff", dataIndex: ["staff", "name"] },
      { title: "Created", dataIndex: "createdAt" }
    ];
    const filteredColumns = ensureColumnFilters(columns, [
      { id: "1", status: "Pending", staff: { name: "Aisyah" }, createdAt: "2026-08-01" },
      { id: "2", status: "Approved", staff: { name: "Aisyah" }, createdAt: "2026-08-02" }
    ]);

    const statusColumn = filteredColumns?.[0] as Exclude<ColumnsType<Row>[number], { children: ColumnsType<Row> }>;
    const staffColumn = filteredColumns?.[1] as Exclude<ColumnsType<Row>[number], { children: ColumnsType<Row> }>;
    const createdAtColumn = filteredColumns?.[2] as Exclude<ColumnsType<Row>[number], { children: ColumnsType<Row> }>;

    expect(statusColumn.filters).toEqual([
      { text: "Approved", value: "Approved" },
      { text: "Pending", value: "Pending" }
    ]);
    expect(staffColumn.filters).toEqual([{ text: "Aisyah", value: "Aisyah" }]);
    expect(createdAtColumn.filters).toBeUndefined();
    expect(statusColumn.onFilter?.("Approved", { id: "2", status: "Approved", staff: { name: "Aisyah" }, createdAt: "2026-08-02" })).toBe(true);
  });
});
