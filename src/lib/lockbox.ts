// Decrypts a payload published as ciphertext.
//
// The Genes tab reads the selection dataset published by the sibling MtbScope
// site, which ships encrypted because the study behind it is unpublished. This
// is the same envelope format and the same passphrase; the encryptor lives in
// that repository (scripts/encrypt-selection.mjs). Static hosting has no server
// to authenticate against, so the file itself is the ciphertext and the
// passphrase never leaves the device.

export interface Envelope {
  v: number;
  kdf: { name: string; hash: string; iterations: number; salt: string };
  cipher: { name: string; iv: string };
  compression?: string;
  ct: string;
}

export class LockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LockedError';
  }
}

export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.v === 1 &&
    typeof v.ct === 'string' &&
    typeof v.kdf === 'object' &&
    v.kdf !== null &&
    typeof v.cipher === 'object' &&
    v.cipher !== null
  );
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new LockedError('This browser cannot decompress the dataset (no DecompressionStream).');
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Derive the key and open the envelope. A wrong passphrase fails at the GCM
 * tag check, which is what makes the difference between right and wrong
 * unambiguous rather than a guess about whether the output looks like JSON.
 */
export async function unlock(envelope: Envelope, passphrase: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new LockedError('This browser has no Web Crypto, so the dataset cannot be decrypted.');
  }
  if (envelope.kdf.name !== 'PBKDF2' || envelope.cipher.name !== 'AES-GCM') {
    throw new LockedError('Unsupported encryption in the published dataset.');
  }

  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fromBase64(envelope.kdf.salt) as BufferSource,
      iterations: envelope.kdf.iterations,
      hash: envelope.kdf.hash,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.cipher.iv) as BufferSource },
      key,
      fromBase64(envelope.ct) as BufferSource,
    );
  } catch {
    throw new LockedError('That passphrase does not open this dataset.');
  }

  const bytes = envelope.compression === 'gzip' ? await gunzip(new Uint8Array(plain)) : new Uint8Array(plain);
  return new TextDecoder().decode(bytes);
}

const PASSPHRASE_KEY = 'research.genes.key';

/**
 * Remember the passphrase for the tab, so moving around the Lab does not mean
 * deriving the key again. sessionStorage, not localStorage: it goes when the
 * tab does, and it is never sent anywhere.
 */
export const passphraseStore = {
  read(): string | null {
    try {
      return sessionStorage.getItem(PASSPHRASE_KEY);
    } catch {
      return null;
    }
  },
  write(value: string): void {
    try {
      sessionStorage.setItem(PASSPHRASE_KEY, value);
    } catch {
      // Private-mode browsers reject storage; unlocking still works per view.
    }
  },
  clear(): void {
    try {
      sessionStorage.removeItem(PASSPHRASE_KEY);
    } catch {
      // Nothing to clear.
    }
  },
};
