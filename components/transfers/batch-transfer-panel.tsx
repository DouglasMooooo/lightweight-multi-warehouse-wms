"use client";

import { useState } from "react";
import type { WarehouseCode } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { ScanReviewWorkbench } from "@/components/review/scan-review-workbench";

export function BatchTransferPanel({
  sourceWarehouse,
  onConfirmed,
}: {
  sourceWarehouse: WarehouseCode;
  onConfirmed: () => Promise<void>;
}) {
  const { t } = useI18n();
  const destinations = (["SYD", "MEL", "BNE"] as WarehouseCode[])
    .filter((code) => code !== sourceWarehouse);
  const [destinationWarehouse, setDestinationWarehouse] = useState<WarehouseCode>(destinations[0]);
  const [requiredCondition, setRequiredCondition] =
    useState<"New" | "Repair_Good" | "Repair">("Repair_Good");
  const [allowRepair, setAllowRepair] = useState(false);
  const [transferReference, setTransferReference] = useState("");
  const contextReady = transferReference.trim().length >= 3;

  return (
    <>
      <section className="batch-operation">
        <div className="batch-context-grid">
          <label><span>{t("transfer.from")}</span><input value={sourceWarehouse} disabled /></label>
          <label>
            <span>{t("transfer.to")}</span>
            <select value={destinationWarehouse} onChange={(event) => setDestinationWarehouse(event.target.value as WarehouseCode)}>
              {destinations.map((code) => <option key={code}>{code}</option>)}
            </select>
          </label>
          <label>
            <span>{t("transfer.conditionPolicy")}</span>
            <select value={requiredCondition} onChange={(event) => setRequiredCondition(event.target.value as typeof requiredCondition)}>
              <option value="New">{t("condition.New")}</option>
              <option value="Repair_Good">{t("condition.Repair_Good")}</option>
              <option value="Repair">{t("condition.Repair")}</option>
            </select>
          </label>
          <label>
            <span>{t("transfer.reference")}</span>
            <input
              value={transferReference}
              onChange={(event) => setTransferReference(event.target.value.toUpperCase())}
              placeholder="TR-20260730-001"
            />
          </label>
          {requiredCondition === "Repair" && (
            <label className="checkbox-row">
              <input type="checkbox" checked={allowRepair} onChange={(event) => setAllowRepair(event.target.checked)} />
              {t("review.allowRepair")}
            </label>
          )}
        </div>
      </section>
      {contextReady ? (
        <ScanReviewWorkbench
          key={`${sourceWarehouse}:${destinationWarehouse}:${requiredCondition}:${transferReference}`}
          endpoint="/api/transfers/batch"
          persistenceKey={`transfer:${sourceWarehouse}:${destinationWarehouse}:${requiredCondition}:${transferReference}`}
          requestContext={{
            sourceWarehouse,
            destinationWarehouse,
            requiredCondition,
            transferReference,
            allowRepair,
          }}
          title={t("review.transferTitle", { reference: transferReference })}
          subtitle={t("review.transferSubtitle", {
            source: sourceWarehouse,
            destination: destinationWarehouse,
          })}
          confirmLabel={t("transfer.confirmOut")}
          onConfirmed={async () => {
            setTransferReference("");
            await onConfirmed();
          }}
        />
      ) : <div className="notice">{t("review.transferContextRequired")}</div>}
    </>
  );
}
