const moneyFormatter = new Intl.NumberFormat("en-MY", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/** Format a monetary value with an explicit thousands separator. */
export function formatMoney(value: number) {
  return `RM ${moneyFormatter.format(value)}`;
}

/** Format a monetary value without the currency prefix for labels that add it themselves. */
export function formatMoneyNumber(value: number) {
  return moneyFormatter.format(value);
}

export function formatMoneyInput(value: string | number | undefined) {
  if (value === undefined || value === "") return "";
  const text = String(value);
  const [integer, decimal] = text.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimal === undefined ? grouped : `${grouped}.${decimal}`;
}

/**
 * Format an editable monetary value with two decimals after the user finishes
 * typing, while leaving their in-progress input untouched.
 */
export function formatMoneyInputWithTwoDecimals(
  value: string | number | undefined,
  info?: { userTyping: boolean; input: string }
) {
  if (info?.userTyping) return formatMoneyInput(info.input);
  if (value === undefined || value === "") return "";

  const numeric = Number(parseMoneyInput(String(value)));
  return Number.isFinite(numeric) ? formatMoneyNumber(numeric) : formatMoneyInput(value);
}

export function parseMoneyInput(value: string | undefined) {
  return value?.replace(/,/g, "") ?? "";
}
