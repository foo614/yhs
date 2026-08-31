import { ProConfigProvider, ProTable, type ProColumns, type ProFormInstance, type ProTableProps } from "@ant-design/pro-components";
import { enUSIntl } from "@ant-design/pro-provider";
import { Button, type TableProps } from "antd";
import type { ColumnType, ColumnsType } from "antd/es/table";
import { isValidElement, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type DataIndex = string | number | readonly (string | number)[];

export type OperationsSearchOption = {
  label: ReactNode;
  value: string | number | boolean;
};

export type OperationsSearchField = {
  name: string;
  label: ReactNode;
  placeholder?: string;
  options?: OperationsSearchOption[];
};

export type OperationsNativeSearch = {
  fields: OperationsSearchField[];
  values: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void;
  onReset: () => void;
};

export function operationsKeywordFromFields(values: Record<string, unknown>, names: string[]) {
  return names.map((name) => String(values[name] ?? "").trim()).filter(Boolean).join(" ");
}

export type OperationsProTableProps<
  RecordType extends object,
  Params extends Record<string, unknown> = Record<string, unknown>
> = Omit<TableProps<RecordType>, "columns"> & {
  columns?: ColumnsType<RecordType>;
  request?: ProTableProps<RecordType, Params>["request"];
  search?: ProTableProps<RecordType, Params>["search"];
  editable?: ProTableProps<RecordType, Params>["editable"];
  /** Use ProTable's native multi-field query form to drive page-owned filtering. */
  nativeSearch?: OperationsNativeSearch;
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

export function filterOperationsTableData<RecordType extends object>(
  records: readonly RecordType[],
  keyword: string,
  columns?: ColumnsType<RecordType>
) {
  return records.filter((record, index) => matchesOperationsTableSearch(record, keyword, columns, index));
}

export function matchesOperationsTableSearch<RecordType extends object>(
  record: RecordType,
  keyword: string,
  columns?: ColumnsType<RecordType>,
  index = 0
) {
  const queryTokens = searchTokens(keyword);
  if (queryTokens.length === 0) return true;

  const searchableValues = [
    ...operationsSearchValues(record),
    ...operationsColumnSearchValues(columns, record, index)
  ];
  const searchableText = searchableValues.join(" ").toLocaleLowerCase();
  const compactSearchableText = compactSearchText(searchableText);
  return queryTokens.every((token) =>
    searchableText.includes(token) || compactSearchableText.includes(compactSearchText(token))
  );
}

function operationsSearchValues(value: unknown, seen = new WeakSet<object>()): string[] {
  if (value === undefined || value === null || typeof value === "function" || typeof value === "symbol") return [];
  if (typeof value !== "object") return [String(value)];
  if (value instanceof Date) return [value.toISOString()];
  if (seen.has(value)) return [];

  seen.add(value);
  return Array.isArray(value)
    ? value.flatMap((item) => operationsSearchValues(item, seen))
    : Object.values(value).flatMap((item) => operationsSearchValues(item, seen));
}

function operationsColumnSearchValues<RecordType extends object>(
  columns: ColumnsType<RecordType> | undefined,
  record: RecordType,
  index: number
): string[] {
  if (!columns) return [];

  return columns.flatMap((column) => {
    if ("children" in column && column.children) {
      return operationsColumnSearchValues(column.children, record, index);
    }

    const leafColumn = column as ColumnType<RecordType>;
    const cellValue = leafColumn.dataIndex
      ? tableCellValue(record, leafColumn.dataIndex as DataIndex)
      : undefined;
    const values = operationsSearchValues(cellValue);
    if (!leafColumn.render) return values;

    try {
      return [...values, ...renderedSearchValues(leafColumn.render(cellValue, record, index))];
    } catch {
      return values;
    }
  });
}

function renderedSearchValues(value: ReactNode | { children?: ReactNode }): string[] {
  if (value === undefined || value === null || typeof value === "boolean") return [];
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => renderedSearchValues(item));
  if (isValidElement(value)) {
    const props = value.props as Record<string, unknown>;
    return ["children", "label", "text", "title", "value", "aria-label"]
      .flatMap((key) => renderedSearchValues(props[key] as ReactNode));
  }
  if (typeof value === "object" && "children" in value) return renderedSearchValues(value.children);
  return [];
}

function tableCellValue<RecordType extends object>(record: RecordType, dataIndex: DataIndex) {
  const keys = Array.isArray(dataIndex) ? dataIndex : [dataIndex];
  return keys.reduce<unknown>((current, key) => {
    if (current && typeof current === "object") return (current as Record<string, unknown>)[String(key)];
    return undefined;
  }, record);
}

function searchTokens(keyword: string) {
  return keyword.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

function compactSearchText(value: string) {
  return value.replace(/[^\p{L}\p{N}]/gu, "");
}

function hideOperationsTableColumnsInSearch<RecordType extends object>(
  columns: ColumnsType<RecordType> | undefined
): ProColumns<RecordType>[] | undefined {
  return columns?.map((column) => {
    if ("children" in column && column.children) {
      return {
        ...column,
        hideInSearch: true,
        children: hideOperationsTableColumnsInSearch(column.children)
      } as ProColumns<RecordType>;
    }

    return { ...column, hideInSearch: true } as ProColumns<RecordType>;
  });
}

function operationsSearchColumns<RecordType extends object>(
  nativeSearch: OperationsNativeSearch | undefined,
  columns: ColumnsType<RecordType> | undefined,
  onFieldChange: (name: string, value: unknown) => void
): ProColumns<RecordType>[] {
  const fields = nativeSearch?.fields ?? defaultOperationsSearchFields(columns);
  return fields.map((field) => ({
    key: `operations-search-${field.name}`,
    title: field.label,
    dataIndex: field.name,
    hideInTable: true,
    valueType: field.options ? "select" : "text",
    fieldProps: {
      allowClear: true,
      placeholder: field.placeholder,
      onChange: (valueOrEvent: unknown) => onFieldChange(
        field.name,
        typeof valueOrEvent === "object" && valueOrEvent !== null && "target" in valueOrEvent
          ? (valueOrEvent as { target?: { value?: unknown } }).target?.value
          : valueOrEvent
      ),
      ...(field.options ? { options: field.options, showSearch: true, optionFilterProp: "label" } : {})
    }
  }));
}

function defaultOperationsSearchFields<RecordType extends object>(columns: ColumnsType<RecordType> | undefined) {
  const seen = new Set<string>();

  return (columns ?? []).flatMap((column): OperationsSearchField[] => {
    if ("children" in column && column.children) return defaultOperationsSearchFields(column.children).filter((field) => {
      if (seen.has(field.name)) return false;
      seen.add(field.name);
      return true;
    });

    const leafColumn = column as ColumnType<RecordType>;
    if (typeof leafColumn.dataIndex !== "string" && typeof leafColumn.dataIndex !== "number") return [];
    const name = String(leafColumn.dataIndex);
    if (seen.has(name)) return [];
    seen.add(name);
    const filters = Array.isArray(leafColumn.filters)
      ? leafColumn.filters.flatMap((filter) => "value" in filter
        ? [{ label: filter.text, value: filter.value as string | number | boolean }]
        : [])
      : undefined;

    return [{
      name,
      label: typeof leafColumn.title === "function" ? name : leafColumn.title ?? name,
      ...(filters?.length ? { options: filters } : {})
    }];
  });
}

export function filterOperationsTableDataByFields<RecordType extends object>(
  records: readonly RecordType[],
  values: Record<string, unknown>,
  columns?: ColumnsType<RecordType>
) {
  const activeValues = Object.entries(values).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "");
  if (activeValues.length === 0) return [...records];

  return records.filter((record, index) => activeValues.every(([name, value]) => {
    const column = findOperationsColumn(columns, name);
    if (!column) return true;
    const cellValue = tableCellValue(record, column.dataIndex as DataIndex);
    const searchable = [
      ...operationsSearchValues(cellValue),
      ...(column.render ? renderedColumnValues(column, cellValue, record, index) : [])
    ].join(" ").toLocaleLowerCase();
    const compactSearchable = compactSearchText(searchable);

    return searchTokens(String(value)).every((token) =>
      searchable.includes(token) || compactSearchable.includes(compactSearchText(token))
    );
  }));
}

function findOperationsColumn<RecordType extends object>(columns: ColumnsType<RecordType> | undefined, name: string): ColumnType<RecordType> | undefined {
  for (const column of columns ?? []) {
    if ("children" in column && column.children) {
      const nested = findOperationsColumn(column.children, name);
      if (nested) return nested;
      continue;
    }
    const leafColumn = column as ColumnType<RecordType>;
    if (String(leafColumn.dataIndex) === name) return leafColumn;
  }
  return undefined;
}

function renderedColumnValues<RecordType extends object>(
  column: ColumnType<RecordType>,
  cellValue: unknown,
  record: RecordType,
  index: number
) {
  try {
    return renderedSearchValues(column.render?.(cellValue, record, index));
  } catch {
    return [];
  }
}

export function OperationsProTable<RecordType extends object, Params extends Record<string, unknown> = Record<string, unknown>>({
  columns,
  dataSource,
  request,
  search,
  nativeSearch,
  columnFilters = false,
  className,
  pagination,
  ...props
}: OperationsProTableProps<RecordType, Params>) {
  const [searchValues, setSearchValues] = useState<Record<string, unknown>>({});
  const [searchPage, setSearchPage] = useState(1);
  const searchFormRef = useRef<ProFormInstance<Record<string, unknown>> | undefined>(undefined);
  const searchDraftRef = useRef<Record<string, unknown>>(nativeSearch?.values ?? {});
  const submitSearch = (values: Record<string, unknown>) => {
    setSearchPage(1);
    if (nativeSearch) {
      nativeSearch.onSubmit(values);
      return;
    }
    setSearchValues(values);
  };
  const resetSearch = () => {
    searchDraftRef.current = {};
    setSearchPage(1);
    if (nativeSearch) {
      nativeSearch.onReset();
      return;
    }
    setSearchValues({});
  };
  const tableColumns = useMemo(
    () => columnFilters ? addOperationsColumnFilters(columns, dataSource) : columns,
    [columnFilters, columns, dataSource]
  );
  const proColumns = useMemo(
    () => [
      ...operationsSearchColumns<RecordType>(nativeSearch, tableColumns, (name, value) => {
        searchDraftRef.current = { ...searchDraftRef.current, [name]: value };
      }),
      ...(hideOperationsTableColumnsInSearch(tableColumns) ?? [])
    ],
    [nativeSearch, tableColumns]
  );
  const nativeSearchValuesKey = JSON.stringify(nativeSearch?.values ?? {});

  useEffect(() => {
    if (!nativeSearch) return;
    searchDraftRef.current = nativeSearch.values;
    searchFormRef.current?.setFieldsValue(nativeSearch.values as Record<string, {} | undefined>);
  }, [nativeSearchValuesKey]);

  const filteredDataSource = useMemo(
    () => Array.isArray(dataSource)
      ? nativeSearch
        ? dataSource
        : filterOperationsTableDataByFields(dataSource, searchValues, tableColumns)
      : dataSource,
    [dataSource, nativeSearch, searchValues, tableColumns]
  );
  const defaultSearchActive = Object.values(searchValues).some((value) => value !== undefined && value !== null && String(value).trim() !== "");
  const filteredPagination = defaultSearchActive && pagination && typeof pagination === "object"
    ? {
      ...pagination,
      current: searchPage,
      total: Array.isArray(filteredDataSource) ? filteredDataSource.length : pagination.total,
      onChange: (page: number, pageSize: number) => {
        setSearchPage(page);
        if (pageSize !== pagination.pageSize) pagination.onChange?.(page, pageSize);
      }
    }
    : pagination;

  return (
    <ProConfigProvider intl={enUSIntl}>
    <ProTable
      {...props}
      className={["operationsProTable", className].filter(Boolean).join(" ")}
      request={request}
      columns={proColumns}
      dataSource={filteredDataSource}
      pagination={filteredPagination}
      search={search === false || proColumns.every((column) => column.hideInSearch) ? false : {
        labelWidth: "auto",
        defaultCollapsed: (nativeSearch?.fields.length ?? 1) > 3,
        span: 6,
        searchText: "Search",
        resetText: "Reset",
        optionRender: () => [
          <Button key="reset" onClick={() => {
            searchFormRef.current?.resetFields();
            resetSearch();
          }}>Reset</Button>,
          <Button key="search" type="primary" onClick={() => submitSearch(searchDraftRef.current)}>Search</Button>
        ],
        ...((nativeSearch?.fields.length ?? 1) <= 3 ? { collapseRender: false } : {}),
        ...(typeof search === "object" ? search : {})
      }}
      formRef={searchFormRef}
      form={{ initialValues: nativeSearch?.values }}
      onSubmit={(values) => submitSearch(values as Record<string, unknown>)}
      onReset={resetSearch}
      options={false}
      toolBarRender={false}
      tableAlertRender={false}
      tableAlertOptionRender={false}
      bordered={false}
      cardBordered={false}
    />
    </ProConfigProvider>
  );
}

export default OperationsProTable;
