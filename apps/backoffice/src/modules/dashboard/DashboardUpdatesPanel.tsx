import { useEffect, useRef, useState } from "react";
import { Alert, Button, Col, Empty, List, Row, Space, Spin, Tag, Typography } from "antd";
import { ProCard } from "@ant-design/pro-components";
import { canAccessRoute } from "../../access";
import { getDashboardUpdates, getVehicleDocumentContent, humanizeApiError, vehicleDocumentContentUrl, type DashboardUpdate, type DashboardUpdatesResponse } from "../../api";
import { DocumentPreviewButton } from "../shared/DocumentPreviewButton";
import { formatDisplayDate } from "../../dateDisplay";

const labels: Record<string, string> = {
  NewStock: "New stock / 新库存", Loan: "Loan / 贷款", LoanApproved: "Loan approved / 贷款已批",
  Deal: "Deal / 成交", Delivery: "Delivery / 交车", MissingDealPrice: "Deal price / 成交价", Task: "Task / 任务"
};

export function DashboardUpdatesPanel({ roles, onNavigate }: { roles: string[]; onNavigate: (path: string) => void }) {
  const [data, setData] = useState<DashboardUpdatesResponse>();
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
    void refresh();
    return () => { requestId.current += 1; };
  }, [roleKey]);

  const renderItem = (item: DashboardUpdate) => <List.Item key={item.id}>
    <Space orientation="vertical" size={6} style={{ width: "100%", minWidth: 0 }}>
      <Space wrap><Tag>{labels[item.kind] ?? item.kind}</Tag><Typography.Text strong>{item.plate ?? item.title}</Typography.Text><Tag>{item.status}</Tag></Space>
      {item.plate && <Typography.Text>{item.title}</Typography.Text>}
      <Space wrap>
        {item.date && <Typography.Text>{formatDisplayDate(item.date)} {item.time ? `${item.time} MYT` : ""}</Typography.Text>}
        {item.daysOpen != null && <Typography.Text>{item.daysOpen} days / 天</Typography.Text>}
        {item.askingPrice != null && <Typography.Text>RM {item.askingPrice.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</Typography.Text>}
      </Space>
      {item.broker && <Typography.Text type="secondary">Broker / 经纪: {item.broker}</Typography.Text>}
      {item.kind === "Loan" && <Typography.Text type="secondary">{item.recordedBy ? `Last handled by / 最近处理人: ${item.recordedBy}` : "Pending assignment / 待分配"}</Typography.Text>}
      {item.kind !== "Loan" && item.recordedBy && <Typography.Text type="secondary">{item.kind === "Delivery" ? "Booked by / 预约人" : item.kind === "Task" ? "Assigned to / 负责人" : "Recorded by / 记录人"}: {item.recordedBy}</Typography.Text>}
      <Space wrap>
        {item.path && canAccessRoute(roles, item.path.split("?")[0]) && <Button onClick={() => onNavigate(item.path!)}>Open / 查看</Button>}
        {item.louDocumentId && item.vehicleId && <DocumentPreviewButton fileName="LOU" previewLabel="View LOU / 查看 LOU" downloadLabel="Download / 下载"
          downloadUrl={vehicleDocumentContentUrl(item.vehicleId, item.louDocumentId)}
          loadContent={() => getVehicleDocumentContent(item.vehicleId!, item.louDocumentId!)} />}
      </Space>
    </Space>
  </List.Item>;
  return <ProCard title="Updates / 工作动态" extra={<Button loading={loading} onClick={() => void refresh()}>Refresh / 刷新</Button>} style={{ marginBottom: 16 }}>
    {error ? <Alert type="error" showIcon title="Updates unavailable / 暂时无法读取" description={error} /> : <Spin spinning={loading}>
      <Row gutter={[24, 16]}>
        <Col xs={24} lg={12}>
          <Typography.Title level={5}>News / 公司动态</Typography.Title>
          <Typography.Text type="secondary">Recent 30 days · latest 60 updates / 近30天，最新60项</Typography.Text>
          <List dataSource={data?.news ?? []} renderItem={renderItem} pagination={{ pageSize: 5, size: "small", showSizeChanger: false }} locale={{ emptyText: <Empty description="No news / 暂无动态" /> }} />
        </Col>
        <Col xs={24} lg={12}>
          <Typography.Title level={5}>{roles.includes("BossAdmin") ? "Pending work / 待办事项" : "My reminders / 我的待办"}</Typography.Title>
          <List dataSource={data?.reminders ?? []} renderItem={renderItem} pagination={{ pageSize: 5, size: "small", showSizeChanger: false }} locale={{ emptyText: <Empty description="No pending work / 暂无待办" /> }} />
        </Col>
      </Row>
    </Spin>}
  </ProCard>;
}
