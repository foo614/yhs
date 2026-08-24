const numberFormatter = new Intl.NumberFormat("en-MY");

/** Format a price or amount with an explicit thousands separator. */
export function formatThousands(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat("en-MY", options).format(value);
}

export function formatRinggit(value: number) {
  return `RM ${numberFormatter.format(Math.round(value))}`;
}
