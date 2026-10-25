import { useEffect, useRef, useState } from "react";
import { Alert, Button, Calendar, DatePicker, Drawer, Empty, Grid, List, Skeleton, Space, Spin, Tag, Typography } from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";
import { ProCard } from "@ant-design/pro-components";
import dayjs from "dayjs";
import { getOperationsCalendar, type OperationsCalendarEvent } from "../../api";
import { DataFreshness } from "./DataFreshness";
import "./operationsCalendar.css";

export function eventsOnDate(events: OperationsCalendarEvent[], date: string) {
  return events.filter(event => event.startDate <= date && event.endDate >= date);
}

export function operationsCalendarEventDetail(event: OperationsCalendarEvent) {
  return {
    time: event.kind === "Delivery" ? event.time ?? "Time not set" : `${event.startDate} – ${event.endDate}`,
    status: event.kind === "Delivery" ? event.status ?? "Status unavailable" : undefined
  };
}

export function operationsCalendarCellKinds(events: OperationsCalendarEvent[]) {
  return {
    delivery: events.filter(event => event.kind === "Delivery").length,
    busy: events.filter(event => event.kind === "Busy").length
  };
}

export function hasScheduledDeliveryTime(event: OperationsCalendarEvent) {
  return event.kind === "Delivery" && Boolean(event.time);
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
                <Tag color={event.kind === "Delivery" ? "blue" : "orange"}>{event.kind === "Delivery" ? "Delivery / 出车" : "Busy / 忙碌"}</Tag>
                {detail.status && <Tag>{detail.status}</Tag>}
              </Space>
              <Space size={6} wrap>
                <Typography.Text strong>{event.title}</Typography.Text>
                {event.kind === "Delivery" && operationsCalendarVehicleLabel(event) ? <Typography.Text type="secondary">{operationsCalendarVehicleLabel(event)}</Typography.Text> : null}
              </Space>
              <Typography.Text type="secondary">
                {hasScheduledDeliveryTime(event) && <ClockCircleOutlined aria-hidden="true" className="operationsCalendarTimeIcon" />}
                {detail.time}
              </Typography.Text>
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

export function OperationsCalendar({ onOpenDelivery, compact = false }: { onOpenDelivery?: (deliveryId: string) => void; compact?: boolean }) {
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

  return <ProCard title="Operations calendar / 工作日历" className={`operationsCalendar${compact ? " operationsCalendarCompact" : ""}`} extra={<Button aria-label="Refresh calendar" loading={loading} onClick={() => setRefresh(value => value + 1)}>Refresh</Button>}>
    <Typography.Paragraph type="secondary">Delivery dates and staff availability. Personal leave and trip details are not shown. / 出车日期与员工忙碌时间，不显示私人详情。</Typography.Paragraph>
    <DataFreshness label="Calendar" updatedAt={loadedMonth === month ? updatedAt : null} loading={loading} error={error} />
    {error && <Alert type="error" showIcon message="Calendar unavailable" description={error} />}
    {(compact || isMobile) && <Button className="operationsCalendarToggle" aria-expanded={monthExpanded} aria-controls="operations-month-grid" onClick={() => setMonthExpanded(value => !value)}>{monthExpanded ? "Hide month / 收起月历" : "Show month / 展开月历"}</Button>}
    {compact && <div className="operationsCalendarLegend"><span><span className="operationsCalendarLegendDelivery" aria-hidden="true" />Delivery / 出车</span><span><span className="operationsCalendarLegendBusy" aria-hidden="true" />Staff busy / 员工忙碌</span><span>Numbers show events that day / 数字为当天安排数量</span></div>}
    <Spin spinning={loading}>
      <div className="operationsCalendarLayout" ref={calendarRegionRef} tabIndex={-1} aria-label="Operations calendar">
        <div id="operations-month-grid" hidden={monthCollapsed}><Calendar fullscreen={false} value={date} onSelect={(nextDate, info) => { setDate(nextDate); if (shouldOpenCalendarDayDrawer(info.source, isMobile)) setMobileDayDrawerOpen(true); }} headerRender={() => <Space wrap className="operationsCalendarToolbar"><Button aria-label="Previous month" onClick={() => navigateMonth(-1)}>‹</Button><DatePicker picker="month" allowClear={false} value={date} onChange={value => { if (value) { setDate(value); setMobileDayDrawerOpen(false); } }} /><Button aria-label="Next month" onClick={() => navigateMonth(1)}>›</Button><Button onClick={() => { setDate(dayjs()); setMobileDayDrawerOpen(false); }}>Today</Button></Space>} cellRender={(value, info) => {
          if (info.type !== "date") return null;
          const dateEvents = eventsOnDate(events, value.format("YYYY-MM-DD"));
          if (dateEvents.length === 0) return null;
          const kinds = operationsCalendarCellKinds(dateEvents);
          return <span className="operationsCalendarCellState" role="img" aria-label={compact ? `${dateEvents.length} events: ${kinds.delivery} deliveries, ${kinds.busy} staff busy` : `${dateEvents.length} events`}>
            {compact && <span className="operationsCalendarCellCount">{dateEvents.length}</span>}
            {kinds.delivery > 0 && <span className="operationsCalendarCellCue operationsCalendarCellCueDelivery" aria-hidden="true" />}
            {kinds.busy > 0 && <span className="operationsCalendarCellCue operationsCalendarCellCueBusy" aria-hidden="true" />}
          </span>;
        }} /></div>
        <section className={`operationsCalendarDesktopAgenda${monthCollapsed ? " operationsCalendarCollapsedAgenda" : ""}`} aria-label="Selected day events">
          <Typography.Title level={5}>{date.format("ddd, D MMM YYYY")}</Typography.Title>
          {loading ? <Skeleton active paragraph={{ rows: 2 }} /> : !error && <SelectedDayEvents events={selected} onOpenDelivery={onOpenDelivery} />}
        </section>
      </div>
    </Spin>
    <Drawer
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
    </Drawer>
  </ProCard>;
}
