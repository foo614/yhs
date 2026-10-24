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
  const [previewMimeType, setPreviewMimeType] = useState(document.mimeType);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [fullViewOpen, setFullViewOpen] = useState(false);
  const kind = documentPreviewKind(previewMimeType);

  useEffect(() => {
    let active = true;
    let loadedUrl = "";
    setLoading(true);
    setError("");
    setObjectUrl("");
    setPreviewMimeType(document.mimeType);
    void getVehicleDocumentContent(vehicleId, document.id)
      .then((blob) => {
        loadedUrl = URL.createObjectURL(blob);
        if (active) {
          setPreviewMimeType(blob.type || document.mimeType);
          setObjectUrl(loadedUrl);
        }
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
  }, [document.id, document.mimeType, reloadKey, vehicleId]);

  return (
    <div className="secureDocumentEvidence">
      <div className="secureDocumentEvidenceHeader">
        <div>
          <Typography.Text strong>{document.fileName}</Typography.Text>
          <Typography.Text type="secondary">{previewMimeType || "Unknown file type"}</Typography.Text>
        </div>
        {objectUrl && (
          <Space wrap size={6}>
            {kind !== "unsupported" && <Button size="small" icon={<EyeOutlined />} onClick={() => setFullViewOpen(true)}>Preview</Button>}
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
      ) : kind === "pdf" ? null : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Preview is not available for this file type. Download the original to view it." />
      )}
      <DocumentPreviewDrawer
        open={fullViewOpen}
        title="Document preview / 文件预览"
        source={objectUrl ? { fileName: document.fileName, mimeType: previewMimeType, url: objectUrl } : undefined}
        onClose={() => setFullViewOpen(false)}
        footer={objectUrl ? <div className="documentPreviewFooter"><Typography.Text type="secondary">If the preview cannot be displayed, download the original file.</Typography.Text><Button icon={<DownloadOutlined />} href={objectUrl} download={document.fileName}>Download original</Button></div> : undefined}
      />
    </div>
  );
}
