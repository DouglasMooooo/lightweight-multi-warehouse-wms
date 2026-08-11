import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { DomainError } from "@/domain/errors";
import { parseQRScan } from "@/domain/scan";
import { getPrisma } from "@/lib/prisma";
import { WmsApplicationService } from "@/services/server/wms-service";

export class TransferReceiptService {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  async validate(transferId: string, destinationLocation: string, rawValues: string[]) {
    const transfer = await this.prisma.transferOrder.findUnique({
      where: { id: transferId },
      include: {
        destinationWarehouse: true,
        lines: {
          include: {
            product: true,
            serials: { include: { serialNumber: true } },
          },
        },
      },
    });
    if (!transfer || transfer.status !== "In_Transit")
      throw new DomainError("Transfer is not ready for receipt.", "TRANSFER_NOT_IN_TRANSIT");
    const destination = await this.prisma.location.findFirst({
      where: {
        warehouseId: transfer.destinationWarehouseId,
        code: destinationLocation.trim().toUpperCase(),
        active: true,
      },
      select: { id: true, code: true },
    });
    if (!destination)
      throw new DomainError("Destination physical location was not found in the receiving warehouse.", "DESTINATION_LOCATION_NOT_FOUND");

    const expected = new Map(
      transfer.lines.flatMap((line) =>
        line.serials.map((link) => [
          link.serialNumber.serialNumber,
          {
            serialNumber: link.serialNumber.serialNumber,
            sku: line.product.sku,
            model: line.product.model,
            condition: line.condition,
            status: link.serialNumber.status,
          },
        ] as const),
      ),
    );
    const seen = new Set<string>();
    const results = rawValues.map((rawValue, index) => {
      const parsed = parseQRScan(rawValue);
      const machine = expected.get(parsed.serialNumber);
      let validationStatus = "VALID";
      let message = "Matched to this transfer.";
      if (seen.has(parsed.serialNumber)) {
        validationStatus = "DUPLICATE_SCAN";
        message = "Duplicate SN in this receipt batch.";
      } else if (!machine) {
        validationStatus = "NOT_IN_TRANSFER";
        message = "SN is not part of this transfer.";
      } else if (parsed.sku && parsed.sku !== machine.sku) {
        validationStatus = "SKU_MISMATCH";
        message = "QR SKU does not match the transfer line.";
      } else if (machine.status !== "In_Transit") {
        validationStatus = "INVALID_STATUS";
        message = "SN is not In Transit.";
      }
      seen.add(parsed.serialNumber);
      return {
        scanId: `receipt-${index + 1}`,
        rawValue,
        serialNumber: parsed.serialNumber,
        sku: machine?.sku ?? parsed.sku,
        model: machine?.model,
        condition: machine?.condition,
        validationStatus,
        message,
      };
    });
    const validNumbers = new Set(
      results.filter((row) => row.validationStatus === "VALID").map((row) => row.serialNumber),
    );
    const missing = [...expected.keys()].filter((serialNumber) => !validNumbers.has(serialNumber));
    const valid = results.filter((row) => row.validationStatus === "VALID").length;
    return {
      transfer: {
        id: transfer.id,
        transferNo: transfer.transferNo,
        destinationWarehouse: transfer.destinationWarehouse.code,
        destinationLocation: destination.code,
      },
      summary: {
        total: results.length,
        expected: expected.size,
        valid,
        invalid: results.length - valid,
        missing: missing.length,
      },
      missing,
      results,
    };
  }

  async confirm(transferId: string, destinationLocation: string, rawValues: string[]) {
    const validation = await this.validate(transferId, destinationLocation, rawValues);
    if (
      validation.summary.invalid ||
      validation.summary.missing ||
      validation.summary.valid !== validation.summary.expected
    )
      throw new DomainError(
        "Receipt batch must contain every transfer SN exactly once.",
        "TRANSFER_RECEIPT_INCOMPLETE",
      );
    await new WmsApplicationService(this.prisma).execute({
      type: "receiveTransfer",
      transferId,
      destinationLocation: validation.transfer.destinationLocation,
    });
    return { ...validation, received: validation.summary.valid };
  }
}
