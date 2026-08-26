export const CASE_TOPICS = [
  "delay_refund",
  "cancelled_train_refund",
  "missed_connection",
  "ticket_change",
  "passenger_name_change",
  "missing_refund",
  "payment_without_ticket",
  "validation_discount_penalty",
] as const;

export type CaseTopic = (typeof CASE_TOPICS)[number];

export type KnowledgePassage = {
  id: string;
  sourceId: string;
  title: string;
  heading: string;
  topics: CaseTopic[];
  authority: string;
  version: number;
  text: string;
};

export type KnowledgeExcerpt = KnowledgePassage & { score: number };

export type KnowledgeIndex = {
  passages: KnowledgePassage[];
};

export function isCaseTopic(value: string): value is CaseTopic {
  return (CASE_TOPICS as readonly string[]).includes(value);
}
