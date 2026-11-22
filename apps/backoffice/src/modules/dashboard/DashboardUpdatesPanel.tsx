import { useEffect, useRef, useState } from "react";
import { Alert, Button, Empty, List, Pagination, Space, Spin, Tag, Typography } from "antd";
import { CalendarOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { ProCard } from "@ant-design/pro-components";
import { canAccessRoute } from "../../access";
import { getDashboardUpdates, getVehicleDocumentContent, humanizeApiError, vehicleDocumentContentUrl, type DashboardUpdate, type DashboardUpdatesResponse } from "../../api";
import { DocumentPreviewButton } from "../shared/DocumentPreviewButton";
import { formatDisplayDate } from "../../dateDisplay";
import "./dashboardUpdates.css";

const labels: Record<string, string> = {
  NewStock: "New stock / 新库存", Loan: "Loan / 贷款", LoanApproved: "Loan approved / 贷款已批",
  Deal: "Deal / 成交", Delivery: "Delivery / 交车", MissingDealPrice: "Deal price / 成交价", Task: "Task / 任务"
};

const statuses: Record<string, string> = {
  Draft: "Draft / 草稿", Pending: "Pending / 待处理", Approved: "Approved / 已批准",
  Rejected: "Rejected / 已拒绝", Done: "Done / 已完成", Submitted: "Submitted / 已提交",
  Available: "Available / 可售", Sold: "Sold / 已售", Open: "Open / 待办",
  Scheduled: "Scheduled / 已安排", Inspection: "Inspection / 验车",
  PreparingDocuments: "Documents / 准备文件", CarPreparation: "Car preparation / 车辆准备",
  ReadyForRelease: "Ready / 可交车", Released: "Released / 已交车", Cancelled: "Cancelled / 已取消"
};

function newsDate(item: DashboardUpdate) {
  if (item.occurredAt) {
    const instant = dayjs.utc(item.occurredAt);
    if (instant.isValid()) return instant.tz("Asia/Kuala_Lumpur").format("YYYY-MM-DD");
  }
  return item.date ?? "";
}

export function DashboardUpdatesPanel({ roles, onNavigate }: { roles: string[]; onNavigate: (path: string) => void }) {
  const [data, setData] = useState<DashboardUpdatesResponse>();
  const [newsPage, setNewsPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const roleKey = roles.join(",");
  async function refresh() {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await getDashboardUpdates();
      if (id === requestId.current) { setData(result); setError(""); }
    } catch (reason) {
      if (id === requestId.current) { setData(undefined); setError(humanizeApiError(reason)); }
    } finally { if (id === requestId.current) setLoading(false); }
  }
  useEffect(() => {
    setData(undefined);
    setNewsPage(1);
    void refresh();
    return () => { requestId.current += 1; };
  }, [roleKey]);

  const news = data?.news ?? [];
  const reminders = data?.reminders ?? [];
  const hasNews = news.length > 0;
  const hasReminders = reminders.length > 0;
  const currentNewsPage = Math.min(newsPage, Math.max(1, Math.ceil(news.length / 5)));
  const newsGroups = new Map<string, DashboardUpdate[]>();
  for (const item of news.slice((currentNewsPage - 1) * 5, currentNewsPage * 5)) {
    const date = newsDate(item);
    newsGroups.set(date, [...(newsGroups.get(date) ?? []), item]);
  }
  const renderActions = (item: DashboardUpdate) => <Space wrap className="dashboardUpdateActions" size={6}>
    {item.path && canAccessRoute(roles, item.path.split("?")[0]) && <Button onClick={() => onNavigate(item.path!)}>Open / 查看</Button>}
    {item.louDocumentId && item.vehicleId && <DocumentPreviewButton fileName="LOU" previewLabel="View LOU / 查看 LOU" downloadLabel="Download / 下载"
      downloadUrl={vehicleDocumentContentUrl(item.vehicleId, item.louDocumentId)}
      loadContent={() => getVehicleDocumentContent(item.vehicleId!, item.louDocumentId!)} />}
  </Space>;
  const renderStatus = (item: DashboardUpdate) => item.status && <Tag color={item.status === "Approved" ? "green" : item.status === "Rejected" ? "red" : undefined}>{statuses[item.status] ?? item.status}</Tag>;
  const renderHandler = (item: DashboardUpdate) => <>
    <span className="dashboardUpdateMobileLabel">{item.kind === "Loan" ? "Last handled by / 最近处理人" : item.kind === "Delivery" ? "Booked by / 预约人" : item.kind === "Task" ? "Assigned to / 负责人" : "Recorded by / 记录人"}</span>
    <span>{item.recordedBy || (item.kind === "Loan" ? "Pending assignment / 待分配" : "Not recorded / 未记录")}</span>
  </>;
  const renderExtra = (item: DashboardUpdate) => <>
    {item.askingPrice != null && <span>RM {item.askingPrice.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</span>}
    {item.broker && <span>Broker / 经纪: {item.broker}</span>}
  </>;
  const renderPending = (item: DashboardUpdate) => <List.Item key={item.id}>
    <div className="dashboardPendingRow">
      <div className="dashboardUpdateEntity"><Typography.Text strong>{item.plate ?? item.title}</Typography.Text>
        {item.plate && <span className="dashboardUpdateSecondary">{item.title}</span>}
        {renderExtra(item)}
      </div>
      <div className="dashboardUpdateStatus"><span className="dashboardUpdateSecondary">{labels[item.kind] ?? item.kind}</span>{renderStatus(item)}</div>
      <div className="dashboardUpdateWaiting">
        {item.daysOpen != null && <strong>{item.daysOpen} days / 天</strong>}
        {item.date ? <time dateTime={item.date}>{formatDisplayDate(item.date)}{item.time ? ` · ${item.time} MYT` : ""}</time> : item.daysOpen == null && <span className="dashboardUpdateSecondary">Date not set / 未定日期</span>}
      </div>
      <div className="dashboardUpdateHandler">{renderHandler(item)}</div>
      {renderActions(item)}
    </div>
  </List.Item>;
  return <ProCard title="Updates / 工作动态" className="dashboardUpdates" extra={<Button loading={loading} onClick={() => void refresh()}>Refresh / 刷新</Button>} style={{ marginBottom: 16 }}>
    {error ? <Alert type="error" showIcon title="Updates unavailable / 暂时无法读取" description={error} /> : <Spin spinning={loading}>
      <div className={`dashboardUpdatesColumns${hasNews && hasReminders ? " dashboardUpdatesColumnsSplit" : ""}`}>
        <section className="dashboardPending" aria-label={roles.includes("BossAdmin") ? "Pending work / 待办事项" : "My reminders / 我的待办"}>
          <Typography.Title level={5}>{roles.includes("BossAdmin") ? "Pending work / 待办事项" : "My reminders / 我的待办"}</Typography.Title>
          {hasReminders && <div className="dashboardPendingColumns" aria-hidden="true"><span>Plate / Entity<br />车牌 / 项目</span><span>Module / Status<br />模块 / 状态</span><span>Waiting / Date<br />等待时长 / 日期</span><span>Handler<br />处理人</span><span>Action<br />操作</span></div>}
          <List dataSource={reminders} renderItem={renderPending} pagination={hasReminders ? { pageSize: 5, size: "small", showSizeChanger: false } : false} locale={{ emptyText: <Typography.Text type="secondary">No pending work / 暂无待办</Typography.Text> }} />
        </section>
        <section className="dashboardNews" aria-label="Company news / 公司动态">
          <div className="dashboardNewsHeading"><Typography.Title level={5}>Company news / 公司动态</Typography.Title>
            <Typography.Text type="secondary">Recent 30 days · latest 60 updates / 近30天，最新60项</Typography.Text></div>
          {hasNews ? <>
            {[...newsGroups].map(([date, items]) => <div className="dashboardNewsGroup" key={date}>
              <div className="dashboardNewsDate"><CalendarOutlined aria-hidden="true" /><time dateTime={date || undefined}>{date ? formatDisplayDate(date) : "Date not recorded / 未记录日期"}</time></div>
              <List dataSource={items} renderItem={item => <List.Item key={item.id}>
                <article className="dashboardNewsItem">
                  <Typography.Text strong>{item.plate ? `${item.plate} · ` : ""}{item.kind === "NewStock" ? labels.NewStock : item.title}</Typography.Text>
                  {item.kind === "NewStock" && <span className="dashboardUpdateSecondary">{item.title}</span>}
                  {!((item.kind === "LoanApproved" && item.status === "Approved") || (item.kind === "Deal" && item.status === "Sold")) && <div>{renderStatus(item)}</div>}
                  <div className="dashboardNewsMetadata">
                    {item.recordedBy && <span>{item.kind === "Delivery" ? "Booked by / 预约人" : "Handled by / 处理人"}: {item.recordedBy}</span>}
                    {((item.date && item.date !== date) || item.time) && <span>Date / 日期: {formatDisplayDate(item.date)}{item.time ? ` · ${item.time} MYT` : ""}</span>}
                    {item.daysOpen != null && <span>{item.daysOpen} days / 天</span>}
                    {renderExtra(item)}
                  </div>
                  {renderActions(item)}
                </article>
              </List.Item>} />
            </div>)}
            <Pagination size="small" current={currentNewsPage} onChange={setNewsPage} pageSize={5} total={news.length} showSizeChanger={false} />
          </> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No news / 暂无动态" style={{ marginBlock: 8 }} styles={{ image: { height: 32, marginBottom: 4 } }} />}
        </section>
      </div>
    </Spin>}
  </ProCard>;
}
