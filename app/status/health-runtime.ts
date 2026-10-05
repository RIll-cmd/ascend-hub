export interface LaunchHealthEnvironment {
  launchToken?: string;
  instanceId?: string;
  buildId?: string;
}

const PRIVATE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

/** The launcher uses this probe to verify that it reached its own Hub process. */
export function createHubHealthResponse(
  authorization: string | null,
  environment: LaunchHealthEnvironment,
): Response {
  const { launchToken, instanceId, buildId } = environment;
  if (!launchToken || !instanceId || !buildId) {
    return new Response(JSON.stringify({ error: "launcher health unavailable" }), {
      status: 503,
      headers: PRIVATE_HEADERS,
    });
  }
  if (authorization !== `Bearer ${launchToken}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 403,
      headers: PRIVATE_HEADERS,
    });
  }
  return new Response(JSON.stringify({
    schemaVersion: 1,
    component: "hub",
    instanceId,
    buildId,
    state: "ready",
    capabilities: { ui: "ready", core: "unknown" },
  }), { status: 200, headers: PRIVATE_HEADERS });
}
