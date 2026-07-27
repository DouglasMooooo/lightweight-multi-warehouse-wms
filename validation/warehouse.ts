import { z } from "zod";

export const moveRequestSchema = z
  .object({
    warehouseCode: z.enum(["SYD", "MEL", "BNE"]),
    sku: z.string().min(1),
    condition: z.enum(["New", "Repair_Good", "Repair", "Scrap", "Material"]),
    fromLocation: z.string().min(1),
    toLocation: z.string().min(1),
    qty: z.number().positive(),
    remark: z.string().min(3),
  })
  .refine((value) => value.fromLocation !== value.toLocation, {
    message: "Source and destination must be different.",
  });

export const adjustmentRequestSchema = z
  .object({
    direction: z.enum(["In", "Out"]),
    warehouseCode: z.enum(["SYD", "MEL", "BNE"]),
    locationCode: z.string().min(1),
    sku: z.string().optional(),
    itemType: z.enum(["Product", "Material"]),
    condition: z.enum(["New", "Repair_Good", "Repair", "Scrap", "Material"]),
    qty: z.number().positive(),
    reason: z.string().min(3),
    remark: z.string().min(3),
  })
  .superRefine((value, context) => {
    if (value.itemType === "Product" && !value.sku) {
      context.addIssue({ code: "custom", message: "SKU is required for Product inventory.", path: ["sku"] });
    }
    if (value.itemType === "Material" && !value.sku && value.reason !== "Unmonitored material") {
      context.addIssue({
        code: "custom",
        message: "No-SKU material requires the reason “Unmonitored material”.",
        path: ["reason"],
      });
    }
  });
