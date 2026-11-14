import { useCallback, useEffect, useState } from "react";
import { ProCard } from "@ant-design/pro-components";
import { Alert, Button, Empty, Input, InputNumber, Pagination, Select, Skeleton, Space, Tag, Typography } from "antd";
import { OperationsProTable } from "../shared/OperationsProTable";
import type { ColumnsType } from "antd/es/table";
import {
  getSalesWorkboard,
  humanizeApiError,
  updateActualSellingPrice,
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
  initialKeyword = "",
  autoLoad = true
}: {
  currentUser: CurrentUser | null;
  initialData?: SalesWorkboard;
  initialKeyword?: string;
  autoLoad?: boolean;
}) {
  const [data, setData] = useState<SalesWorkboard | undefined>(initialData);
  const [loading, setLoading] = useState(autoLoad);
  const [loadError, setLoadError] = useState<string>();
  const [agentUserId, setAgentUserId] = useState<string | "All">("All");
  const [keyword, setKeyword] = useState(initialKeyword);
  useEffect(() => { setKeyword(initialKeyword); }, [initialKeyword]);
  const [mobilePage, setMobilePage] = useState(1);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, number | undefined>>({});
  const [priceSavingFor, setPriceSavingFor] = useState<string | null>(null);
  const [priceSaveError, setPriceSaveError] = useState<string | null>(null);
  const isBoss = currentUser?.roles.includes("BossAdmin") ?? false;
  const mobilePageSize = 6;
  const filteredItems = filterSalesMyCars(data?.items ?? [], keyword);
  const mobilePageCount = Math.max(1, Math.ceil(filteredItems.length / mobilePageSize));
  const clampedMobilePage = Math.min(mobilePage, mobilePageCount);
  const mobileItems = filteredItems.slice((clampedMobilePage - 1) * mobilePageSize, clampedMobilePage * mobilePageSize);
  const showAgentColumn = isBoss;

  useEffect(() => {
    setPriceDrafts(Object.fromEntries((data?.items ?? []).map(item => [item.vehicleId, item.actualSellingPrice ?? undefined])));
  }, [data]);

  const load = useCallback(async (selectedAgent: string | "All" = agentUserId) => {
    setLoading(true);
    try {
      setData(await getSalesWorkboard(isBoss && selectedAgent !== "All" ? selectedAgent : undefined));
      setLoadError(undefined);
    } catch (error) {
      setLoadError(humanizeApiError(error, "Cars I’m Handling could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [agentUserId, isBoss]);

  const savePrice = async (item: SalesWorkboardItem) => {
    const amount = priceDrafts[item.vehicleId];
    if (!amount || amount <= 0) {
      setPriceSaveError("Enter a valid actual deal price before saving.");
      return;
    }
    setPriceSavingFor(item.vehicleId);
    setPriceSaveError(null);
    try {
      await updateActualSellingPrice(item.vehicleId, amount);
      await load();
    } catch (error) {
      setPriceSaveError(humanizeApiError(error, "Actual deal price could not be saved."));
    } finally {
      setPriceSavingFor(null);
    }
  };

  const dealPriceCell = (item: SalesWorkboardItem) => {
    if (isBoss) return item.actualSellingPrice ? `RM ${item.actualSellingPrice.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Not filled";
    return <Space.Compact><InputNumber aria-label={`Actual deal price for ${item.plateNumber}`} min={0.01} precision={2} value={priceDrafts[item.vehicleId]} onChange={value => setPriceDrafts(current => ({ ...current, [item.vehicleId]: value ?? undefined }))} placeholder="RM" /><Button loading={priceSavingFor === item.vehicleId} onClick={() => void savePrice(item)}>Save</Button></Space.Compact>;
  };

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
    {
      title: "Current handoff / 当前跟进",
      width: 300,
      render: (_, item) => (
        <Space direction="vertical" size={0} style={{ whiteSpace: "normal" }}>
          <Typography.Text strong>{item.responsibleDepartment}</Typography.Text>
          <Typography.Text type="secondary">{item.nextAction}</Typography.Text>
        </Space>
      )
    },
    { title: "Actual deal price / 成交价", width: isBoss ? 170 : 260, render: (_, item) => dealPriceCell(item) },
    ...(showAgentColumn ? [{ title: "Broker / 经纪人", dataIndex: "salesAgentName", width: 170, render: (value: string | null | undefined) => value || "Unassigned" } as ColumnsType<SalesWorkboardItem>[number]] : [])
  ];

  return (
    <ProCard title="Cars I’m Handling / 我负责的车辆" className="salesMyCarsPanel">
      <div className="salesMyCarsHeader">
        <Typography.Text type="secondary">See the cars you sold or are following, their current process, and which team owns the next step.</Typography.Text>
      </div>
      {priceSaveError && <Alert type="error" showIcon message={priceSaveError} closable onClose={() => setPriceSaveError(null)} />}
      <Space wrap className="toolbarForm salesMyCarsFilterBar">
        <Input.Search
          allowClear
          value={keyword}
          placeholder="Plate, model or next action"
          aria-label="Search Cars I’m Handling"
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
          aria-label="Filter Cars I’m Handling by agent"
        />}
        <Tag color={keyword.trim() ? "blue" : undefined}>
          {keyword.trim() ? `${filteredItems.length} of ${data?.items.length ?? 0} matching` : `${data?.items.length ?? 0} cars`}
        </Tag>
        {keyword.trim() && <Button size="small" onClick={() => setKeyword("")}>Clear search</Button>}
      </Space>
      <div className="salesMyCarsStats" aria-label="Broker car summary">
        <span><strong>{data?.soldThisMonth ?? 0}</strong>Sold this month</span>
        <span><strong>{data?.inProgressCount ?? 0}</strong>Cars in progress</span>
      </div>
      {loadError && <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => void load()}>Try again</Button>} />}
      {loading ? <Skeleton active paragraph={{ rows: 5 }} /> : <>
        <div className="salesMyCarsMobileList">
          {filteredItems.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={keyword.trim() ? "No cars match this search." : "No cars are assigned to your Cars I’m Handling view yet."} />}
          {mobileItems.map((item) => (
            <article className="salesMyCarsMobileCard" key={`${item.vehicleId}:${item.salesAgentUserId ?? "unassigned"}`}>
              <div><Typography.Title level={5}>{item.plateNumber}</Typography.Title><Typography.Text type="secondary">{item.vehicleLabel}</Typography.Text></div>
              <div className="salesMyCarsMobileSection">
                <Typography.Text className="mobileRecordLabel">Current process / 当前流程</Typography.Text>
                <Tag color={item.process === "Completed" ? "green" : "blue"}>{item.process}</Tag>
              </div>
              <div className="salesMyCarsMobileSection">
                <Typography.Text className="mobileRecordLabel">Current handoff / 当前跟进</Typography.Text>
                <Typography.Text strong>{item.responsibleDepartment}</Typography.Text>
                <Typography.Text type="secondary">{item.nextAction}</Typography.Text>
              </div>
              <div className="salesMyCarsMobileSection">
                <Typography.Text className="mobileRecordLabel">Actual deal price / 成交价</Typography.Text>
                {dealPriceCell(item)}
              </div>
              {showAgentColumn && <Typography.Text type="secondary">Broker: {item.salesAgentName || "Unassigned"}</Typography.Text>}
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
          scroll={{ x: showAgentColumn ? 880 : 700 }}
          locale={{ emptyText: keyword.trim() ? "No cars match this search." : "No cars are assigned to your Cars I’m Handling view yet." }}
        />
      </>}
    </ProCard>
  );
}
