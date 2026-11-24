import { useEffect, useState, type ReactNode } from "react";
import { Modal, type DrawerProps, type ModalProps } from "antd";
import { dialogWidths } from "./dialogSizing";

type BusinessDialogProps = Pick<DrawerProps,
  "title" | "open" | "onClose" | "children" | "footer" | "extra" | "className" | "rootClassName" |
  "height" | "placement" | "closable" | "keyboard" | "destroyOnClose" | "maskClosable" | "mask"
> & { width?: ModalProps["width"] };

export function BusinessDialog({
  title, open, onClose, children, footer, extra, className, rootClassName, width = dialogWidths.form,
  height, closable, keyboard, destroyOnClose
}: BusinessDialogProps) {
  // Keep closed children updating after their first opening so conditional
  // previews can release private URLs without mounting unopened panels early.
  const [hasOpened, setHasOpened] = useState(Boolean(open));
  useEffect(() => {
    if (!open) return;
    setHasOpened(true);
    const trigger = document.activeElement;
    // Some workflows unmount the whole dialog on cancel, before Modal's
    // closing animation can restore focus to the underlying record action.
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open]);
  const heading: ReactNode = extra ? <div className="businessDialogHeading">
    <div className="businessDialogTitle">{title}</div>
    <div className="businessDialogExtra">{extra}</div>
  </div> : title;

  return <Modal
    centered
    title={heading}
    open={open}
    onCancel={onClose}
    width={width}
    className={["businessDialog", className].filter(Boolean).join(" ")}
    rootClassName={rootClassName}
    footer={footer ?? null}
    mask={{ closable: false }}
    closable={closable}
    keyboard={keyboard}
    destroyOnHidden={destroyOnClose}
    forceRender={hasOpened && !destroyOnClose}
    styles={height ? { body: { maxHeight: height } } : undefined}
  >{children}</Modal>;
}
