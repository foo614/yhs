import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { Alert, Button, Card, DatePicker, Empty, Space, Spin, Typography, message } from "antd";
import { exportInsuranceMonthlyAutoCountWorkbook, getInsuranceMonthlyAutoCount, type InsuranceAutoCountPreview } from "../../api";

export function InsuranceMonthlySales() {
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const [refresh, setRefresh] = useState(0);
  const [snapshot, setSnapshot] = useState<{ month: string; data: InsuranceAutoCountPreview }>();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setLoading(true); setSnapshot(undefined); setError(""); setExporting(false);
    void getInsuranceMonthlyAutoCount(month).then(data => {
      if (current === generation.current) setSnapshot({ month, data });
    }).catch(reason => {
      if (current === generation.current) setError(reason instanceof Error ? reason.message : "Unable to load monthly rows.");
    }).finally(() => {
      if (current === generation.current) setLoading(false);
    });
    return () => { generation.current++; };
  }, [month, refresh]);

  const preview = snapshot?.month === month ? snapshot.data : undefined;
  const canOutput = !!preview?.rows.length && !!preview.clipboard && preview.blockers.length === 0 && !loading;
  function changeMonth(next: string) {
    if (next === month) return;
    generation.current++;
    setSnapshot(undefined); setError(""); setLoading(true); setExporting(false); setMonth(next);
  }
  function reload() {
    generation.current++;
    setSnapshot(undefined); setError(""); setLoading(true); setExporting(false); setRefresh(value => value + 1);
  }
  async function exportWorkbook() {
    if (!canOutput || !preview?.fingerprint) return;
    const current = generation.current;
    setExporting(true);
    try {
      const blob = await exportInsuranceMonthlyAutoCountWorkbook(month, preview.fingerprint);
      if (current !== generation.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `insurance-intercompany-${month}.xlsx`;
      link.click(); URL.revokeObjectURL(url);
      message.success("Monthly workbook downloaded. Review in AutoCount before saving.");
    } catch (reason) {
      if (current === generation.current) {
        setSnapshot(undefined);
        setError(reason instanceof Error ? reason.message : "Unable to export monthly rows.");
      }
    } finally {
      if (current === generation.current) setExporting(false);
    }
  }

  return <Card title="Monthly Auto intercompany sales / 每月公司间销售">
    <Space direction="vertical" size="middle" className="fullWidth">
      <Space wrap className="insuranceToolbar">
        <label htmlFor="insuranceMonthlyMonth">Month / 月份</label>
        <DatePicker id="insuranceMonthlyMonth" picker="month" value={dayjs(`${month}-01`)} allowClear={false} onChange={value => value && changeMonth(value.format("YYYY-MM"))} />
        <Button loading={loading} onClick={reload}>Refresh preview / 刷新预览</Button>
        <Button disabled={!canOutput || exporting} onClick={() => void navigator.clipboard.writeText(preview!.clipboard).then(() => message.success("Rows copied. Review in AutoCount before saving.")).catch(() => message.error("Clipboard unavailable. Copy the reviewed rows manually."))}>Copy rows / 复制行</Button>
        <Button type="primary" disabled={!canOutput || !preview?.fingerprint} loading={exporting} onClick={() => void exportWorkbook()}>Export Excel (.xlsx) / 导出 Excel</Button>
      </Space>
      <Typography.Text strong>{month} · YS Heng Auto → YS Heng Automotive</Typography.Text>
      {loading && <Spin description="Loading monthly rows / 正在加载月度记录"><div className="insuranceMonthlyLoading" /></Spin>}
      {error && <Alert type="error" showIcon title="Monthly rows unavailable / 无法加载月度记录" description={error} action={<Button onClick={reload}>Retry / 重试</Button>} />}
      {!loading && !error && preview && <>
        {preview.blockers.map((blocker, index) => <Alert key={index} type="warning" showIcon title={blocker} />)}
        {preview.rows.length ? <>
          <Typography.Text>{preview.rows.length} {preview.rows.length === 1 ? "row" : "rows"} / 行 · {preview.book}</Typography.Text>
          <div className="insuranceCopyTable insuranceMonthlyPreview" role="region" aria-label="Monthly intercompany rows" tabIndex={0}>
            <table><thead><tr>{preview.columns.map((column, index) => <th key={index} scope="col">{column}</th>)}</tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column}>{value || "\u00a0"}</td>)}</tr>)}</tbody></table>
          </div>
        </> : <Empty description={`No eligible rows for ${month} / 本月暂无可导出记录`} />}
        {preview.notes.map((note, index) => <Typography.Text type="secondary" key={index}>{note}</Typography.Text>)}
      </>}
    </Space>
  </Card>;
}
