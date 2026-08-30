import { DownloadOutlined, PrinterOutlined, QrcodeOutlined } from "@ant-design/icons";
import { Alert, Button, QRCode, Space, Typography } from "antd";
import { useRef } from "react";
import { printShowroomEnquiryQr, showroomEnquiryQrBranding, showroomEnquiryUrl } from "./ShowroomEnquiryQr";

export function ShowroomEnquiryQrSettings() {
  const qrPreviewRef = useRef<HTMLDivElement>(null);
  const url = showroomEnquiryUrl();
  const qrSvg = () => qrPreviewRef.current?.querySelector("svg");

  const download = () => {
    const svg = qrSvg();
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "ys-heng-showroom-enquiry-qr.svg";
    link.click();
    URL.revokeObjectURL(href);
  };

  const print = () => {
    const svg = qrSvg();
    if (!svg) return;
    printShowroomEnquiryQr(url, new XMLSerializer().serializeToString(svg));
  };

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <Alert className="operationalInfoAlert" type="info" showIcon message="Stable shop QR — Opens the public no-login enquiry flow and labels new submissions for Sales." />
      <div ref={qrPreviewRef} className="showroomQrPreview">
        <QRCode
          value={url}
          type="svg"
          size={260}
          color="#161616"
          bgColor="#ffffff"
          aria-label="YS Heng showroom enquiry QR"
          {...showroomEnquiryQrBranding}
        />
      </div>
      <Typography.Text strong>Public showroom enquiry URL</Typography.Text>
      <Typography.Paragraph copyable={{ text: url }} code>{url}</Typography.Paragraph>
      <Space wrap>
        <Button icon={<QrcodeOutlined />} href={url} target="_blank">Open public flow</Button>
        <Button icon={<DownloadOutlined />} onClick={download}>Download QR</Button>
        <Button icon={<PrinterOutlined />} onClick={print}>Print QR</Button>
      </Space>
    </Space>
  );
}
