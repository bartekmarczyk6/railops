import { Dashboard } from "../components/dashboard.tsx";
import { computeDashboardData } from "./dashboard-data.ts";
import { readState } from "../lib/storage/store.ts";
import { DEFAULT_DATA_DIR } from "../lib/pipeline/run-case.ts";

export const dynamic = "force-dynamic";

export default async function Page() {
  const state = await readState({ dataDir: DEFAULT_DATA_DIR });
  const data = computeDashboardData(state.cases);
  return <Dashboard data={data} />;
}
