import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

/** Calendar dates and scheduled times are local values, not UTC instants. */
export function formatDisplayDate(value?: string) {
  if (!value) return "-";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.locale("en").format("DD MMM YYYY") : "-";
}

export function formatScheduledDateTime(date?: string, time?: string) {
  return `${formatDisplayDate(date)}${time ? `, ${time.slice(0, 5)}` : ""}`;
}

/** API timestamps are UTC instants; always display them in Malaysia time. */
export function formatDisplayDateTime(value?: string) {
  if (!value) return "-";
  const parsed = dayjs.utc(value);
  return parsed.isValid() ? parsed.tz("Asia/Kuala_Lumpur").locale("en").format("DD MMM YYYY, HH:mm") : "-";
}
