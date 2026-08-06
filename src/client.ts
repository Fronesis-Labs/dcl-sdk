/**
 * dcl-sdk / client.ts
 *
 * Thin HTTP client over PROTOCOL.md §5 — does not implement x402 payment
 * itself, only shapes requests/responses. Payment is expected to be
 * handled by the environment the SDK runs in (an x402-aware fetch wrapper,
 * an agent framework's payment layer, etc.) — pass a custom `fetchImpl` if
 * you need to inject one.
 */

import type { ChainRecord } from "./verify.js";

export interface EvaluateRequest {
  response: string;
  policy?: string;
  agent_id?: string;
  model?: string;
  model_provider?: string;
  pipeline_id?: string;
  task_type?: string;
  retry_count?: number;
  rag_source_count?: number;
}

export interface EvaluateResponse {
  verdict: "COMMIT" | "NO_COMMIT";
  confidence: number;
  reason: string;
  tx_hash: string;
  chain_index: number;
  input_hash: string;
  policy_version: string;
  timestamp: number;
  pipeline_id: string;
  drift_mode: "NORMAL" | "WARNING" | "ESCALATION" | "BLOCK";
  drift_score: number;
  seal_text: string;
  verify_url: string;
}

export interface ScanRequest {
  response: string;
  agent_id?: string;
  task_type?: string;
}

export interface ScanFinding {
  type: string;
  position: number;
  redacted_sample: string;
  severity: "critical" | "major" | "minor";
  category: string;
  provider?: string | null;
}

export interface ScanResponse {
  verdict: "COMMIT" | "NO_COMMIT";
  risk_score: number;
  findings: ScanFinding[];
  detection_count: number;
  categories_checked: string[];
  categories_clear: string[];
  tx_hash: string;
  chain_index: number;
  input_hash: string;
  timestamp: number;
  seal_text: string;
  verify_url: string;
}

export interface ChainStatus {
  chain_length: number;
  integrity: boolean;
  tampered_at: number | null;
  tamper_reason: string | null;
  drift_mode: string;
  drift_score: number;
}

export interface ChainExport {
  chain: ChainRecord[];
  integrity: boolean;
  exported_at: number;
}

export interface DclClientOptions {
  baseUrl?: string;
  /** Inject a custom fetch (e.g. an x402-payment-aware wrapper). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const EVALUATE_TIERS = ["fast", "strict", "jailbreak", "safety", "quality"] as const;
type EvaluateTier = (typeof EVALUATE_TIERS)[number];

export class DclClient {
  private baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(opts: DclClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "https://x402.fronesislabs.com").replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async post<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`DCL API ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<TRes>;
  }

  private async get<TRes>(path: string): Promise<TRes> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`);
    if (!res.ok) {
      throw new Error(`DCL API ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<TRes>;
  }

  /** POST /evaluate/{tier} — fast, strict, jailbreak, safety, quality. */
  evaluate(tier: EvaluateTier, req: EvaluateRequest): Promise<EvaluateResponse> {
    return this.post(`/evaluate/${tier}`, req);
  }

  evaluateSecrets(req: ScanRequest): Promise<ScanResponse> {
    return this.post("/evaluate/secrets", req);
  }

  evaluatePii(req: ScanRequest): Promise<ScanResponse> {
    return this.post("/evaluate/pii", req);
  }

  /** GET /audit/{tx_hash} — server-reported integrity, not independently verified. */
  audit(txHash: string): Promise<Record<string, unknown>> {
    return this.get(`/audit/${txHash}`);
  }

  /** GET /audit/{tx_hash}/deep */
  auditDeep(txHash: string): Promise<Record<string, unknown>> {
    return this.get(`/audit/${txHash}/deep`);
  }

  chainStatus(): Promise<ChainStatus> {
    return this.get("/chain/status");
  }

  /** GET /chain/export — feed this into verifyChain() from verify.ts for independent local verification. */
  chainExport(): Promise<ChainExport> {
    return this.get("/chain/export");
  }

  health(): Promise<{ status: string; chain_length: number; ts: number }> {
    return this.get("/health");
  }

  policies(): Promise<{ policies: string[] }> {
    return this.get("/policies");
  }
}
