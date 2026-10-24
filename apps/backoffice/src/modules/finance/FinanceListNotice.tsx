import { Alert, Button, Space, Spin, Typography } from "antd";

export function FinanceListNotice({ label, loading, error, onRetry }: {
  label: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => Promise<void>;
}) {
  if (error) return <Alert
    type="error"
    showIcon
    message={`${label} unavailable`}
    description={<>{error} Reload before making changes. Previously loaded records, if any, remain available for reference.</>}
    action={onRetry ? <Button loading={loading} onClick={() => void onRetry()}>Retry</Button> : undefined}
  />;
  if (loading) return <Space role="status" className="financeListLoading"><Spin size="small" /><Typography.Text>Loading {label.toLowerCase()}…</Typography.Text></Space>;
  return null;
}
