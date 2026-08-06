/**
 * dcl-sdk / verify.ts
 *
 * Implements PROTOCOL.md §1 (canonical content string), §2 (chain linking),
 * §3 (verification algorithm). This is the part that MUST produce
 * byte-identical hashes to the Python dcl-core reference — see §1.1 for
 * why a naive JSON.stringify does not work here.
 */

export interface ChainRecord {
  index: number;
  tx_hash: string;
  prev_hash: string;
  verdict: "COMMIT" | "NO_COMMIT" | string;
  input_hash: string;
  policy_hash: string;
  agent_id: string;
  reason: string;
  confidence: number;
  task_type: string;
  timestamp: number;
  drift_context: Record<string, unknown> | null | undefined;
}

export interface VerifyResult {
  clean: boolean;
  badIndex: number | null;
  reason: string | null;
}

export const GENESIS = "0".repeat(64);

/**
 * §1.1 — canonical JSON matching Python's `json.dumps(obj, sort_keys=True)`
 * default formatting: comma-space and colon-space separators, keys sorted
 * recursively. JSON.stringify() alone does NOT produce this (it's compact
 * and unsorted), so this function exists specifically to bridge that gap.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) {
    // Python's json.dumps(None) -> "null"; the codebase always passes {}
    // for empty drift_context rather than None, but handle it faithfully.
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(", ") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort(); // Unicode code point order, matches Python's default str sort for this data
    const parts = keys.map((k) => `${JSON.stringify(k)}: ${canonicalJson(obj[k])}`);
    return "{" + parts.join(", ") + "}";
  }
  throw new Error(`canonicalJson: unsupported value type ${typeof value}`);
}

/**
 * §1 — builds the exact pipe-delimited string that gets SHA-256 hashed.
 * Field order and formatting must match dcl_core/chain.py::_content_for_hash
 * exactly.
 */
export function canonicalContent(r: {
  idx: number;
  verdict: string;
  input_hash: string;
  policy_hash: string;
  prev_hash: string;
  agent_id: string;
  reason: string;
  confidence: number;
  task_type: string;
  timestamp: number;
  drift_context: Record<string, unknown> | null | undefined;
}): string {
  const driftJson = canonicalJson(r.drift_context ?? {});
  return [
    String(r.idx),
    r.verdict,
    r.input_hash,
    r.policy_hash,
    r.prev_hash,
    r.agent_id,
    r.reason,
    r.confidence.toFixed(6),
    r.task_type,
    r.timestamp.toFixed(6),
    driftJson,
  ].join("|");
}

/** §1.2 — sha256 hex via Web Crypto (available in Node 18+ and all browsers). */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Recomputes tx_hash for a single record from its stored fields (§1). */
export async function recomputeTxHash(r: ChainRecord): Promise<string> {
  const content = canonicalContent({
    idx: r.index,
    verdict: r.verdict,
    input_hash: r.input_hash,
    policy_hash: r.policy_hash,
    prev_hash: r.prev_hash,
    agent_id: r.agent_id,
    reason: r.reason,
    confidence: r.confidence,
    task_type: r.task_type,
    timestamp: r.timestamp,
    drift_context: r.drift_context,
  });
  return "0x" + (await sha256Hex(content));
}

/**
 * §3 — full verification: chain-link continuity AND per-record content-hash
 * recomputation. This is the client-side check that catches direct-DB edits
 * a server's own /audit response can't be trusted to admit to.
 */
export async function verifyChain(records: ChainRecord[]): Promise<VerifyResult> {
  const sorted = [...records].sort((a, b) => a.index - b.index);
  let expectedPrev = GENESIS;

  for (const r of sorted) {
    if (r.prev_hash !== expectedPrev) {
      return { clean: false, badIndex: r.index, reason: "prev_hash does not match preceding tx_hash (link broken)" };
    }
    const recomputed = await recomputeTxHash(r);
    if (recomputed !== r.tx_hash) {
      return {
        clean: false,
        badIndex: r.index,
        reason: "stored tx_hash does not match recomputed hash of row content (row was edited)",
      };
    }
    expectedPrev = r.tx_hash;
  }

  return { clean: true, badIndex: null, reason: null };
}
