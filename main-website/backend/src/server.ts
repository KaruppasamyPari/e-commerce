import { z } from "zod";
import { db } from "../../../shared/config";
import {
  server,
  listen,
  included,
  account,
  id,
  check,
} from "../../../shared/http";
import { quote, checkout, checkoutSchema, itemsSchema } from "./checkout";
import { customerSignin } from "./customer-signin";
const app = server("customer");
app.use("/api/auth", customerSignin);
app.get("/api/products", async (_req, res) =>
  res.json(
    await db.product.findMany({
      where: { state: "published" },
      include: included,
      orderBy: { id: "desc" },
    }),
  ),
);
app.get("/api/products/:slug", async (req, res) =>
  res.json(
    await db.product.findFirstOrThrow({
      where: { slug: req.params.slug, state: "published" },
      include: included,
    }),
  ),
);
app.get("/api/addresses", async (_req, res) =>
  res.json(
    await db.address.findMany({
      where: { accountId: account(res).id },
      orderBy: { id: "desc" },
    }),
  ),
);
const address = z.object({
  recipient: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .transform((s) => s.replace(/[ -]/g, ""))
    .pipe(
      z.string().regex(/^(\+91)?[6-9]\d{9}$/, "Enter an Indian mobile number"),
    ),
  line1: z.string().trim().min(4).max(191),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  pin: z.string().regex(/^[1-9]\d{5}$/, "Enter a six-digit PIN"),
});
app.post("/api/addresses", async (req, res) =>
  res.json(
    await db.address.create({
      data: { ...address.parse(req.body), accountId: account(res).id },
    }),
  ),
);
app.delete("/api/addresses/:id", async (req, res) => {
  const result = await db.address.deleteMany({
    where: { id: id(req.params.id), accountId: account(res).id },
  });
  check(result.count, 404, "Address not found");
  res.json({ ok: true });
});
app.get("/api/bag", async (_req, res) =>
  res.json(
    await db.account.findUniqueOrThrow({
      where: { id: account(res).id },
      select: { cart: true, wishlist: true },
    }),
  ),
);
app.put("/api/bag", async (req, res) => {
  const b = z
    .object({
      cart: itemsSchema,
      wishlist: z.array(z.number().int().positive()).max(500),
    })
    .parse(req.body);
  await db.account.update({ where: { id: account(res).id }, data: b });
  res.json({ ok: true });
});
app.post("/api/cart/quote", async (req, res) =>
  res.json(await quote(db, itemsSchema.parse(req.body.items))),
);
app.post("/api/orders", async (req, res) =>
  res.json(await checkout(account(res).id, checkoutSchema.parse(req.body))),
);
app.get("/api/orders", async (_req, res) =>
  res.json(
    await db.order.findMany({
      where: { accountId: account(res).id },
      omit: { notes: true, key: true },
      orderBy: { id: "desc" },
    }),
  ),
);
app.get("/api/orders/:id", async (req, res) =>
  res.json(
    await db.order.findFirstOrThrow({
      where: { id: id(req.params.id), accountId: account(res).id },
      omit: { notes: true, key: true },
      include: { items: true },
    }),
  ),
);
listen(app, 8080);
