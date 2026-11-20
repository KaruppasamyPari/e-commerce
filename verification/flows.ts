import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { db, root, uploads } from "../shared/config";

const storeUrl = process.env.STORE_API_URL || "http://localhost:8080";
const adminUrl = process.env.ADMIN_API_URL || "http://localhost:8081";
const run = randomUUID();
const password = randomUUID();
const slots = ["front", "back", "detail"] as const;
const accounts: number[] = [];
const uploadedFiles: string[] = [];
let productId: number | undefined;

class Client {
  cookie = "";
  constructor(readonly base: string) {}
  async request(
    method: string,
    endpoint: string,
    body?: unknown,
    expected = [200],
  ) {
    const headers = new Headers({ "X-Store-Request": "1" });
    if (this.cookie) headers.set("Cookie", this.cookie);
    const form = body instanceof FormData;
    if (body !== undefined && !form)
      headers.set("Content-Type", "application/json");
    const response = await fetch(this.base + "/api" + endpoint, {
      method,
      headers,
      body: form ? body : body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    assert.ok(
      expected.includes(response.status),
      method +
        " " +
        endpoint +
        " " +
        response.status +
        " " +
        JSON.stringify(data),
    );
    const session = response.headers.get("set-cookie");
    if (session) this.cookie = session.split(";")[0];
    return { data, status: response.status };
  }
  async get(route: string) {
    return (await this.request("GET", route)).data;
  }
  async post(route: string, body?: unknown) {
    return (await this.request("POST", route, body)).data;
  }
  async put(route: string, body: unknown) {
    return (await this.request("PUT", route, body)).data;
  }
}

async function customer(index: number) {
  const client = new Client(storeUrl);
  const user = await client.post("/register", {
    email: "qa-" + run + index + "@example.test",
    name: "Verification buyer",
    password,
  });
  accounts.push(user.id);
  const address = await client.post("/addresses", {
    recipient: "Test Recipient",
    phone: "9876543210",
    line1: "27 Verification Road",
    city: "Pune",
    state: "Maharashtra",
    pin: "411001",
  });
  return { client, address };
}

async function main() {
  const guest = new Client(storeUrl),
    staff = new Client(adminUrl);
  const seed = JSON.parse(
    await readFile(path.join(root, "database/prisma/catalog.json"), "utf8"),
  );
  const catalog = await guest.get("/products");
  assert.equal(seed.length, 20);
  assert.equal(
    catalog.length,
    20,
    "Run against a fresh seeded verification database",
  );
  for (const spec of seed) {
    const product = catalog.find((p: any) => p.slug === spec.slug);
    assert.equal(product?.state, "published", spec.slug);
    for (const view of slots) {
      assert.equal(
        product[view],
        "/media/catalog/" + spec.slug + "-" + view + ".webp",
      );
      const response = await fetch(storeUrl + product[view]);
      assert.equal(response.status, 200, product[view]);
      const metadata = await sharp(
        Buffer.from(await response.arrayBuffer()),
      ).metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.width! * 5, metadata.height! * 4);
    }
  }
  console.log("PASS Twenty published seed products and sixty 4:5 WebP views");

  await staff.request("GET", "/dashboard", undefined, [401]);
  const email = "qa-" + run + "-staff@example.test";
  const staffUser = await db.account.create({
    data: {
      email,
      name: "Verification staff",
      role: "admin",
      password: await bcrypt.hash(password, 12),
    },
  });
  accounts.push(staffUser.id);
  await staff.post("/login", { email, password });
  const baseline = await staff.get("/dashboard");
  const slug = "qa-" + run;
  let product = await staff.post("/products");
  productId = product.id;
  await staff.request(
    "PUT",
    "/products/" + product.id,
    { ...product, state: "published" },
    [400],
  );
  const paths: Record<string, string> = {};
  const invalid = new FormData();
  invalid.append(
    "file",
    new Blob(["not an image"], { type: "image/webp" }),
    "garment.webp",
  );
  await staff.request("POST", "/uploads", invalid, [400]);
  const oversized = new FormData();
  oversized.append(
    "file",
    new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]),
    "large.webp",
  );
  await staff.request("POST", "/uploads", oversized, [413]);
  for (const view of slots) {
    const photo = await fetch(storeUrl + catalog[0][view]);
    const form = new FormData();
    form.append("file", await photo.blob(), view + ".webp");
    const { url } = await staff.post("/uploads", form);
    assert.match(url, /^\/media\/uploads\/[a-f0-9-]{36}\.webp$/);
    uploadedFiles.push(path.join(uploads, path.basename(url)));
    paths[view] = url;
    assert.equal((await fetch(storeUrl + url)).status, 200);
  }
  product = await staff.put("/products/" + product.id, {
    ...product,
    ...paths,
    slug,
    name: "Verification shirt",
    description: "Fixture for order verification",
    price: 150000,
    state: "published",
    categoryId: catalog[0].categoryId,
    collectionId: catalog[0].collectionId,
    picturedColour: "Ink",
    variants: [{ sku: slug, size: "M", colour: "Ink", stock: 1 }],
  });
  const page = () => guest.get("/products/" + slug);
  const change = async (overrides: object) => {
    const current = await staff.get("/products/" + product.id);
    return staff.put("/products/" + product.id, {
      ...current,
      variants: current.variants.map((v: any) => ({
        ...v,
        originalStock: v.stock,
      })),
      ...overrides,
    });
  };
  assert.equal((await page()).price, 150000);
  assert.equal((await guest.get("/products")).length, 21);
  await change({ price: 165000, name: "Revised verification shirt" });
  assert.equal((await page()).price, 165000);
  for (const state of ["draft", "archived"]) {
    await change({ state });
    await guest.request("GET", "/products/" + slug, undefined, [404]);
    assert.equal((await guest.get("/products")).length, 20);
    await change({ state: "published" });
  }
  console.log(
    "PASS Three uploads, draft validation, publication, edits, unpublishing and archiving",
  );

  const buyers = [await customer(1), await customer(2)];
  const impersonator = new Client(adminUrl);
  impersonator.cookie = buyers[0].client.cookie;
  await impersonator.request("GET", "/orders", undefined, [401]);
  await impersonator.request("POST", "/products", {}, [401]);
  const items = [
    { variantId: product.variants[0].id, quantity: 1, price: 165000 },
  ];
  const quote = await guest.post("/cart/quote", { items });
  for (const buyer of buyers) {
    await buyer.client.put("/bag", { cart: items, wishlist: [product.id] });
    assert.deepEqual((await buyer.client.get("/bag")).cart, items);
  }
  const requests = buyers.map(({ address }) => ({
    items,
    total: quote.total,
    key: randomUUID(),
    addressId: address.id,
  }));
  await buyers[0].client.request(
    "POST",
    "/orders",
    { ...requests[0], total: 1 },
    [409],
  );
  await buyers[0].client.request(
    "POST",
    "/orders",
    { ...requests[0], addressId: buyers[1].address.id },
    [404],
  );
  const unavailable = await db.variant.findFirstOrThrow({
    where: {
      stock: 0,
      active: true,
      product: { state: "published" },
      productId: { not: product.id },
    },
  });
  await buyers[0].client.request(
    "POST",
    "/orders",
    {
      ...requests[0],
      items: [...items, { variantId: unavailable.id, quantity: 1, price: 0 }],
    },
    [409],
  );
  assert.equal((await page()).variants[0].stock, 1);
  assert.equal((await buyers[0].client.get("/orders")).length, 0);
  const raced = await Promise.all(
    buyers.map((buyer, i) =>
      buyer.client.request("POST", "/orders", requests[i], [200, 409]),
    ),
  );
  assert.deepEqual(raced.map((r) => r.status).sort(), [200, 409]);
  const winner = raced.findIndex((r) => r.status === 200);
  const owner = buyers[winner].client,
    other = buyers[1 - winner].client;
  const orderId = raced[winner].data.id;
  const replay = await Promise.all([
    owner.post("/orders", requests[winner]),
    owner.post("/orders", requests[winner]),
  ]);
  for (const result of replay) assert.equal(result.id, orderId);
  assert.equal((await page()).variants[0].stock, 0);
  assert.equal((await owner.get("/orders")).length, 1);
  await other.request("GET", "/orders/" + orderId, undefined, [404]);
  await other.request(
    "DELETE",
    "/addresses/" + buyers[winner].address.id,
    undefined,
    [404],
  );
  const receipt = await owner.get("/orders/" + orderId);
  assert.equal(receipt.status, "Placed");
  assert.equal(receipt.payment, "Pending");
  assert.equal(receipt.address.pin, "411001");
  assert.equal(receipt.items[0].sku, slug);
  assert.equal(receipt.items[0].colour, "Ink");
  assert.equal(receipt.items[0].size, "M");
  assert.equal(receipt.total, quote.total);
  assert.equal((await staff.get("/dashboard")).orders, baseline.orders + 1);
  assert.ok((await staff.get("/orders")).some((o: any) => o.id === orderId));
  const advance = (id: number, status: string) =>
    staff.put("/orders/" + id, {
      status,
      notes: "Internal verification note",
      courier: "Test Courier",
      tracking: "TEST-001",
    });
  await advance(orderId, "Confirmed");
  assert.equal((await owner.get("/orders/" + orderId)).status, "Confirmed");
  assert.equal(
    (await staff.get("/dashboard")).sales,
    baseline.sales + receipt.total,
  );
  await change({ name: "New catalog name", price: 180000 });
  const snapshot = await owner.get("/orders/" + orderId);
  assert.equal(snapshot.items[0].name, "Revised verification shirt");
  assert.equal(snapshot.items[0].price, 165000);
  assert.equal(snapshot.notes, undefined);
  await Promise.all([
    advance(orderId, "Cancelled"),
    advance(orderId, "Cancelled"),
  ]);
  assert.equal((await page()).variants[0].stock, 1);
  assert.equal((await owner.get("/orders/" + orderId)).status, "Cancelled");
  await owner.request(
    "POST",
    "/orders",
    { ...requests[winner], key: randomUUID() },
    [409],
  );
  console.log(
    "PASS COD checkout, stock race, scoped orders and addresses, snapshots, cancellation and replay",
  );

  const updatedItems = [{ ...items[0], price: 180000 }];
  const latest = await guest.post("/cart/quote", { items: updatedItems });
  const retry = {
    ...requests[winner],
    key: randomUUID(),
    items: updatedItems,
    total: latest.total,
  };
  const [first, duplicate] = await Promise.all([
    owner.post("/orders", retry),
    owner.post("/orders", retry),
  ]);
  assert.equal(first.id, duplicate.id);
  for (const status of ["Confirmed", "Packed", "Shipped", "Delivered"]) {
    await advance(first.id, status);
    assert.equal((await owner.get("/orders/" + first.id)).status, status);
  }
  const delivered = await owner.get("/orders/" + first.id);
  assert.equal(delivered.payment, "Pending");
  assert.equal(delivered.shipment, "Delivered");
  assert.equal(delivered.tracking, "TEST-001");
  await staff.post("/orders/" + first.id + "/collect");
  assert.equal((await owner.get("/orders/" + first.id)).payment, "Paid");
  assert.equal((await page()).variants[0].stock, 0);
  console.log(
    "PASS Simultaneous duplicate checkout, manual fulfilment, independent COD collection",
  );
}

try {
  await main();
} finally {
  try {
    await db.$transaction(async (tx) => {
      const orders = await tx.order.findMany({
        where: { accountId: { in: accounts } },
        select: { id: true },
      });
      await tx.orderItem.deleteMany({
        where: { orderId: { in: orders.map((o) => o.id) } },
      });
      await tx.order.deleteMany({ where: { accountId: { in: accounts } } });
      await tx.address.deleteMany({ where: { accountId: { in: accounts } } });
      await tx.account.deleteMany({ where: { id: { in: accounts } } });
      if (productId !== undefined) {
        await tx.variant.deleteMany({ where: { productId } });
        await tx.product.delete({ where: { id: productId } });
      }
    });
    for (const file of uploadedFiles) await unlink(file);
  } finally {
    await db.$disconnect();
  }
}
