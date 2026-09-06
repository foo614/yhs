import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import App from "./App";
import { BusinessTextFormProvider } from "./BusinessTextFormProvider";
import { configureAntdReact19Rendering } from "./antdReact19";
import "./styles.css";

configureAntdReact19Rendering();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={enUS}
      theme={{
        token: {
          colorPrimary: "#0d6b57",
          borderRadius: 6,
          fontFamily: "Arial, Helvetica, sans-serif"
        }
      }}
    >
      <BusinessTextFormProvider>
        <App />
      </BusinessTextFormProvider>
    </ConfigProvider>
  </React.StrictMode>
);
