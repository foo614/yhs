import { useEffect, useState } from "react";
import { Alert, Button, Card, Empty, Pagination, Skeleton, Space, Tag, Typography } from "antd";
import { getCollectionAgeingRecords, type CollectionAgeingRecord, type CollectionAgeingRecords } from "../../api";
import { collectionAgeingBucketFromSearch, collectionAgeingLabels, collectionDateLimitation, collectionMoney } from "../dashboard/CollectionAgeingPanel";

export function CollectionAgeingRecordsPanel({ search, plateFor, onOpen, sourceStatus, onRetrySource }: {
  search: string;
  plateFor: (vehicleId: string) => string;
  onOpen: (record: CollectionAgeingRecord) => void;
  sourceStatus: (record: CollectionAgeingRecord) => { loading: boolean; unavailable: boolean };
  onRetrySource: (record: CollectionAgeingRecord) => Promise<void>;
}) {
  const bucket = collectionAgeingBucketFromSearch(search);
  const [data, setData] = useState<CollectionAgeingRecords>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(1);
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError(undefined);
    setPage(1);
    if (bucket) getCollectionAgeingRecords(bucket).then(value => { if (active) setData(value); }).catch(() => {
      if (active) setError("Collection records could not be loaded. Check the connection and retry.");
    });
    return () => { active = false; };
  }, [bucket, attempt]);

  return <Card className="collectionAgeingRecords" title="Collection balance records / 待收款记录">
    {!bucket ? <Alert type="error" showIcon message="Invalid collection ageing filter. Return to Dashboard and select a bucket." />
      : error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => setAttempt(value => value + 1)}>Retry</Button>} />
        : !data ? <Skeleton active /> : <Space direction="vertical" size={16} className="fullWidth">
          <Typography.Title level={4}>{collectionAgeingLabels[bucket]}</Typography.Title>
          <Typography.Text strong>{collectionMoney(data.totalAmount)} · {data.records.length} records · As of {data.asOfDate} (Asia/Singapore)</Typography.Text>
          <Alert type="info" showIcon message="Current balances across all dates" description={`${collectionDateLimitation} Balances may have changed since the Dashboard was loaded.`} />
          {data.records.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No matching outstanding balances" />}
          <Button onClick={() => setAttempt(value => value + 1)}>Refresh balances / 刷新余额</Button>
          {data.records.slice((page - 1) * 20, page * 20).map(record => <div className="collectionAgeingRecord" key={`${record.sourceType}:${record.sourceId}`}>
            <Space wrap><strong>{plateFor(record.vehicleId)}</strong><Tag>{record.sourceType === "PaymentRecord" ? "Receivable / 应收款" : "Open debt case / 未结欠款"}</Tag></Space>
            <p><strong>{collectionMoney(record.amount)}</strong> · Due date: {record.dueDate ?? "Unknown / 未知"}</p>
            {sourceStatus(record).unavailable && <Alert type="warning" showIcon message="Source records unavailable. Reload before opening Details." action={<Button loading={sourceStatus(record).loading} onClick={() => void onRetrySource(record)}>Reload records</Button>} />}
            <div className="collectionAgeingRecordActions"><Button loading={sourceStatus(record).loading} disabled={sourceStatus(record).unavailable || sourceStatus(record).loading} onClick={() => onOpen(record)}>Details / 详情</Button></div>
          </div>)}
          <Pagination current={page} pageSize={20} total={data.records.length} showSizeChanger={false} hideOnSinglePage onChange={setPage} />
        </Space>}
  </Card>;
}
