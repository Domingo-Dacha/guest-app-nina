export function shouldMigrateDeployment(
  env: Record<string, string | undefined>,
): boolean {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "production") return false;
  if (env.DEMO_WRITES_ENABLED !== "true") {
    throw new Error(
      "Production demo migrations require DEMO_WRITES_ENABLED=true.",
    );
  }
  let valid = false;
  try {
    const url = new URL(env.DATABASE_URL?.trim() ?? "");
    valid =
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      Boolean(url.hostname);
  } catch {
    // Never include a connection string in errors or build logs.
  }
  if (!valid)
    throw new Error(
      "DATABASE_URL must be available inside the Vercel production build.",
    );
  return true;
}
