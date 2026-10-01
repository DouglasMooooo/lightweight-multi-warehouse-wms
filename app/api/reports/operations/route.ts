import { NextResponse } from "next/server";
import { z } from "zod";
import { timed } from "@/lib/performance";
import { OperationalReportingService } from "@/services/server/reporting-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

const schema = z.object({
  mode: z.enum(["Weekly", "Monthly"]).default("Weekly"),
  warehouse: z.enum(["SYD", "MEL", "BNE", "ALL"]).default("SYD"),
  period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const parsed = schema.safeParse({
    mode: query.get("mode") ?? "Weekly",
    warehouse: query.get("warehouse") ?? "SYD",
    period: query.get("period"),
  });
  if (!parsed.success)
    return NextResponse.json(
      { code: "INVALID_REPORT_FILTER", error: "A valid report mode, warehouse and business date are required." },
      { status: 400 },
    );
  const containing = new Date(`${parsed.data.period}T12:00:00Z`);
  const result = await timed(
    {
      route: "GET /api/reports/operations",
      queryName: "operationsReport",
      rowCount: (value) => value.reports.length,
    },
    () => new OperationalReportingService().reports({
      mode: parsed.data.mode,
      warehouseCode: parsed.data.warehouse,
      containing,
    }),
  );
  return NextResponse.json(result);
}
