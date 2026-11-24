const encoder = new TextEncoder();
const decoder = new TextDecoder();

const ITERATIONS = 210000;
const KEY_LENGTH = 256;

export type EncryptedPayload = {
  version: 1;
  salt: string;
  iv: string;
  cipher: string;
};

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  view.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    material,
    {
      name: "AES-GCM",
      length: KEY_LENGTH,
    },
    false,
    usages,
  );
}

export async function encryptText(text: string, password: string): Promise<string> {
  if (!password) {
    throw new Error("未配置加密密钥");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ["encrypt"]);
  const cipher = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encoder.encode(text),
  );
  const payload: EncryptedPayload = {
    version: 1,
    salt: toBase64Url(salt),
    iv: toBase64Url(iv),
    cipher: toBase64Url(cipher),
  };
  return JSON.stringify(payload);
}

export async function decryptText(payloadText: string, password: string): Promise<string> {
  const payload = JSON.parse(payloadText) as EncryptedPayload;
  if (payload.version !== 1 || !payload.salt || !payload.iv || !payload.cipher) {
    throw new Error("密文格式不支持");
  }
  const key = await deriveKey(password, fromBase64Url(payload.salt), ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64Url(payload.iv),
    },
    key,
    fromBase64Url(payload.cipher),
  );
  return decoder.decode(plain);
}
