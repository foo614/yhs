import { DownloadOutlined, EyeOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Space, Spin, Typography } from "antd";
import { useEffect, useState } from "react";
import { getVehicleDocumentContent, humanizeApiError, type VehicleDocument } from "../../api";
import { DocumentPreviewDrawer, documentPreviewKind } from "./DocumentPreviewDrawer";

export function releaseObjectUrl(url: string, revoke: (value: string) => void = URL.revokeObjectURL) {
  if (url) revoke(url);
}

export function SecureDocumentEvidence({ vehicleId, document }: { vehicleId: string; document: VehicleDocument }) {
  const [objectUrl, setObjectUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [fullViewOpen, setFullViewOpen] = useState(false);
  const kind = documentPreviewKind(document.mimeType);

  useEffect(() => {
    let active = true;
    let loadedUrl = "";
    setLoading(true);
    setError("");
    setObjectUrl("");
    void getVehicleDocumentContent(vehicleId, document.id)
      .then((blob) => {
        loadedUrl = URL.createObjectURL(blob);
        if (active) setObjectUrl(loadedUrl);
        else releaseObjectUrl(loadedUrl);
      })
      .catch((loadError) => {
        if (active) setError(humanizeApiError(loadError, "Evidence could not be loaded."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      releaseObjectUrl(loadedUrl);
    };
  }, [document.id, reloadKey, vehicleId]);

  return (
    <div className="secureDocumentEvidence">
      <div className="secureDocumentEvidenceHeader">
        <div>
          <Typography.Text strong>{document.fileName}</Typography.Text>
          <Typography.Text type="secondary">{document.mimeType || "Unknown file type"}</Typography.Text>
        </div>
        {objectUrl && (
          <Space wrap size={6}>
            {kind !== "unsupported" && <Button size="small" icon={<EyeOutlined />} onClick={() => setFullViewOpen(true)}>Full view</Button>}
            <Button size="small" icon={<DownloadOutlined />} href={objectUrl} download={document.fileName}>Download original</Button>
          </Space>
        )}
      </div>
      {loading ? (
        <div className="secureDocumentEvidenceState"><Spin size="small" /><Typography.Text type="secondary">Loading evidence…</Typography.Text></div>
      ) : error ? (
        <Alert type="error" showIcon message="Evidence unavailable" description={error} action={<Button size="small" icon={<ReloadOutlined />} onClick={() => setReloadKey((value) => value + 1)}>Retry</Button>} />
      ) : kind === "image" ? (
        <button type="button" className="secureDocumentThumbnail" onClick={() => setFullViewOpen(true)} aria-label={`Enlarge ${document.fileName}`}>
          <img src={objectUrl} alt={`Evidence ${document.fileName}`} />
        </button>
      ) : kind === "pdf" ? (
        <div className="secureDocumentPdf">
          <iframe src={objectUrl} title={`Inline preview of ${document.fileName}`} sandbox="" />
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Preview is not available for this file type. Download the original to view it." />
      )}
      <DocumentPreviewDrawer
        open={fullViewOpen}
        title={`${document.fileName} preview`}
        source={objectUrl ? { fileName: document.fileName, mimeType: document.mimeType, url: objectUrl } : undefined}
        onClose={() => setFullViewOpen(false)}
        footer={objectUrl ? <Button icon={<DownloadOutlined />} href={objectUrl} download={document.fileName}>Download original</Button> : undefined}
      />
    </div>
  );
}
