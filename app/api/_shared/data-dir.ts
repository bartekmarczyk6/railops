export function getDataDir(): string {
  return process.env.RAILOPS_DATA_DIR ?? ".railops/data";
}
