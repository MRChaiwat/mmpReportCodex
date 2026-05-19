import crypto from "node:crypto";

export function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}
