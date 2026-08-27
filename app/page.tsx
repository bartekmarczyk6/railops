import { Dashboard } from "../components/dashboard.tsx";
import { computeDashboardData } from "./dashboard-data.ts";
import { readState } from "../lib/storage/store.ts";
import { getDataDir } from "./api/_shared/data-dir.ts";

export const dynamic = "force-dynamic";

export default async function Page() {
  const dataDir = getDataDir();
  const state = await readState({ dataDir });
  const data = computeDashboardData(state.cases);
  return <Dashboard data={data} />;
}
