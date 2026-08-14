export const FINANCE_LIST_PAGE_SIZE = 8;

export function financeStatusLabel(status: string) {
  return status === "FollowedUp" ? "Followed Up / 已跟进" : status;
}

export function filterFinanceRows<T>(
  rows: T[],
  keyword: string,
  status: string | undefined,
  searchValues: (row: T) => Array<string | undefined | null>,
  rowStatus: (row: T) => string
) {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase();

  return rows.filter((row) => {
    const matchesKeyword = !normalizedKeyword || searchValues(row).some((value) => value?.toLocaleLowerCase().includes(normalizedKeyword));
    return matchesKeyword && (!status || rowStatus(row) === status);
  });
}

export function financePageFor(totalRows: number, page: number, pageSize = FINANCE_LIST_PAGE_SIZE) {
  return Math.min(Math.max(1, page), Math.max(1, Math.ceil(totalRows / pageSize)));
}

export function pageFinanceRows<T>(rows: T[], page: number, pageSize = FINANCE_LIST_PAGE_SIZE) {
  const currentPage = financePageFor(rows.length, page, pageSize);
  const start = (currentPage - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}
