export const FINANCE_LIST_PAGE_SIZE = 8;

export function financeStatusLabel(status: string) {
  return status === "FollowedUp" ? "Followed Up / 已跟进" : status;
}

export function filterFinanceRows<T>(
  rows: T[],
  keyword: string,
  status: string | undefined,
  searchValues: (row: T) => Array<string | undefined | null>,
  rowStatus: (row: T) => string | string[]
) {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase();
  const compactKeyword = compactSearchValue(normalizedKeyword);

  return rows.filter((row) => {
    const matchesKeyword = !normalizedKeyword || searchValues(row).some((value) => {
      const normalizedValue = value?.toLocaleLowerCase() ?? "";
      return normalizedValue.includes(normalizedKeyword)
        || (Boolean(compactKeyword) && compactSearchValue(normalizedValue).includes(compactKeyword));
    });
    const statuses = rowStatus(row);
    const matchesStatus = !status || (Array.isArray(statuses) ? statuses.includes(status) : statuses === status);
    return matchesKeyword && matchesStatus;
  });
}

function compactSearchValue(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLocaleLowerCase();
}

export function financePageFor(totalRows: number, page: number, pageSize = FINANCE_LIST_PAGE_SIZE) {
  return Math.min(Math.max(1, page), Math.max(1, Math.ceil(totalRows / pageSize)));
}

export function pageFinanceRows<T>(rows: T[], page: number, pageSize = FINANCE_LIST_PAGE_SIZE) {
  const currentPage = financePageFor(rows.length, page, pageSize);
  const start = (currentPage - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export function financeEmptyText(totalRows: number, filteredRows: number, itemName: string) {
  return totalRows === 0
    ? `No ${itemName} yet.`
    : filteredRows === 0
      ? `No ${itemName} match the current filters.`
      : `No ${itemName} yet.`;
}
