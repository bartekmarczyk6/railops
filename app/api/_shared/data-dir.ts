export function getDataDir(): string {
  if (process.env.RAILOPS_DATA_DIR) return process.env.RAILOPS_DATA_DIR;
  if (process.env.VERCEL) return "/tmp/railops/data";
  return ".railops/data";
}
