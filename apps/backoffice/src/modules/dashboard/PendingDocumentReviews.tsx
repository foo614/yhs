import { useEffect, useRef, useState } from "react";
import { Alert, Button, Drawer, Empty, List, Space, Spin, Tag, Typography } from "antd";
import { FileSearchOutlined, RightOutlined } from "@ant-design/icons";
import { getPendingDocumentReview, getPendingDocumentReviews, humanizeApiError, type PendingDocumentReview, type PendingDocumentReviews as ReviewQueue } from "../../api";
import { formatDisplayDateTime } from "../../dateDisplay";
import "./pendingDocumentReviews.css";

export function PendingDocumentReviews({ canReview, onNavigate }: { canReview: boolean; onNavigate: (path: string) => void }) {
  const [queue, setQueue] = useState<ReviewQueue>();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resumeError, setResumeError] = useState("");
  const [continuing, setContinuing] = useState<string>();
  const version = useRef(0);

  async function refresh() {
    if (!canReview) return;
    const request = ++version.current;
    setContinuing(undefined);
    setLoading(true);
    try {
      const result = await getPendingDocumentReviews();
      if (request === version.current) { setQueue(result); setError(""); }
    } catch (reason) {
      if (request === version.current) { setQueue(undefined); setError(humanizeApiError(reason)); }
    } finally { if (request === version.current) setLoading(false); }
  }
  useEffect(() => {
    setQueue(undefined);
    setOpen(false);
    if (canReview) void refresh();
    return () => { version.current += 1; };
  }, [canReview]);

  async function continueReview(item: PendingDocumentReview) {
    const request = version.current;
    setContinuing(item.jobId);
    setResumeError("");
    try {
      const current = await getPendingDocumentReview(item.jobId);
      if (request !== version.current) return;
      onNavigate(current.path);
      setOpen(false);
    } catch (reason) {
      if (request === version.current) { setResumeError(humanizeApiError(reason)); void refresh(); }
    } finally { if (request === version.current) setContinuing(undefined); }
  }

  if (!canReview) return null;
  return <div className="pendingDocumentReviews">
    <Button className="pendingDocumentReviewsShortcut" disabled={loading && !queue} onClick={() => { setOpen(true); void refresh(); }}>
      <FileSearchOutlined aria-hidden="true" />
      <span>Pending document reviews / 待审核文件</span>
      {queue ? <Tag color={queue.items.length ? "orange" : "default"}>{queue.items.length}</Tag> : <span>{loading ? "Loading… / 读取中…" : "Unavailable / 暂不可用"}</span>}
      <RightOutlined aria-hidden="true" />
    </Button>
    {error && <Alert type="warning" showIcon title="Document reviews unavailable / 暂无法读取审核列表" description={error} action={<Button onClick={() => void refresh()} loading={loading}>Retry / 重试</Button>} />}
    <Drawer title="Pending document reviews / 待审核文件" size={760} open={open} onClose={() => setOpen(false)} rootClassName="pendingDocumentReviewsDrawer">
      <Space wrap className="pendingDocumentReviewsToolbar"><Typography.Text type="secondary">Current actionable documents / 当前可继续审核的文件</Typography.Text><Button loading={loading} onClick={() => { setResumeError(""); void refresh(); }}>Refresh / 刷新</Button></Space>
      {resumeError && <Alert type="warning" showIcon title="Review changed / 审核状态已变更" description={resumeError} />}
      {error && <Alert type="error" showIcon title="Queue could not load / 无法读取列表" description={error} />}
      <Spin spinning={loading}>
        {queue && <>
          <List dataSource={queue.items} pagination={queue.items.length > 5 ? { pageSize: 5, size: "small", showSizeChanger: false } : false}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No documents ready to resume / 暂无可继续审核的文件" /> }}
            renderItem={item => <List.Item key={item.jobId}>
              <div className="pendingDocumentReviewRow">
                <div className="pendingDocumentReviewDetails"><Tag>{item.plate}</Tag><Typography.Text strong>{item.fileName}</Typography.Text><Typography.Text type="secondary">{item.source === "Repair" ? "Repair / 整备" : "Loan LOU / 贷款 LOU"} · {formatDisplayDateTime(item.createdAt)} MYT</Typography.Text></div>
                <Button type="primary" loading={continuing === item.jobId} disabled={Boolean(continuing && continuing !== item.jobId)} onClick={() => void continueReview(item)}>Continue review / 继续审核</Button>
              </div>
            </List.Item>} />
        </>}
      </Spin>
    </Drawer>
  </div>;
}
