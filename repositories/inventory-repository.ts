import { Prisma } from "@/generated/prisma/client";
import { DomainError } from "@/domain/errors";

export interface BalanceKey {
  warehouseId: string;
  locationId: string;
  containerId?: string | null;
  productId?: string | null;
  itemType: "Product" | "Material";
  condition: "New" | "Repair_Good" | "Repair" | "Scrap" | "Material";
}

export interface BalanceDelta {
  physicalDelta?: string | number | Prisma.Decimal;
  frozenDelta?: string | number | Prisma.Decimal;
  inTransitDelta?: string | number | Prisma.Decimal;
}

export class InventoryRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  private where(key: BalanceKey) {
    return {
      warehouseId: key.warehouseId,
      locationId: key.locationId,
      containerId: key.containerId ?? null,
      productId: key.productId ?? null,
      itemType: key.itemType,
      condition: key.condition,
    } as const;
  }

  async getOrCreateBalance(key: BalanceKey) {
    const existing = await this.tx.inventoryBalance.findFirst({ where: this.where(key) });
    if (existing) return existing;
    // A concurrent create is retried by the enclosing Serializable transaction.
    return this.tx.inventoryBalance.create({ data: this.where(key) });
  }

  async applyDelta(key: BalanceKey, delta: BalanceDelta) {
    const balance = await this.getOrCreateBalance(key);
    const physicalQty = balance.physicalQty.plus(delta.physicalDelta ?? 0);
    const frozenQty = balance.frozenQty.plus(delta.frozenDelta ?? 0);
    const inTransitQty = balance.inTransitQty.plus(delta.inTransitDelta ?? 0);
    if (physicalQty.isNegative()) throw new DomainError("Physical inventory cannot become negative.");
    if (frozenQty.isNegative()) throw new DomainError("Frozen inventory cannot become negative.");
    if (inTransitQty.isNegative()) throw new DomainError("In-transit inventory cannot become negative.");
    if (frozenQty.greaterThan(physicalQty)) throw new DomainError("Frozen inventory cannot exceed physical inventory.");
    return this.tx.inventoryBalance.update({
      where: { id: balance.id },
      data: { physicalQty, frozenQty, inTransitQty, version: { increment: 1 } },
    });
  }
}
