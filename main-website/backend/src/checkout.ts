import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../../../shared/config";
import { check } from "../../../shared/http";
export const itemsSchema = z
  .array(
    z.object({
      variantId: z.number().int().positive(),
      quantity: z.number().int().min(1).max(99),
      price: z.number().int().nonnegative().optional(),
    }),
  )
  .max(60)
  .refine(
    (a) => new Set(a.map((x) => x.variantId)).size === a.length,
    "Duplicate variant",
  );
type Items = z.infer<typeof itemsSchema>;
export async function quote(tx: Prisma.TransactionClient, items: Items) {
  check(items.length, 400, "Your bag is empty");
  const settings = await tx.settings.findUniqueOrThrow({ where: { id: 1 } });
  const lines = [];
  let subtotal = 0;
  for (const item of [...items].sort((a, b) => a.variantId - b.variantId)) {
    const variant = await tx.variant.findUnique({
      where: { id: item.variantId },
      include: { product: true },
    });
    check(
      variant?.active &&
        variant.product.state === "published" &&
        variant.product.price,
      409,
      "A bag item is no longer available",
    );
    check(
      variant.stock >= item.quantity,
      409,
      variant.product.name +
        " has only " +
        variant.stock +
        " available in " +
        variant.size,
    );
    const price = variant.product.price;
    lines.push({
      variantId: variant.id,
      name: variant.product.name,
      sku: variant.sku,
      colour: variant.colour,
      size: variant.size,
      price,
      quantity: item.quantity,
    });
    subtotal += price * item.quantity;
  }
  const shipping = subtotal >= settings.freeOver ? 0 : settings.shipping;
  check(
    subtotal + shipping <= 2147483647,
    400,
    "Order value exceeds the limit",
  );
  return {
    items: lines,
    subtotal,
    shipping,
    total: subtotal + shipping,
    currency: settings.currency,
    cod: settings.cod,
  };
}
export const checkoutSchema = z.object({
  items: itemsSchema,
  addressId: z.number().int().positive(),
  total: z.number().int(),
  key: z.uuid(),
});
export async function checkout(
  accountId: number,
  b: z.infer<typeof checkoutSchema>,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM Account WHERE id=${accountId} FOR UPDATE`;
      const previous = await tx.order.findUnique({
        where: { accountId_key: { accountId, key: b.key } },
        select: { id: true },
      });
      if (previous) return previous;
      const address = await tx.address.findFirstOrThrow({
        where: { id: b.addressId, accountId },
        select: {
          recipient: true,
          phone: true,
          line1: true,
          city: true,
          state: true,
          pin: true,
        },
      });
      // Lock in a stable order before pricing. Product edits must wait until the purchase commits.
      const ids = b.items.map((i) => i.variantId).sort((a, b) => a - b);
      check(ids.length, 400, "Your bag is empty");
      await tx.$queryRaw`SELECT v.id FROM Variant v JOIN Product p ON v.productId=p.id WHERE v.id IN (${Prisma.join(ids)}) ORDER BY v.id FOR UPDATE`;
      const q = await quote(tx, b.items);
      check(q.cod, 409, "Cash on Delivery is currently unavailable");
      check(
        q.total === b.total &&
          q.items.every(
            (l) =>
              b.items.find((i) => i.variantId === l.variantId)?.price ===
              l.price,
          ),
        409,
        "Prices changed. Review the updated order summary.",
      );
      for (const l of q.items) {
        const result = await tx.variant.updateMany({
          where: { id: l.variantId, active: true, stock: { gte: l.quantity } },
          data: { stock: { decrement: l.quantity } },
        });
        check(result.count === 1, 409, "Stock changed. Review your bag.");
      }
      const order = await tx.order.create({
        data: {
          accountId,
          key: b.key,
          address,
          subtotal: q.subtotal,
          shipping: q.shipping,
          total: q.total,
          currency: q.currency,
          items: { create: q.items },
        },
        select: { id: true },
      });
      await tx.account.update({ where: { id: accountId }, data: { cart: [] } });
      return order;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 15000,
    },
  );
}
