import { getHindsightClient, RAILOPS_BANK_ID } from "../lib/memory/hindsight";

type MentalModelSpec = {
  id: string;
  name: string;
  sourceQuery: string;
  tags: string[];
};

const MISSION_REFLECT =
  "RailOps reviewer-facing assistant. Synthesize reviewer corrections into guidance for future draft responses. Never treat memory as evidence for eligibility, refunds, or ticket changes.";

const MISSION_RETAIN =
  "Capture only reviewer learning: the topic, the decision outcome, the reviewer action, the edited guidance, and a sanitized summary of the original and final draft. Strip account, ticket, payment, route, and reservation identifiers before retention.";

const MISSION_OBSERVATIONS =
  "Consolidate reviewer feedback into concise observations about how future drafts should sound, what missing information to request next, how refunds and changes are explained, how corrections should reshape the next draft, and when to escalate.";

const MENTAL_MODELS: MentalModelSpec[] = [
  {
    id: "railops-tone",
    name: "Tone",
    sourceQuery:
      "What tone should reviewer-facing responses use across all topics? Concise, neutral, evidence-anchored, and free of internal jargon or chain-of-thought.",
    tags: ["tone"],
  },
  {
    id: "railops-missing-information",
    name: "Missing Information",
    sourceQuery:
      "How should missing-information follow-ups request the next required field without sounding demanding and without inventing facts?",
    tags: ["missing_information"],
  },
  {
    id: "railops-refunds-changes",
    name: "Refunds and Changes",
    sourceQuery:
      "How should refund and ticket-change outcomes be explained in plain language while remaining consistent with deterministic policy results?",
    tags: ["refunds_changes"],
  },
  {
    id: "railops-corrections",
    name: "Corrections",
    sourceQuery:
      "How should reviewer-requested corrections shape the next draft without overriding deterministic eligibility or policy decisions?",
    tags: ["corrections"],
  },
  {
    id: "railops-escalation",
    name: "Escalation",
    sourceQuery:
      "When should a case be escalated or marked information-only instead of being drafted further? What signals trigger that boundary?",
    tags: ["escalation"],
  },
];

type CliOptions = {
  apply: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  return { apply: argv.includes("--apply") };
}

function logDryRun(plan: { existing: boolean; bankId: string; mentalModels: MentalModelSpec[] }): void {
  const lines: string[] = [];
  lines.push(`[dry-run] Hindsight endpoint: ${process.env.HINDSIGHT_API_URL ?? "(not set)"}`);
  lines.push(`[dry-run] bank id: ${plan.bankId}`);
  if (!plan.existing) {
    lines.push(`[dry-run] would create bank with reflect/retain/observation missions`);
  } else {
    lines.push(`[dry-run] bank already exists; would skip createBank`);
  }
  lines.push(`[dry-run] reflect mission: ${MISSION_REFLECT}`);
  lines.push(`[dry-run] retain mission: ${MISSION_RETAIN}`);
  lines.push(`[dry-run] observations mission: ${MISSION_OBSERVATIONS}`);
  for (const m of plan.mentalModels) {
    lines.push(`[dry-run] would ensure mental model "${m.id}" (${m.name})`);
  }
  console.log(lines.join("\n"));
}

function logApplied(plan: {
  createdBank: boolean;
  createdModels: string[];
  skippedModels: string[];
  mentalModels: MentalModelSpec[];
}): void {
  const lines: string[] = [];
  lines.push(plan.createdBank ? `[apply] bank "${RAILOPS_BANK_ID}" created` : `[apply] bank "${RAILOPS_BANK_ID}" already existed`);
  for (const id of plan.createdModels) lines.push(`[apply] created mental model "${id}"`);
  for (const id of plan.skippedModels) lines.push(`[apply] mental model "${id}" already existed`);
  console.log(lines.join("\n"));
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.apply) {
    logDryRun({
      existing: false,
      bankId: RAILOPS_BANK_ID,
      mentalModels: MENTAL_MODELS,
    });
    return;
  }

  const client = getHindsightClient();
  if (!client) {
    console.error("HINDSIGHT_API_URL is not set; cannot apply. Run with --dry-run to preview.");
    process.exitCode = 1;
    return;
  }

  let createdBank = false;
  try {
    await client.getBankProfile(RAILOPS_BANK_ID);
  } catch {
    await client.createBank(RAILOPS_BANK_ID, {
      reflectMission: MISSION_REFLECT,
      retainMission: MISSION_RETAIN,
      observationsMission: MISSION_OBSERVATIONS,
      enableObservations: true,
    });
    createdBank = true;
  }

  const existing = await client.listMentalModels(RAILOPS_BANK_ID);
  const existingIds = new Set(
    (existing.mental_models ?? [])
      .map((m) => (typeof m.id === "string" ? m.id : null))
      .filter((id): id is string => id !== null),
  );

  const createdModels: string[] = [];
  const skippedModels: string[] = [];
  for (const m of MENTAL_MODELS) {
    if (existingIds.has(m.id)) {
      skippedModels.push(m.id);
      continue;
    }
    await client.createMentalModel(RAILOPS_BANK_ID, m.name, m.sourceQuery, {
      id: m.id,
      tags: m.tags,
    });
    createdModels.push(m.id);
  }

  logApplied({ createdBank, createdModels, skippedModels, mentalModels: MENTAL_MODELS });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[apply] failed: ${message}`);
  process.exit(1);
});
