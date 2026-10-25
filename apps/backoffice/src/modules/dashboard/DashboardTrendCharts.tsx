import { useEffect, useId, useRef, useState } from "react";
import { Empty } from "antd";
import "./dashboardTrends.css";

type LeadMonth = { label: string; count: number };
type MarginMonth = { label: string; estimatedProfit: number; soldProfit: number; soldCount: number };
type TrendPoint = { label: string; value: number };

const money = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" });
const count = new Intl.NumberFormat("en-MY");
const compact = new Intl.NumberFormat("en-MY", { notation: "compact", maximumFractionDigits: 1 });
const exact = (value: number, currency: boolean) => Number.isFinite(value) ? (currency ? money : count).format(value) : "Unavailable";

function TrendPlot({ items, currency = false, tone }: { items: TrendPoint[]; currency?: boolean; tone: "lead" | "sold" | "stock" }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(280);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const values = items.map(item => item.value).filter(Number.isFinite);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const roughStep = (maximum - minimum || (currency ? 1000 : 4)) / 4;
  const power = 10 ** Math.floor(Math.log10(roughStep));
  const unit = roughStep / power;
  const step = (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
  const tickStep = currency ? step : Math.max(1, step);
  const low = Math.floor(minimum / tickStep) * tickStep;
  const high = Math.max(low + tickStep, Math.ceil(maximum / tickStep) * tickStep);
  const ticks = Array.from({ length: Math.round((high - low) / tickStep) + 1 }, (_, index) => low + index * tickStep);
  const left = currency ? 58 : 36;
  const right = 20;
  const top = 22;
  const height = tone === "sold" && width >= 400 ? 300 : 205;
  const bottom = height - 39;
  const x = (index: number) => tone === "sold" ? left + (index + .5) * Math.max(0, width - left - right) / items.length : items.length === 1 ? (left + width - right) / 2 : left + index * Math.max(0, width - left - right) / (items.length - 1);
  const y = (value: number) => bottom - (value - low) / (high - low) * (bottom - top);
  const labelSlots = Math.max(2, Math.floor((width - left - right) / 64));
  const stride = Math.max(1, Math.ceil((items.length - 1) / (labelSlots - 1)));
  const showLabel = (index: number) => index === items.length - 1 || (index % stride === 0 && (index === 0 || items.length - 1 - index >= stride));
  const barWidth = Math.max(2, Math.min(42, (width - left - right) / Math.max(items.length, 1) * .5));
  let connected = false;
  const path = items.map((item, index) => {
    if (!Number.isFinite(item.value)) { connected = false; return ""; }
    const segment = `${connected ? "L" : "M"} ${x(index)} ${y(item.value)}`;
    connected = true;
    return segment;
  }).join(" ");

  return <div ref={container} className={`dashboardTrendPlot dashboardTrendPlot-${tone}`} aria-hidden="true">
    <svg width={width} height={height}>
      {ticks.map(tick => <g key={tick}>
        <line className={tick === 0 ? "dashboardTrendZero" : "dashboardTrendGrid"} x1={left} x2={Math.max(left, width - right)} y1={y(tick)} y2={y(tick)} />
        <text className="dashboardTrendAxis" x={left - 10} y={y(tick) + 4} textAnchor="end">{compact.format(tick)}</text>
      </g>)}
      {tone !== "sold" && <path className="dashboardTrendLine" d={path} />}
      {items.map((item, index) => <g key={`${item.label}-${index}`}>
        {Number.isFinite(item.value) && (tone === "sold" ? <rect className={item.value < 0 ? "dashboardTrendBar dashboardTrendBar-negative" : "dashboardTrendBar"} x={Math.max(left, Math.min(width - right - barWidth, x(index) - barWidth / 2))} y={Math.min(y(0), y(item.value))} width={barWidth} height={Math.max(item.value === 0 ? 1 : 0, Math.abs(y(item.value) - y(0)))} rx="2" /> : <circle className={item.value < 0 ? "dashboardTrendPoint dashboardTrendPoint-negative" : "dashboardTrendPoint"} cx={x(index)} cy={y(item.value)} r="3.5" />)}
        {showLabel(index) && <>
          {!currency && Number.isFinite(item.value) && <text className="dashboardTrendValue" x={x(index)} y={Math.max(13, y(item.value) - 11)} textAnchor="middle">{compact.format(item.value)}</text>}
          {tone === "sold" && Number.isFinite(item.value) && <text className={item.value < 0 ? "dashboardTrendValue dashboardTrendValue-negative" : "dashboardTrendValue"} x={x(index)} y={item.value < 0 ? y(item.value) + 14 : Math.max(13, y(item.value) - 8)} textAnchor="middle">{compact.format(item.value)}</text>}
          <text className="dashboardTrendAxis" x={x(index)} y={height - 12} textAnchor={tone === "sold" || items.length === 1 ? "middle" : index === 0 ? "start" : index === items.length - 1 ? "end" : "middle"}>{item.label}</text>
        </>}
      </g>)}
    </svg>
  </div>;
}

export function DashboardLeadTrend({ items }: { items: LeadMonth[] }) {
  const summaryId = useId();
  const last = items.at(-1);
  if (!last) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No monthly enquiry data yet." />;

  return <figure className="dashboardTrend dashboardLeadTrend" aria-label="Monthly enquiry volume" aria-describedby={summaryId}>
    <figcaption id={summaryId} className="dashboardTrendReadout"><span>Enquiries by month</span><span>{last.label}: <strong>{exact(last.count, false)}</strong></span></figcaption>
    <TrendPlot items={items.map(item => ({ label: item.label, value: item.count }))} tone="lead" />
    <details className="dashboardTrendDetails">
      <summary>View monthly values / 查看每月数据</summary>
      <div className="dashboardTrendTableWrap" tabIndex={0} role="region" aria-label="Monthly enquiry values"><table><caption>Exact enquiry counts by month</caption><thead><tr><th scope="col">Month</th><th scope="col">Enquiries</th></tr></thead><tbody>
        {items.map((item, index) => <tr key={`${item.label}-${index}`}><th scope="row">{item.label}</th><td>{exact(item.count, false)}</td></tr>)}
      </tbody></table></div>
    </details>
  </figure>;
}

export function DashboardMarginTrend({ items, kind }: { items: MarginMonth[]; kind: "sold" | "stock" }) {
  const summaryId = useId();
  const sold = kind === "sold";
  const title = sold ? "Sold vehicle margin by sale month" : "Current stock projected margin by intake month";
  const series = items.map(item => ({ label: item.label, value: sold ? item.soldProfit : item.estimatedProfit }));
  const last = series.at(-1);
  if (!last) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={sold ? "No monthly sold margin data yet." : "No current stock margin data yet."} />;

  return <figure className={`dashboardTrend dashboardMarginTrend dashboardMarginTrend-${kind}`} aria-label={title} aria-describedby={summaryId}>
    <figcaption id={summaryId} className="dashboardTrendReadout"><span>{sold ? "Sold margin · RM" : "Projected stock margin · RM"}</span><span>{last.label}: <strong className={last.value < 0 ? "dashboardTrendLoss" : undefined}>{exact(last.value, true)}</strong></span></figcaption>
    <TrendPlot items={series} currency tone={kind} />
    <details className="dashboardTrendDetails">
      <summary>View monthly values / 查看每月数据</summary>
      <div className="dashboardTrendTableWrap" tabIndex={0} role="region" aria-label={title}><table><caption>{title}. Exact amounts in RM.</caption><thead><tr><th scope="col">{sold ? "Sale month" : "Intake month"}</th><th scope="col">{sold ? "Sold margin" : "Projected margin"}</th>{sold && <th scope="col">Sold</th>}</tr></thead><tbody>
        {items.map((item, index) => {
          const value = sold ? item.soldProfit : item.estimatedProfit;
          return <tr key={`${item.label}-${index}`}><th scope="row">{item.label}</th><td className={value < 0 ? "dashboardTrendLoss" : undefined}>{exact(value, true)}</td>{sold && <td>{exact(item.soldCount, false)}</td>}</tr>;
        })}
      </tbody></table></div>
    </details>
  </figure>;
}
