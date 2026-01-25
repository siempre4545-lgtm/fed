import type { Metadata } from "next";
import { Suspense } from "react";
import { MacroTraceDashboard } from "../../components/macro-trace/MacroTraceDashboard";

export const metadata: Metadata = {
  title: "월목토 루틴",
  description: "금융 데이터 기반 자산 바스켓 대시보드",
};

const MacroTrace = () => (
  <Suspense fallback={<div style={{ padding: 24 }}>로딩 중...</div>}>
    <MacroTraceDashboard />
  </Suspense>
);

export default MacroTrace;
