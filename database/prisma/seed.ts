import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { db } from "../../shared/config";
const products = JSON.parse(
  await readFile(new URL("./catalog.json", import.meta.url), "utf8"),
);
try {
  for (const p of products)
    for (const slot of ["front", "back", "detail"])
      await access(
        fileURLToPath(
          new URL(
            "../../main-website/frontend/public/catalog/" +
              p.slug +
              "-" +
              slot +
              ".webp",
            import.meta.url,
          ),
        ),
      );
  await db.$transaction(
    async (tx) => {
      if (await tx.settings.findUnique({ where: { id: 1 } })) return; // First-run catalog; later admin edits are authoritative.
      await tx.settings.create({ data: { id: 1 } });
      for (const [i, p] of products.entries()) {
        const category = await tx.category.upsert({
          where: { name: p.category },
          update: {},
          create: { name: p.category },
        });
        const collection = await tx.collection.upsert({
          where: { name: p.collection },
          update: {},
          create: { name: p.collection },
        });
        if (await tx.product.findUnique({ where: { slug: p.slug } })) continue;
        const path = "/media/catalog/" + p.slug + "-";
        await tx.product.create({
          data: {
            name: p.name,
            slug: p.slug,
            description: p.description,
            price: p.price * 100,
            categoryId: category.id,
            collectionId: collection.id,
            state: "published",
            front: path + "front.webp",
            back: path + "back.webp",
            detail: path + "detail.webp",
            picturedColour: p.colour,
            variants: {
              create: ["S", "M", "L", "XL"].map((size, k) => ({
                size,
                colour: p.colour,
                sku: "SV-" + (1001 + i) + "-" + size,
                stock: (i * 3 + k * 7) % 23,
              })),
            },
          },
        });
      }
    },
    { timeout: 60000 },
  );
  console.log("Seed complete. Existing inventory preserved.");
} finally {
  await db.$disconnect();
}
