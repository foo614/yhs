import { unstableSetRender } from "antd";
import { createRoot, type Root } from "react-dom/client";

// Ant Design 5's static dialogs need the React 19 client renderer.
// Remove this compatibility registration when migrating to Ant Design 6.
export function configureAntdReact19Rendering() {
  const roots = new WeakMap<Element | DocumentFragment, Root>();
  unstableSetRender((node, container) => {
    const root = roots.get(container) ?? createRoot(container);
    roots.set(container, root);
    root.render(node);
    return async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      root.unmount();
      roots.delete(container);
    };
  });
}
