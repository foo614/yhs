const moneyFormatter = new Intl.NumberFormat("en-MY", {
  maximumFractionDigits: 0
});

/** Format a monetary value with an explicit thousands separator. */
export function formatMoney(value: number) {
  return `RM ${moneyFormatter.format(Math.round(value))}`;
}

/** Format a monetary value without the currency prefix for labels that add it themselves. */
export function formatMoneyNumber(value: number) {
  return moneyFormatter.format(Math.round(value));
}

export function formatMoneyInput(value: string | number | undefined) {
  if (value === undefined || value === "") return "";
  const text = String(value);
  const [integer, decimal] = text.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimal === undefined ? grouped : `${grouped}.${decimal}`;
}

export function parseMoneyInput(value: string | undefined) {
  return value?.replace(/,/g, "") ?? "";
}
