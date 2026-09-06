import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { configureAntdReact19Rendering } from "./antdReact19";

const mocks = vi.hoisted(() => ({ register: vi.fn(), render: vi.fn(), unmount: vi.fn(), create: vi.fn() }));
vi.mock("antd", () => ({ unstableSetRender: mocks.register }));
vi.mock("react-dom/client", () => ({ createRoot: mocks.create }));

describe("Ant Design static React 19 rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockReturnValue({ render: mocks.render, unmount: mocks.unmount });
  });

  it("uses one client root per dialog container and releases it after close", async () => {
    configureAntdReact19Rendering();
    const render = mocks.register.mock.calls[0][0] as (node: ReactNode, container: Element) => () => Promise<void>;
    const first = {} as Element;
    const second = {} as Element;
    const close = render("first", first);
    render("updated", first);
    render("other dialog", second);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.render.mock.calls).toEqual([["first"], ["updated"], ["other dialog"]]);
    const closing = close();
    expect(mocks.unmount).not.toHaveBeenCalled();
    await closing;
    expect(mocks.unmount).toHaveBeenCalledOnce();
    render("reopened", first);
    expect(mocks.create).toHaveBeenCalledTimes(3);
  });
});
