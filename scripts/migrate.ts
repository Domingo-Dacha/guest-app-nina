import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { neon } from "@neondatabase/serverless";

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const sql = neon(databaseUrl);
  const migrationsDir = path.resolve("db/migrations");
  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  await sql.query(
    `create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )`,
  );

  for (const file of files) {
    const applied = await sql.query(
      "select 1 from schema_migrations where version = $1",
      [file],
    );
    if (applied.length > 0) {
      console.log(`skip ${file}`);
      continue;
    }

    const source = await readFile(path.join(migrationsDir, file), "utf8");
    const statements = source
      .split("-- statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    const queries = statements.map((statement) => sql.query(statement));
    queries.push(
      sql.query("insert into schema_migrations (version) values ($1)", [file]),
    );
    await sql.transaction(queries);
    console.log(`applied ${file}`);
  }
}

void main().catch(() => {
  console.error(
    "Migration failed. Check database connectivity and migration SQL. Connection details are not logged.",
  );
  process.exitCode = 1;
});
