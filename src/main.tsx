import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 앱 셸을 캐시해 오프라인에서도 열리게 한다 (빌드 결과물에서만)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // BASE_URL = 배포 시 /hankki/ → 서비스 워커 범위도 /hankki/ 로 한정된다
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      /* 서비스 워커 없이도 앱은 동작한다 */
    });
  });
}
