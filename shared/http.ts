import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import helmet from "helmet";
import cookies from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db, root, uploads } from "./config";
export class Problem extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function check(
  ok: unknown,
  status: number,
  message: string,
): asserts ok {
  if (!ok) throw new Problem(status, message);
}
export const id = (v: unknown) => z.coerce.number().int().positive().parse(v);
export const included = {
  category: true,
  collection: true,
  variants: { where: { active: true }, orderBy: { id: "asc" as const } },
};
export function account(res: Response) {
  check(res.locals.account, 401, "Please sign in to continue");
  return res.locals.account as { id: number; name: string; email: string };
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function startSession(res: Response, role: "customer" | "admin", user: {
  id: number; name: string; email: string | null; phone?: string | null;
}) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 7 * 86400000);
  await db.session.create({ data: { accountId: user.id, token: hash(token), expires }, select: { token: true } });
  res.cookie("sv_" + role, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", expires, path: "/",
  }).json({ id: user.id, name: user.name, email: user.email, phone: user.phone });
}
export function server(role: "admin" | "customer") {
  const app = express(),
    cookie = "sv_" + role,
    allowed =
      process.env.WEB_ORIGIN ||
      "http://localhost:" + (role === "admin" ? 3001 : 3000);
  mkdirSync(uploads, { recursive: true });
  app.disable("x-powered-by");
  app.use(
    helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }),
    cors({ origin: allowed, credentials: true }),
    express.json({ limit: "128kb" }),
    cookies(),
  );
  app.use(
    "/media/uploads",
    express.static(uploads, { immutable: true, maxAge: "1y" }),
  );
  app.use(
    "/media/catalog",
    express.static(path.join(root, "main-website/frontend/public/catalog"), {
      immutable: true,
      maxAge: "1y",
    }),
  );
  app.use("/api", async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method))
      check(req.get("X-Store-Request") === "1", 403, "Invalid request header");
    const token = req.cookies[cookie];
    if (typeof token === "string" && token.length === 64) {
      const session = await db.session.findUnique({
        where: { token: hash(token) },
        include: {
          account: {
            select: { id: true, name: true, email: true, phone: true, role: true },
          },
        },
      });
      if (
        session &&
        session.expires > new Date() &&
        session.account.role === role
      )
        res.locals.account = session.account;
    }
    next();
  });
  app.get("/api/health", async (_req, res) => {
    await db.$queryRaw`SELECT 1`;
    res.json({ ready: true });
  });
  const limits = rateLimit({
    windowMs: 600000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Too many attempts. Try again in ten minutes." },
  });
  const login = async (req: Request, res: Response) => {
    const email = z.email().max(254).parse(req.body.email).toLowerCase();
    const pass = z
      .string()
      .min(1)
      .refine((p) => Buffer.byteLength(p) <= 72, "Password exceeds 72 bytes")
      .parse(req.body.password);
    let user;
    if (req.path.endsWith("/register")) {
      check(
        pass.length >= 10,
        400,
        "Use at least 10 characters for your password",
      );
      const name = z.string().trim().min(1).max(100).parse(req.body.name);
      user = await db.account.create({
        data: { email, name, password: await bcrypt.hash(pass, 12), role },
      });
    } else {
      user = await db.account.findUnique({
        where: { role_email: { email, role } },
      });
      check(
        user?.password && (await bcrypt.compare(pass, user.password)),
        401,
        "Incorrect email or password",
      );
    }
    await startSession(res, role, user);
  };
  app.post("/api/login", limits, login);
  if (role === "customer") app.post("/api/register", limits, login);
  if (role === "admin")
    app.use("/api", (_req, res, next) => {
      account(res);
      next();
    });
  app.get("/api/me", (_req, res) => res.json(account(res)));
  app.post("/api/logout", async (req, res) => {
    await db.session.deleteMany({
      where: { token: hash(req.cookies[cookie] || "") },
    });
    res.clearCookie(cookie, { path: "/" }).json({ ok: true });
  });
  app.get("/api/settings", async (_req, res) =>
    res.json(await db.settings.findUniqueOrThrow({ where: { id: 1 } })),
  );
  return app;
}
export function listen(app: express.Express, port: number) {
  app.use((_req, res) => res.status(404).json({ message: "Not found" }));
  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError)
      return res
        .status(400)
        .json({
          message: error.issues
            .map((i) => i.path.join(".") + " " + i.message)
            .join(", "),
        });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025")
        return res.status(404).json({ message: "Record not found" });
      if (["P2002", "P2003", "P2034"].includes(error.code))
        return res
          .status(409)
          .json({
            message:
              "The record conflicts with another change. Refresh and try again.",
          });
    }
    const status =
      error instanceof Problem
        ? error.status
        : error.code === "LIMIT_FILE_SIZE"
          ? 413
          : error.status || 500;
    if (status >= 500) console.error(error);
    res
      .status(status)
      .json({
        message: status >= 500 ? "Unable to complete request" : error.message,
      });
  });
  const http = app.listen(Number(process.env.PORT || port), () =>
    console.log("API listening on " + (process.env.PORT || port)),
  );
  process.on("SIGTERM", () => http.close(() => void db.$disconnect()));
}
