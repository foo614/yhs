import { describe, expect, it } from "vitest";
import type { ColumnsType } from "antd/es/table";
import { addOperationsColumnFilters } from "./OperationsProTable";

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
});
