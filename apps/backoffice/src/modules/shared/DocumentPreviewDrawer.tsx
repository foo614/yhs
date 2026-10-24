import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Alert, Drawer, Empty, Spin, Typography } from "antd";

export type DocumentPreviewSource = {
  fileName: string;
  mimeType: string;
  url: string;
};

export type DocumentPreviewKind = "image" | "pdf" | "unsupported";

export function documentPreviewKind(mimeType: string): DocumentPreviewKind {
  const normalized = mimeType.split(";", 1)[0].trim().toLowerCase();
  if (["image/jpeg", "image/png", "image/webp"].includes(normalized)) return "image";
  if (normalized === "application/pdf") return "pdf";
  return "unsupported";
}

export function DocumentPreviewDrawer({
  open,
  title,
  source,
  loading = false,
  error,
  footer,
  onClose
}: {
  open: boolean;
  title: string;
  source?: DocumentPreviewSource;
  loading?: boolean;
  error?: string;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const kind = source ? documentPreviewKind(source.mimeType) : "unsupported";
  const [displayError, setDisplayError] = useState(false);

  useEffect(() => setDisplayError(false), [open, source?.url]);

  return (
    <Drawer
      title={title}
      width={720}
      open={open}
      onClose={onClose}
      footer={footer}
      destroyOnClose
      className="documentPreviewDrawer"
    >
      {loading ? (
        <div className="documentPreviewState"><Spin /><Typography.Text type="secondary">Loading preview…</Typography.Text></div>
      ) : error ? (
        <Alert type="error" showIcon message="Preview unavailable" description={error} />
      ) : source ? (
        <div className="documentPreviewContent">
          <div className="documentPreviewMeta">
            <Typography.Text strong>{source.fileName}</Typography.Text>
            <Typography.Text type="secondary">{source.mimeType || "Unknown file type"}</Typography.Text>
          </div>
          {displayError ? <Alert type="warning" showIcon message="Preview cannot be displayed" description="Download the file to view it, or close this preview and try again." /> : <>
            {kind === "image" && <img src={source.url} alt={`Preview of ${source.fileName}`} onError={() => setDisplayError(true)} />}
            {kind === "pdf" && <iframe src={source.url} title={`Preview of ${source.fileName}`} onError={() => setDisplayError(true)} />}
          </>}
          {kind === "unsupported" && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Inline preview is available for PDF, JPEG, PNG, and WebP files. You can still upload or download this file."
            />
          )}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Choose a file to preview." />
      )}
    </Drawer>
  );
}
