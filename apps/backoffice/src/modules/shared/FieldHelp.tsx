import type { ReactNode } from "react";
import { Button, Tooltip } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";

const triggers = ["hover", "focus", "click"] as ("hover" | "focus" | "click")[];

function helpButton(label: string, title: ReactNode) {
  return <Button type="text" size="small" htmlType="button" disabled={false} className="fieldHelpButton" aria-label={label} aria-description={typeof title === "string" ? title : undefined} icon={<InfoCircleOutlined />} />;
}

export function fieldTooltip(title: ReactNode, label: string) {
  if (title == null || title === false || title === "") return undefined;
  return { title, trigger: triggers, icon: helpButton(label, title) };
}

export function FieldHelp({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === false || children === "") return null;
  return <Tooltip title={children} trigger={triggers}>{helpButton(label, children)}</Tooltip>;
}
