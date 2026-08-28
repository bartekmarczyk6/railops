import { buildLearningContent, learningMetadata, learningTags } from "./sanitize";
import type { TombstoneStore } from "./learning";
import {
  type CaseTopic,
  type LearningRecord,
  type MemoryContext,
  type MemoryTraceEvent,
  type MemoryTraceListener,
} from "./types";

export const RAILOPS_BANK_ID = "railops";
export const HINDSIGHT_API_URL_ENV = "HINDSIGHT_API_URL";
export const HINDSIGHT_API_KEY_ENV = "HINDSIGHT_API_KEY";
export const REVIEWER_LEARNING_TAG = "reviewer_learning";
export const DEFAULT_RECALL_LIMIT = 5;

export type RecallResultLike = {
  id: string;
  text: string;
  type?: string | null;
  context?: string | null;
  metadata?: Record<string, string> | null;
  tags?: string[] | null;
  document_id?: string | null;
};

export type RecallResponseLike = {
  results?: RecallResultLike[];
};

export type RetainResponseLike = {
  success: boolean;
  bank_id: string;
  items_count: number;
  async: boolean;
  operation_id?: string | null;
  operation_ids?: string[] | null;
};

export type BankProfileLike = {
  bank_id: string;
};

export type MentalModelSummaryLike = {
  id: string;
  name: string;
};

export type MentalModelListLike = {
  mental_models?: MentalModelSummaryLike[];
};

export type CreateMentalModelResponseLike = {
  id: string;
  name: string;
};

export type HindsightLike = {
  recall(bankId: string, query: string, options?: Record<string, unknown>): Promise<RecallResponseLike>;
  retain(bankId: string, content: string, options?: Record<string, unknown>): Promise<RetainResponseLike>;
  deleteDocument(bankId: string, documentId: string, options?: Record<string, unknown>): Promise<void>;
  listMentalModels(bankId: string, options?: Record<string, unknown>): Promise<MentalModelListLike>;
  createBank(bankId: string, options?: Record<string, unknown>): Promise<BankProfileLike>;
  createMentalModel(
    bankId: string,
    name: string,
    sourceQuery: string,
    options?: Record<string, unknown>,
  ): Promise<CreateMentalModelResponseLike>;
  getBankProfile(bankId: string, options?: Record<string, unknown>): Promise<BankProfileLike>;
};

let listener: MemoryTraceListener | null = null;
let tombstoneStore: TombstoneStore = createMemoryTombstoneStore();

export function setMemoryTraceListener(next: MemoryTraceListener | null): void {
  listener = next;
}

export function setTombstoneStore(store: TombstoneStore): void {
  tombstoneStore = store;
}

export function resetMemoryAdapter(): void {
  listener = null;
  tombstoneStore = createMemoryTombstoneStore();
}

function createMemoryTombstoneStore(): TombstoneStore {
  const ids = new Set<string>();
  return {
    path: "(memory)",
    load: () => new Set(ids),
    add: (memoryId: string) => {
      ids.add(memoryId);
    },
    remove: (memoryId: string) => {
      ids.delete(memoryId);
    },
  };
}

function emit(event: MemoryTraceEvent): void {
  listener?.(event);
}

function reasonFromError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown_error";
}

/* Demo branch: reviewer memory is paused. Every call site already handles a
 * null client by degrading to local-only learning. */
export function getHindsightClient(): HindsightLike | null {
  return null;
}

export type RecallOptions = {
  topic: CaseTopic;
  query: string;
  limit?: number;
  client?: HindsightLike | null;
};

export async function recallReviewerContext(input: RecallOptions): Promise<MemoryContext> {
  const limit = input.limit ?? DEFAULT_RECALL_LIMIT;
  const client = pickClient(input.client);
  if (!client) {
    emit({ kind: "memory_unavailable", stage: "recall", reason: "no_hindsight_endpoint" });
    return { topic: input.topic, reviewerGuidance: [], source: "none" };
  }
  try {
    const tombstones = tombstoneStore.load();
    const response = await client.recall(RAILOPS_BANK_ID, input.query, {
      tags: [REVIEWER_LEARNING_TAG, input.topic],
      tagsMatch: "any_strict",
      maxTokens: 1024,
    });
    const items = (response.results ?? [])
      .filter((r) => {
        const handle = r.document_id ?? r.id;
        return !tombstones.has(handle);
      })
      .slice(0, limit)
      .map((r) => r.text.trim())
      .filter((t) => t.length > 0);
    return { topic: input.topic, reviewerGuidance: items, source: "hindsight" };
  } catch (err) {
    emit({ kind: "memory_unavailable", stage: "recall", reason: reasonFromError(err) });
    return { topic: input.topic, reviewerGuidance: [], source: "none" };
  }
}

export type RetainOptions = {
  record: LearningRecord;
  client?: HindsightLike | null;
};

export type RetainResult = { memoryId: string | null };

export async function retainReviewerLearning(input: RetainOptions): Promise<RetainResult> {
  const client = pickClient(input.client);
  if (!client) {
    emit({ kind: "memory_unavailable", stage: "retain", reason: "no_hindsight_endpoint" });
    return { memoryId: null };
  }
  const memoryId = generateMemoryId();
  const content = buildLearningContent(input.record);
  try {
    await client.retain(RAILOPS_BANK_ID, content, {
      documentId: memoryId,
      tags: learningTags(input.record),
      metadata: learningMetadata(input.record),
      timestamp: input.record.timestamp,
    });
    return { memoryId };
  } catch (err) {
    emit({ kind: "memory_unavailable", stage: "retain", reason: reasonFromError(err) });
    return { memoryId: null };
  }
}

export type UndoOptions = {
  memoryId: string;
  client?: HindsightLike | null;
};

export async function undoReviewerLearning(input: UndoOptions): Promise<void> {
  tombstoneStore.add(input.memoryId);
  const client = pickClient(input.client);
  if (!client) {
    emit({ kind: "memory_unavailable", stage: "undo", reason: "no_hindsight_endpoint" });
    return;
  }
  try {
    await client.deleteDocument(RAILOPS_BANK_ID, input.memoryId);
  } catch (err) {
    emit({ kind: "memory_unavailable", stage: "undo", reason: reasonFromError(err) });
  }
}

function pickClient(override: HindsightLike | null | undefined): HindsightLike | null {
  if (override !== undefined) return override;
  return getHindsightClient();
}

function generateMemoryId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `learning-${cryptoObj.randomUUID()}`;
  }
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `learning-${time}-${rand}`;
}
