/**
 * dcl-sdk / seal.ts
 *
 * Mirrors `format_seal()` from `audit_logic.py` on the server — pure
 * presentation formatting over already-public fields (tx_hash, input_hash,
 * timestamp). No scoring/policy logic here, so per the open/closed split
 * this lives in the open SDK: independent local verification loses most of
 * its point if showing the resulting seal still requires a network call.
 *
 * Kept as a plain function, not tied to any single brand string, so other
 * DCL-protocol implementers can format their own seal without depending on
 * Fronesis Labs' specific wording — see `brand` param.
 */

export interface Seal {
  seal_text: string;
  verify_url: string;
}

export interface FormatSealOptions {
  /** Shown on line 1, e.g. "Leibniz Layer | Fronesis Labs". Override for white-label/other implementers. */
  brand?: string;
  /** Base URL the hash is appended to, e.g. "https://x402.fronesislabs.com/verify". No trailing slash. */
  verifyBaseUrl?: string;
  /** Label after the sealed timestamp, e.g. "Base Mainnet". Set to "" to omit. */
  network?: string;
}

const DEFAULTS: Required<FormatSealOptions> = {
  brand: "Leibniz Layer | Fronesis Labs",
  verifyBaseUrl: "https://x402.fronesislabs.com/verify",
  network: "Base Mainnet",
};

function stripHexPrefix(s: string): string {
  return s.startsWith("0x") ? s.slice(2) : s;
}

/** Matches Python's `datetime.fromtimestamp(ts, tz=utc).strftime("%Y-%m-%d %H:%M UTC")` exactly. */
function formatSealedTimestamp(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  return `${y}-${mo}-${day} ${h}:${mi} UTC`;
}

/**
 * Formats a human-readable verification seal from already-known,
 * already-public fields. Does not fetch anything and does not verify
 * anything itself — call verifyChain()/recomputeTxHash() first if you want
 * an integrity guarantee behind the seal you're displaying.
 */
export function formatSeal(
  txHash: string,
  inputHash: string,
  timestamp: number,
  options: FormatSealOptions = {}
): Seal {
  const opts = { ...DEFAULTS, ...options };
  const hashDisplay = stripHexPrefix(txHash);
  const intentDisplay = stripHexPrefix(inputHash);
  const sealed = formatSealedTimestamp(timestamp);
  const verifyUrl = `${opts.verifyBaseUrl}/${hashDisplay}`;

  const networkSuffix = opts.network ? ` — ${opts.network}` : "";
  const sealText = [
    `🔒 Verified by ${opts.brand}`,
    `Hash: ${hashDisplay}`,
    `Intent: ${intentDisplay}`,
    `Sealed: ${sealed}${networkSuffix}`,
    `Verify: ${verifyUrl}`,
  ].join("\n");

  return { seal_text: sealText, verify_url: verifyUrl };
}
