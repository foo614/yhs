import { useEffect, useState } from "react";
import { Alert, Button, Card, Empty, Skeleton, Space, Typography } from "antd";
import { getCollectionAgeing, type CollectionAgeingBucketKey, type CollectionAgeingSummary } from "../../api";
import "./collectionAgeing.css";

export const collectionAgeingLabels: Record<CollectionAgeingBucketKey, string> = {
  NotYetDue: "Not yet due / 未到期",
  Overdue1To7: "1–7 days overdue / 逾期 1–7 天",
  Overdue8To30: "8–30 days overdue / 逾期 8–30 天",
  OverdueOver30: "Over 30 days overdue / 逾期超过 30 天",
  UnknownDueDate: "Unknown due date / 到期日未知"
};

export function collectionAgeingTarget(bucket: CollectionAgeingBucketKey) {
  return `/finance?tab=collection-ageing&collectionBucket=${encodeURIComponent(bucket)}`;
}

export function collectionAgeingBucketFromSearch(search: string): CollectionAgeingBucketKey | undefined {
  const key = new URLSearchParams(search).get("collectionBucket");
  return key && Object.hasOwn(collectionAgeingLabels, key) ? key as CollectionAgeingBucketKey : undefined;
}

export const collectionDateLimitation = "Collection due dates are not recorded. Invoice, created and follow-up dates are not payment deadlines, so current balances appear under Unknown due date. Receivables and open debt cases retain the existing headline’s separate balances.";
export const collectionMoney = (amount: number) => new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(amount);

export function CollectionAgeingPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<CollectionAgeingSummary>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError(undefined);
    getCollectionAgeing().then(value => { if (active) setData(value); }).catch(() => {
      if (active) setError("Collection ageing could not be loaded. Check the connection and retry.");
    });
    return () => { active = false; };
  }, [refreshKey, attempt]);

  return <Card className="collectionAgeing" title="Outstanding collection ageing / 待收款账龄">
    {error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => setAttempt(value => value + 1)}>Retry</Button>} />
      : !data ? <Skeleton active paragraph={{ rows: 5 }} /> : <Space direction="vertical" size={16} className="fullWidth">
        <div className="collectionAgeingSummary"><strong>{collectionMoney(data.totalAmount)}</strong><span>{data.totalCount} balance records · As of {data.asOfDate} ({data.timeZone}) · Current balances across all dates</span></div>
        <Alert type="info" showIcon message="Due dates unavailable / 暂无收款到期日" description={collectionDateLimitation} />
        {data.totalCount === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No outstanding collection balances" />}
        <div className="collectionAgeingBuckets">
          {data.buckets.map(bucket => <a key={bucket.key} href={collectionAgeingTarget(bucket.key)} className="collectionAgeingBucket" aria-label={`${collectionAgeingLabels[bucket.key]}, ${collectionMoney(bucket.amount)}, ${bucket.count} balance records. View records.`}>
            <span>{collectionAgeingLabels[bucket.key]}</span>
            <strong>{collectionMoney(bucket.amount)}</strong><span>{bucket.count} records · View records →</span>
            <span className="collectionAgeingTrack" aria-hidden="true"><span style={{ width: `${data.totalAmount > 0 ? Math.min(100, Math.max(0, bucket.amount / data.totalAmount * 100)) : 0}%` }} /></span>
          </a>)}
        </div>
        <Typography.Text type="secondary">Current outstanding balance; amounts are not cash receipts or a forecast. Due today is included in Not yet due.</Typography.Text>
      </Space>}
  </Card>;
}
