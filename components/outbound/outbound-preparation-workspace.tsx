"use client";

import { PackageCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type { InventoryBalance, OutboundLine, OutboundOrder } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { ScanReviewWorkbench } from "@/components/review/scan-review-workbench";
import { Button } from "@/components/shared/ui";

export function OutboundPreparationWorkspace({
  order,
  line,
  candidates,
  serialTrackingRequired,
  onConfirmed,
}: {
  order: OutboundOrder;
  line: OutboundLine;
  candidates: InventoryBalance[];
  serialTrackingRequired: boolean;
  onConfirmed: () => Promise<void>;
}) {
  const { t, error: friendlyError } = useI18n();
  const [locationCode, setLocationCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const selected = useMemo(
    () => candidates.find((candidate) => candidate.locationCode === locationCode),
    [candidates, locationCode],
  );
  const requestContext = {
    lineId: line.id,
    locationCode,
    quantity: line.requiredQty,
  };

  async function confirmNonSerial() {
    if (!locationCode) return;
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch(`/api/outbound/${order.id}/preparation`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...requestContext, action: "confirm", rows: [] }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(friendlyError(body.code, body.error));
      setFeedback(t("review.confirmed"));
      await onConfirmed();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("common.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel preparation-workspace">
      <div className="panel-head">
        <div>
          <h3>{t("outbound.preparationWorkspace")}</h3>
          <span className="subtle">{t("outbound.preparationWorkspaceHelp")}</span>
        </div>
        <PackageCheck />
      </div>
      <div className="panel-body form-grid">
        <div className="field">
          <label htmlFor={`preparation-location-${line.id}`}>{t("outbound.sourceLocation")}</label>
          <select
            id={`preparation-location-${line.id}`}
            value={locationCode}
            onChange={(event) => setLocationCode(event.target.value)}
          >
            <option value="">{t("outbound.selectSourceLocation")}</option>
            {candidates.map((candidate) => (
              <option value={candidate.locationCode} key={candidate.id}>
                {candidate.locationCode} · {t("common.available")} {candidate.availableQty}
              </option>
            ))}
          </select>
        </div>
        <div className="field"><label>{t("common.required")}</label><input value={line.requiredQty} disabled /></div>
        <div className="field"><label>{t("common.condition")}</label><input value={t(`status.${line.requiredCondition}`)} disabled /></div>
        <div className="field"><label>{t("common.available")}</label><input value={selected?.availableQty ?? "—"} disabled /></div>
      </div>
      {!candidates.length && <div className="notice error">{t("outbound.noEligible")}</div>}
      {serialTrackingRequired && locationCode && (
        <ScanReviewWorkbench
          key={`${line.id}:${locationCode}`}
          endpoint={`/api/outbound/${order.id}/preparation`}
          persistenceKey={`preparation:${order.id}:${line.id}:${locationCode}`}
          requestContext={requestContext}
          title={t("outbound.confirmPreparationTitle", { sku: line.sku })}
          subtitle={t("outbound.confirmPreparationHelp")}
          confirmLabel={t("review.confirmPreparation")}
          lines={[{
            id: line.id,
            sku: line.sku,
            model: line.model,
            requiredCondition: line.requiredCondition,
            requiredQty: line.requiredQty,
            assignedQty: 0,
          }]}
          onConfirmed={onConfirmed}
        />
      )}
      {!serialTrackingRequired && (
        <div className="panel-body">
          <Button className="primary" disabled={!locationCode || busy} onClick={() => void confirmNonSerial()}>
            <PackageCheck /> {t("review.confirmPreparation")}
          </Button>
        </div>
      )}
      {feedback && <div className="notice" aria-live="polite">{feedback}</div>}
    </section>
  );
}
