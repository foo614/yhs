import { ProTable, type ProColumns } from "@ant-design/pro-components";
import type { TableProps } from "antd/es/table";
import { useMemo } from "react";

type OperationsProTableProps<RecordType extends object> = Omit<TableProps<RecordType>, "columns"> & {
  columns?: TableProps<RecordType>["columns"];
};

/**
 * Keeps the portal's existing Ant Design table contracts while standardising
 * operational lists on ProTable and its client-side column filter menus.
 */
export function OperationsProTable<RecordType extends Record<string, any>>({
  columns,
  dataSource,
  ...props
}: OperationsProTableProps<RecordType>) {
  const tableColumns = useMemo(
    () => ensureColumnFilters(columns, dataSource),
    [columns, dataSource]
  );

  return (
    <ProTable<RecordType>
      {...props}
      cardBordered={false}
      columns={tableColumns as unknown as ProColumns<RecordType>[]}
      dataSource={dataSource}
      ghost
      options={false}
      search={false}
      tableAlertOptionRender={false}
      tableAlertRender={false}
      toolBarRender={false}
    />
  );
}

export function ensureColumnFilters<RecordType extends object>(
  columns: TableProps<RecordType>["columns"],
  dataSource: TableProps<RecordType>["dataSource"]
): TableProps<RecordType>["columns"] {
  if (!columns || !Array.isArray(dataSource)) {
    return columns;
  }

  return columns.map((column) => {
    if ("children" in column && column.children) {
      return {
        ...column,
        children: ensureColumnFilters(column.children, dataSource)
      };
    }

    const filterableColumn = column as typeof column & {
      dataIndex?: string | number | readonly (string | number)[];
      filters?: unknown;
      filterDropdown?: unknown;
    };

    if (!filterableColumn.dataIndex || filterableColumn.filters || filterableColumn.filterDropdown) {
      return column;
    }

    const dataIndex = filterableColumn.dataIndex;
    const leafKey = String(Array.isArray(dataIndex) ? dataIndex[dataIndex.length - 1] : dataIndex);
    if (/(?:^id$|Id$|At$|Date$)/.test(leafKey)) {
      return column;
    }

    const filterValues = dataSource
      .flatMap((row) => tableFilterValues(row, dataIndex))
      .filter((value) => value.length > 0);
    const uniqueValues = Array.from(new Set(filterValues)).sort((a, b) => a.localeCompare(b));

    if (uniqueValues.length === 0) {
      return column;
    }

    return {
      ...column,
      filters: uniqueValues.map((value) => ({ text: value, value })),
      filterSearch: column.filterSearch ?? uniqueValues.length > 8,
      onFilter: column.onFilter ?? ((value, row) => tableFilterValues(row, dataIndex).includes(String(value)))
    };
  });
}

function tableFilterValues<RecordType extends object>(row: RecordType, dataIndex: string | number | readonly (string | number)[]) {
  const keys = Array.isArray(dataIndex) ? dataIndex : [dataIndex];
  const value = keys.reduce<unknown>((current, key) => {
    if (current && typeof current === "object") {
      return (current as Record<string, unknown>)[String(key)];
    }

    return undefined;
  }, row);

  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (value === undefined || value === null) {
    return [];
  }

  return [String(value)];
}
