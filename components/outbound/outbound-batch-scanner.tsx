"use client";

import type { OutboundOrder } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { ScanReviewWorkbench } from "@/components/review/scan-review-workbench";

export function OutboundBatchScanner({
  order,
  onCommitted,
}: {
  order: OutboundOrder;
  onCommitted: () => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <ScanReviewWorkbench
      endpoint={`/api/outbound/${order.id}/scans`}
      persistenceKey={`outbound:${order.id}`}
      title={t("review.outboundTitle", { shNo: order.shNo })}
      subtitle={t("review.outboundSubtitle")}
      confirmLabel={t("review.confirmPreparation")}
      lines={order.lines.map((line) => ({
        id: line.id,
        sku: line.sku,
        model: line.model,
        requiredCondition: line.requiredCondition,
        requiredQty: line.requiredQty,
        assignedQty: line.scannedSerials.length,
      }))}
      onConfirmed={onCommitted}
    />
  );
}
