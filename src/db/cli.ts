// Entry point for the `npm run db:*` scripts: `tsx src/db/cli.ts <migrate|seed|reset>`.
import { runMigrations } from "./migrate";
import { resetDatabase } from "./reset";
import { seed } from "./seed";

const commands: Record<string, (url: string) => Promise<void>> = {
  migrate: runMigrations,
  seed,
  reset: resetDatabase,
};

async function main(): Promise<void> {
  const name = process.argv[2] ?? "";
  const command = commands[name];
  if (!command) {
    throw new Error(
      `Usage: tsx src/db/cli.ts <${Object.keys(commands).join("|")}>`,
    );
  }
  // Only the database URL is needed here, so don't demand the full app config.
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error("DATABASE_URL is not set (copy .env.example to .env).");

  await command(url);
  console.log(`db:${name} done.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
