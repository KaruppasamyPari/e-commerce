import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import multer from "multer";
import sharp from "sharp";
import { db, root, uploads } from "../../../shared/config";
import { id, check, server, listen, included } from "../../../shared/http";
import { fulfil, update } from "./fulfilment";
const app = server("admin");
app.get("/api/dashboard", async (_req, res) => {
  const [orders, sales, low, published, recent] = await Promise.all([
    db.order.count(),
    db.order.aggregate({
      _sum: { total: true },
      where: {
        status: { in: ["Confirmed", "Packed", "Shipped", "Delivered"] },
      },
    }),
    db.variant.count({ where: { active: true, stock: { lte: 3 } } }),
    db.product.count({ where: { state: "published" } }),
    db.order.findMany({ take: 5, orderBy: { id: "desc" } }),
  ]);
  res.json({ orders, sales: sales._sum.total || 0, low, published, recent });
});
app.get("/api/products", async (_req, res) =>
  res.json(
    await db.product.findMany({ include: included, orderBy: { id: "desc" } }),
  ),
);
app.get("/api/products/:id", async (req, res) =>
  res.json(
    await db.product.findUniqueOrThrow({
      where: { id: id(req.params.id) },
      include: included,
    }),
  ),
);
app.post("/api/products", async (_req, res) =>
  res.json(await db.product.create({ data: {}, include: included })),
);
const short = z.string().trim().min(1).max(80);
const draft = z.object({
  name: z.string().trim().max(150),
  slug: z
    .string()
    .max(191)
    .regex(/^$|^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .nullable(),
  categoryId: z.number().int().positive().nullable(),
  collectionId: z.number().int().positive().nullable(),
  description: z.string().trim().max(4000),
  price: z.number().int().positive().max(10000000).nullable(),
  comparePrice: z.number().int().positive().max(50000000).nullable(),
  picturedColour: z.string().trim().max(80),
  state: z.enum(["draft", "published", "archived"]),
  revision: z.number().int().nonnegative(),
  front: z.string().nullable(),
  back: z.string().nullable(),
  detail: z.string().nullable(),
  variants: z
    .array(
      z.object({
        id: z.number().int().positive().optional(),
        sku: short,
        size: short,
        colour: short,
        stock: z.number().int().min(0).max(100000),
        originalStock: z.number().int().nonnegative().optional(),
      }),
    )
    .max(200),
});
app.put("/api/products/:id", async (req, res) => {
  const productId = id(req.params.id),
    { variants, revision, ...b } = draft.parse(req.body);
  b.slug = b.slug || null;
  check(
    !b.comparePrice || (b.price && b.comparePrice > b.price),
    400,
    "Compare-at price must exceed the selling price",
  );
  if (b.state === "published")
    check(
      b.name &&
        b.slug &&
        b.categoryId &&
        b.collectionId &&
        b.description &&
        b.price &&
        variants.length &&
        b.picturedColour &&
        variants.some((v) => v.colour === b.picturedColour) &&
        b.front &&
        b.back &&
        b.detail &&
        new Set([b.front, b.back, b.detail]).size === 3,
      400,
      "Publishing requires all details, a pictured colour, at least one variant and three distinct images",
    );
  for (const url of [b.front, b.back, b.detail].filter(
    (p): p is string => !!p,
  )) {
    check(
      /^\/media\/(catalog\/[a-z0-9-]+|uploads\/[a-f0-9-]{36})\.webp$/.test(url),
      400,
      "Invalid image location",
    );
    const dir = url.startsWith("/media/catalog/")
      ? path.join(root, "main-website/frontend/public/catalog")
      : uploads;
    await access(path.join(dir, path.basename(url))).catch(() =>
      check(false, 400, "Image file is missing"),
    );
  }
  const result = await db.$transaction(async (tx) => {
    const changed = await tx.product.updateMany({
      where: { id: productId, revision },
      data: { ...b, revision: { increment: 1 } },
    });
    check(changed.count, 409, "Product changed. Reload the editor.");
    await tx.variant.updateMany({
      where: { productId },
      data: { active: false },
    });
    for (const { id: variantId, originalStock, ...v } of variants) {
      if (variantId) {
        check(originalStock !== undefined, 400, "Missing inventory version");
        const saved = await tx.variant.updateMany({
          where: { id: variantId, productId, stock: originalStock },
          data: { ...v, active: true },
        });
        check(saved.count, 409, "Inventory changed. Reload before saving.");
      } else await tx.variant.create({ data: { ...v, productId } });
    }
    return tx.product.findUniqueOrThrow({
      where: { id: productId },
      include: included,
    });
  });
  res.json(result);
});
app.post(
  "/api/uploads",
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  }).single("file"),
  async (req, res) => {
    check(req.file, 400, "Select an image");
    const image = sharp(req.file.buffer, { limitInputPixels: 16000000 });
    const meta = await image.metadata().catch(() => null);
    check(
      meta && ["jpeg", "png", "webp"].includes(meta.format),
      400,
      "Use a valid JPEG, PNG or WebP up to 5 MB",
    );
    const filename = randomUUID() + ".webp";
    await image
      .rotate()
      .resize(1000, 1250, { fit: "cover" })
      .webp({ quality: 85 })
      .toFile(path.join(uploads, filename));
    res.json({ url: "/media/uploads/" + filename });
  },
);
app.get("/api/taxonomy", async (_req, res) =>
  res.json({
    categories: await db.category.findMany({ orderBy: { name: "asc" } }),
    collections: await db.collection.findMany({ orderBy: { name: "asc" } }),
  }),
);
app.post("/api/taxonomy/:kind", async (req, res) => {
  const name = short.parse(req.body.name),
    key = req.body.id ? id(req.body.id) : 0;
  check(
    ["categories", "collections"].includes(req.params.kind),
    404,
    "Unknown group",
  );
  const params = { where: { id: key }, create: { name }, update: { name } };
  res.json(
    req.params.kind === "categories"
      ? await db.category.upsert(params)
      : await db.collection.upsert(params),
  );
});
app.get("/api/inventory", async (_req, res) =>
  res.json(
    await db.variant.findMany({
      where: { active: true },
      include: { product: { select: { name: true } } },
      orderBy: { stock: "asc" },
    }),
  ),
);
app.get("/api/orders", async (_req, res) =>
  res.json(
    await db.order.findMany({
      orderBy: { id: "desc" },
      include: { account: { select: { name: true, email: true } } },
    }),
  ),
);
app.get("/api/orders/:id", async (req, res) =>
  res.json(
    await db.order.findUniqueOrThrow({
      where: { id: id(req.params.id) },
      include: {
        items: true,
        account: { select: { name: true, email: true } },
      },
    }),
  ),
);
app.put("/api/orders/:id", async (req, res) =>
  res.json(await fulfil(id(req.params.id), update.parse(req.body))),
);
app.post("/api/orders/:id/collect", async (req, res) => {
  const o = await db.order.updateMany({
    where: { id: id(req.params.id), status: "Delivered" },
    data: { payment: "Paid" },
  });
  check(o.count, 409, "Record collection after delivery");
  res.json({ ok: true });
});
app.get("/api/customers", async (_req, res) =>
  res.json(
    await db.account.findMany({
      where: { role: "customer" },
      select: {
        id: true,
        name: true,
        email: true,
        _count: { select: { orders: true } },
      },
      orderBy: { id: "desc" },
    }),
  ),
);
app.put("/api/settings", async (req, res) => {
  const data = z
    .object({
      name: short,
      brandColour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      currency: z.literal("INR"),
      shipping: z.number().int().min(0).max(1000000),
      freeOver: z.number().int().min(0).max(100000000),
      cod: z.boolean(),
    })
    .parse(req.body);
  res.json(await db.settings.update({ where: { id: 1 }, data }));
});
listen(app, 8081);
