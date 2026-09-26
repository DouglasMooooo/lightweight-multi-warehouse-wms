import { LeadershipDemo } from "@/components/demo/leadership-demo";
import "./demo.css";

export const metadata = {
  title: "WMS 仓库作业预览 · 管理层演示",
  description:
    "中文仓库作业原型：扫码备货、数字取货、故障收货、跨仓调拨、维修、SN 追溯与审计。",
};
export default function DemoPage() {
  return <LeadershipDemo />;
}
