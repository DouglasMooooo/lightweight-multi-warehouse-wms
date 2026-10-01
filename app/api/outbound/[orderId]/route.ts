import { NextResponse } from "next/server";
import { timed } from "@/lib/performance";
import { PageQueryService } from "@/services/server/page-query-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const result = await timed(
    { route: "GET /api/outbound/:id", queryName: "outboundDetail" },
    () => new PageQueryService().outboundDetail(orderId),
  );
  return result ? NextResponse.json(result) : NextResponse.json({ error: "Outbound order not found." }, { status: 404 });
}
