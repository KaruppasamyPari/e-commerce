import { z } from "zod";
import { db } from "../../../shared/config";
import { check } from "../../../shared/http";
const flow = ["Placed", "Confirmed", "Packed", "Shipped", "Delivered"];
export const update = z.object({
  status: z.enum([
    "Placed",
    "Confirmed",
    "Packed",
    "Shipped",
    "Delivered",
    "Cancelled",
  ]),
  courier: z.string().max(150),
  tracking: z.string().max(150),
  notes: z.string().max(3000),
});
export async function fulfil(id: number, b: z.infer<typeof update>) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id=${id} FOR UPDATE`;
    const o = await tx.order.findUniqueOrThrow({
      where: { id },
      include: { items: { orderBy: { variantId: "asc" } } },
    });
    let shipment = o.shipment;
    if (o.status !== b.status) {
      if (b.status === "Cancelled") {
        check(
          flow.slice(0, 3).includes(o.status),
          409,
          "This order can no longer be cancelled",
        );
        for (const item of o.items)
          await tx.variant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        shipment = "Cancelled";
      } else {
        check(
          flow.includes(o.status) &&
            flow.indexOf(b.status) === flow.indexOf(o.status) + 1,
          409,
          "Choose the next order status",
        );
        if (b.status === "Shipped") shipment = "In transit";
        if (b.status === "Delivered") shipment = "Delivered";
      }
    }
    return tx.order.update({
      where: { id },
      data: { ...b, shipment },
      include: { items: true },
    });
  });
}
