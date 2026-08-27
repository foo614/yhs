const numberFormatter = new Intl.NumberFormat("en-MY", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/** Format a price or amount with an explicit thousands separator. */
export function formatThousands(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat("en-MY", options ?? { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function formatRinggit(value: number) {
  return `RM ${numberFormatter.format(value)}`;
}
