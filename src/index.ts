export {
  verifyChain,
  recomputeTxHash,
  canonicalContent,
  canonicalJson,
  sha256Hex,
  GENESIS,
} from "./verify.js";
export type { ChainRecord, VerifyResult } from "./verify.js";

export { formatSeal } from "./seal.js";
export type { Seal, FormatSealOptions } from "./seal.js";

export { DclClient } from "./client.js";
export type {
  EvaluateRequest,
  EvaluateResponse,
  ScanRequest,
  ScanResponse,
  ScanFinding,
  ChainStatus,
  ChainExport,
  DclClientOptions,
} from "./client.js";
