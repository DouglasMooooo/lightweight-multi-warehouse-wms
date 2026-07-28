import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { WmsApplicationService } from "@/services/server/wms-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const serialNumber = new URL(request.url).searchParams.get("serialNumber")?.trim();
    if (!serialNumber) throw new DomainError("Serial number is required.");
    return NextResponse.json(await new WmsApplicationService().lookupFaulty(serialNumber));
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERP lookup failed.";
    return NextResponse.json({ error: message }, { status: error instanceof DomainError ? 400 : 500 });
  }
}
