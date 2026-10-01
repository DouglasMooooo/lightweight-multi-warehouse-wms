import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { DomainError } from "@/domain/errors";
import type { ScanReviewInputRow } from "@/domain/scan-review";
import { getPrisma } from "@/lib/prisma";
import {
  BatchTransferService,
  type TransferBatchInput,
} from "@/services/server/batch-transfer-service";

export interface TransferReviewInput
  extends Omit<TransferBatchInput, "rawValues"> {
  rows: ScanReviewInputRow[];
}

export class TransferReviewService {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  async validate(input: TransferReviewInput) {
    const included = input.rows.filter((row) => row.included !== false);
    const validation = await new BatchTransferService(this.prisma).validate({
      ...input,
      rawValues: included.map((row) => row.rawValue),
    });
    let resultIndex = 0;
    const results = input.rows.map((row) => {
      if (row.included === false) {
        return {
          rowId: row.rowId,
          rawValue: row.rawValue,
          serialNumber: row.rawValue,
          included: false,
          operatorRemark: row.operatorRemark,
          validationStatus: "EXCLUDED" as const,
          validationCode: "EXCLUDED",
          message: "Excluded from final confirmation.",
          targetLabel: input.destinationWarehouse,
        };
      }
      const result = validation.results[resultIndex++];
      const validationStatus = result.validationStatus === "VALID"
        ? "VALID"
        : result.validationStatus === "MANUAL_REVIEW"
          ? "UNRESOLVED"
          : "NEEDS_ATTENTION";
      return {
        ...result,
        rowId: row.rowId,
        included: true,
        operatorRemark: row.operatorRemark,
        validationStatus,
        validationCode: result.validationStatus,
        targetLabel: input.destinationWarehouse,
      };
    });
    const selected = results.filter((row) => row.included);
    return {
      batchReference: `TRR-${input.transferReference}`,
      summary: {
        total: results.length,
        valid: selected.filter((row) => row.validationStatus === "VALID").length,
        needsAttention: selected.filter((row) => row.validationStatus === "NEEDS_ATTENTION").length,
        unresolved: selected.filter((row) => row.validationStatus === "UNRESOLVED").length,
        excluded: results.filter((row) => row.validationStatus === "EXCLUDED").length,
      },
      groups: validation.groups,
      results,
    };
  }

  async confirm(input: TransferReviewInput) {
    const review = await this.validate(input);
    if (
      !review.summary.valid ||
      review.summary.needsAttention ||
      review.summary.unresolved
    ) {
      throw new DomainError(
        "Transfer review changed or still contains selected invalid rows.",
        "TRANSFER_REVIEW_REVALIDATION_FAILED",
      );
    }
    const included = input.rows.filter((row) => row.included !== false);
    const confirmed = await new BatchTransferService(this.prisma).confirm({
      ...input,
      rawValues: included.map((row) => row.rawValue),
    });
    return {
      ...confirmed,
      confirmed: true,
      reviewBatchReference: input.reviewBatchReference,
    };
  }
}
