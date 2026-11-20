import { existsSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
let dir = process.cwd();
while (!existsSync(path.join(dir, "database/prisma/schema.prisma"))) {
  const parent = path.dirname(dir);
  if (parent === dir)
    throw Error("Start inside the clothing-ecommerce checkout");
  dir = parent;
}
export const root = dir;
dotenv.config({
  path: [path.join(process.cwd(), ".env"), path.join(root, ".env")],
  quiet: true,
});
export const uploads = path.resolve(
  root,
  process.env.UPLOAD_DIR || "storage/uploads",
);
export const db = new PrismaClient();
