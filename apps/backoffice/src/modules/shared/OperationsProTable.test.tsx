import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ColumnsType } from "antd/es/table";
import { OperationsProTable, addOperationsColumnFilters, filterOperationsTableData, filterOperationsTableDataByFields, matchesOperationsTableSearch } from "./OperationsProTable";

describe("OperationsProTable column filters", () => {
  type Row = {
    id: string;
    status: string;
    amount: number;
    createdAt: string;
    description: string;
  };

  it("only adds opt-in low-cardinality status filters", () => {
    const columns: ColumnsType<Row> = [
      { title: "Status", dataIndex: "status" },
      { title: "Amount", dataIndex: "amount" },
      { title: "Created", dataIndex: "createdAt" },
      { title: "Description", dataIndex: "description" }
    ];

    const filtered = addOperationsColumnFilters(columns, [
      { id: "1", status: "Open", amount: 100, createdAt: "2026-08-01", description: "Repair" },
      { id: "2", status: "Done", amount: 200, createdAt: "2026-08-02", description: "Repair" }
    ]);

    expect(filtered?.[0]).toHaveProperty("filters");
    expect(filtered?.[1]).not.toHaveProperty("filters");
    expect(filtered?.[2]).not.toHaveProperty("filters");
    expect(filtered?.[3]).not.toHaveProperty("filters");
  });

  it("preserves explicit and nested column filters", () => {
    const explicitFilter = [{ text: "Open", value: "Open" }];
    const columns: ColumnsType<{ status: string; owner: string }> = [{
      title: "Workflow",
      children: [
        { title: "Status", dataIndex: "status", filters: explicitFilter },
        { title: "Owner", dataIndex: "owner" }
      ]
    }];

    const filtered = addOperationsColumnFilters(columns, [
      { status: "Open", owner: "Sales" },
      { status: "Done", owner: "Loan" }
    ]);
    const children = filtered?.[0] && "children" in filtered[0] ? filtered[0].children : [];

    expect(children?.[0]).toHaveProperty("filters", explicitFilter);
    expect(children?.[1]).toHaveProperty("filters");
  });

  it("uses real table columns for the default native multi-field query form", () => {
    const markup = renderToStaticMarkup(createElement(OperationsProTable<Row>, {
      rowKey: "id",
      columns: [{ title: "Status", dataIndex: "status" }],
      dataSource: [{ id: "1", status: "Open", amount: 100, createdAt: "2026-08-01", description: "Repair" }],
      pagination: false
    }));

    expect(markup).toContain("operationsProTable");
    expect(markup).toContain('title="Status"');
    expect(markup).toContain("ant-pro-query-filter");
    expect(markup).not.toContain("Search table records");
    expect(markup).not.toContain("ant-pro-table-list-toolbar");
  });

  it("renders page-owned fields inside the native ProTable query form", () => {
    const markup = renderToStaticMarkup(createElement(OperationsProTable<Row>, {
      rowKey: "id",
      columns: [{ title: "Status", dataIndex: "status" }],
      dataSource: [{ id: "1", status: "Open", amount: 100, createdAt: "2026-08-01", description: "Repair" }],
      pagination: false,
      nativeSearch: {
        fields: [
          { name: "keyword", label: "Keyword", placeholder: "Plate or customer" },
          { name: "status", label: "Status", options: [{ value: "Open", label: "Open" }] }
        ],
        values: { keyword: "", status: undefined },
        onSubmit: () => undefined,
        onReset: () => undefined
      }
    }));

    expect(markup).toContain("operationsProTable");
    expect(markup).toContain("Plate or customer");
    expect(markup).toContain("Status");
    expect(markup).toContain(">Reset<");
    expect(markup).toContain(">Search<");
    expect(markup).not.toContain("Search table records");
    expect(markup).not.toContain("ant-pro-table-list-toolbar");
  });

  it("matches primitive, nested, and array record values case-insensitively", () => {
    const record = {
      id: "loan-1",
      customer: { name: "Ah Ming", phone: "012-3456789" },
      status: "Pending Review",
      categories: ["Loan Document", "Status Receipt"]
    };

    expect(matchesOperationsTableSearch(record, "ah ming")).toBe(true);
    expect(matchesOperationsTableSearch(record, "STATUS RECEIPT")).toBe(true);
    expect(matchesOperationsTableSearch(record, "approved")).toBe(false);
    expect(matchesOperationsTableSearch(record, "   ")).toBe(true);
  });

  it("matches words across fields and ignores plate and phone punctuation", () => {
    const record = {
      id: "vehicle-1",
      make: "Toyota",
      model: "Vios",
      phone: "012-345 6789"
    };

    expect(matchesOperationsTableSearch(record, "toyota vios")).toBe(true);
    expect(matchesOperationsTableSearch(record, "0123456789")).toBe(true);
    expect(matchesOperationsTableSearch(record, "honda vios")).toBe(false);
  });

  it("searches the visible values produced by column renderers", () => {
    type RenderedRow = { id: string; vehicleId: string; customerName: string };
    const plates: Record<string, string> = { "vehicle-1": "VPK 1234", "vehicle-2": "JQK 88" };
    const columns: ColumnsType<RenderedRow> = [
      { title: "Car Plate", render: (_, row) => createElement("span", null, plates[row.vehicleId]) },
      { title: "Customer", dataIndex: "customerName" }
    ];
    const records: RenderedRow[] = [
      { id: "1", vehicleId: "vehicle-1", customerName: "Ah Ming" },
      { id: "2", vehicleId: "vehicle-2", customerName: "Siti" }
    ];

    expect(filterOperationsTableData(records, "vpk1234 ah", columns)).toEqual([records[0]]);
    expect(filterOperationsTableData(records, "jqk 88", columns)).toEqual([records[1]]);
    expect(filterOperationsTableData(records, "", columns)).toEqual(records);
    expect(filterOperationsTableData(records, "missing", columns)).toEqual([]);
  });

  it("combines default column fields and matches rendered values", () => {
    type RenderedRow = { id: string; vehicleId: string; status: string };
    const columns: ColumnsType<RenderedRow> = [
      { title: "Plate", dataIndex: "vehicleId", render: (value) => value === "vehicle-1" ? "VPK 1234" : "JQK 88" },
      { title: "Status", dataIndex: "status" }
    ];
    const records: RenderedRow[] = [
      { id: "1", vehicleId: "vehicle-1", status: "Pending" },
      { id: "2", vehicleId: "vehicle-2", status: "Approved" }
    ];

    expect(filterOperationsTableDataByFields(records, { vehicleId: "VPK1234", status: "Pending" }, columns)).toEqual([records[0]]);
    expect(filterOperationsTableDataByFields(records, { vehicleId: "VPK1234", status: "Approved" }, columns)).toEqual([]);
    expect(filterOperationsTableDataByFields(records, {}, columns)).toEqual(records);
  });
});
