// Derives a Chrome extension id from the base64 DER public key in manifest.json ("key"),
// and (when run with no argument) generates a fresh RSA keypair and prints both.
// The private key is never written anywhere: only the public key matters for pinning the id.
import { createHash, generateKeyPairSync } from "node:crypto";
import { pathToFileURL } from "node:url";

/** Chrome's id: sha256 of the DER public key, first 32 hex chars, each digit 0-f mapped to a-p. */
export function deriveExtensionId(publicKeyBase64) {
  const der = Buffer.from(publicKeyBase64, "base64");
  const hex = createHash("sha256").update(der).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode("a".charCodeAt(0) + parseInt(c, 16))).join("");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let key = process.argv[2];
  if (!key) {
    const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    key = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    console.log("Generated a new keypair (private key discarded).");
  }
  console.log(`manifest "key": ${key}`);
  console.log(`extension id:   ${deriveExtensionId(key)}`);
}
