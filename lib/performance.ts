export async function timed<T>(
  input: { route: string; queryName: string; rowCount?: (value: T) => number },
  operation: () => Promise<T>,
) {
  const startedAt = performance.now();
  try {
    const value = await operation();
    console.info("wms_timing", {
      route: input.route,
      durationMs: Math.round(performance.now() - startedAt),
      queryName: input.queryName,
      rowCount: input.rowCount?.(value),
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    });
    return value;
  } catch (error) {
    console.info("wms_timing", {
      route: input.route,
      durationMs: Math.round(performance.now() - startedAt),
      queryName: input.queryName,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      failed: true,
    });
    throw error;
  }
}
