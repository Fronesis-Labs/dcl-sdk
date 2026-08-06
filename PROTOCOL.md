# DCL Protocol Specification v1

Status: matches the code actually shipped in `dcl-core` v0.1.0 and live in
`dcl-webhook` production. This document does not introduce new behavior —
it documents the existing on-the-wire/on-disk format exactly, byte for
byte, so independent implementations (this TS SDK, future Go/Rust clients,
third-party auditors) produce identical hashes to the Python reference.

**Changing anything in section 1 below breaks verification of every
record already committed to a live chain.** If the format ever needs to
change, it needs a version field and a migration plan — not a silent edit.

---

## 1. Record hash — canonical content string

Every chain record hashes a pipe-delimited string built from exactly
these 11 fields, in exactly this order:

```
idx | verdict | input_hash | policy_hash | prev_hash | agent_id | reason | confidence | task_type | timestamp | drift_context_json
```

Joined with a single `|` character (no surrounding spaces). Field-by-field
formatting rules — every one of these matters for byte-identical output:

| # | Field | Type | Exact formatting rule |
|---|---|---|---|
| 1 | `idx` | integer | `str(idx)` — plain decimal, no padding |
| 2 | `verdict` | string | as-is, e.g. `"COMMIT"` / `"NO_COMMIT"` |
| 3 | `input_hash` | string | as-is (already a `"0x"+hex` string from the caller) |
| 4 | `policy_hash` | string | as-is |
| 5 | `prev_hash` | string | as-is — `"0"*64` for the genesis record |
| 6 | `agent_id` | string | as-is |
| 7 | `reason` | string | as-is |
| 8 | `confidence` | float | fixed **6 decimal places**: Python `f"{confidence:.6f}"` → e.g. `0.950000` |
| 9 | `task_type` | string | as-is |
| 10 | `timestamp` | float (unix seconds) | fixed **6 decimal places**: Python `f"{timestamp:.6f}"` → e.g. `1754400000.123456` |
| 11 | `drift_context_json` | object → string | see §1.1 below — this is the field most likely to break cross-language parity |

### 1.1 `drift_context` canonicalization

`drift_context` is an arbitrary flat-ish JSON object (currently always a
flat string→string dict in practice, e.g.
`{"environment": "production-edge", "policy_version_hash": "abc123"}`, but
the format does not forbid nested values).

The Python reference serializes it with:

```python
json.dumps(drift_context, sort_keys=True)
```

**Critical detail:** Python's `json.dumps` default separators are
`", "` (comma-space) and `": "` (colon-space) — NOT compact. This is
different from JavaScript's `JSON.stringify`, which is always compact
(no spaces) and does **not** sort keys. A naive `JSON.stringify(obj)` in
TS will *not* reproduce the same string, and therefore not the same hash.

A conforming implementation must:
1. Sort object keys recursively (top-level and any nested objects), by
   Unicode code point order (Python's default string sort — this matches
   JS's default `Array.prototype.sort()` on strings for the ASCII range
   this data uses in practice).
2. Join with `", "` after each entry and `": "` after each key.
3. Match Python's number formatting for any numeric values (integers
   print without a decimal point; this format has not yet been exercised
   with float values inside `drift_context` in production — treat as
   undefined/needs-a-real-example if it comes up).

Empty/`None` drift_context is serialized as `{}` (Python: `json.dumps({})`
→ `"{}"`), never as an empty string or `null`.

### 1.2 Hash function

```
tx_hash = "0x" + hex(SHA256(content_string))
```

Full 64 hex characters — the hash is **not** truncated. (An earlier,
now-retired implementation embedded directly in `dcl-webhook` truncated
to 32 hex chars; that format is obsolete and does not apply to `dcl-core`
v0.1.0+.)

---

## 2. Chain linking

- `prev_hash` of record `N` MUST equal `tx_hash` of record `N-1`.
- `prev_hash` of record `0` (genesis) is `"0" * 64` (64 ASCII zero characters).
- `idx` is a zero-based, gap-free, strictly increasing integer per chain.

## 3. Verification algorithm

To verify a chain of records `[r0, r1, ..., rN]`:

```
expected_prev = GENESIS  # "0"*64
for r in records (in idx order):
    if r.prev_hash != expected_prev:
        FAIL at r.idx, reason = "link broken"
    recomputed = "0x" + SHA256(canonical_content_string(r))
    if recomputed != r.tx_hash:
        FAIL at r.idx, reason = "content hash mismatch (row was edited)"
    expected_prev = r.tx_hash
PASS
```

Both checks are required. Checking only chain linkage (as an earlier,
now-fixed implementation did) misses direct edits to a row's stored
fields that leave `tx_hash`/`prev_hash` untouched — this was a real bug,
fixed in `dcl-core` v0.1.0, and is exactly why independent client-side
verification exists as a feature: a third party can catch that class of
tamper without trusting the server's own `/audit` endpoint response.

## 4. Multi-party consensus (Super-Hash)

For a set of `M` parties each contributing a local hash `h_i` for the
same timestep, keyed by `party_id`:

```
parts = []
for party_id in sorted(party_ids):  # lexicographic sort, ascending
    h = contributions[party_id]
    parts.append(f"{len(party_id)}:{party_id}:{len(h)}:{h}")
combined = "|".join(parts)
super_hash = "0x" + SHA256(combined)
```

Length-prefixing each `(party_id, hash)` pair before concatenation
prevents ambiguous boundaries (e.g. `"ab"+"c"` vs `"a"+"bc"`). Sorting by
`party_id` makes the result independent of submission order — no party
gains an advantage by contributing last. This replaces an earlier XOR-based
combine (`H* = hash(h1 ⊕ h2 ⊕ ... ⊕ hM)`), which was forgeable: XOR is
commutative and invertible, so a last-mover could solve for a contribution
that forces any target Super-Hash without breaking any hash function.

## 5. dcl-webhook REST API surface (for the HTTP-client half of the SDK)

Base URL: `https://x402.fronesislabs.com` (production). All paid endpoints
require x402 payment per the `fastapi-x402` / PayMCP integration; the SDK
does not implement payment itself, only shapes requests/responses.

| Method | Path | Request body | Response |
|---|---|---|---|
| POST | `/evaluate/fast` | `EvaluateRequest` | `EvaluateResponse` |
| POST | `/evaluate/strict` | `EvaluateRequest` | `EvaluateResponse` |
| POST | `/evaluate/jailbreak` | `EvaluateRequest` | `EvaluateResponse` |
| POST | `/evaluate/safety` | `EvaluateRequest` | `EvaluateResponse` |
| POST | `/evaluate/quality` | `EvaluateRequest` | `EvaluateResponse` |
| POST | `/evaluate/secrets` | `ScanRequest` | `ScanResponse` |
| POST | `/evaluate/pii` | `ScanRequest` | `ScanResponse` |
| POST | `/evaluate/batch` | `BatchEvaluateRequest` | batch result |
| POST | `/pipeline/start` | `PipelineStartRequest` | `PipelineStartResponse` |
| GET | `/audit/{tx_hash}` | — | chain record + `chain_integrity` (server-side verify) |
| GET | `/audit/{tx_hash}/deep` | — | + `tampered_at_index`, `tamper_reason`, `drift_context` |
| GET | `/chain/status` | — | `{chain_length, integrity, tampered_at, tamper_reason, drift_mode, drift_score}` |
| GET | `/chain/export` | — | `{chain: ChainRecord[], integrity, exported_at}` — full raw record dump, this is what the SDK's local `verifyChain()` consumes |
| GET | `/health` | — | liveness |
| GET | `/policies` | — | list of built-in policy names |

`GET /chain/export` is the endpoint the TS SDK calls to fetch records for
independent local verification — the whole point of §3 is to let the SDK
re-derive `chain_integrity` itself instead of trusting the server's own
computed answer in the response body.

## 5.1 Seal formatting — open, not closed

Unlike policy scoring/thresholds, seal display formatting is **open**: it
formats already-public fields (`tx_hash`, `input_hash`, `timestamp`) and
contains no scoring logic, so it belongs in client SDKs rather than being
gated behind a server round-trip. Reference implementation: `format_seal()`
in `audit_logic.py` (server) and `formatSeal()` in the TS SDK (`seal.ts`) —
both produce byte-identical output for the same inputs. Format:

```
🔒 Verified by {brand}
Hash: {tx_hash without "0x" prefix}
Intent: {input_hash without "0x" prefix}
Sealed: {timestamp as "%Y-%m-%d %H:%M UTC", always UTC} — {network label}
Verify: {verify_base_url}/{tx_hash without "0x" prefix}
```

`brand`, `network` label, and `verify_base_url` are parameterized in the
SDK (defaulting to Fronesis Labs' own values) so other implementers of
this open protocol can format their own seal without inheriting
Fronesis-specific branding.

## 6. Field types (for SDK type generation)

```
ChainRecord = {
  index: number
  tx_hash: string          // "0x" + 64 hex chars
  prev_hash: string        // "0x" + 64 hex chars, or 64 zero chars for genesis
  verdict: "COMMIT" | "NO_COMMIT"
  input_hash: string
  policy_hash: string
  agent_id: string
  reason: string
  confidence: number       // 0.0-1.0
  task_type: string
  timestamp: number        // unix seconds, float
  drift_context: Record<string, unknown>
}
```
