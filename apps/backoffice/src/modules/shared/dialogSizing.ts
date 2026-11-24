import type { ModalProps } from "antd";

export const dialogWidths = {
  compact: "min(440px, calc(100vw - 16px))",
  form: "min(720px, calc(100vw - 16px))",
  formWide: "min(960px, calc(100vw - 16px))",
  data: "min(1200px, calc(100vw - 16px))",
  document: "min(1200px, calc(100vw - 16px))"
} satisfies Record<string, NonNullable<ModalProps["width"]>>;
