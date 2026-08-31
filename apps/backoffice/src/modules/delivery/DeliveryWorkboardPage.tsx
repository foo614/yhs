import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExportOutlined,
  MoreOutlined,
  UploadOutlined,
  UserOutlined
} from "@ant-design/icons";
import { ProCard } from "@ant-design/pro-components";
import { OperationsProTable, operationsKeywordFromFields } from "../shared/OperationsProTable";
import {
  Alert,
  Button,
  Checkbox,
  Collapse,
  Descriptions,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Select,
  Skeleton,
  Space,
  Tag,
  Timeline,
  Typography,
  Upload,
  message
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { MenuProps } from "antd";
import {
  cancelDelivery,
  correctDeliveryBuyer,
  createDelivery,
  getDeliveryActivity,
  getDeliveryPicOptions,
  getDeliveryWorkboard,
  humanizeApiError,
  releaseDelivery,
  requestDeliveryInvoiceUpdate,
  updateDelivery,
  uploadVehicleDocument,
  vehicleDocumentContentUrl,
  type DeliveryActivity,
  type DeliveryPicOption,
  type DeliverySchedule,
  type DeliveryWorkboardItem,
  type DeliveryWorkboardStage,
  type DocumentCategory,
  type VehicleLookup
} from "../../api";

const stageOrder: DeliveryWorkboardStage[] = ["PlanDelivery", "PrepareCar", "ClearDocuments", "Handover"];

const stageMeta: Record<DeliveryWorkboardStage, { label: string; shortLabel: string; color: string }> = {
  PlanDelivery: { label: "Plan delivery / 安排交车", shortLabel: "Plan delivery", color: "blue" },
  PrepareCar: { label: "Prepare car / 准备车辆", shortLabel: "Prepare car", color: "gold" },
  ClearDocuments: { label: "Clear documents / 文件确认", shortLabel: "Clear documents", color: "purple" },
  Handover: { label: "Handover / 交车", shortLabel: "Handover", color: "cyan" },
  Completed: { label: "Done / 已交车", shortLabel: "Done", color: "green" },
  Cancelled: { label: "Cancelled / 已取消", shortLabel: "Cancelled", color: "default" }
};

const evidenceLabels: Partial<Record<DocumentCategory, string>> = {
  InspectionReport: "Inspection report / 检查报告",
  DeliveryDocument: "Delivery documents / 交车文件",
  Policy: "Insurance policy / 保险保单",
  RoadTaxReceipt: "Road tax / 路税",
  WindscreenPolicy: "Windscreen insurance / 挡风玻璃保险",
  HandoverPhoto: "Handover photo / 交车照片",
  SignedHandover: "Signed handover / 签署交车单"
};

export type DeliveryWorkboardFilters = {
  keyword?: string;
  stage?: DeliveryWorkboardStage | "All";
  picUserId?: string | "All";
};

export type DeliveryQueueFilter = "All" | "ThisWeek" | "NeedsAction" | "Ready" | "Outstation";

export function filterDeliveryWorkboard(items: readonly DeliveryWorkboardItem[], filters: DeliveryWorkboardFilters) {
  const keyword = filters.keyword?.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.stage && filters.stage !== "All" && item.stage !== filters.stage) return false;
    if (filters.picUserId && filters.picUserId !== "All" && item.picUserId !== filters.picUserId) return false;
    if (!keyword) return true;
    return [item.plateNumber, item.vehicleLabel, item.customerName, item.picName, item.nextAction]
      .some((value) => value?.toLowerCase().includes(keyword));
  });
}

export function filterDeliveryQueue(items: readonly DeliveryWorkboardItem[], queue: DeliveryQueueFilter, today: string) {
  const weekEndDate = addCalendarDays(today, 7);
  if (queue === "ThisWeek") return items.filter((item) => !item.terminal && item.scheduledDate >= today && item.scheduledDate <= weekEndDate);
  if (queue === "NeedsAction") return items.filter((item) => deliveryNeedsAction(item, today));
  if (queue === "Ready") return items.filter((item) => item.canRelease);
  if (queue === "Outstation") return items.filter((item) => !item.terminal && item.deliveryType === "Outstation");
  return [...items];
}

export function eligibleDeliveryVehicles(vehicles: readonly VehicleLookup[], deliveries: readonly DeliveryWorkboardItem[]) {
  const unavailableVehicleIds = new Set(deliveries
    .filter((delivery) => !delivery.terminal || delivery.stage === "Completed" || delivery.status === "Released")
    .map((delivery) => delivery.vehicleId));
  return vehicles.filter((vehicle) => vehicle.customerId && vehicle.status !== "Sold" && !unavailableVehicleIds.has(vehicle.id));
}

export function deliveryStageLabel(stage: DeliveryWorkboardStage) {
  return stageMeta[stage].label;
}

export function completedDeliveryStages(stage: DeliveryWorkboardStage) {
  if (stage === "Completed") return stageOrder;
  const currentIndex = stageOrder.indexOf(stage);
  return currentIndex <= 0 ? [] : stageOrder.slice(0, currentIndex);
}

export function deliveryNeedsAction(item: DeliveryWorkboardItem, today: string) {
  if (item.terminal) return false;
  if (!item.picUserId || item.scheduledDate < today) return true;
  if (!item.blocker || /waiting|finance/i.test(item.blocker)) return false;
  return item.scheduledDate <= addCalendarDays(today, 7);
}

export function singaporeDateString(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function deliveryTimeLabel(time?: string) {
  return time?.slice(0, 5);
}

function shortDestination(address?: string) {
  const destination = address?.trim().replace(/\s+/g, " ");
  if (!destination) return "Address needed";
  return destination.length > 34 ? `${destination.slice(0, 31)}...` : destination;
}

function deliveryScheduleFromItem(item: DeliveryWorkboardItem, patch: Partial<DeliverySchedule> = {}): DeliverySchedule {
  return {
    id: item.id,
    vehicleId: item.vehicleId,
    customerId: item.customerId,
    picUserId: item.picUserId,
    pic: item.picName,
    status: item.status,
    deliveryType: item.deliveryType,
    scheduledDate: item.scheduledDate,
    scheduledTime: item.scheduledTime,
    deliveryAddress: item.deliveryAddress,
    transportMethod: item.transportMethod,
    rescheduleReason: item.rescheduleReason,
    cancellationReason: item.cancellationReason,
    polishDone: item.polishDone,
    tintedDone: item.tintedDone,
    washDone: item.washDone,
    documentsPrepared: item.documentsPrepared,
    inspectionDone: item.inspectionDone,
    inspectionBookingReference: item.inspectionBookingReference,
    inspectionReportReference: item.inspectionReportReference,
    notificationSent: item.notificationSent,
    twoDayNoticeSent: item.twoDayNoticeSent,
    insuranceHandled: item.insuranceHandled,
    insurancePolicyReference: item.insurancePolicyReference,
    insuranceExpiryDate: item.insuranceExpiryDate,
    roadTaxHandled: item.roadTaxHandled,
    roadTaxReceiptReference: item.roadTaxReceiptReference,
    roadTaxExpiryDate: item.roadTaxExpiryDate,
    windscreenInsuranceHandled: item.windscreenInsuranceHandled,
    windscreenPolicyReference: item.windscreenPolicyReference,
    windscreenInsuranceExpiryDate: item.windscreenInsuranceExpiryDate,
    handoverPhotoCaptured: item.handoverPhotoCaptured,
    signedHandoverReceived: item.signedHandoverReceived,
    customerAcknowledged: item.customerAcknowledged,
    finalChecklistConfirmed: item.finalChecklistConfirmed,
    ...patch
  };
}

type CreateDeliveryValues = {
  vehicleId: string;
  picUserId: string;
  scheduledDate: string;
  scheduledTime: string;
  deliveryType: "Standard" | "Outstation";
  deliveryAddress?: string;
  transportMethod?: string;
};

type SecondaryAction = "reschedule" | "cancel" | "invoice" | "buyer";

const emptyGuid = "00000000-0000-0000-0000-000000000000";

export function hasLockedDeliveryBuyer(customerId?: string | null) {
  return Boolean(customerId && customerId !== emptyGuid);
}

export function canCorrectDeliveryBuyer(item: DeliveryWorkboardItem, vehicles: readonly VehicleLookup[], canCorrectBuyer: boolean) {
  return canCorrectBuyer && !item.terminal && !hasLockedDeliveryBuyer(item.customerId) && Boolean(vehicles.find((vehicle) => vehicle.id === item.vehicleId)?.customerId);
}

export function DeliveryWorkboardPage({
  vehicles,
  dashboardFocus,
  onClearDashboardFocus,
  onOpenCustomer,
  canCorrectBuyer = false,
  initialItems = [],
  initialPicOptions = [],
  autoLoad = true
}: {
  vehicles: VehicleLookup[];
  dashboardFocus?: { vehicleId?: string };
  onClearDashboardFocus: () => void;
  onOpenCustomer: (customerId: string) => void;
  canCorrectBuyer?: boolean;
  initialItems?: DeliveryWorkboardItem[];
  initialPicOptions?: DeliveryPicOption[];
  autoLoad?: boolean;
}) {
  const [items, setItems] = useState<DeliveryWorkboardItem[]>(initialItems);
  const [picOptions, setPicOptions] = useState<DeliveryPicOption[]>(initialPicOptions);
  const [loading, setLoading] = useState(autoLoad);
  const [loadError, setLoadError] = useState<string>();
  const [keyword, setKeyword] = useState("");
  const [stageFilter, setStageFilter] = useState<DeliveryWorkboardStage | "All">("All");
  const [picFilter, setPicFilter] = useState<string | "All">("All");
  const [queueFilter, setQueueFilter] = useState<DeliveryQueueFilter>("All");
  const [mobilePage, setMobilePage] = useState(1);
  const [selectedId, setSelectedId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [activity, setActivity] = useState<DeliveryActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [secondaryAction, setSecondaryAction] = useState<SecondaryAction>();
  const [actionReason, setActionReason] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleType, setRescheduleType] = useState<"Standard" | "Outstation">("Standard");
  const [rescheduleAddress, setRescheduleAddress] = useState("");
  const [rescheduleTransport, setRescheduleTransport] = useState("");
  const [createForm] = Form.useForm<CreateDeliveryValues>();
  const createDeliveryType = Form.useWatch("deliveryType", createForm);
  const selected = items.find((item) => item.id === selectedId);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextItems, nextPicOptions] = await Promise.all([getDeliveryWorkboard(), getDeliveryPicOptions()]);
      setItems(nextItems);
      setPicOptions(nextPicOptions);
      setLoadError(undefined);
    } catch (error) {
      setLoadError(humanizeApiError(error, "Delivery workboard could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async (deliveryId: string) => {
    setActivityLoading(true);
    try {
      setActivity(await getDeliveryActivity(deliveryId));
    } catch (error) {
      message.error(humanizeApiError(error, "Delivery history could not be loaded."));
      setActivity([]);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) void reload();
  }, [autoLoad, reload]);

  useEffect(() => {
    if (!dashboardFocus?.vehicleId) return;
    const focused = items.find((item) => item.vehicleId === dashboardFocus.vehicleId);
    if (focused) setSelectedId(focused.id);
  }, [dashboardFocus?.vehicleId, items]);

  const eligibleVehicles = useMemo(() => eligibleDeliveryVehicles(vehicles, items), [vehicles, items]);
  const today = singaporeDateString();
  const weekEndDate = addCalendarDays(today, 7);
  const filteredItems = useMemo(() => filterDeliveryQueue(filterDeliveryWorkboard(items, {
    keyword,
    stage: stageFilter,
    picUserId: picFilter
  }), queueFilter, today), [items, keyword, stageFilter, picFilter, queueFilter, today]);
  const thisWeekCount = items.filter((item) => !item.terminal && item.scheduledDate >= today && item.scheduledDate <= weekEndDate).length;
  const needsActionCount = items.filter((item) => deliveryNeedsAction(item, today)).length;
  const readyCount = items.filter((item) => item.canRelease).length;
  const outstationCount = items.filter((item) => !item.terminal && item.deliveryType === "Outstation").length;
  const mobilePageSize = 6;
  const clampedMobilePage = Math.min(mobilePage, Math.max(1, Math.ceil(filteredItems.length / mobilePageSize)));
  const mobileItems = filteredItems.slice((clampedMobilePage - 1) * mobilePageSize, clampedMobilePage * mobilePageSize);

  useEffect(() => {
    setMobilePage(1);
  }, [keyword, stageFilter, picFilter, queueFilter]);

  const toggleQueueFilter = (filter: Exclude<DeliveryQueueFilter, "All">) => {
    setQueueFilter((current) => current === filter ? "All" : filter);
  };

  const openDetails = (item: DeliveryWorkboardItem) => {
    setSelectedId(item.id);
    setActivity([]);
    void loadActivity(item.id);
  };

  const refreshSelected = async (deliveryId: string) => {
    await reload();
    await loadActivity(deliveryId);
  };

  const saveProgress = async (item: DeliveryWorkboardItem, patch: Partial<DeliverySchedule>, successMessage = "Delivery progress saved") => {
    setSaving(true);
    try {
      await updateDelivery(deliveryScheduleFromItem(item, patch));
      message.success(successMessage);
      await refreshSelected(item.id);
    } catch (error) {
      message.error(humanizeApiError(error, "Delivery progress could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const uploadEvidence = async (item: DeliveryWorkboardItem, file: File, category: DocumentCategory) => {
    if (!hasLockedDeliveryBuyer(item.customerId)) {
      message.warning("Ask Boss to lock the confirmed buyer before uploading delivery evidence.");
      return;
    }
    setSaving(true);
    try {
      await uploadVehicleDocument(item.vehicleId, file, category, {
        ownershipType: "Buyer",
        customerId: item.customerId,
        deliveryScheduleId: item.id
      });
      message.success(`${evidenceLabels[category] ?? "Evidence"} uploaded`);
      await refreshSelected(item.id);
    } catch (error) {
      message.error(humanizeApiError(error, "Evidence could not be uploaded."));
    } finally {
      setSaving(false);
    }
  };

  const confirmRelease = (item: DeliveryWorkboardItem) => {
    Modal.confirm({
      title: "Confirm vehicle release?",
      content: `${item.plateNumber} will be marked as handed over. This delivery becomes read-only after release.`,
      okText: "Confirm release",
      cancelText: "Keep working",
      onOk: async () => {
        setSaving(true);
        try {
          await releaseDelivery(item.id);
          message.success("Vehicle released");
          await refreshSelected(item.id);
        } catch (error) {
          message.error(humanizeApiError(error, "Vehicle could not be released."));
          throw error;
        } finally {
          setSaving(false);
        }
      }
    });
  };

  const openSecondaryAction = (action: SecondaryAction, item: DeliveryWorkboardItem) => {
    setSelectedId(item.id);
    setSecondaryAction(action);
    setActionReason(action === "invoice" ? item.invoiceUpdateRequestReason ?? "" : "");
    setRescheduleDate(item.scheduledDate);
    setRescheduleTime(deliveryTimeLabel(item.scheduledTime) ?? "");
    setRescheduleType(item.deliveryType ?? "Standard");
    setRescheduleAddress(item.deliveryAddress ?? "");
    setRescheduleTransport(item.transportMethod ?? "");
  };

  const runSecondaryAction = async () => {
    if (!selected || !secondaryAction) return;
    if (!actionReason.trim()) {
      message.warning("Add a reason before continuing.");
      return;
    }
    setSaving(true);
    try {
      if (secondaryAction === "cancel") {
        await cancelDelivery(selected.id, actionReason.trim());
        message.success("Delivery cancelled");
      } else if (secondaryAction === "invoice") {
        await requestDeliveryInvoiceUpdate(selected.id, actionReason.trim());
        message.success("Invoice update requested from Finance");
      } else if (secondaryAction === "buyer") {
        const canonicalCustomerId = vehicles.find((vehicle) => vehicle.id === selected.vehicleId)?.customerId;
        if (!canonicalCustomerId) {
          message.warning("Confirm the buyer on the vehicle record first.");
          return;
        }
        await correctDeliveryBuyer(selected.id, canonicalCustomerId, actionReason.trim());
        message.success("Delivery locked to the confirmed vehicle buyer");
      } else {
        if (!rescheduleDate) {
          message.warning("Choose a new delivery date.");
          return;
        }
        if (rescheduleType === "Outstation" && (!rescheduleAddress.trim() || !rescheduleTransport.trim())) {
          message.warning("Add the outstation address and transport arrangement.");
          return;
        }
        await updateDelivery(deliveryScheduleFromItem(selected, {
          scheduledDate: rescheduleDate,
          scheduledTime: rescheduleTime || undefined,
          deliveryType: rescheduleType,
          deliveryAddress: rescheduleType === "Outstation" ? rescheduleAddress.trim() : undefined,
          transportMethod: rescheduleType === "Outstation" ? rescheduleTransport.trim() : undefined,
          rescheduleReason: actionReason.trim()
        }));
        message.success("Delivery rescheduled");
      }
      setSecondaryAction(undefined);
      await refreshSelected(selected.id);
    } catch (error) {
      message.error(humanizeApiError(error, "The delivery action could not be completed."));
    } finally {
      setSaving(false);
    }
  };

  const menuItems = (item: DeliveryWorkboardItem): MenuProps["items"] => item.terminal ? [] : [
    { key: "reschedule", label: "Reschedule / 更改日期", onClick: () => openSecondaryAction("reschedule", item) },
    { type: "divider" as const },
    { key: "cancel", danger: true, label: "Cancel delivery / 取消交车", onClick: () => openSecondaryAction("cancel", item) }
  ];

  const columns: ColumnsType<DeliveryWorkboardItem> = [
    {
      title: "Car / 车辆",
      width: 190,
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{item.plateNumber}</Typography.Text>
          <Typography.Text type="secondary">{item.vehicleLabel}</Typography.Text>
        </Space>
      )
    },
    {
      title: "Customer / PIC",
      width: 220,
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{item.customerName}</Typography.Text>
          <Typography.Text type="secondary">PIC: {item.picName || "Not assigned"}</Typography.Text>
        </Space>
      )
    },
    {
      title: "Delivery / 交车",
      width: 190,
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{item.scheduledDate}{item.scheduledTime ? ` · ${deliveryTimeLabel(item.scheduledTime)}` : ""}</Typography.Text>
          <Typography.Text type="secondary" title={item.deliveryAddress}>{item.deliveryType === "Outstation" ? `Outstation · ${shortDestination(item.deliveryAddress)}` : "Showroom / 展厅"}</Typography.Text>
        </Space>
      )
    },
    {
      title: "Stage / 阶段",
      width: 165,
      render: (_, item) => <Tag color={stageMeta[item.stage].color}>{stageMeta[item.stage].shortLabel}</Tag>
    },
    {
      title: "Next action / 下一步",
      fixed: "right",
      width: 260,
      render: (_, item) => (
        <Space direction="vertical" size={4} className="deliveryWorkboardAction">
          {item.blocker
            ? <Typography.Text type="danger">{item.blocker}</Typography.Text>
            : <Typography.Text>{item.nextAction}</Typography.Text>}
          <Space size={6} wrap>
            <Button size="small" type="primary" onClick={() => openDetails(item)}>{item.terminal ? "View" : "Continue"}</Button>
            {!item.terminal && <Dropdown menu={{ items: menuItems(item) }} trigger={["click"]}>
              <Button size="small" aria-label={`More actions for ${item.plateNumber}`} icon={<MoreOutlined />} />
            </Dropdown>}
          </Space>
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" size={16} className="fullWidth deliveryWorkboardPage">
      <ProCard
        title="Delivery Workboard / 交车工作台"
        extra={<Button type="primary" disabled={eligibleVehicles.length === 0 || picOptions.length === 0} onClick={() => {
          createForm.resetFields();
          createForm.setFieldsValue({
            vehicleId: eligibleVehicles.length === 1 ? eligibleVehicles[0].id : undefined,
            picUserId: picOptions.length === 1 ? picOptions[0].id : undefined,
            deliveryType: "Standard"
          } as CreateDeliveryValues);
          setCreateOpen(true);
        }}>New delivery / 新交车</Button>}
      >
        <Typography.Paragraph type="secondary" className="deliveryWorkboardIntro">
          See every car, customer, PIC, stage, and next action in one place. Open a car only when you need to do the next step.
        </Typography.Paragraph>

        <div className="deliveryWorkboardStats" aria-label="Delivery queue filters">
          <button type="button" className={queueFilter === "ThisWeek" ? "isActive" : undefined} aria-pressed={queueFilter === "ThisWeek"} onClick={() => toggleQueueFilter("ThisWeek")}><strong>{thisWeekCount}</strong>This week</button>
          <button type="button" className={queueFilter === "NeedsAction" ? "isActive" : undefined} aria-pressed={queueFilter === "NeedsAction"} onClick={() => toggleQueueFilter("NeedsAction")}><strong>{needsActionCount}</strong>Needs action</button>
          <button type="button" className={queueFilter === "Ready" ? "isActive" : undefined} aria-pressed={queueFilter === "Ready"} onClick={() => toggleQueueFilter("Ready")}><strong>{readyCount}</strong>Ready</button>
          <button type="button" className={queueFilter === "Outstation" ? "isActive" : undefined} aria-pressed={queueFilter === "Outstation"} onClick={() => toggleQueueFilter("Outstation")}><strong>{outstationCount}</strong>Outstation</button>
        </div>

        {dashboardFocus?.vehicleId && <Alert
          type="info"
          showIcon
          message="Showing the delivery selected from Dashboard"
          action={<Button size="small" onClick={onClearDashboardFocus}>Clear focus</Button>}
        />}
        {loadError && <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => void reload()}>Try again</Button>} />}
        {eligibleVehicles.length === 0 && !loading && <Alert type="info" showIcon message="No buyer-confirmed car is waiting for a new delivery." />}
        {picOptions.length === 0 && !loading && <Alert type="warning" showIcon message="No active Delivery PIC is available. Ask Admin to assign Delivery access." />}

        <div className="deliveryWorkboardToolbar pageFilterMobileOnly">
          <Input.Search
            allowClear
            value={keyword}
            placeholder="Search plate, customer or PIC"
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Select<DeliveryWorkboardStage | "All">
            value={stageFilter}
            onChange={setStageFilter}
            options={[
              { value: "All", label: "All stages" },
              ...Object.entries(stageMeta).map(([value, meta]) => ({ value: value as DeliveryWorkboardStage, label: meta.shortLabel }))
            ]}
          />
          <Select<string | "All">
            showSearch
            optionFilterProp="label"
            value={picFilter}
            onChange={setPicFilter}
            options={[{ value: "All", label: "All PICs" }, ...picOptions.map((pic) => ({ value: pic.id, label: pic.displayName }))]}
          />
        </div>

        {loading ? <Skeleton active paragraph={{ rows: 6 }} /> : <>
          <div className="deliveryWorkboardMobileList">
            {filteredItems.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No deliveries match these filters." />}
            {mobileItems.map((item) => (
              <article className="deliveryWorkboardMobileCard" key={item.id}>
                <div className="deliveryWorkboardMobileHeader">
                  <div>
                    <Typography.Title level={5}>{item.plateNumber}</Typography.Title>
                    <Typography.Text type="secondary">{item.vehicleLabel}</Typography.Text>
                  </div>
                  <Tag color={stageMeta[item.stage].color}>{stageMeta[item.stage].shortLabel}</Tag>
                </div>
                <dl>
                  <div><dt>Customer</dt><dd>{item.customerName}</dd></div>
                  <div><dt>PIC</dt><dd>{item.picName || "Not assigned"}</dd></div>
                  <div><dt>Delivery</dt><dd>{item.scheduledDate}{item.scheduledTime ? ` · ${deliveryTimeLabel(item.scheduledTime)}` : ""}</dd></div>
                  <div><dt>Type</dt><dd>{item.deliveryType === "Outstation" ? `Outstation · ${shortDestination(item.deliveryAddress)}` : "Showroom"}</dd></div>
                </dl>
                <div className="deliveryWorkboardMobileNext">
                  {item.blocker
                    ? <Typography.Text type="danger">{item.blocker}</Typography.Text>
                    : <Typography.Text>{item.nextAction}</Typography.Text>}
                  <Space size={6}>
                    <Button type="primary" onClick={() => openDetails(item)}>{item.terminal ? "View" : "Continue"}</Button>
                    {!item.terminal && <Dropdown menu={{ items: menuItems(item) }} trigger={["click"]}><Button aria-label="More actions" icon={<MoreOutlined />} /></Dropdown>}
                  </Space>
                </div>
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
            className="deliveryWorkboardTable nativeSearchDesktopOnly"
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={filteredItems}
            nativeSearch={{
              fields: [
                { name: "plate", label: "Plate" },
                { name: "customer", label: "Customer" },
                { name: "pic", label: "PIC", options: picOptions.map((pic) => ({ value: pic.id, label: pic.displayName })) },
                { name: "schedule", label: "Schedule" },
                { name: "stage", label: "Stage", options: Object.entries(stageMeta).map(([value, meta]) => ({ value, label: meta.shortLabel })) }
              ],
              values: {
                pic: picFilter === "All" ? undefined : picFilter,
                stage: stageFilter === "All" ? undefined : stageFilter
              },
              onSubmit: (values) => {
                setKeyword(operationsKeywordFromFields(values, ["plate", "customer", "schedule"]));
                setPicFilter((values.pic as string | undefined) ?? "All");
                setStageFilter((values.stage as DeliveryWorkboardStage | undefined) ?? "All");
                setMobilePage(1);
              },
              onReset: () => {
                setKeyword("");
                setPicFilter("All");
                setStageFilter("All");
                setMobilePage(1);
              }
            }}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 1040 }}
            locale={{ emptyText: "No deliveries match these filters." }}
          />
        </>}
      </ProCard>

      <CreateDeliveryModal
        open={createOpen}
        form={createForm}
        deliveryType={createDeliveryType}
        vehicles={eligibleVehicles}
        picOptions={picOptions}
        saving={saving}
        onCancel={() => setCreateOpen(false)}
        onCreate={async (values) => {
          const vehicle = eligibleVehicles.find((item) => item.id === values.vehicleId);
          const pic = picOptions.find((item) => item.id === values.picUserId);
          if (!vehicle?.customerId || !pic) {
            message.warning("Choose a buyer-confirmed car and an active delivery PIC.");
            return;
          }
          const id = globalThis.crypto?.randomUUID?.() ?? `delivery-${Date.now()}`;
          const delivery: DeliverySchedule = {
            id,
            vehicleId: vehicle.id,
            customerId: vehicle.customerId,
            picUserId: pic.id,
            pic: pic.displayName,
            status: "BookingInspection",
            deliveryType: values.deliveryType,
            scheduledDate: values.scheduledDate,
            scheduledTime: values.scheduledTime,
            deliveryAddress: values.deliveryAddress?.trim() || undefined,
            transportMethod: values.transportMethod?.trim() || undefined,
            polishDone: false,
            tintedDone: false,
            washDone: false,
            documentsPrepared: false,
            inspectionDone: false,
            notificationSent: false,
            twoDayNoticeSent: false,
            insuranceHandled: false,
            roadTaxHandled: false,
            windscreenInsuranceHandled: false,
            handoverPhotoCaptured: false,
            signedHandoverReceived: false,
            customerAcknowledged: false,
            finalChecklistConfirmed: false
          };
          setSaving(true);
          try {
            await createDelivery(delivery);
            message.success("Delivery scheduled");
            setCreateOpen(false);
            await reload();
          } catch (error) {
            message.error(humanizeApiError(error, "Delivery could not be scheduled."));
          } finally {
            setSaving(false);
          }
        }}
      />

      <Drawer
        rootClassName="deliveryWorkboardDrawer"
        width={760}
        open={Boolean(selected)}
        onClose={() => setSelectedId(undefined)}
        title={selected ? `${selected.plateNumber} · ${stageMeta[selected.stage].label}` : "Delivery"}
        extra={selected && <Space>
          <Button icon={<UserOutlined />} disabled={!hasLockedDeliveryBuyer(selected.customerId)} onClick={() => hasLockedDeliveryBuyer(selected.customerId) && onOpenCustomer(selected.customerId!)}>Customer</Button>
          {!selected.terminal && <Dropdown menu={{ items: menuItems(selected) }} trigger={["click"]}><Button icon={<MoreOutlined />}>More</Button></Dropdown>}
        </Space>}
      >
        {selected && <DeliveryDrawerContent
          item={selected}
          picOptions={picOptions}
          activity={activity}
          activityLoading={activityLoading}
          saving={saving}
          buyerCorrectionAvailable={canCorrectDeliveryBuyer(selected, vehicles, canCorrectBuyer)}
          onSave={(patch, successMessage) => saveProgress(selected, patch, successMessage)}
          onUpload={(file, category) => uploadEvidence(selected, file, category)}
          onRelease={() => confirmRelease(selected)}
          onRequestInvoice={() => openSecondaryAction("invoice", selected)}
          onCorrectBuyer={() => openSecondaryAction("buyer", selected)}
        />}
      </Drawer>

      <Modal
        open={Boolean(secondaryAction)}
        title={secondaryAction === "cancel" ? "Cancel delivery?" : secondaryAction === "invoice" ? "Request invoice update" : secondaryAction === "buyer" ? "Lock confirmed buyer?" : "Reschedule delivery"}
        okText={secondaryAction === "cancel" ? "Cancel delivery" : secondaryAction === "invoice" ? "Send request" : secondaryAction === "buyer" ? "Confirm buyer lock" : "Save new schedule"}
        okButtonProps={{ danger: secondaryAction === "cancel", loading: saving }}
        onCancel={() => setSecondaryAction(undefined)}
        onOk={() => void runSecondaryAction()}
      >
        {secondaryAction === "cancel" && <Alert type="warning" showIcon message="This closes the delivery record. Start a new delivery if the sale continues later." />}
        {secondaryAction === "invoice" && <Alert type="info" showIcon message="Finance will receive the request. Delivery staff cannot edit invoice details." />}
        {secondaryAction === "buyer" && <Alert type="warning" showIcon message="This locks delivery to the confirmed buyer already linked on the vehicle. It does not change or select a different customer." />}
        {secondaryAction === "reschedule" && <div className="deliveryActionDateGrid">
          <label><span>New date</span><Input type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} /></label>
          <label><span>Time</span><Input type="time" value={rescheduleTime} onChange={(event) => setRescheduleTime(event.target.value)} /></label>
          <label><span>Location</span><Select value={rescheduleType} onChange={setRescheduleType} options={[{ value: "Standard", label: "Showroom / 展厅" }, { value: "Outstation", label: "Outstation / 外坡" }]} /></label>
          {rescheduleType === "Outstation" && <>
            <label><span>Delivery address</span><Input value={rescheduleAddress} onChange={(event) => setRescheduleAddress(event.target.value)} /></label>
            <label><span>Transport</span><Input value={rescheduleTransport} onChange={(event) => setRescheduleTransport(event.target.value)} /></label>
          </>}
        </div>}
        <label className="deliveryActionReason">
          <span>{secondaryAction === "invoice" ? "What needs updating?" : secondaryAction === "buyer" ? "Why is this correction needed?" : "Reason"}</span>
          <Input.TextArea rows={3} value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="Add a short, clear reason" />
        </label>
      </Modal>
    </Space>
  );
}

function CreateDeliveryModal({
  open,
  form,
  deliveryType,
  vehicles,
  picOptions,
  saving,
  onCancel,
  onCreate
}: {
  open: boolean;
  form: ReturnType<typeof Form.useForm<CreateDeliveryValues>>[0];
  deliveryType?: CreateDeliveryValues["deliveryType"];
  vehicles: VehicleLookup[];
  picOptions: DeliveryPicOption[];
  saving: boolean;
  onCancel: () => void;
  onCreate: (values: CreateDeliveryValues) => Promise<void>;
}) {
  return (
    <Modal
      open={open}
      title="New delivery / 新交车"
      okText="Schedule delivery"
      okButtonProps={{ loading: saving }}
      onCancel={onCancel}
      onOk={() => form.submit()}
    >
      <Typography.Paragraph type="secondary">Start with the people, time, and place. The workboard will guide the remaining steps.</Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={(values) => void onCreate(values)}>
        <Form.Item name="vehicleId" label="Car / 车辆" rules={[{ required: true, message: "Choose a car." }]}>
          <Select showSearch optionFilterProp="label" options={vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.plateNumber} · ${vehicle.make} ${vehicle.model}` }))} />
        </Form.Item>
        <Form.Item name="picUserId" label="PIC / 负责人" rules={[{ required: true, message: "Choose a delivery PIC." }]}>
          <Select showSearch optionFilterProp="label" options={picOptions.map((pic) => ({ value: pic.id, label: pic.displayName }))} />
        </Form.Item>
        <div className="deliveryCreateGrid">
          <Form.Item name="scheduledDate" label="Delivery date / 交车日期" rules={[{ required: true, message: "Choose a date." }]}><Input type="date" /></Form.Item>
          <Form.Item name="scheduledTime" label="Time / 时间" rules={[{ required: true, message: "Choose a time." }]}><Input type="time" /></Form.Item>
        </div>
        <Form.Item name="deliveryType" label="Location / 地点" rules={[{ required: true }]}>
          <Select options={[{ value: "Standard", label: "Showroom / 展厅" }, { value: "Outstation", label: "Outstation / 外坡" }]} />
        </Form.Item>
        {deliveryType === "Outstation" && <>
          <Form.Item name="deliveryAddress" label="Delivery address / 地址" rules={[{ required: true, message: "Add the outstation address." }]}><Input /></Form.Item>
          <Form.Item name="transportMethod" label="Transport / 运输" rules={[{ required: true, message: "Add the transport arrangement." }]}><Input placeholder="Driver, runner or transporter" /></Form.Item>
        </>}
      </Form>
    </Modal>
  );
}

export function DeliveryDrawerContent({
  item,
  picOptions,
  activity,
  activityLoading,
  saving,
  buyerCorrectionAvailable = false,
  onSave,
  onUpload,
  onRelease,
  onRequestInvoice,
  onCorrectBuyer
}: {
  item: DeliveryWorkboardItem;
  picOptions: DeliveryPicOption[];
  activity: DeliveryActivity[];
  activityLoading: boolean;
  saving: boolean;
  buyerCorrectionAvailable?: boolean;
  onSave: (patch: Partial<DeliverySchedule>, successMessage?: string) => Promise<void>;
  onUpload: (file: File, category: DocumentCategory) => Promise<void>;
  onRelease: () => void;
  onRequestInvoice: () => void;
  onCorrectBuyer?: () => void;
}) {
  const completed = completedDeliveryStages(item.stage);
  const completedItems = completed.map((stage) => ({
    key: stage,
    label: <Space><CheckCircleOutlined className="deliveryStageCompleteIcon" />{stageMeta[stage].label}</Space>,
    children: <StageSummary item={item} stage={stage} />
  }));

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
        <Descriptions.Item label="Car / 车辆">{item.plateNumber} · {item.vehicleLabel}</Descriptions.Item>
        <Descriptions.Item label="Customer / 客户">{item.customerName}</Descriptions.Item>
        <Descriptions.Item label="PIC / 负责人">{item.picName || "Not assigned"}</Descriptions.Item>
        <Descriptions.Item label="Delivery / 交车">{item.scheduledDate}{item.scheduledTime ? ` · ${deliveryTimeLabel(item.scheduledTime)}` : ""}</Descriptions.Item>
        <Descriptions.Item label="Location / 地点">{item.deliveryType === "Outstation" ? "Outstation / 外坡" : "Showroom / 展厅"}</Descriptions.Item>
        {item.deliveryType === "Outstation" && <Descriptions.Item label="Address / 地址">{item.deliveryAddress || "Not provided"}</Descriptions.Item>}
        {item.deliveryType === "Outstation" && <Descriptions.Item label="Transport / 运输">{item.transportMethod || "Not provided"}</Descriptions.Item>}
      </Descriptions>

      {item.blocker && !item.terminal && <Alert
        type="warning"
        showIcon
        message="What is blocking release"
        description={item.blocker}
        action={buyerCorrectionAvailable && onCorrectBuyer ? <Button size="small" onClick={onCorrectBuyer}>Lock confirmed buyer</Button> : undefined}
      />}
      {completedItems.length > 0 && <Collapse ghost items={completedItems} />}

      {item.terminal ? <Alert
        type={item.stage === "Completed" ? "success" : "info"}
        showIcon
        message={stageMeta[item.stage].label}
        description={item.stage === "Completed"
          ? "This vehicle has been handed over. The delivery record is read-only."
          : `This delivery was cancelled${item.cancellationReason ? `: ${item.cancellationReason}` : ""}. The record is read-only.`}
      /> : <section className="deliveryCurrentStage" aria-label={`Current stage: ${stageMeta[item.stage].label}`}>
        <div className="deliveryCurrentStageHeader">
          <div>
            <Typography.Text className="moduleEyebrow">Current stage / 当前阶段</Typography.Text>
            <Typography.Title level={4}>{stageMeta[item.stage].label}</Typography.Title>
          </div>
        </div>
        <CurrentStageForm item={item} picOptions={picOptions} saving={saving} onSave={onSave} onUpload={onUpload} onRelease={onRelease} onRequestInvoice={onRequestInvoice} />
      </section>}

      <section className="deliveryActivityPanel">
        <Typography.Title level={5}>Activity / 记录</Typography.Title>
        {activityLoading ? <Skeleton active paragraph={{ rows: 3 }} /> : activity.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No activity recorded yet." /> : <Timeline
          items={activity.map((entry) => ({
            dot: <ClockCircleOutlined />,
            children: <div><Typography.Text strong>{entry.summary}</Typography.Text><br /><Typography.Text type="secondary">{entry.actorName} · {String(entry.createdAt).replace("T", " ").slice(0, 16)}</Typography.Text></div>
          }))}
        />}
      </section>
    </Space>
  );
}

export function CurrentStageForm({
  item,
  picOptions,
  saving,
  onSave,
  onUpload,
  onRelease,
  onRequestInvoice
}: {
  item: DeliveryWorkboardItem;
  picOptions: DeliveryPicOption[];
  saving: boolean;
  onSave: (patch: Partial<DeliverySchedule>, successMessage?: string) => Promise<void>;
  onUpload: (file: File, category: DocumentCategory) => Promise<void>;
  onRelease: () => void;
  onRequestInvoice: () => void;
}) {
  if (item.stage === "PlanDelivery") {
    return <Form
      key={`${item.id}-plan`}
      layout="vertical"
      initialValues={item}
      onFinish={(values) => void onSave(values, "Delivery plan saved")}
    >
      <Form.Item name="picUserId" label="PIC / 负责人" rules={[{ required: true, message: "Choose a delivery PIC." }]}>
        <Select showSearch optionFilterProp="label" options={picOptions.map((pic) => ({ value: pic.id, label: pic.displayName }))} />
      </Form.Item>
      <Form.Item name="inspectionBookingReference" label="Inspection booking / 验车预约" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
      <Typography.Paragraph type="secondary">To change {item.scheduledDate}{item.scheduledTime ? ` at ${deliveryTimeLabel(item.scheduledTime)}` : ""}, use More → Reschedule so the reason is recorded.</Typography.Paragraph>
      <Button type="primary" htmlType="submit" loading={saving}>Save inspection booking / 保存验车预约</Button>
    </Form>;
  }

  if (item.stage === "PrepareCar") {
    return <Form
      key={`${item.id}-prepare`}
      layout="vertical"
      initialValues={item}
      onFinish={(values) => void onSave(values, "Car preparation saved")}
    >
      <EvidenceUpload item={item} category="InspectionReport" saving={saving} onUpload={onUpload} />
      <div className="deliveryCheckGrid">
        <Form.Item name="inspectionDone" valuePropName="checked"><Checkbox>Inspection completed / 检查完成</Checkbox></Form.Item>
        <Form.Item name="polishDone" valuePropName="checked"><Checkbox>Polish completed / 抛光完成</Checkbox></Form.Item>
        <Form.Item name="tintedDone" valuePropName="checked"><Checkbox>Tint completed / 隔热膜完成</Checkbox></Form.Item>
        <Form.Item name="washDone" valuePropName="checked"><Checkbox>Car wash completed / 洗车完成</Checkbox></Form.Item>
      </div>
      <Button type="primary" htmlType="submit" loading={saving}>Save preparation / 保存准备</Button>
    </Form>;
  }

  if (item.stage === "ClearDocuments") {
    return <Form
      key={`${item.id}-documents`}
      layout="vertical"
      initialValues={item}
      onFinish={(values) => void onSave(values, "Document checks saved")}
    >
      <div className="deliveryEvidenceGrid">
        {(["DeliveryDocument", "Policy", "RoadTaxReceipt", "WindscreenPolicy"] as DocumentCategory[]).map((category) => (
          <EvidenceUpload key={category} item={item} category={category} saving={saving} onUpload={onUpload} />
        ))}
      </div>
      <div className="deliveryStageFormGrid">
        <Form.Item name="insuranceExpiryDate" label="Insurance expiry"><Input type="date" /></Form.Item>
        <Form.Item name="roadTaxExpiryDate" label="Road tax expiry"><Input type="date" /></Form.Item>
        <Form.Item name="windscreenInsuranceExpiryDate" label="Windscreen expiry"><Input type="date" /></Form.Item>
      </div>
      <div className="deliveryEvidenceReviewIntro">
        <Typography.Text strong>Evidence reviewed and confirmed / 证据已审核确认</Typography.Text>
        <Typography.Paragraph type="secondary">Received means a file is on record. Open each file and confirm it is correct before checking the matching item below.</Typography.Paragraph>
      </div>
      <div className="deliveryCheckGrid">
        <Form.Item name="documentsPrepared" valuePropName="checked"><Checkbox>Delivery documents reviewed and confirmed</Checkbox></Form.Item>
        <Form.Item name="insuranceHandled" valuePropName="checked"><Checkbox>Insurance evidence reviewed and confirmed</Checkbox></Form.Item>
        <Form.Item name="roadTaxHandled" valuePropName="checked"><Checkbox>Road tax evidence reviewed and confirmed</Checkbox></Form.Item>
        <Form.Item name="windscreenInsuranceHandled" valuePropName="checked"><Checkbox>Windscreen cover reviewed and confirmed</Checkbox></Form.Item>
      </div>
      <Form.Item name="twoDayNoticeSent" valuePropName="checked" className="deliveryNoticeCheck"><Checkbox>2-day customer notice sent</Checkbox></Form.Item>
      <div className="deliveryFinanceGate">
        <Alert
          type={item.financeCleared ? "success" : "warning"}
          showIcon
          message={item.financeCleared ? "Finance cleared / 财务已确认" : "Waiting for Finance / 等待财务"}
          description="Delivery can see clearance only. Invoice amounts and payment details stay with Finance."
        />
        <Button disabled={item.invoiceUpdateRequested} onClick={onRequestInvoice}>{item.invoiceUpdateRequested ? "Request sent to Finance" : "Request invoice update"}</Button>
      </div>
      <Button type="primary" htmlType="submit" loading={saving}>Save document checks / 保存文件确认</Button>
    </Form>;
  }

  return <Form
    key={`${item.id}-handover`}
    layout="vertical"
    initialValues={item}
    onFinish={(values) => void onSave(values, "Handover checks saved")}
  >
    <div className="deliveryEvidenceGrid">
      <EvidenceUpload item={item} category="HandoverPhoto" saving={saving} onUpload={onUpload} />
      <EvidenceUpload item={item} category="SignedHandover" saving={saving} onUpload={onUpload} />
    </div>
    <div className="deliveryCheckGrid">
      <Form.Item name="customerAcknowledged" valuePropName="checked"><Checkbox>Customer acknowledged handover</Checkbox></Form.Item>
      <Form.Item name="finalChecklistConfirmed" valuePropName="checked"><Checkbox>Final checklist confirmed</Checkbox></Form.Item>
    </div>
    <Alert
      type={item.financeCleared ? "success" : "warning"}
      showIcon
      message={item.financeCleared ? "Finance cleared" : "Release blocked: waiting for Finance"}
    />
    {item.canRelease ? <Button type="primary" onClick={onRelease} loading={saving}>Confirm vehicle release / 确认交车</Button> : <Button type="primary" htmlType="submit" loading={saving}>Save handover checks / 保存交车确认</Button>}
  </Form>;
}

function EvidenceUpload({
  item,
  category,
  saving,
  onUpload
}: {
  item: DeliveryWorkboardItem;
  category: DocumentCategory;
  saving: boolean;
  onUpload: (file: File, category: DocumentCategory) => Promise<void>;
}) {
  const evidence = item.evidence.find((entry) => entry.category === category && entry.isPresent);
  const accept = category === "HandoverPhoto" ? "image/jpeg,image/png,image/webp" : "application/pdf,image/jpeg,image/png";
  return (
    <div className="deliveryEvidenceItem">
      <div>
        <Typography.Text strong>{evidenceLabels[category] ?? category}</Typography.Text>
        <Typography.Text type="secondary">{evidence?.fileName ?? "Not uploaded yet"}</Typography.Text>
        {evidence?.uploadedBy && <Typography.Text type="secondary">{evidence.uploadedBy} · {String(evidence.uploadedAt ?? "").replace("T", " ").slice(0, 16)}</Typography.Text>}
      </div>
      <Space>
        <Tag color={evidence ? "green" : "orange"}>{evidence ? "Received" : "Needed"}</Tag>
        {evidence?.documentId && <Button
          size="small"
          icon={<ExportOutlined />}
          href={vehicleDocumentContentUrl(item.vehicleId, evidence.documentId)}
          target="_blank"
          rel="noreferrer"
        >Open</Button>}
        <Upload
          accept={accept}
          showUploadList={false}
          disabled={saving || item.terminal}
          beforeUpload={(file) => {
            void onUpload(file as File, category);
            return Upload.LIST_IGNORE;
          }}
        >
          <Button size="small" icon={<UploadOutlined />}>{evidence ? "Replace" : "Upload"}</Button>
        </Upload>
      </Space>
    </div>
  );
}

function StageSummary({ item, stage }: { item: DeliveryWorkboardItem; stage: DeliveryWorkboardStage }) {
  if (stage === "PlanDelivery") {
    return <Typography.Text type="secondary">{item.scheduledDate}{item.scheduledTime ? ` · ${deliveryTimeLabel(item.scheduledTime)}` : ""} · {item.deliveryType === "Outstation" ? "Outstation" : "Showroom"} · Inspection booked</Typography.Text>;
  }
  if (stage === "PrepareCar") {
    return <Typography.Text type="secondary">Inspection, polish, tint, and wash recorded.</Typography.Text>;
  }
  if (stage === "ClearDocuments") {
    return <Typography.Text type="secondary">Coverage, documents, customer notice, and Finance clearance checked.</Typography.Text>;
  }
  return <Typography.Text type="secondary">Handover evidence and final confirmation recorded.</Typography.Text>;
}
