import { dialogWidths } from "./dialogSizing";
import { BusinessDialog } from "./BusinessDialog";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Calendar, DatePicker, Empty, Form, Grid, Input, List, Modal, Select, Skeleton, Space, Spin, Tag, TimePicker, Typography } from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";
import { ProCard } from "@ant-design/pro-components";
import dayjs from "dayjs";
import { createCalendarTask, getOperationsCalendar, type OperationsCalendarEvent, type StaffUser } from "../../api";
import { displayRoleLabel } from "../../roleLabels";
import { DataFreshness } from "./DataFreshness";
import "./operationsCalendar.css";

export function eventsOnDate(events: OperationsCalendarEvent[], date: string) {
  return events.filter(event => event.startDate <= date && event.endDate >= date);
}

export function operationsCalendarEventDetail(event: OperationsCalendarEvent) {
  const taskTimeline = event.kind === "Task" && event.startTime && event.endTime
    ? `${event.startDate} ${event.startTime.slice(0, 5)} – ${event.endDate} ${event.endTime.slice(0, 5)} (MYT)`
    : `${event.startDate} – ${event.endDate}`;
  return {
    time: (event.kind === "Delivery" || event.kind === "Inspection") ? event.time ?? "Time not set" : taskTimeline,
    status: (event.kind === "Delivery" || event.kind === "Inspection") ? event.status ?? "Status unavailable" : event.kind === "Task" ? event.status : undefined
  };
}

export function operationsCalendarCellKinds(events: OperationsCalendarEvent[]) {
  return {
    delivery: events.filter(event => event.kind === "Delivery").length,
    busy: events.filter(event => event.kind === "Busy").length,
    holiday: events.filter(event => event.kind === "Holiday").length
  };
}

export function hasScheduledDeliveryTime(event: OperationsCalendarEvent) {
  return (event.kind === "Delivery" || event.kind === "Inspection") && Boolean(event.time);
}

export function operationsCalendarVehicleLabel(event: OperationsCalendarEvent) {
  return [event.vehicleYear, event.vehicleMake, event.vehicleModel].filter(Boolean).join(" ");
}

export function shouldOpenCalendarDayDrawer(source: string, isMobile: boolean) {
  return isMobile && source === "date";
}

export function SelectedDayEvents({
  events,
  onOpenDelivery
}: {
  events: OperationsCalendarEvent[];
  onOpenDelivery?: (deliveryId: string) => void;
}) {
  return (
    <List
      dataSource={events}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No scheduled events / 暂无日程" /> }}
      renderItem={event => {
        const detail = operationsCalendarEventDetail(event);
        return (
          <List.Item key={`${event.kind}-${event.id}`} className="operationsCalendarEvent">
            <div className="operationsCalendarEventBody">
              <Space size={6} wrap>
                <Tag color={event.kind === "Delivery" ? "blue" : event.kind === "Task" ? "purple" : event.kind === "Holiday" ? "gold" : "orange"}>{event.kind === "Inspection" ? "Inspection / 验车" : event.kind === "Delivery" ? "Delivery / 出车" : event.kind === "Task" ? "Task / 任务" : event.kind === "Holiday" ? "Public holiday / 公共假期" : event.availabilityKind === "Leave" ? "On Leave / 休假" : event.availabilityKind === "BusinessTrip" ? "Business Trip / 出差" : "Busy / 忙碌"}</Tag>
                {detail.status && <Tag>{detail.status}</Tag>}
              </Space>
              <Space size={6} wrap>
                <Typography.Text strong>{event.title}</Typography.Text>
                {(event.kind === "Delivery" || event.kind === "Inspection") && operationsCalendarVehicleLabel(event) ? <Typography.Text type="secondary">{operationsCalendarVehicleLabel(event)}</Typography.Text> : null}
              </Space>
              <Typography.Text type="secondary">
                {hasScheduledDeliveryTime(event) && <ClockCircleOutlined aria-hidden="true" className="operationsCalendarTimeIcon" />}
                {detail.time}
              </Typography.Text>
              {event.kind === "Task" && <Typography.Text type="secondary">Assigned to / 负责员工: {event.assignedToName ?? "Unassigned"}</Typography.Text>}
              {event.kind === "Task" && event.description && <Typography.Text type="secondary">{event.description}</Typography.Text>}
              {event.kind === "Delivery" && (
                <Typography.Text type="secondary" className="operationsCalendarCustomer">
                  Customer / 客户: {event.customerName ?? "No customer linked"}{event.customerContact ? ` · ${event.customerContact}` : ""}
                </Typography.Text>
              )}
            </div>
            {event.kind === "Delivery" && onOpenDelivery && <Button type="link" onClick={() => onOpenDelivery(event.id)}>Open delivery</Button>}
          </List.Item>
        );
      }}
    />
  );
}

export function OperationsCalendar({ onOpenDelivery, compact = false, canManageTasks = false, staffUsers = [] }: { onOpenDelivery?: (deliveryId: string) => void; compact?: boolean; canManageTasks?: boolean; staffUsers?: StaffUser[] }) {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [monthExpanded, setMonthExpanded] = useState(compact);
  const [date, setDate] = useState(() => dayjs());
  const [events, setEvents] = useState<OperationsCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [mobileDayDrawerOpen, setMobileDayDrawerOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskSaveError, setTaskSaveError] = useState<string | null>(null);
  const [taskForm] = Form.useForm();
  const calendarRegionRef = useRef<HTMLDivElement>(null);
  const month = date.format("YYYY-MM");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setEvents([]);
    const start = dayjs(`${month}-01`);
    getOperationsCalendar(start.startOf("week").format("YYYY-MM-DD"), start.endOf("month").endOf("week").format("YYYY-MM-DD"))
      .then(result => { if (active) { setEvents(result); setUpdatedAt(new Date()); setLoadedMonth(month); } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Calendar could not load. Please retry."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, refresh]);

  useEffect(() => {
    if (!isMobile) setMobileDayDrawerOpen(false);
  }, [isMobile]);

  const selected = eventsOnDate(events, date.format("YYYY-MM-DD"));
  const monthCollapsed = (compact || isMobile) && !monthExpanded;
  const navigateMonth = (direction: -1 | 1) => {
    setDate(current => current.add(direction, "month"));
    setMobileDayDrawerOpen(false);
  };
  const closeMobileDayDrawer = () => {
    setMobileDayDrawerOpen(false);
    requestAnimationFrame(() => calendarRegionRef.current?.focus());
  };

  const openTaskModal = () => {
    setTaskSaveError(null);
    taskForm.resetFields();
    taskForm.setFieldsValue({ startDate: date, endDate: date, assignedToUserId: staffUsers.find(user => user.isActive)?.id });
    setTaskModalOpen(true);
  };

  const saveTask = async () => {
    try {
      const values = await taskForm.validateFields();
      setTaskSaving(true);
      setTaskSaveError(null);
      await createCalendarTask({
        title: values.title,
        description: values.description,
        startDate: values.startDate.format("YYYY-MM-DD"),
        endDate: values.endDate.format("YYYY-MM-DD"),
        startTime: values.startTime.format("HH:mm:ss"),
        endTime: values.endTime.format("HH:mm:ss"),
        assignedToUserId: values.assignedToUserId
      });
      setTaskModalOpen(false);
      taskForm.resetFields();
      setRefresh(value => value + 1);
    } catch (reason) {
      if (reason && typeof reason === "object" && "errorFields" in reason) return;
      setTaskSaveError(reason instanceof Error ? reason.message : "Task could not be saved. Please try again.");
    } finally {
      setTaskSaving(false);
    }
  };

  return <>
    <ProCard title="Operations calendar / 工作日历" className={`operationsCalendar${compact ? " operationsCalendarCompact" : ""}`} extra={<Space wrap><>{canManageTasks && <Button type="primary" onClick={openTaskModal}>Add task / 新增任务</Button>}</><Button aria-label="Refresh calendar" loading={loading} onClick={() => setRefresh(value => value + 1)}>Refresh</Button></Space>}>
    <Typography.Paragraph className="operationsCalendarDescription" type="secondary">Delivery, inspection appointments, assigned tasks, staff availability and public holidays. / 出车、验车预约、工作任务、员工忙碌时间与公共假期。</Typography.Paragraph>
    <div className="operationsCalendarMeta">
      <DataFreshness label="Calendar" updatedAt={loadedMonth === month ? updatedAt : null} loading={loading} error={error} />
      {(compact || isMobile) && <Button className="operationsCalendarToggle" aria-expanded={monthExpanded} aria-controls="operations-month-grid" onClick={() => setMonthExpanded(value => !value)}>{monthExpanded ? "Hide month / 收起月历" : "Show month / 展开月历"}</Button>}
    </div>
    {error && <Alert type="error" showIcon message="Calendar unavailable" description={error} />}
     {compact && <div className="operationsCalendarLegend"><span><span className="operationsCalendarLegendDelivery" aria-hidden="true" />Delivery / 出车</span><span><span className="operationsCalendarLegendBusy" aria-hidden="true" />Staff busy / 员工忙碌</span><span><span className="operationsCalendarLegendHoliday" aria-hidden="true" />Public holiday / 公共假期</span><span>Numbers show events that day / 数字为当天安排数量</span></div>}
    <Spin spinning={loading}>
      <div className="operationsCalendarLayout" ref={calendarRegionRef} tabIndex={-1} aria-label="Operations calendar">
        <div id="operations-month-grid" hidden={monthCollapsed}><Calendar fullscreen={false} value={date} onSelect={(nextDate, info) => { setDate(nextDate); if (shouldOpenCalendarDayDrawer(info.source, isMobile)) setMobileDayDrawerOpen(true); }} headerRender={() => <Space wrap className="operationsCalendarToolbar"><Button aria-label="Previous month" onClick={() => navigateMonth(-1)}>‹</Button><DatePicker picker="month" format="MMMM YYYY" allowClear={false} value={date} onChange={value => { if (value) { setDate(value); setMobileDayDrawerOpen(false); } }} /><Button aria-label="Next month" onClick={() => navigateMonth(1)}>›</Button><Button onClick={() => { setDate(dayjs()); setMobileDayDrawerOpen(false); }}>Today</Button></Space>} cellRender={(value, info) => {
          if (info.type !== "date") return null;
          const dateEvents = eventsOnDate(events, value.format("YYYY-MM-DD"));
          if (dateEvents.length === 0) return null;
          const kinds = operationsCalendarCellKinds(dateEvents);
           return <span className="operationsCalendarCellState" role="img" aria-label={compact ? `${dateEvents.length} events: ${kinds.delivery} deliveries, ${kinds.busy} staff busy, ${kinds.holiday} public holidays` : `${dateEvents.length} events`}>
            {compact && <span className="operationsCalendarCellCount">{dateEvents.length}</span>}
            {kinds.delivery > 0 && <span className="operationsCalendarCellCue operationsCalendarCellCueDelivery" aria-hidden="true" />}
            {kinds.busy > 0 && <span className="operationsCalendarCellCue operationsCalendarCellCueBusy" aria-hidden="true" />}
            {kinds.holiday > 0 && <span className="operationsCalendarCellCue operationsCalendarCellCueHoliday" aria-hidden="true" />}
          </span>;
        }} /></div>
        <section className={`operationsCalendarDesktopAgenda${monthCollapsed ? " operationsCalendarCollapsedAgenda" : ""}`} aria-label="Selected day events">
          <div className="operationsCalendarAgendaHeading"><div><Typography.Text type="secondary">Day agenda / 当天安排</Typography.Text><Typography.Title level={5}>{date.format("ddd, D MMM YYYY")}</Typography.Title></div>{!loading && !error && <Tag>{selected.length} {selected.length === 1 ? "event" : "events"} / 项安排</Tag>}</div>
          {loading ? <Skeleton active paragraph={{ rows: 2 }} /> : !error && <SelectedDayEvents events={selected} onOpenDelivery={onOpenDelivery} />}
        </section>
      </div>
    </Spin>
    <BusinessDialog width={dialogWidths.form}
      title={date.format("ddd, D MMM YYYY")}
      placement="bottom"
      height="72vh"
      open={isMobile && mobileDayDrawerOpen}
      onClose={closeMobileDayDrawer}
      rootClassName="operationsCalendarDayDrawer"
      destroyOnClose
    >
      {error
        ? <Alert type="error" showIcon message="Calendar unavailable" description={error} action={<Button onClick={() => setRefresh(value => value + 1)}>Try again</Button>} />
        : loading ? <Skeleton active paragraph={{ rows: 2 }} /> : <SelectedDayEvents events={selected} onOpenDelivery={onOpenDelivery} />}
    </BusinessDialog>
    </ProCard>
    <Modal width={dialogWidths.form} centered mask={{ closable: false }} title="Add calendar task / 新增日历任务" open={taskModalOpen} onCancel={() => setTaskModalOpen(false)} onOk={() => void saveTask()} confirmLoading={taskSaving} okText="Save task / 保存任务" destroyOnClose>
      {taskSaveError && <Alert type="error" showIcon message="Task could not be saved" description={taskSaveError} />}
      <Form form={taskForm} layout="vertical">
        <Form.Item name="title" label="Task / 任务" rules={[{ required: true, message: "Enter a task title." }]}><Input maxLength={160} showCount /></Form.Item>
        <Form.Item name="description" label="Details / 备注"><Input.TextArea maxLength={2000} showCount rows={3} /></Form.Item>
        <Typography.Paragraph type="secondary">Date and time / 日期与时间 · Malaysia (MYT)</Typography.Paragraph>
        <div className="calendarTaskTimeGrid">
          <Form.Item name="startDate" label="Start / 开始日期" rules={[{ required: true, message: "Select the start date." }]}><DatePicker className="fullWidth" format="DD MMM YYYY" allowClear={false} /></Form.Item>
          <Form.Item name="startTime" label="Time / 开始时间" rules={[{ required: true, message: "Select the start time." }]}><TimePicker className="fullWidth" format="HH:mm" needConfirm={false} /></Form.Item>
          <Form.Item name="endDate" label="End / 结束日期" rules={[{ required: true, message: "Select the end date." }]}><DatePicker className="fullWidth" format="DD MMM YYYY" allowClear={false} /></Form.Item>
          <Form.Item name="endTime" label="Time / 结束时间" dependencies={["startDate", "startTime", "endDate"]} rules={[
            { required: true, message: "Select the end time." },
            ({ getFieldValue }) => ({ validator(_, value) {
              const startDate = getFieldValue("startDate");
              const startTime = getFieldValue("startTime");
              const endDate = getFieldValue("endDate");
              if (startDate && startTime && endDate && value) {
                const start = startDate.format("YYYY-MM-DD") + startTime.format("HH:mm");
                const end = endDate.format("YYYY-MM-DD") + value.format("HH:mm");
                if (end <= start) return Promise.reject(new Error("End must be after the start date and time."));
              }
              return Promise.resolve();
            } })
          ]}><TimePicker className="fullWidth" format="HH:mm" needConfirm={false} /></Form.Item>
        </div>
        <Form.Item name="assignedToUserId" label="Assign to / 负责员工" rules={[{ required: true, message: "Select a staff member." }]}>
          <Select showSearch optionFilterProp="label" options={staffUsers.filter(user => user.isActive).map(user => ({ value: user.id, label: `${user.displayName} / ${user.roles.map(displayRoleLabel).join(", ")}` }))} placeholder="Select staff / 选择员工" />
        </Form.Item>
      </Form>
    </Modal>
  </>;
}
