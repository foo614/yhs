import { FieldHelp } from "../shared/FieldHelp";
import { dialogWidths } from "../shared/dialogSizing";
import { BusinessDialog } from "../shared/BusinessDialog";
import { useEffect, useState } from "react";
import { Alert, Button, Card, Descriptions, Empty, Grid, Input, Modal, Select, Space, Tag, Typography, message } from "antd";
import { confirmInsuranceReceipt, getInsuranceAttachment, getInsuranceAutoCount, getInsuranceCases, renewInsuranceCase, sendInsuranceDocuments, uploadInsuranceAttachment, type InsuranceAttachment, type InsuranceAutoCountKind, type InsuranceAutoCountPreview, type InsuranceCaseView, type InsuranceReceipt } from "../../api";
import { formatDisplayDate } from "../../dateDisplay";
import { OperationsProTable } from "../shared/OperationsProTable";
import { PreviewDocumentUpload } from "../shared/PreviewDocumentUpload";
import { DocumentPreviewDrawer, type DocumentPreviewSource } from "../shared/DocumentPreviewDrawer";
import { ResponsiveSectionTabs } from "../shared/ResponsiveSectionTabs";
import { InsuranceCaseForm, InsuranceImport, InsuranceMoneyForm } from "./InsuranceForms";
import { InsuranceMonthlySales } from "./InsuranceMonthlySales";
import "./insurance.css";

export const insuranceMoney = (value: number) => `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const insuranceError = (error: unknown) => error instanceof Error ? error.message : "Unable to complete this request.";
const exportKinds: { value: InsuranceAutoCountKind; label: string }[] = [{ value: "PurchaseInsurance", label: "Auto purchase: insurance" }, { value: "PurchaseRoadTax", label: "Auto purchase: road tax" }, { value: "PurchaseOther", label: "Auto purchase: other charges" }, { value: "CustomerSales", label: "Customer sales invoice" }, { value: "AutomotiveAP", label: "Automotive A/P (one plate)" }];

export function InsurancePage() {
  const screens = Grid.useBreakpoint();
  const [records, setRecords] = useState<InsuranceCaseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<InsuranceCaseView>();
  const [filter, setFilter] = useState("all");
  const [caseForm, setCaseForm] = useState<{ record?: InsuranceCaseView["record"] }>();
  const [moneyForm, setMoneyForm] = useState<"receipt" | "insurer">();
  const [receiptPreview, setReceiptPreview] = useState<InsuranceReceipt>();
  const [importOpen, setImportOpen] = useState(false);
  const [exportKind, setExportKind] = useState<InsuranceAutoCountKind>("CustomerSales");
  const [exportPreview, setExportPreview] = useState<InsuranceAutoCountPreview>();
  const [filePreview, setFilePreview] = useState<DocumentPreviewSource>();
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [fileOpen, setFileOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  async function reload(caseId?: string) {
    setLoading(true);
    try { const data = await getInsuranceCases(); setRecords(data); setError(""); if (caseId) setSelected(data.find(item => item.record.id === caseId)); }
    catch (e) { setError(insuranceError(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);
  useEffect(() => () => { if (filePreview?.url) URL.revokeObjectURL(filePreview.url); }, [filePreview?.url]);
  async function previewFile(file: InsuranceAttachment) {
    if (!selected) return;
    setFileOpen(true); setFileLoading(true); setFileError(""); setFilePreview(undefined);
    try { const blob = await getInsuranceAttachment(selected.record.id, file.id); setFilePreview({ fileName: file.fileName, mimeType: blob.type || file.mimeType, url: URL.createObjectURL(blob) }); }
    catch (e) { setFileError(insuranceError(e)); }
    finally { setFileLoading(false); }
  }
  async function showExport(kind = exportKind, receiptId?: string) {
    if (!selected) return;
    setBusy(true);
    try { setExportPreview(await getInsuranceAutoCount(selected.record.id, kind, receiptId)); }
    catch (e) { message.error(insuranceError(e)); }
    finally { setBusy(false); }
  }
  const filtered = records.filter(item => filter === "all" || (filter === "renewal" && item.renewalDue) || (filter === "overdue" && item.paymentAlert) || (filter === "jpj" && item.record.roadTaxMethod === "JPJ" && !item.record.roadTaxCompleted));
  const r = selected?.record;
  const sendFiles = (["Policy", ...(r?.roadTaxMethod === "JPJ" ? ["RoadTaxReceipt"] : [])]).flatMap(kind => {
    const latest = selected?.attachments.filter(file => file.kind === kind).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || b.id.localeCompare(a.id))[0];
    return latest ? [latest] : [];
  });
  return <div className="insurancePage">
    {error && <Alert type="error" showIcon title="Insurance records unavailable" description={error} action={<Button onClick={() => void reload()}>Retry</Button>} />}
    <Card title="Cases / 保险路税个案" extra={<Button onClick={() => void reload()} loading={loading}>Refresh / 刷新</Button>}>
      <Space wrap className="insuranceToolbar">
        <Button type="primary" onClick={() => setCaseForm({})}>New case / 新增个案</Button>
        <Button onClick={() => setImportOpen(true)}>Import listing / 导入旧名单</Button>
        <Select aria-label="Case queue" value={filter} onChange={setFilter} options={[{ value: "all", label: `All cases (${records.length})` }, { value: "renewal", label: `Renewal due (${records.filter(item => item.renewalDue).length})` }, { value: "overdue", label: `Payment alerts (${records.filter(item => item.paymentAlert).length})` }, { value: "jpj", label: "JPJ work list / 跑腿清单" }]} />
      </Space>
      {filter === "jpj" && <Button className="insuranceToolbar" disabled={!filtered.length} onClick={() => {
        const lines = [["Plate", "IC / company number", "Period"], ...filtered.map(item => [item.record.plateNumber, item.record.identityNumber ?? "", `${item.record.roadTaxMonths} months`])];
        void navigator.clipboard.writeText(lines.map(row => row.map(value => value.replace(/[\t\r\n]/g, " ")).join("\t")).join("\r\n")).then(() => message.success("JPJ work list copied for internal runner handoff.")).catch(() => message.error("Clipboard unavailable. Review the JPJ list below."));
      }}>Copy JPJ work list / 复制跑腿清单</Button>}
      {filter === "jpj" && <Alert type="info" title="JPJ work list / 跑腿清单" description="Give the runner the plate, identity number and six/twelve-month period below. JPJ completion requires an uploaded receipt." />}
      {!screens.md ? <div className="insuranceMobileRecords">{loading ? <Typography.Text>Loading cases…</Typography.Text> : filtered.length ? filtered.map(item => <article className="mobileRecordCard" key={item.record.id}><Typography.Text strong>{item.record.plateNumber} · {item.record.customerName}</Typography.Text><span>{item.record.customerPhone || "No phone · internal reminders only"}</span><span>{item.record.caseType} · {item.record.insurer} · {formatDisplayDate(item.record.expiryDate)}</span>{filter === "jpj" && <span>{item.record.identityNumber || "Identity number missing"} · {item.record.roadTaxMonths} months</span>}<span>Outstanding: {insuranceMoney(item.outstanding)}</span><Space wrap>{item.renewalDue && <Tag color="gold">Prepare renewal</Tag>}{item.paymentAlert && <Tag color="red">Payment alert</Tag>}{item.record.renewedByCaseId && <Tag color="green">Renewal created</Tag>}{item.record.renewalDeclined && <Tag>Renewal declined</Tag>}</Space><div className="mobileRecordCardActions"><Button onClick={() => setSelected(item)}>Details / 详情</Button></div></article>) : <Empty description="No cases in this queue" />}</div> : <OperationsProTable<InsuranceCaseView> rowKey={item => item.record.id} loading={loading} dataSource={filtered} scroll={{ x: 1050 }} columns={[
        { title: "Plate / 车牌", key: "plate", render: (_, item) => item.record.plateNumber },
        { title: "Customer / 客户", key: "customer", render: (_, item) => <div>{item.record.customerName}<div className="insuranceSecondary">{item.record.customerPhone || "No phone · internal reminders only"}</div></div> },
        ...(filter === "jpj" ? [{ title: "JPJ details", key: "jpj", render: (_: unknown, item: InsuranceCaseView) => `${item.record.identityNumber || "Identity number missing"} · ${item.record.roadTaxMonths} months` }] : []),
        { title: "Cover / 保障", key: "cover", render: (_, item) => <div>{item.record.caseType} · {item.record.insurer}<div className="insuranceSecondary">Expires {formatDisplayDate(item.record.expiryDate)}</div></div> },
        { title: "Outstanding / 待收", key: "outstanding", render: (_, item) => insuranceMoney(item.outstanding) },
        { title: "Status / 状态", key: "status", render: (_, item) => <Space wrap>{item.renewalDue && <Tag color="gold">Prepare renewal</Tag>}{item.paymentAlert && <Tag color="red">Payment alert</Tag>}{item.record.renewedByCaseId && <Tag color="green">Renewal created</Tag>}{item.record.renewalDeclined && <Tag>Renewal declined</Tag>}{item.outstanding === 0 && <Tag color="green">Settled</Tag>}</Space> },
        { title: "Action / 操作", key: "actions", fixed: "right", width: 120, render: (_, item) => <div className="tableActionGroup"><Button size="small" onClick={() => setSelected(item)}>Details / 详情</Button></div> }
      ]} />}
    </Card>
    <InsuranceMonthlySales />
    <BusinessDialog title={r ? `${r.plateNumber} · ${r.customerName}` : "Insurance case"} open={!!selected} onClose={() => !busy && setSelected(undefined)} width={dialogWidths.data} className="insuranceDrawer">
      {selected && r && <Space direction="vertical" size="large" className="fullWidth">
        <Space wrap><Button onClick={() => setCaseForm({ record: r })}>Edit case / 编辑个案</Button><Button onClick={() => setMoneyForm("receipt")}>Customer receipt / 客户收款</Button><Button disabled={selected.insurerPayments.length > 0 || r.caseType === "BankArranged"} onClick={() => setMoneyForm("insurer")}>Final insurer payment / 保险最终付款</Button><Button disabled={!!r.renewedByCaseId || r.renewalDeclined || busy} onClick={() => Modal.confirm({ centered: true, width: dialogWidths.compact, title: "Start a separate next renewal? / 建立独立续保个案？", content: `${r.plateNumber} · ${r.customerName}. The current policy and payment history stay on this case. Enter the next cover, amounts and invoices on the new case.`, okText: "Confirm next renewal", onOk: async () => { setBusy(true); try { const next = await renewInsuranceCase(r.id, r.version); setSelected(next); setCaseForm({ record: next.record }); await reload(); message.success("Next renewal draft created."); } catch (e) { message.error(insuranceError(e)); throw e; } finally { setBusy(false); } } })}>Start next renewal / 建立下年续保</Button></Space>
        {selected.paymentAlert && <Alert type="error" title={`Payment overdue · ${insuranceMoney(selected.outstanding)}`} description="Policy took effect at least one week ago. Follow up until actual funds are confirmed." />}
        {selected.renewalDue && <Alert type="warning" title="Prepare renewal quotation / 准备续保报价" description="Expiry is within one month. Enter reviewed internal values; quotation sending is on hold." />}
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Total / 总额">{insuranceMoney(selected.total)}</Descriptions.Item><Descriptions.Item label="Confirmed received / 已确认收款">{insuranceMoney(selected.received)}</Descriptions.Item><Descriptions.Item label="Outstanding / 待收">{insuranceMoney(selected.outstanding)}</Descriptions.Item><Descriptions.Item label="Insurer paid / 已付保险公司">{insuranceMoney(selected.insurerPayments.reduce((total, item) => total + item.amount, 0))}</Descriptions.Item><Descriptions.Item label="Policy / 保单">{r.policyNumber || "-"}</Descriptions.Item><Descriptions.Item label="Policy effective date / 保单生效日期">{formatDisplayDate(r.coverStartDate ?? undefined)}</Descriptions.Item><Descriptions.Item label="Expiry / 到期日">{formatDisplayDate(r.expiryDate)}</Descriptions.Item><Descriptions.Item label="Road tax / 路税">{r.roadTaxMethod} · {r.roadTaxMonths} months</Descriptions.Item><Descriptions.Item label="Invoice / 发票">{r.invoiceNumber || "Select manually in AutoCount"}</Descriptions.Item><Descriptions.Item label="Renewal / 续保">{r.renewedByCaseId ? "Renewal created · previous reminders stopped" : r.renewalDeclined ? "Declined · reminders stopped" : "Reminders enabled"}</Descriptions.Item>
        </Descriptions>
        <ResponsiveSectionTabs sectionLabel="Case section / 个案栏目" items={[
          { key: "documents", label: "Documents / 文件", children: <Space direction="vertical" size="large" className="fullWidth">
            <Typography.Text strong>Customer documents / 客户文件<FieldHelp label="Customer document guidance">Upload the policy and applicable JPJ receipt, then review the recipient and files before queuing delivery. Windscreen photos remain internal evidence.</FieldHelp></Typography.Text>
            <Space wrap>{(["Policy", "RoadTaxReceipt", "Windscreen", "PaymentEvidence", "Other"] as const).map(kind => <PreviewDocumentUpload key={kind} documentLabel={kind} buttonLabel={`Upload ${kind}`} onUpload={async (file, progress) => { progress(0); await uploadInsuranceAttachment(r.id, kind, file); progress(100); await reload(r.id); }} />)}</Space>
            {selected.attachments.length ? selected.attachments.map(file => <div className="insuranceFile" key={file.id}><div><Typography.Text strong>{file.fileName}</Typography.Text><div className="insuranceSecondary">{file.kind} · {formatDisplayDate(file.uploadedAt)}</div></div><Button onClick={() => void previewFile(file)}>Preview / 预览</Button></div>) : <Empty description="No files uploaded / 暂无文件" />}
            <Button disabled={!sendFiles.length || !r.customerPhone} onClick={() => setSendOpen(true)}>Review customer document send / 检查发送文件</Button>
            {!r.customerPhone && <Typography.Text type="secondary">Add a phone number before sending customer documents. Internal reminders remain available.</Typography.Text>}
          </Space> },
          { key: "receipts", label: "Customer receipts / 客户收款", children: <Space direction="vertical" className="fullWidth">{selected.receipts.length ? selected.receipts.map(receipt => <Card size="small" key={receipt.id}><Space direction="vertical" className="fullWidth"><Typography.Text strong>{insuranceMoney(receipt.amount)} · {receipt.paymentType}</Typography.Text><span>Invoice: {receipt.invoiceNumber || "Select manually in AutoCount"} · {formatDisplayDate(receipt.receivedDate)}</span><Space wrap><Tag color={receipt.status === "Confirmed" ? "green" : "gold"}>{receipt.status}</Tag>{receipt.status === "Pending" ? <Button onClick={() => setReceiptPreview(receipt)}>Review & confirm actual funds</Button> : <Button onClick={() => void showExport("Receipt", receipt.id)}>A/R Copy Payment Row</Button>}</Space></Space></Card>) : <Empty description="No customer receipts" />}</Space> },
          { key: "insurer", label: "Insurer payments / 保险公司付款", children: <Space direction="vertical" className="fullWidth">{selected.insurerPayments.length ? selected.insurerPayments.map(payment => <Card size="small" key={payment.id}>{insuranceMoney(payment.amount)} · {formatDisplayDate(payment.paidDate)}<div>{payment.reference}</div></Card>) : <Empty description="Final actual insurer payment has not been recorded." />}<Typography.Text strong>Insurer payments / 保险公司付款<FieldHelp label="Insurer payment guidance">Record the final full insurer settlement once to calculate commission. Customer receipts do not change insurer payment.</FieldHelp></Typography.Text></Space> },
          { key: "autocount", label: "AutoCount copy", children: <Space direction="vertical" className="fullWidth"><Space wrap><Select aria-label="AutoCount copy format" value={exportKind} onChange={setExportKind} options={exportKinds} /><Button loading={busy} onClick={() => void showExport()}>Preview rows / 预览行</Button></Space><Typography.Text strong>AutoCount copy<FieldHelp label="AutoCount copy guidance">Review the correct invoice book and blank placeholders. AutoCount posting and invoice knock-off are manual.</FieldHelp></Typography.Text></Space> }
        ]} />
      </Space>}
    </BusinessDialog>
    {caseForm && <InsuranceCaseForm insurerNames={records.map(item => item.record.insurer)} record={caseForm.record} onClose={() => setCaseForm(undefined)} onSaved={async saved => { setSelected(saved); setCaseForm(undefined); await reload(); }} />}
    {moneyForm && selected && <InsuranceMoneyForm kind={moneyForm} selected={selected} onClose={() => setMoneyForm(undefined)} onSaved={async receipt => { setMoneyForm(undefined); await reload(r?.id); if (receipt) setReceiptPreview(receipt); }} />}
    {importOpen && <InsuranceImport onClose={() => setImportOpen(false)} onSaved={async () => { setImportOpen(false); await reload(); }} />}
    <Modal width={dialogWidths.compact} mask={{ closable: false }} centered title="Confirm actual funds / 确认实际收款" open={!!receiptPreview} onCancel={() => !busy && setReceiptPreview(undefined)} okText="I verified funds · Confirm receipt" confirmLoading={busy} onOk={() => void (async () => { if (!selected || !receiptPreview) return; setBusy(true); try { await confirmInsuranceReceipt(selected.record.id, receiptPreview.id); setReceiptPreview(undefined); await reload(selected.record.id); message.success("Receipt confirmed. Outstanding updated."); } catch (e) { message.error(insuranceError(e)); } finally { setBusy(false); } })()}>
      {receiptPreview && <Space direction="vertical" className="fullWidth"><Alert type="warning" title="Check the bank or cash before confirming" description="Partial receipts reduce outstanding only by the confirmed amount." /><Descriptions column={1} bordered><Descriptions.Item label="Case / plate">{r?.plateNumber} · {r?.customerName}</Descriptions.Item><Descriptions.Item label="Invoice">{receiptPreview.invoiceNumber || "Select manually in AutoCount"}</Descriptions.Item><Descriptions.Item label="Invoice book">{r?.company}</Descriptions.Item><Descriptions.Item label="Amount">{insuranceMoney(receiptPreview.amount)}</Descriptions.Item><Descriptions.Item label="Original type">{receiptPreview.paymentType}</Descriptions.Item><Descriptions.Item label="Destination">{receiptPreview.depositAccount}</Descriptions.Item><Descriptions.Item label="Date">{formatDisplayDate(receiptPreview.receivedDate)}</Descriptions.Item></Descriptions>{receiptPreview.evidenceAttachmentId && <Button onClick={() => { const file = selected?.attachments.find(item => item.id === receiptPreview.evidenceAttachmentId); if (file) void previewFile(file); }}>View linked evidence</Button>}</Space>}
    </Modal>
    <Modal mask={{ closable: false }} centered title={<>AutoCount copy preview<FieldHelp label="AutoCount copy guidance">Physical paste into AutoCount has not been verified. Select the lower invoice knock-off manually in AutoCount.</FieldHelp></>} open={!!exportPreview} onCancel={() => setExportPreview(undefined)} width={dialogWidths.data} footer={<Space wrap><Button onClick={() => setExportPreview(undefined)}>Close</Button><Button type="primary" disabled={!exportPreview?.clipboard || !!exportPreview.blockers.length} onClick={() => void navigator.clipboard.writeText(exportPreview?.clipboard ?? "").then(() => message.success("Rows copied. Review in AutoCount before saving.")).catch(() => message.error("Clipboard unavailable. Copy the reviewed text manually."))}>Copy rows</Button></Space>}>
      {exportPreview && <Space direction="vertical" className="fullWidth"><Tag>{exportPreview.book}</Tag>{Object.entries(exportPreview.headers).map(([key, value]) => <Typography.Text key={key}><strong>{key}:</strong> {value || "(blank)"}</Typography.Text>)}{exportPreview.blockers.map((item, index) => <Alert key={index} type="error" title={item} />)}{exportPreview.notes.map((item, index) => <Typography.Text type="secondary" key={index}>{item}</Typography.Text>)}<div className="insuranceCopyTable"><table><thead><tr>{exportPreview.columns.map((column, index) => <th key={index}>{column}</th>)}</tr></thead><tbody>{exportPreview.rows.map((row, index) => <tr key={index}>{row.map((value, col) => <td key={col}>{value || "\u00a0"}</td>)}</tr>)}</tbody></table></div><Input.TextArea readOnly rows={5} value={exportPreview.clipboard} aria-label="Exact AutoCount tab-separated copy rows" /></Space>}
    </Modal>
    <Modal width={dialogWidths.form} mask={{ closable: false }} centered title={<>Review customer document send / 检查客户文件发送<FieldHelp label="Customer document delivery guidance">The server checks approved messaging, consent and required documents before queuing. Quotation sending remains on hold.</FieldHelp></>} open={sendOpen} onCancel={() => !busy && setSendOpen(false)} confirmLoading={busy} okText="Confirm queue documents" onOk={() => void (async () => { if (!selected) return; setBusy(true); try { const response = await sendInsuranceDocuments(selected.record.id, { caseVersion: selected.record.version, customerPhone: selected.record.customerPhone ?? "", attachmentIds: sendFiles.map(file => file.id) }); message.success(response.message); setSendOpen(false); } catch (e) { message.error(insuranceError(e)); } finally { setBusy(false); } })()}>
      <Space direction="vertical" className="fullWidth"><Typography.Text strong>{r?.customerName} · {r?.customerPhone}</Typography.Text><Typography.Text>Case: {r?.plateNumber} · Policy: {r?.policyNumber || "Not entered"}</Typography.Text>{sendFiles.map(file => <Button key={file.id} onClick={() => void previewFile(file)}>{file.kind}: {file.fileName}</Button>)}</Space>
    </Modal>
    <DocumentPreviewDrawer open={fileOpen} title="Insurance evidence / 保险凭证" source={filePreview} loading={fileLoading} error={fileError} onClose={() => { setFileOpen(false); setFilePreview(undefined); }} footer={filePreview ? <Button href={filePreview.url} download={filePreview.fileName}>Download original / 下载原件</Button> : undefined} />
  </div>;
}
