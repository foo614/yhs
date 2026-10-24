import { Typography } from "antd";

export function DataFreshness({ label, updatedAt, loading, error }: {
  label: string;
  updatedAt: Date | null;
  loading: boolean;
  error: string | null;
}) {
  return <Typography.Text type="secondary" className="dataFreshness" role="status" aria-label={`${label} data status`}>
    {label}: {loading ? "Loading. " : error ? "Update failed. " : ""}
    {updatedAt ? <>Last successful update <time dateTime={updatedAt.toISOString()}>{updatedAt.toLocaleString("en-GB", { timeZone: "Asia/Singapore", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })} UTC+08</time>.</> : "No successful update yet."}
  </Typography.Text>;
}
