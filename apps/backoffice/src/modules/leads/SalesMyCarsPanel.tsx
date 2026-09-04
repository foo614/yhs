import { useCallback, useEffect, useState } from "react";
import { ProCard } from "@ant-design/pro-components";
import { Alert, Button, Empty, Input, Pagination, Select, Skeleton, Space, Tag, Typography } from "antd";
import { OperationsProTable } from "../shared/OperationsProTable";
import type { ColumnsType } from "antd/es/table";
import {
  getSalesWorkboard,
  humanizeApiError,
  type CurrentUser,
  type SalesWorkboard,
  type SalesWorkboardItem
} from "../../api";

export function filterSalesMyCars(items: readonly SalesWorkboardItem[], keyword?: string) {
  const normalizedKeyword = keyword?.trim().toLocaleLowerCase();
  if (!normalizedKeyword) return [...items];

  return items.filter((item) => [
    item.plateNumber,
    item.vehicleLabel,
    item.process,
    item.responsibleDepartment,
    item.nextAction,
    item.salesAgentName
  ].some((value) => value?.toLocaleLowerCase().includes(normalizedKeyword)));
}

export function SalesMyCarsPanel({
  currentUser,
  initialData,
  autoLoad = true
}: {
  currentUser: CurrentUser | null;
  initialData?: SalesWorkboard;
  autoLoad?: boolean;
}) {
  const [data, setData] = useState<SalesWorkboard | undefined>(initialData);
  const [loading, setLoading] = useState(autoLoad);
  const [loadError, setLoadError] = useState<string>();
  const [agentUserId, setAgentUserId] = useState<string | "All">("All");
  const [keyword, setKeyword] = useState("");
  const [mobilePage, setMobilePage] = useState(1);
  const isBoss = currentUser?.roles.includes("BossAdmin") ?? false;
  const mobilePageSize = 6;
  const filteredItems = filterSalesMyCars(data?.items ?? [], keyword);
  const mobilePageCount = Math.max(1, Math.ceil(filteredItems.length / mobilePageSize));
  const clampedMobilePage = Math.min(mobilePage, mobilePageCount);
  const mobileItems = filteredItems.slice((clampedMobilePage - 1) * mobilePageSize, clampedMobilePage * mobilePageSize);

  const load = useCallback(async (selectedAgent: string | "All" = agentUserId) => {
    setLoading(true);
    try {
      setData(await getSalesWorkboard(isBoss && selectedAgent !== "All" ? selectedAgent : undefined));
      setLoadError(undefined);
    } catch (error) {
      setLoadError(humanizeApiError(error, "Your sales cars could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [agentUserId, isBoss]);

  useEffect(() => {
    if (autoLoad) void load();
  }, [autoLoad, load]);

  useEffect(() => {
    setMobilePage(1);
  }, [agentUserId, keyword]);

  const columns: ColumnsType<SalesWorkboardItem> = [
    {
      title: "Car / 车辆",
      width: 220,
      render: (_, item) => <Space direction="vertical" size={0}><Typography.Text strong>{item.plateNumber}</Typography.Text><Typography.Text type="secondary">{item.vehicleLabel}</Typography.Text></Space>
    },
    { title: "Current process / 当前流程", dataIndex: "process", width: 180, render: (value) => <Tag color={value === "Completed" ? "green" : "blue"}>{value}</Tag> },
    { title: "Responsible team / 负责部门", dataIndex: "responsibleDepartment", width: 170 },
    { title: "Next action / 下一步", dataIndex: "nextAction" },
    ...(isBoss ? [{ title: "Agent / 销售员", dataIndex: "salesAgentName", width: 170, render: (value: string | null | undefined) => value || "Unassigned" } as ColumnsType<SalesWorkboardItem>[number]] : [])
  ];

  return (
    <ProCard title="My Cars / 我的车辆" className="salesMyCarsPanel">
      <div className="salesMyCarsHeader">
        <Typography.Text type="secondary">See the cars you sold or are following, their current process, and which team owns the next step.</Typography.Text>
      </div>
      <Space wrap className="toolbarForm salesMyCarsFilterBar">
        <Input.Search
          allowClear
          value={keyword}
          placeholder="Search plate, model or next action"
          aria-label="Search My Cars"
          onChange={(event) => setKeyword(event.target.value)}
        />
        {isBoss && <Select
          showSearch
          optionFilterProp="label"
          value={agentUserId}
          onChange={(value) => {
            setAgentUserId(value);
          }}
          options={[
            { value: "All", label: "All agents" },
            ...(data?.availableAgents ?? []).map((agent) => ({ value: agent.id, label: agent.displayName }))
          ]}
          aria-label="Filter My Cars by agent"
        />}
        <Tag color={keyword.trim() ? "blue" : undefined}>
          {keyword.trim() ? `${filteredItems.length} of ${data?.items.length ?? 0} matching` : `${data?.items.length ?? 0} cars`}
        </Tag>
        {keyword.trim() && <Button size="small" onClick={() => setKeyword("")}>Clear search</Button>}
      </Space>
      <div className="salesMyCarsStats" aria-label="Sales car summary">
        <span><strong>{data?.soldThisMonth ?? 0}</strong>Sold this month</span>
        <span><strong>{data?.inProgressCount ?? 0}</strong>Cars in progress</span>
      </div>
      {loadError && <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => void load()}>Try again</Button>} />}
      {loading ? <Skeleton active paragraph={{ rows: 5 }} /> : <>
        <div className="salesMyCarsMobileList">
          {filteredItems.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={keyword.trim() ? "No cars match this search." : "No cars are assigned to this sales view yet."} />}
          {mobileItems.map((item) => (
            <article className="salesMyCarsMobileCard" key={`${item.vehicleId}:${item.salesAgentUserId ?? "unassigned"}`}>
              <div><Typography.Title level={5}>{item.plateNumber}</Typography.Title><Typography.Text type="secondary">{item.vehicleLabel}</Typography.Text></div>
              <Space wrap><Tag color={item.process === "Completed" ? "green" : "blue"}>{item.process}</Tag><Tag>{item.responsibleDepartment}</Tag></Space>
              <Typography.Text>{item.nextAction}</Typography.Text>
              {isBoss && <Typography.Text type="secondary">Agent: {item.salesAgentName || "Unassigned"}</Typography.Text>}
            </article>
          ))}
          {filteredItems.length > mobilePageSize && <Pagination
            current={clampedMobilePage}
            pageSize={mobilePageSize}
            total={filteredItems.length}
            showSizeChanger={false}
            onChange={setMobilePage}
          />}
        </div>
        <OperationsProTable
          className="salesMyCarsTable"
          rowKey={(item) => `${item.vehicleId}:${item.salesAgentUserId ?? "unassigned"}`}
          size="small"
          columns={columns}
          dataSource={filteredItems}
          search={false}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 880 }}
          locale={{ emptyText: keyword.trim() ? "No cars match this search." : "No cars are assigned to this sales view yet." }}
        />
      </>}
    </ProCard>
  );
}
