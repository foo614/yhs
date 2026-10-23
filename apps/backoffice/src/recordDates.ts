/** Numeric API timestamps are Unix seconds; ISO strings retain their timezone. */
function recordTime(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const time = typeof value === "number" ? value * 1000 : Date.parse(String(value));
  return Number.isFinite(time) ? time : undefined;
}

/** Ant Design reverses this ascending comparator for descending order. */
export function compareRecordDates(left: unknown, right: unknown, order: "ascend" | "descend" = "ascend") {
  const a = recordTime(left);
  const b = recordTime(right);
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return order === "descend" ? -1 : 1;
  if (b === undefined) return order === "descend" ? 1 : -1;
  return a - b;
}

export function newestRecordsFirst<T>(records: readonly T[], dateFor: (record: T) => unknown): T[] {
  return [...records].sort((a, b) => -compareRecordDates(dateFor(a), dateFor(b), "descend"));
}
