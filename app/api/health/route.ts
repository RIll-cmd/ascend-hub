import { createHubHealthResponse } from "../../status/health-runtime";

export const runtime = "edge";

export function GET(request: Request) {
  return createHubHealthResponse(request.headers.get("authorization"), {
    launchToken: process.env.ASCEND_LAUNCH_TOKEN,
    instanceId: process.env.ASCEND_INSTANCE_ID,
    buildId: process.env.ASCEND_BUILD_ID,
  });
}
