import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Hex SHA-256 of a UTF-8 string or Buffer. */
export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Hex HMAC-SHA256 of a payload with the given secret. */
export function hmacSha256Hex(payload: string | Buffer, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time comparison of two strings (hex digests). */
export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const AES_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * AES-256-GCM encryption for secrets at rest (e.g. Plaid access tokens).
 * Output format: iv:tag:ciphertext (base64). APP_ENCRYPTION_KEY must be a
 * base64-encoded 32-byte key.
 */
export class FieldEncryptor {
  readonly #key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, "base64");
    if (key.length !== 32) {
      throw new Error("APP_ENCRYPTION_KEY must decode to a 32-byte key (openssl rand -base64 32)");
    }
    this.#key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(AES_ALGORITHM, this.#key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split(":");
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error("Malformed encrypted payload");
    }
    const decipher = createDecipheriv(AES_ALGORITHM, this.#key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}
