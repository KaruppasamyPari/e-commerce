import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../../../shared/config";
import { check, Problem, startSession } from "../../../shared/http";

export const customerSignin = Router();
const publicFields = { id: true, name: true, email: true, phone: true, role: true } as const;
const keys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const mobile = z.string().trim().regex(/^(?:\+91)?[6-9]\d{9}$/, "Enter a valid Indian mobile number")
  .transform(value => "+91" + value.slice(-10));
const smsReady = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID);
customerSignin.get("/options", (_req, res) => res.json({
  mobile: smsReady(), googleClientId: process.env.GOOGLE_CLIENT_ID || "",
}));
const limit = (count: number) => rateLimit({
  windowMs: 600000, limit: count, standardHeaders: "draft-7", legacyHeaders: false,
  message: { message: "Too many attempts. Try again in ten minutes." },
});
async function verification(resource: string, fields: Record<string, string>) {
  check(smsReady(), 503, "Mobile sign-in is unavailable.");
  const auth = Buffer.from(process.env.TWILIO_ACCOUNT_SID + ":" + process.env.TWILIO_AUTH_TOKEN).toString("base64");
  const reply = await fetch("https://verify.twilio.com/v2/Services/" + process.env.TWILIO_VERIFY_SERVICE_SID + "/" + resource, {
    method: "POST", headers: { Authorization: "Basic " + auth },
    body: new URLSearchParams(fields), signal: AbortSignal.timeout(12000),
  });
  check(reply.status !== 429, 429, "Too many requests. Please try again later.");
  if (!reply.ok) {
    if (resource === "VerificationCheck" && [400, 404].includes(reply.status))
      throw new Problem(401, "The code is incorrect or expired.");
    throw new Problem(502, "SMS verification is unavailable.");
  }
  return await reply.json() as { status: string; to: string };
}
customerSignin.post("/mobile/send", limit(5), async (req, res) => {
  const phone = mobile.parse(req.body.phone);
  const result = await verification("Verifications", { To: phone, Channel: "sms" });
  check(result.status === "pending", 502, "Unable to send the code.");
  res.json({ sent: true });
});
customerSignin.post("/mobile/verify", limit(15), async (req, res) => {
  const phone = mobile.parse(req.body.phone);
  const code = z.string().regex(/^\d{4,10}$/, "Enter the code from the SMS").parse(req.body.code);
  const result = await verification("VerificationCheck", { To: phone, Code: code });
  check(result.status === "approved" && result.to === phone, 401, "The code is incorrect or expired.");
  const user = await db.account.upsert({ where: { phone }, update: {},
    create: { phone, role: "customer", name: "Customer " + phone.slice(-4) }, select: publicFields });
  check(user.role === "customer", 403, "Customer account required");
  await startSession(res, "customer", user);
});
customerSignin.post("/google", limit(30), async (req, res) => {
  const audience = process.env.GOOGLE_CLIENT_ID;
  check(audience, 503, "Google sign-in is unavailable.");
  const credential = z.string().min(1).max(12000).parse(req.body.credential);
  const { payload } = await jwtVerify(credential, keys, {
    issuer: ["https://accounts.google.com", "accounts.google.com"], audience,
    algorithms: ["RS256"], requiredClaims: ["sub", "exp", "iat"],
  }).catch(() => { throw new Problem(401, "Google sign-in could not be verified."); });
  const googleSubject = z.string().min(1).max(255).parse(payload.sub);
  check(payload.email_verified === true, 401, "A verified Google email is required.");
  const email = z.email().max(254).parse(payload.email).toLowerCase();
  const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim().slice(0,100) : email.split("@")[0];
  let user;
  try {
    user = await db.account.upsert({ where: { googleSubject }, update: {},
      create: { googleSubject, email, name, role: "customer" }, select: publicFields });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    user = await db.account.findUnique({ where: { googleSubject }, select: publicFields });
    check(user, 409, "This email already has an account. Sign in with your existing method.");
  }
  check(user.role === "customer", 403, "Customer account required");
  await startSession(res, "customer", user);
});
