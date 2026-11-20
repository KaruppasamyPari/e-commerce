import { db } from "../../shared/config";
import bcrypt from "bcryptjs";
import { z } from "zod";
try {
  const email = z.email().parse(process.env.ADMIN_EMAIL).toLowerCase(),
    password = z
      .string()
      .min(12)
      .refine((s) => Buffer.byteLength(s) <= 72)
      .parse(process.env.ADMIN_PASSWORD);
  const existing = await db.account.findUnique({
    where: { role_email: { role: "admin", email } },
  });
  if (existing) throw Error("Staff account already exists");
  await db.account.create({
    data: {
      role: "admin",
      email,
      password: await bcrypt.hash(password, 12),
      name: "Store manager",
    },
  });
  console.log("Staff account created.");
} finally {
  await db.$disconnect();
}
