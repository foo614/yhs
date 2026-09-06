import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import { ProCard } from "@ant-design/pro-components";
import { Alert, Button, DatePicker, Descriptions, Empty, Form, Input, InputNumber, Select, Space, Spin, Switch, Tag, Typography, message } from "antd";
import { DownloadOutlined, EditOutlined } from "@ant-design/icons";
import { formatMoney, formatMoneyInput, parseMoneyInput } from "../../money";
import "./OwnerPurchaseInvoiceDetails.css";
import {
  getPurchaseInvoiceRevisionContent,
  getPurchaseInvoiceRevisions,
  humanizeApiError,
  type CreatePurchaseInvoiceRevisionInput,
  type PurchaseInvoice,
  type PurchaseInvoiceLineType,
  type PurchaseInvoiceRevision,
  type PurchaseInvoiceRevisionLine
} from "../../api";

type RevisionFormValues = {
  reason: string;
  invoiceDate: Dayjs;
  purchaseDate: Dayjs;
  paymentReference?: string;
  sellerName: string;
  sellerPhone: string;
  sellerIcNumber?: string;
  sellerTinNumber?: string;
  sellerAddress?: string;
  lines: Array<{
    lineType: PurchaseInvoiceLineType;
    description: string;
    amount: number;
    capitaliseIntoVehicleCost?: boolean;
  }>;
};

export type PurchaseInvoiceRevisionChange = {
  field: string;
  before: string;
  after: string;
};

export type PurchaseInvoiceHistoryRequest = {
  invoiceId: string;
  generation: number;
};

/** Keeps late history responses from one invoice out of another invoice's detail drawer. */
export function createPurchaseInvoiceHistoryRequestGate(initialInvoiceId: string) {
  let activeInvoiceId = initialInvoiceId;
  let latestGeneration = 0;

  return {
    get activeInvoiceId() {
      return activeInvoiceId;
    },
    switchInvoice(invoiceId: string) {
      if (activeInvoiceId === invoiceId) return;
      activeInvoiceId = invoiceId;
      latestGeneration += 1;
    },
    begin(invoiceId: string): PurchaseInvoiceHistoryRequest | undefined {
      if (activeInvoiceId !== invoiceId) return undefined;
      latestGeneration += 1;
      return { invoiceId, generation: latestGeneration };
    },
    canApply(request: PurchaseInvoiceHistoryRequest) {
      return activeInvoiceId === request.invoiceId && latestGeneration === request.generation;
    }
  };
}

const lineTypeOptions: Array<{ value: PurchaseInvoiceLineType; label: string }> = [
  { value: "VehiclePurchase", label: "Vehicle purchase (6P00-0000)" },
  { value: "PurchaseProcessing", label: "Purchase processing (6P00-1000)" },
  { value: "LatePaymentCharge", label: "Late payment charge (Finance mapping required)" },
  { value: "Parking", label: "Parking (6T00-1000)" },
  { value: "Transport", label: "Transport (Finance mapping required)" },
  { value: "Refurbishment", label: "Refurbishment (6R00-0000)" },
  { value: "Other", label: "Other (Finance mapping required)" }
];

function displayValue(value?: string | number) {
  return value === undefined || value === null || value === "" ? "Not provided" : String(value);
}

function lineSummary(lines: PurchaseInvoiceRevisionLine[]) {
  return lines
    .map((line) => `${line.description} · ${line.lineType} · ${formatMoney(Number(line.amount))}${line.capitaliseIntoVehicleCost ? " · capitalised" : ""}`)
    .join("; ") || "No classified lines";
}

export function purchaseInvoiceRevisionChanges(previous: PurchaseInvoiceRevision | undefined, current: PurchaseInvoiceRevision): PurchaseInvoiceRevisionChange[] {
  if (!previous) return [{ field: "Issued", before: "—", after: "Initial official version" }];

  const comparisons: Array<[string, string | number | undefined, string | number | undefined]> = [
    ["Invoice date", previous.invoiceDate, current.invoiceDate],
    ["Purchase date", previous.purchaseDate, current.purchaseDate],
    ["Payment reference", previous.paymentReference, current.paymentReference],
    ["Seller name", previous.sellerName, current.sellerName],
    ["Seller phone", previous.sellerPhone, current.sellerPhone],
    ["Seller IC", previous.sellerIcNumber, current.sellerIcNumber],
    ["Seller TIN", previous.sellerTinNumber, current.sellerTinNumber],
    ["Seller address", previous.sellerAddress, current.sellerAddress],
    ["Total", formatMoney(Number(previous.amount)), formatMoney(Number(current.amount))],
    ["Classified lines", lineSummary(previous.lines), lineSummary(current.lines)]
  ];

  return comparisons
    .filter(([, before, after]) => displayValue(before) !== displayValue(after))
    .map(([field, before, after]) => ({ field, before: displayValue(before), after: displayValue(after) }));
}

function revisionInitialValues(revision: PurchaseInvoiceRevision): RevisionFormValues {
  return {
    reason: "",
    invoiceDate: dayjs(revision.invoiceDate),
    purchaseDate: dayjs(revision.purchaseDate),
    paymentReference: revision.paymentReference,
    sellerName: revision.sellerName,
    sellerPhone: revision.sellerPhone,
    sellerIcNumber: revision.sellerIcNumber,
    sellerTinNumber: revision.sellerTinNumber,
    sellerAddress: revision.sellerAddress,
    lines: revision.lines.map((line) => ({
      lineType: line.lineType,
      description: line.description,
      amount: Number(line.amount),
      capitaliseIntoVehicleCost: line.capitaliseIntoVehicleCost
    }))
  };
}

function revisionAccountingTag(status: PurchaseInvoiceRevision["accountingStatus"]) {
  return status === "FinanceConfirmed"
    ? <Tag className="purchaseInvoiceStatusTag" color="green">Finance confirmed</Tag>
    : <Tag className="purchaseInvoiceStatusTag" color="gold">Pending Finance review</Tag>;
}

function auditTimestamp(value?: string) {
  return value ? dayjs(value).format("DD MMM YYYY, HH:mm") : "Time unavailable";
}

function financeReviewEvidence(revision: PurchaseInvoiceRevision) {
  if (revision.accountingStatus !== "FinanceConfirmed") return "Pending Finance review";
  return `Finance reviewed by ${revision.accountingConfirmedBy || "Staff account unavailable"} · ${auditTimestamp(revision.accountingConfirmedAt)}`;
}

function RevisionLineFields() {
  return (
    <Form.List name="lines" rules={[{ validator: async (_, lines) => { if (!lines?.length) throw new Error("Add at least one classified line."); } }]}>
      {(fields, { add, remove }, { errors }) => (
        <Space direction="vertical" className="fullWidth" size={8}>
          <Typography.Text strong>Classified invoice lines</Typography.Text>
          {fields.map((field) => (
            <ProCard key={field.key} size="small" bordered className="purchaseInvoiceLineCard">
              <Form.Item {...field} name={[field.name, "lineType"]} label="Fee classification" rules={[{ required: true }]}><Select options={lineTypeOptions} /></Form.Item>
              <Form.Item {...field} name={[field.name, "description"]} label="Description" rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item {...field} name={[field.name, "amount"]} label="Amount" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0.01} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
              <Form.Item {...field} name={[field.name, "capitaliseIntoVehicleCost"]} label="Capitalise into vehicle cost" valuePropName="checked"><Switch /></Form.Item>
              {fields.length > 1 && <Button danger onClick={() => remove(field.name)}>Remove line</Button>}
            </ProCard>
          ))}
          <Button onClick={() => add({ lineType: "Other", capitaliseIntoVehicleCost: false })}>Add fee line</Button>
          <Form.ErrorList errors={errors} />
        </Space>
      )}
    </Form.List>
  );
}

function SnapshotDetails({ revision }: { revision: PurchaseInvoiceRevision }) {
  return (
    <Descriptions size="small" column={1} className="purchaseInvoiceSnapshot">
      <Descriptions.Item label="Invoice number">{revision.invoiceNumber} · Version {revision.revisionNumber}</Descriptions.Item>
      <Descriptions.Item label="Official status"><Tag className="purchaseInvoiceStatusTag" color="blue">Issued official version</Tag></Descriptions.Item>
      <Descriptions.Item label="Finance status">{revisionAccountingTag(revision.accountingStatus)}</Descriptions.Item>
      <Descriptions.Item label="Finance review evidence">{financeReviewEvidence(revision)}</Descriptions.Item>
      <Descriptions.Item label="Invoice date">{revision.invoiceDate}</Descriptions.Item>
      <Descriptions.Item label="Purchase date">{revision.purchaseDate}</Descriptions.Item>
      <Descriptions.Item label="Payment reference">{displayValue(revision.paymentReference)}</Descriptions.Item>
      <Descriptions.Item label="Seller">{revision.sellerName} · {revision.sellerPhone}</Descriptions.Item>
      <Descriptions.Item label="Seller IC / TIN">{displayValue(revision.sellerIcNumber)} / {displayValue(revision.sellerTinNumber)}</Descriptions.Item>
      <Descriptions.Item label="Seller address">{displayValue(revision.sellerAddress)}</Descriptions.Item>
      <Descriptions.Item label="Vehicle">{revision.vehiclePlateNumber} · {revision.vehicleDescription}</Descriptions.Item>
      <Descriptions.Item label="Classified lines">{lineSummary(revision.lines)}</Descriptions.Item>
      <Descriptions.Item label="Total">{formatMoney(Number(revision.amount))}</Descriptions.Item>
    </Descriptions>
  );
}

export function OwnerPurchaseInvoiceDetails({
  invoice,
  onCreateRevision,
  allowCorrections = Boolean(onCreateRevision)
}: {
  invoice: PurchaseInvoice;
  onCreateRevision?: (invoiceId: string, input: CreatePurchaseInvoiceRevisionInput) => Promise<PurchaseInvoice>;
  allowCorrections?: boolean;
}) {
  const [history, setHistory] = useState<{ invoiceId: string; revisions: PurchaseInvoiceRevision[] }>({ invoiceId: invoice.id, revisions: [] });
  const [historyLoad, setHistoryLoad] = useState<{ invoiceId: string; loading: boolean; error?: string }>({ invoiceId: invoice.id, loading: false });
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingRevision, setDownloadingRevision] = useState<number>();
  const historyGate = useRef(createPurchaseInvoiceHistoryRequestGate(invoice.id));
  const currentRevision = invoice.currentRevision;

  if (historyGate.current.activeInvoiceId !== invoice.id) {
    historyGate.current.switchInvoice(invoice.id);
  }

  const reloadHistory = useCallback(async () => {
    const request = historyGate.current.begin(invoice.id);
    if (!request || !historyGate.current.canApply(request)) return;
    setHistory({ invoiceId: request.invoiceId, revisions: [] });
    setHistoryLoad({ invoiceId: request.invoiceId, loading: true });
    let errorMessage: string | undefined;
    try {
      const records = await getPurchaseInvoiceRevisions(invoice.id);
      if (!historyGate.current.canApply(request)) return;
      setHistory({ invoiceId: request.invoiceId, revisions: records.sort((left, right) => right.revisionNumber - left.revisionNumber) });
    } catch (error) {
      if (!historyGate.current.canApply(request)) return;
      errorMessage = humanizeApiError(error, "Unable to load the purchase invoice version history.");
    } finally {
      if (historyGate.current.canApply(request)) {
        setHistoryLoad({ invoiceId: request.invoiceId, loading: false, error: errorMessage });
      }
    }
  }, [invoice.id]);

  useEffect(() => {
    setEditing(false);
    setHistory({ invoiceId: invoice.id, revisions: [] });
    setHistoryLoad({ invoiceId: invoice.id, loading: false });
    void reloadHistory();
  }, [reloadHistory]);

  const historyRevisions = history.invoiceId === invoice.id ? history.revisions : [];
  const historyLoading = historyLoad.invoiceId === invoice.id && historyLoad.loading;
  const historyError = historyLoad.invoiceId === invoice.id ? historyLoad.error : undefined;

  const historyWithCurrent = useMemo(() => {
    if (!currentRevision) return historyRevisions;
    return historyRevisions.some((revision) => revision.revisionNumber === currentRevision.revisionNumber)
      ? historyRevisions
      : [currentRevision, ...historyRevisions];
  }, [currentRevision, historyRevisions]);

  const download = async (revision: PurchaseInvoiceRevision) => {
    setDownloadingRevision(revision.revisionNumber);
    try {
      const blob = await getPurchaseInvoiceRevisionContent(invoice.id, revision.revisionNumber);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${revision.invoiceNumber}-v${revision.revisionNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      message.error(humanizeApiError(error, "Unable to download this official purchase invoice PDF."));
    } finally {
      setDownloadingRevision(undefined);
    }
  };

  if (!currentRevision) {
    return <Alert type="warning" showIcon message="Current invoice version is unavailable" description="Reload the purchase invoice before correcting or downloading it. No change has been saved." />;
  }

  return (
    <Space direction="vertical" size={16} className="fullWidth purchaseInvoiceRevisionPanel">
      <Alert type="info" showIcon message="Formal owner-acquisition invoice" description="This number is already issued. Corrections create a new numbered version; they never overwrite the previous official PDF or the Owner master record." />
      <ProCard
        size="small"
        title={`Current version / 当前版本 · V${currentRevision.revisionNumber}`}
        extra={<Space wrap><Button icon={<DownloadOutlined />} onClick={() => void download(currentRevision)} loading={downloadingRevision === currentRevision.revisionNumber}>Download current PDF</Button>{allowCorrections && <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing((value) => !value)}>{editing ? "Cancel correction" : "Correct with new version"}</Button>}</Space>}
      >
        <SnapshotDetails revision={currentRevision} />
      </ProCard>

      {allowCorrections && editing && (
        <ProCard size="small" title={`Create version ${currentRevision.revisionNumber + 1}`} className="purchaseInvoiceCorrectionCard">
          <Alert type="warning" showIcon message="A reason is required" description="Seller details below belong to this invoice snapshot only. They do not edit the previous Owner record." />
          <Form
            key={`${invoice.id}-${currentRevision.revisionNumber}`}
            name={`ownerPurchaseInvoiceRevision-${invoice.id}`}
            layout="vertical"
            className="drawerForm purchaseInvoiceRevisionForm"
            initialValues={revisionInitialValues(currentRevision)}
            onFinish={async (values: RevisionFormValues) => {
              if (!onCreateRevision) return;
              setSubmitting(true);
              try {
                await onCreateRevision(invoice.id, {
                  expectedRevision: currentRevision.revisionNumber,
                  reason: values.reason.trim(),
                  invoiceDate: values.invoiceDate.format("YYYY-MM-DD"),
                  purchaseDate: values.purchaseDate.format("YYYY-MM-DD"),
                  paymentReference: values.paymentReference?.trim() || undefined,
                  seller: {
                    name: values.sellerName.trim(),
                    phone: values.sellerPhone.trim(),
                    icNumber: values.sellerIcNumber?.trim() || undefined,
                    tinNumber: values.sellerTinNumber?.trim() || undefined,
                    address: values.sellerAddress?.trim() || undefined
                  },
                  lines: values.lines.map((line) => ({
                    lineType: line.lineType,
                    description: line.description.trim(),
                    amount: Number(line.amount),
                    capitaliseIntoVehicleCost: Boolean(line.capitaliseIntoVehicleCost)
                  }))
                });
                setEditing(false);
                await reloadHistory();
              } catch {
                // The App mutation wrapper has displayed the structured API failure. Keep the form open and intact.
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <Form.Item name="reason" label="Correction reason" rules={[{ required: true, whitespace: true, message: "Explain why this official invoice needs a new version." }]}><Input.TextArea rows={3} maxLength={500} showCount /></Form.Item>
            <div className="purchaseInvoiceRevisionFormGrid">
              <Form.Item name="invoiceDate" label="Invoice date" rules={[{ required: true }]}><DatePicker className="fullWidth" /></Form.Item>
              <Form.Item name="purchaseDate" label="Purchase date" rules={[{ required: true, message: "Purchase date is required for every official version." }]}><DatePicker className="fullWidth" /></Form.Item>
              <Form.Item name="paymentReference" label="Payment reference"><Input /></Form.Item>
              <Form.Item name="sellerName" label="Seller name" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
              <Form.Item name="sellerPhone" label="Seller phone" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
              <Form.Item name="sellerIcNumber" label="Seller IC (optional)"><Input /></Form.Item>
              <Form.Item name="sellerTinNumber" label="Seller TIN (optional)"><Input /></Form.Item>
              <Form.Item name="sellerAddress" label="Seller address (optional)" className="purchaseInvoiceRevisionWide"><Input.TextArea rows={2} /></Form.Item>
            </div>
            <RevisionLineFields />
            <Form.Item className="formActions"><Space wrap><Button onClick={() => setEditing(false)} disabled={submitting}>Cancel</Button><Button type="primary" htmlType="submit" loading={submitting}>Create new official version</Button></Space></Form.Item>
          </Form>
        </ProCard>
      )}

      <ProCard size="small" title="Version history / 版本记录" extra={<Button size="small" onClick={() => void reloadHistory()} loading={historyLoading}>Refresh</Button>}>
        {historyError && <Alert type="warning" showIcon message="Version history could not be refreshed" description={historyError} />}
        {historyLoading && historyWithCurrent.length === 0 ? <Spin /> : null}
        {!historyLoading && historyWithCurrent.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No historical versions are available yet." /> : null}
        <Space direction="vertical" className="fullWidth" size={10}>
          {historyWithCurrent.map((revision, index) => {
            const previous = historyWithCurrent[index + 1];
            const changes = purchaseInvoiceRevisionChanges(previous, revision);
            return (
              <ProCard key={revision.id || revision.revisionNumber} size="small" className="purchaseInvoiceHistoryVersion" title={<Space wrap><Typography.Text strong>Version {revision.revisionNumber}</Typography.Text>{revisionAccountingTag(revision.accountingStatus)}</Space>} extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => void download(revision)} loading={downloadingRevision === revision.revisionNumber}>PDF</Button>}>
                <Space direction="vertical" size={4} className="fullWidth">
                  <Typography.Text type="secondary">Created {auditTimestamp(revision.createdAt)} · {revision.createdBy || "Staff account unavailable"}</Typography.Text>
                  <Typography.Text>Reason: {revision.reason || "Initial official issue"}</Typography.Text>
                  <Typography.Text type="secondary">{financeReviewEvidence(revision)}</Typography.Text>
                  {changes.map((change) => <div key={change.field} className="purchaseInvoiceChange"><strong>{change.field}</strong><span>{change.before}</span><span aria-hidden="true">→</span><span>{change.after}</span></div>)}
                </Space>
              </ProCard>
            );
          })}
        </Space>
      </ProCard>
    </Space>
  );
}
