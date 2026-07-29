export type AppEnvironment = "production" | "preview" | "staging" | "development" | "test";
export type DatabaseEnvironment = "production" | "preview" | "staging" | "development" | "test";

export function normalizeAppEnvironment(value?: string): AppEnvironment {
  if (value === "production" || value === "preview" || value === "staging" || value === "test")
    return value;
  return "development";
}

export function assertSafeEnvironment(input: {
  appEnv?: string;
  databaseEnv?: string;
  vercelEnv?: string;
  nodeEnv?: string;
}) {
  const appEnv = normalizeAppEnvironment(input.appEnv ?? input.vercelEnv ?? input.nodeEnv);
  const databaseEnv = input.databaseEnv as DatabaseEnvironment | undefined;
  if (["production", "preview", "staging"].includes(appEnv) && !databaseEnv)
    throw new Error(`DATABASE_ENV is required for ${appEnv} deployments.`);
  if (appEnv === "production" && databaseEnv !== "production")
    throw new Error("Production application requires DATABASE_ENV=production.");
  if ((appEnv === "preview" || appEnv === "staging" || appEnv === "development") && databaseEnv === "production")
    throw new Error(
      `Unsafe environment pairing: ${appEnv} application cannot connect to a production database.`,
    );
  return { appEnv, databaseEnv };
}

export function canShowShadowSeed(input: {
  appEnv?: string;
  enabled?: string;
  adminTools?: string;
}) {
  return (
    normalizeAppEnvironment(input.appEnv) !== "production" &&
    input.enabled === "true" &&
    input.adminTools === "true"
  );
}

export function shouldShowEnvironmentBanner(appEnv?: string) {
  return normalizeAppEnvironment(appEnv) !== "production";
}

export function shouldShowDemoReset(input: { appEnv?: string; demoMode?: string }) {
  return normalizeAppEnvironment(input.appEnv) !== "production" && input.demoMode === "true";
}

export function assertShadowSeedAllowed(input: { appEnv?: string; enabled?: string }) {
  if (normalizeAppEnvironment(input.appEnv) === "production" || input.enabled !== "true")
    throw new Error("SHADOW_SEED is disabled outside an explicitly enabled non-production environment.");
}

export function assertDemoResetAllowed(input: { appEnv?: string; demoMode?: string }) {
  if (!shouldShowDemoReset(input))
    throw new Error("Demo reset is disabled outside explicit non-production demo mode.");
}
