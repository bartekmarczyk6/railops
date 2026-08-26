import { NextResponse } from "next/server";

import { readState } from "@/lib/storage/store.ts";
import { getDataDir } from "@/app/api/_shared/data-dir.ts";

type Params = { id: string };

export async function GET(
  _request: Request,
  context: { params: Promise<Params> },
): Promise<Response> {
  const { id } = await context.params;
  const state = await readState({ dataDir: getDataDir() });
  const stored = state.cases.find((c) => c.caseId === id);
  if (!stored) {
    return NextResponse.json({ error: "case_not_found" }, { status: 404 });
  }
  return NextResponse.json(stored);
}
