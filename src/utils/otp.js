import crypto from "crypto";

export function generateOTP() {
  return crypto.randomInt(100000, 1000000).toString();
}

export function hashValue(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

export function generateVerificationToken() {
  return crypto.randomBytes(32).toString("hex");
}