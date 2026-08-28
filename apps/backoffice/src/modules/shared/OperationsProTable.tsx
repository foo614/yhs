import { ProTable } from "@ant-design/pro-components";
import type { ProTableProps } from "@ant-design/pro-table";
import type { TableProps } from "antd";
import type { ColumnType, ColumnsType } from "antd/es/table";
import { useMemo } from "react";

type DataIndex = string | number | readonly (string | number)[];

export type OperationsProTableProps<
  RecordType extends object,
  Params extends Record<string, unknown> = Record<string, unknown>
> = Omit<TableProps<RecordType>, "columns"> & {
  columns?: ColumnsType<RecordType>;
  request?: ProTableProps<RecordType, Params>["request"];
  search?: ProTableProps<RecordType, Params>["search"];
  /** Generate filters only for short, low-cardinality operational values. */
  columnFilters?: boolean;
};

const MAX_AUTO_FILTER_VALUES = 8;
const MAX_AUTO_FILTER_VALUE_LENGTH = 48;

/**
 * Adds filters only when a caller explicitly opts in. Existing filter metadata
 * and grouped columns are retained exactly as provided.
 */
export function addOperationsColumnFilters<RecordType extends object>(
  columns: ColumnsType<RecordType> | undefined,
  dataSource: TableProps<RecordType>["dataSource"]
): ColumnsType<RecordType> | undefined {
  if (!columns || !Array.isArray(dataSource)) return columns;

  return columns.map((column) => {
    if ("children" in column && column.children) {
      return {
        ...column,
        children: addOperationsColumnFilters(column.children, dataSource)
      };
    }

    const leafColumn = column as ColumnType<RecordType>;
    if (!leafColumn.dataIndex || leafColumn.filters !== undefined || leafColumn.filterDropdown !== undefined) {
      return column;
    }

    const dataIndex = leafColumn.dataIndex as DataIndex;
    const leafKey = String(Array.isArray(dataIndex) ? dataIndex[dataIndex.length - 1] : dataIndex);
    if (!isSafeAutoFilterKey(leafKey)) return column;

    const uniqueValues = Array.from(new Set(dataSource.flatMap((row) => tableFilterValues(row, dataIndex))))
      .filter((value) => value.length > 0)
      .sort((a, b) => a.localeCompare(b));

    if (
      uniqueValues.length < 2 ||
      uniqueValues.length > MAX_AUTO_FILTER_VALUES ||
      uniqueValues.some((value) => value.length > MAX_AUTO_FILTER_VALUE_LENGTH)
    ) {
      return column;
    }

    return {
      ...leafColumn,
      filters: uniqueValues.map((value) => ({ text: value, value })),
      filterSearch: leafColumn.filterSearch ?? uniqueValues.length > 5,
      onFilter: leafColumn.onFilter ?? ((value, row) => tableFilterValues(row, dataIndex).includes(String(value)))
    };
  }) as ColumnsType<RecordType>;
}

function isSafeAutoFilterKey(key: string) {
  const normalized = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (!normalized) return false;

  // Automatic menus are intentionally limited to stable operational enums.
  // Names, identifiers, dates, amounts and narrative text need deliberate
  // search controls or explicit caller-provided filters.
  return /(?:status|state|type|category|kind|role|department|team|process|source|method|priority|stage|visibility|approval|owner|stockowner|active|enabled|ispublic)$/.test(normalized);
}

function tableFilterValues<RecordType extends object>(row: RecordType, dataIndex: DataIndex) {
  const keys = Array.isArray(dataIndex) ? dataIndex : [dataIndex];
  const value = keys.reduce<unknown>((current, key) => {
    if (current && typeof current === "object") return (current as Record<string, unknown>)[String(key)];
    return undefined;
  }, row);

  if (Array.isArray(value)) return value.map((item) => String(item));
  if (value === undefined || value === null) return [];
  return [String(value)];
}

export function OperationsProTable<RecordType extends object, Params extends Record<string, unknown> = Record<string, unknown>>({
  columns,
  dataSource,
  request,
  search = false,
  columnFilters = false,
  className,
  ...props
}: OperationsProTableProps<RecordType, Params>) {
  const tableColumns = useMemo(
    () => columnFilters ? addOperationsColumnFilters(columns, dataSource) : columns,
    [columnFilters, columns, dataSource]
  );

  return (
    <ProTable
      {...props}
      className={["operationsProTable", className].filter(Boolean).join(" ")}
      request={request}
      columns={tableColumns as any}
      dataSource={dataSource}
      search={search}
      options={false}
      toolBarRender={false}
      tableAlertRender={false}
      tableAlertOptionRender={false}
      bordered={false}
      cardBordered={false}
    />
  );
}

export default OperationsProTable;
