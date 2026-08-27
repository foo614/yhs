import { ProDescriptions } from "@ant-design/pro-components";
import { Alert } from "antd";
import type { AiUsageLimitSnapshot } from "../../api";
import { aiUsageSnapshotDescriptionData, ocrOperationalGuidanceItems } from "./AiUsagePanelContent";

export function OcrOperationalGuidance() {
  return (
    <Alert
      type="info"
      showIcon
      message="When to use OCR"
      description={(
        <ul className="settingsGuidanceList">
          {ocrOperationalGuidanceItems.map((item) => <li key={item.label}><strong>{item.label}</strong> {item.text}</li>)}
        </ul>
      )}
    />
  );
}

export function AiUsageSnapshotDescriptions({ snapshot }: { snapshot: AiUsageLimitSnapshot }) {
  const data = aiUsageSnapshotDescriptionData(snapshot);

  return (
    <ProDescriptions
      bordered
      size="small"
      column={{ xs: 1, sm: 2 }}
      dataSource={data}
      columns={[
        { title: "This month used", dataIndex: "usedThisMonth" },
        { title: "This month remaining", dataIndex: "remainingThisMonth" },
        { title: "Last updated", dataIndex: "updatedAt" },
        { title: "Updated by", dataIndex: "updatedBy" }
      ]}
    />
  );
}
