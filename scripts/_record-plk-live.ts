import {
  PlkNotImplemented,
  isPlkKeyConfigured,
  PLK_API_KEY_ENV,
} from "../lib/route-data/plk.ts";
import { redactPlkKey } from "../lib/route-data/plk.ts";

type Args = {
  origin?: string;
  destination?: string;
  date?: string;
  out?: string;
};

function parseArgs(argv: readonly string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--origin") out.origin = argv[++i];
    else if (flag === "--destination") out.destination = argv[++i];
    else if (flag === "--date") out.date = argv[++i];
    else if (flag === "--out") out.out = argv[++i];
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.origin || !args.destination || !args.date || !args.out) {
    process.stderr.write("record-plk-live: --origin, --destination, --date and --out are required\n");
    process.exit(1);
  }
  const rawKey = process.env[PLK_API_KEY_ENV];
  if (!isPlkKeyConfigured(process.env)) {
    process.stderr.write("record-plk-live: PLK_API_KEY missing\n");
    process.exit(2);
  }
  process.stderr.write(
    `record-plk-live: PLK_API_KEY present (redacted=${redactPlkKey((rawKey as string).trim())})\n`,
  );
  throw new PlkNotImplemented();
}

main().catch((err: unknown) => {
  const name = err instanceof Error ? err.name : "Error";
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`record-plk-live: ${name}: ${message}\n`);
  process.exit(1);
});
