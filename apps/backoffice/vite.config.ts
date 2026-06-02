import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          const normalizedId = id.replaceAll("\\", "/");
          if (id.includes("@ant-design/pro-components")) return "pro-components";
          if (normalizedId.includes("@ant-design/icons")) return "ant-icons";
          if (normalizedId.includes("@ant-design/cssinjs")) return "ant-cssinjs";
          const antdModule = normalizedId.match(/\/node_modules\/antd\/es\/([^/]+)/);
          if (antdModule) return `antd-${antdModule[1].replaceAll("_", "")}`;
          if (normalizedId.includes("/node_modules/antd/")) return "antd-core";
          if (normalizedId.includes("/node_modules/rc-") || normalizedId.includes("/node_modules/@rc-component/")) return "rc-components";
          if (id.includes("react") || id.includes("react-dom")) return "react";
          return "vendor";
        }
      }
    }
  },
  server: {
    port: 3001
  }
});
