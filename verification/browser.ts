import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { unlink } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { db, root, uploads } from "../shared/config";

const storefront = process.env.STORE_WEB_URL || "http://localhost:3000";
const admin = process.env.ADMIN_WEB_URL || "http://localhost:3001";
const run = randomUUID();
const staffEmail = "qa-admin-" + run + "@example.test";
const staffPassword = randomUUID();
const uploadedFiles: string[] = [];
const emails: string[] = [];
const products: number[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

async function fits(page: Page) {
  const dims = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dims.content <= dims.width + 1,
    "Horizontal page overflow at " + page.url() + " " + JSON.stringify(dims),
  );
}

async function staffBrowser(width: number, orderId: number) {
  const adminPage = await browser!.newPage({
    viewport: { width, height: 900 },
  });
  const publicPage = await browser!.newPage();
  try {
    await adminPage.goto(admin);
    await adminPage.getByLabel("Email").fill(staffEmail);
    await adminPage.getByLabel("Password").fill(staffPassword);
    await adminPage.getByRole("button", { name: "Sign in" }).click();
    await adminPage.getByRole("heading", { name: "Overview" }).waitFor();
    await fits(adminPage);
    if (process.env.QA_SCREENSHOTS)
      await adminPage.screenshot({
        path: path.join(process.env.QA_SCREENSHOTS, "admin-" + width + ".png"),
      });
    await adminPage.getByRole("link", { name: "Orders", exact: true }).click();
    await adminPage
      .getByRole("link", { name: "#" + orderId, exact: true })
      .click();
    await adminPage.getByLabel("Order status").selectOption("Confirmed");
    await adminPage.getByLabel("Internal notes").fill("QA verified");
    await adminPage.getByRole("button", { name: "Save order" }).click();
    await adminPage.getByText("Order updated").waitFor();
    if (width < 700) return;

    await adminPage
      .getByRole("link", { name: "Products", exact: true })
      .click();
    await adminPage.getByRole("button", { name: "Create product" }).click();
    await adminPage.getByRole("heading", { name: "New product" }).waitFor();
    products.push(Number(new URL(adminPage.url()).pathname.split("/").pop()));
    const slug = "ui-editor-" + run;
    const name = "Browser publication check";
    await adminPage.getByLabel("name", { exact: true }).fill(name);
    await adminPage.getByLabel("slug", { exact: true }).fill(slug);
    await adminPage.getByLabel("Pictured colour").fill("Ink");
    await adminPage
      .getByRole("combobox", { name: /^category/i })
      .selectOption({ index: 1 });
    await adminPage
      .getByRole("combobox", { name: /^collection/i })
      .selectOption({ index: 1 });
    await adminPage.getByLabel(/^Price /).fill("1490");
    await adminPage
      .getByLabel("Description")
      .fill("Photography and publishing workflow verification.");
    const sample = await db.product.findFirstOrThrow({
      where: { state: "published", front: { startsWith: "/media/catalog/" } },
    });
    for (const slot of ["front", "back", "detail"] as const) {
      const response = adminPage.waitForResponse(
        (r) =>
          r.url().endsWith("/api/uploads") && r.request().method() === "POST",
      );
      await adminPage
        .getByLabel(slot, { exact: true })
        .setInputFiles(
          path.join(
            root,
            "main-website/frontend/public/catalog",
            path.basename(sample[slot]!),
          ),
        );
      const data = await (await response).json();
      assert.match(data.url, /^\/media\/uploads\/[a-f0-9-]{36}\.webp$/);
      uploadedFiles.push(path.join(uploads, path.basename(data.url)));
      await adminPage.getByRole("img", { name: slot + " view" }).waitFor();
    }
    await adminPage.getByRole("button", { name: "Add variant" }).click();
    await adminPage.getByLabel("sku", { exact: true }).fill(slug);
    await adminPage.getByLabel("size", { exact: true }).fill("M");
    await adminPage.getByLabel("colour", { exact: true }).fill("Ink");
    await adminPage.getByLabel("stock", { exact: true }).fill("3");
    await adminPage
      .getByRole("button", { name: "Preview", exact: true })
      .click();
    await adminPage
      .getByRole("button", { name: "Publish", exact: true })
      .click();
    await adminPage.getByText(/Saved .* published/i).waitFor();
    await publicPage.goto(storefront + "/product/" + slug);
    await publicPage.getByRole("heading", { name, exact: true }).waitFor();
    await adminPage.getByRole("button", { name: "Edit product" }).click();
    await adminPage.getByLabel("name", { exact: true }).fill(name + " revised");
    await adminPage.getByLabel(/^Price /).fill("1990");
    await adminPage.getByLabel("stock", { exact: true }).fill("5");
    await adminPage
      .getByRole("button", { name: "Save published changes" })
      .click();
    await adminPage.getByText(/Saved .* published/i).waitFor();
    await publicPage.reload();
    await publicPage
      .getByRole("heading", { name: name + " revised" })
      .waitFor();
    await publicPage.getByRole("button", { name: "M", exact: true }).click();
    await publicPage.getByText("5 in stock").waitFor();
    await publicPage.getByText(/1,990/).waitFor();
    await adminPage
      .getByRole("button", { name: "Unpublish", exact: true })
      .click();
    await adminPage.getByText(/Saved .* draft/i).waitFor();
    await publicPage.reload();
    await publicPage.getByText(/Record not found/i).waitFor();
    await publicPage.goto(storefront + "/shop?q=" + encodeURIComponent(name));
    await publicPage.getByText(/No pieces here yet/).waitFor();
    console.log(
      "PASS Browser staff login, three uploads, create, preview, publish, edit, unpublish and public visibility",
    );
  } finally {
    await adminPage.close();
    await publicPage.close();
  }
}

async function shopper(width: number, height: number) {
  const context = await browser!.newContext({
    viewport: { width, height },
    hasTouch: width < 700,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const sample = await db.product.findFirstOrThrow({
    where: { state: "published" },
    include: { variants: true },
  });
  const slug = "ui-" + width + "-" + run;
  const name = "Verification linen " + width;
  const product = await db.product.create({
    data: {
      slug,
      name,
      state: "published",
      description: sample.description,
      picturedColour: sample.picturedColour,
      front: sample.front,
      back: sample.back,
      detail: sample.detail,
      price: 165000,
      categoryId: sample.categoryId,
      collectionId: sample.collectionId,
      variants: {
        create: {
          size: "M",
          colour: sample.picturedColour,
          stock: 3,
          sku: slug,
        },
      },
    },
  });
  products.push(product.id);
  const email = slug + "@example.test";
  emails.push(email);
  try {
    await page.goto(storefront);
    await page.getByRole("heading", { name: /everyday ease/i }).waitFor();
    await fits(page);
    if (process.env.QA_SCREENSHOTS)
      await page.screenshot({
        path: path.join(process.env.QA_SCREENSHOTS, "home-" + width + ".png"),
      });
    if (width < 700) {
      await page.getByRole("button", { name: "Open menu" }).click();
      await page
        .getByRole("dialog")
        .getByRole("link", { name: "Shop all" })
        .click();
    } else
      await page
        .getByRole("navigation")
        .getByRole("link", { name: "Shop all" })
        .click();
    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByLabel("In stock only").click();
    await page.waitForURL(/stock=yes/);
    await page.getByRole("button", { name: /Show .* pieces/ }).click();
    await page.getByLabel("Search products").fill(name);
    await page.getByRole("link", { name, exact: true }).first().click();
    await page.getByRole("heading", { name }).waitFor();
    await page.getByRole("button", { name: "Next image" }).click();
    await page.getByRole("img", { name: /back view/i }).waitFor();
    await page.getByRole("button", { name: "Size guide" }).click();
    await page.getByRole("dialog").getByRole("table").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Save to wishlist" }).click();
    await page.getByRole("button", { name: "M", exact: true }).click();
    await page.getByRole("button", { name: "Add to bag" }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: "Increase quantity" }).click();
    await drawer.getByRole("button", { name: "Decrease quantity" }).click();
    await drawer.getByRole("link", { name: "Continue to checkout" }).click();
    await page.getByRole("link", { name: "Sign in to checkout" }).click();
    await page.getByRole("button", { name: /New here/ }).click();
    await page.getByLabel("Name", { exact: true }).fill("Browser buyer");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(randomUUID());
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByRole("heading", { name: "Order summary" }).waitFor();
    await page.getByLabel("Full name").fill("Browser Buyer");
    await page.getByLabel("Mobile number").fill("9876543210");
    await page
      .getByLabel("House, street and locality")
      .fill("28 Verification Lane");
    await page.getByLabel("City", { exact: true }).fill("Pune");
    await page.getByLabel("State or union territory").fill("Maharashtra");
    await page.getByLabel("PIN code").fill("411001");
    await page.getByRole("button", { name: "Save address" }).click();
    await fits(page);
    await page.getByRole("button", { name: "Place COD order" }).click();
    await page.getByRole("heading", { name: /^Order #/ }).waitFor();
    const orderId = Number(new URL(page.url()).pathname.split("/").pop());
    const saved = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    assert.equal(saved.items[0].name, name);
    assert.equal(saved.items[0].quantity, 1);
    assert.equal(saved.payment, "Pending");
    await page.getByRole("link", { name: "Back to my account" }).click();
    await page
      .getByRole("link", { name: "Order #" + orderId, exact: false })
      .waitFor();
    await staffBrowser(width, orderId);
    await page.reload();
    await page
      .getByRole("link", {
        name: new RegExp("Order #" + orderId + ".*Confirmed"),
      })
      .click();
    await page
      .locator(".timeline li.done")
      .filter({ hasText: /^Confirmed$/ })
      .waitFor();
    await fits(page);
    assert.deepEqual(errors, []);
    console.log(
      "PASS Browser " +
        width +
        "x" +
        height +
        " navigation, catalog, gallery, bag, registration, delivery and COD",
    );
    return orderId;
  } finally {
    await context.close();
  }
}

async function verifyCatalog() {
  const context = await browser!.newContext();
  try {
    const page = await context.newPage();
    await page.goto(storefront + "/shop");
    const cards = page.locator(".card .cardline a");
    await cards.first().waitFor();
    const hrefs = await cards.evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).href),
    );
    assert.equal(hrefs.length, 20);
    for (const url of hrefs) {
      await page.goto(url);
      for (const view of ["Front", "Back", "Detail"]) {
        await page.getByRole("button", { name: view, exact: true }).click();
        const image = page.locator(".gallery img");
        const rendered = await image.evaluate(async (node) => {
          const img = node as HTMLImageElement;
          await img.decode();
          return {
            src: img.src,
            width: img.naturalWidth,
            height: img.naturalHeight,
          };
        });
        assert.ok(rendered.src.endsWith("-" + view.toLowerCase() + ".webp"));
        assert.equal(rendered.width / rendered.height, 4 / 5);
      }
    }
    console.log(
      "PASS Browser rendered 20 seeded product pages and 60 ordered catalog images",
    );
  } finally {
    await context.close();
  }
}

async function main() {
  await db.account.create({
    data: {
      email: staffEmail,
      password: await bcrypt.hash(staffPassword, 12),
      role: "admin",
      name: "Verification manager",
    },
  });
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  await verifyCatalog();
  await shopper(1440, 900);
  await shopper(390, 844);
}
try {
  await main();
} finally {
  await browser?.close();
  try {
    await db.$transaction(async (tx) => {
      await tx.account.deleteMany({
        where: { email: staffEmail, role: "admin" },
      });
      const buyers = await tx.account.findMany({
        where: { email: { in: emails }, role: "customer" },
        select: { id: true },
      });
      const account = { in: buyers.map((b) => b.id) };
      const orders = await tx.order.findMany({
        where: { accountId: account },
        select: { id: true },
      });
      await tx.orderItem.deleteMany({
        where: { orderId: { in: orders.map((o) => o.id) } },
      });
      await tx.order.deleteMany({ where: { accountId: account } });
      await tx.address.deleteMany({ where: { accountId: account } });
      await tx.account.deleteMany({ where: { id: account } });
      await tx.variant.deleteMany({ where: { productId: { in: products } } });
      await tx.product.deleteMany({ where: { id: { in: products } } });
    });
    for (const file of uploadedFiles) await unlink(file);
  } finally {
    await db.$disconnect();
  }
}
