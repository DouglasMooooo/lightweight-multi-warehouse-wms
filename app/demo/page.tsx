import { LeadershipDemo } from "@/components/demo/leadership-demo";
import "./demo.css";

export const metadata = {
  title: "WMS 仓库人员实操全流程演练",
  description:
    "仓库人员中文实操演练：ASN 到货验收、SN 扫描、货架上架、拣货出库、交接、调拨、故障返修与全流程追溯。",
};
export default function DemoPage() {
  return <LeadershipDemo />;
}
