# @fronesis-labs/dcl-sdk

TypeScript SDK for the **DCL / Leibniz Layer™** protocol — a tamper-evident audit chain for AI agent decisions and MCP tool calls.

This package is **100% free and Apache-2.0-licensed on purpose.** It contains no payment logic and no server dependency for its core function: given a chain record, it recomputes the hash locally and tells you if the record was tampered with. No API key, no round-trip, no trust required in the server that's showing you the record.

```bash
npm install @fronesis-labs/dcl-sdk
```

## Why a free client for a paid protocol

DCL's paid layer is the *evaluation* (running an agent's output through a policy and getting a verdict, via [x402](https://github.com/coinbase/x402) micropayments in USDC on Base). Verification of a chain you already have is a different problem — and gating it behind a paywall would defeat the point of an audit trail. If you can't independently check that a record wasn't edited without paying the party who might have edited it, it isn't really independent verification.

So: the protocol is open. Anyone can implement a DCL-compatible client, and `dcl-sdk` is the reference implementation for TypeScript/JavaScript. See [`PROTOCOL.md`](./PROTOCOL.md) for the full byte-for-byte spec if you want to implement your own client in another language.

## What's in the box

| Export | What it does |
|---|---|
| `verifyChain(records)` | Independently re-verifies an entire chain: link continuity **and** per-record content-hash recomputation. Catches direct row edits that a server's own `/audit` response wouldn't admit to. |
| `recomputeTxHash(record)` | Recomputes the hash of a single record. |
| `canonicalContent(record)` / `canonicalJson(value)` | The exact canonicalization rules (byte-identical to the Python reference) — exposed for anyone building their own tooling on top. |
| `formatSeal(txHash, inputHash, timestamp, options?)` | Formats a human-readable "Verified by..." seal from already-public fields. Pure presentation, no network call, brandable for other implementers. |
| `DclClient` | Thin HTTP wrapper over the `dcl-webhook` REST API (evaluate, audit, chain export, health, policies). Does **not** handle payment itself — inject your own x402-aware `fetch` via `fetchImpl` if you're calling paid endpoints. |

## Quickstart: verify records you already have

No client, no network — if you already have records (from a log, a webhook payload, wherever), verify them offline:

```ts
import { verifyChain } from "@fronesis-labs/dcl-sdk";

const result = await verifyChain([record0, record1, record2]);

if (result.clean) {
  console.log("Chain verified locally — no server trust required.");
} else {
  console.error(`Tampering detected at index ${result.badIndex}: ${result.reason}`);
}
```

## Quickstart: pull and verify a live chain

```ts
import { DclClient, verifyChain } from "@fronesis-labs/dcl-sdk";

const client = new DclClient(); // defaults to https://x402.fronesislabs.com

const { chain } = await client.chainExport();
const result = await verifyChain(chain);

if (result.clean) {
  console.log("Chain verified locally — no server trust required.");
} else {
  console.error(`Tampering detected at index ${result.badIndex}: ${result.reason}`);
}
```

## Quickstart: format a seal for display

```ts
import { formatSeal } from "@fronesis-labs/dcl-sdk";

const { seal_text, verify_url } = formatSeal(txHash, inputHash, timestamp);
console.log(seal_text);
// 🔒 Verified by Leibniz Layer | Fronesis Labs
// Hash: 7f3a...
// Intent: 9c1e...
// Sealed: 2026-08-06 11:48 UTC — Base Mainnet
// Verify: https://x402.fronesislabs.com/verify/7f3a...
```

White-label it for your own DCL-protocol implementation:

```ts
formatSeal(txHash, inputHash, timestamp, {
  brand: "My Audit Layer",
  verifyBaseUrl: "https://myservice.example.com/verify",
  network: "", // omit the network suffix entirely
});
```

## Calling paid evaluation endpoints

`DclClient` shapes the requests/responses for `dcl-webhook`'s evaluation tiers — `fast`, `strict`, `jailbreak`, `safety`, `quality` — plus secrets/PII scanning. These endpoints are x402-metered; the SDK doesn't move money, it just gives you typed request/response shapes and lets you supply your own payment-aware `fetch`:

```ts
import { DclClient } from "@fronesis-labs/dcl-sdk";

const client = new DclClient({ fetchImpl: myX402Fetch });

const result = await client.evaluate("strict", {
  response: agentOutput,
  agent_id: "my-agent",
  task_type: "financial-summary",
});

console.log(result.verdict, result.tx_hash, result.seal_text);
```

## Design notes

- **Node 18+ or a browser.** `sha256Hex` uses Web Crypto (`crypto.subtle`), available natively in both.
- **Byte-identical to the Python reference (`dcl-core`).** The trickiest part is `drift_context` canonicalization — Python's `json.dumps(obj, sort_keys=True)` uses `", "` / `": "` separators, which `JSON.stringify` does not reproduce. `canonicalJson()` exists specifically to close that gap; see [`PROTOCOL.md §1.1`](./PROTOCOL.md#11-drift_context-canonicalization) for why.
- **No secrets, no keys, nothing to leak.** The entire local-verification path is pure functions over data you already have.

## Links

- Protocol spec: [`PROTOCOL.md`](./PROTOCOL.md)
- Live server: [mcp.fronesislabs.com](https://mcp.fronesislabs.com) / [x402.fronesislabs.com](https://x402.fronesislabs.com)
- MCP server (Smithery): [fronesislabs/dcl-trust-oracle](https://smithery.ai/server/fronesislabs/dcl-trust-oracle)
- Org: [github.com/Fronesis-Labs](https://github.com/Fronesis-Labs)

## License

Apache-2.0 — see [`LICENSE`](./LICENSE).
