import { WmsApp } from "@/components/wms-app";

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  return <WmsApp path={path} />;
}
