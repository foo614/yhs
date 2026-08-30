import { BookOutlined, PlayCircleOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Alert, Button, Collapse, Divider, Drawer, Space, Steps, Tag, Tour, Typography } from "antd";
import type { ModuleGuideDefinition } from "../../moduleGuides";

export type ModuleGuideTarget = () => HTMLElement | null;

export type ModuleGuideExperienceProps = {
  guide: ModuleGuideDefinition;
  activeSectionKey?: string;
  drawerOpen: boolean;
  tourOpen: boolean;
  headerTarget: ModuleGuideTarget;
  contentTarget: ModuleGuideTarget;
  buttonTarget: ModuleGuideTarget;
  onCloseDrawer: () => void;
  onReplayTour: () => void;
  onCloseTour: () => void;
};

// rc-tour accepts a lazy target that resolves to null while a ref is not mounted,
// but its declaration models this as two separate function types.
function lazyTourTarget(target: ModuleGuideTarget): () => HTMLElement {
  return target as () => HTMLElement;
}

function guideActionContent(action: string) {
  const headingEnd = action.indexOf(": ");
  if (headingEnd <= 0) return action;

  return (
    <>
      <strong>{action.slice(0, headingEnd)}</strong>
      {action.slice(headingEnd)}
    </>
  );
}

export function ModuleGuideExperience({
  guide,
  activeSectionKey,
  drawerOpen,
  tourOpen,
  headerTarget,
  contentTarget,
  buttonTarget,
  onCloseDrawer,
  onReplayTour,
  onCloseTour
}: ModuleGuideExperienceProps) {
  const initialSectionKey = guide.sections.some((section) => section.key === activeSectionKey)
    ? activeSectionKey
    : guide.sections[0]?.key;
  const tourSteps = [
    {
      target: lazyTourTarget(headerTarget),
      title: `Page purpose / 页面用途 · ${guide.title}`,
      description: guide.summary,
      placement: "bottom" as const
    },
    {
      target: lazyTourTarget(contentTarget),
      title: "Recommended workflow / 建议流程",
      description: (
        <ol style={{ margin: 0, paddingInlineStart: 20 }}>
          {guide.quickSteps.map((step) => <li key={step.title}>{step.title}</li>)}
        </ol>
      ),
      placement: "top" as const
    },
    {
      target: lazyTourTarget(contentTarget),
      title: "Tabs & sections / 标签与区域",
      description: (
        <ul className="moduleGuideTourSectionList">
          {guide.sections.map((section) => <li key={section.key}>{section.label}</li>)}
        </ul>
      ),
      placement: "top" as const
    },
    {
      target: lazyTourTarget(buttonTarget),
      title: "Help anytime / 随时查看帮助",
      description: "Open How to use whenever you need the full steps, completion check, or a replay of this page tour.",
      placement: "bottomRight" as const
    }
  ];

  return (
    <>
      <Drawer
        title={(
          <Space size={8}>
            <BookOutlined />
            <span>How to use / 使用指南</span>
          </Space>
        )}
        width="min(680px, 96vw)"
        open={drawerOpen}
        onClose={onCloseDrawer}
        className="moduleGuideDrawer"
        footer={(
          <Space wrap>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={onReplayTour}>
              Start page tour / 开始导览
            </Button>
            <Button onClick={onCloseDrawer}>Close / 关闭</Button>
          </Space>
        )}
      >
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <section aria-labelledby="module-guide-title">
            <Typography.Title id="module-guide-title" level={4} style={{ marginBlock: 0 }}>
              {guide.title}
            </Typography.Title>
            <Space wrap size={6} className="moduleGuideMeta">
              <Tag color="cyan">{guide.roleLabel}</Tag>
              <Tag>{guide.sections.length} tabs / sections · 标签与区域</Tag>
            </Space>
            <Typography.Paragraph style={{ marginTop: 12, marginBottom: 0 }}>
              {guide.summary}
            </Typography.Paragraph>
          </section>

          <section aria-labelledby="module-guide-workflow-title">
            <Typography.Title id="module-guide-workflow-title" level={5}>
              Quick workflow / 快速流程
            </Typography.Title>
            <Steps
              direction="vertical"
              size="small"
              current={-1}
              items={guide.quickSteps.map((step) => ({
                title: step.title,
                description: step.description
              }))}
            />
          </section>

          <Divider className="moduleGuideDivider" />

          <section aria-labelledby="module-guide-sections-title">
            <Typography.Title id="module-guide-sections-title" level={5} style={{ marginTop: 0 }}>
              Tabs & sections / 标签与区域
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              These names match the page. Expand the tab or section you are working in for its fields, steps, completion check, handoff, and limits.
            </Typography.Paragraph>
            <Collapse
              key={`${guide.path}:${guide.roleLabel}:${initialSectionKey ?? "none"}`}
              className="moduleGuideSections"
              defaultActiveKey={initialSectionKey ? [initialSectionKey] : []}
              items={guide.sections.map((section) => ({
                key: section.key,
                label: (
                  <span className="moduleGuideSectionLabel">
                    <strong>{section.label}</strong>
                    <span className="moduleGuideSectionTags">
                      {section.key === activeSectionKey && <Tag color="green">Current / 当前</Tag>}
                      <Tag>{section.kind === "tab" ? "Tab / 标签页" : section.kind === "detail-tab" ? "Detail tab / 详情标签" : "Section / 区域"}</Tag>
                    </span>
                  </span>
                ),
                children: (
                  <Space direction="vertical" size={14} className="moduleGuideSectionBody">
                    <Tag color="blue">{section.audience}</Tag>
                    <div className="moduleGuideSectionBlock">
                      <Typography.Text strong>Purpose / 用途</Typography.Text>
                      <Typography.Paragraph>{section.purpose}</Typography.Paragraph>
                    </div>

                    {section.requiredItems.length > 0 && (
                      <div className="moduleGuideSectionBlock">
                        <Typography.Text strong>Required / 需要资料</Typography.Text>
                        <ul>
                          {section.requiredItems.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                    )}

                    <div className="moduleGuideSectionBlock">
                      <Typography.Text strong>What to do / 操作步骤</Typography.Text>
                      <ol>
                        {section.actions.map((action) => <li key={action}>{guideActionContent(action)}</li>)}
                      </ol>
                    </div>

                    <Alert
                      className="moduleGuideReadyAlert"
                      type="success"
                      showIcon
                      message="Ready when / 完成标准"
                      description={section.completeWhen}
                    />

                    {section.handoff && (
                      <div className="moduleGuideHandoff">
                        <Typography.Text strong>Next handoff / 下一步交接</Typography.Text>
                        <Typography.Paragraph>{section.handoff}</Typography.Paragraph>
                      </div>
                    )}

                    {section.warnings.length > 0 && (
                      <Alert
                        type="warning"
                        showIcon
                        message="Important limits / 重要限制"
                        description={(
                          <ul className="moduleGuideWarningList">
                            {section.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                          </ul>
                        )}
                      />
                    )}
                  </Space>
                )
              }))}
            />
          </section>

          <Alert
            type="warning"
            showIcon
            icon={<SafetyCertificateOutlined />}
            message="Before you finish / 完成前确认"
            description={guide.completionReminder}
          />
        </Space>
      </Drawer>

      <Tour
        key={`${guide.path}:${guide.roleLabel}`}
        open={tourOpen}
        type="primary"
        rootClassName="moduleGuideTour"
        steps={tourSteps}
        onClose={onCloseTour}
      />
    </>
  );
}
