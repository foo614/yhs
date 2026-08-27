import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import App from "./App";
import "./styles.css";

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
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
