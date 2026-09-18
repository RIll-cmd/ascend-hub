import { createStatusShelfProxy } from "../../../status/shelf-runtime";

export const runtime = "edge";

export async function GET() {
  return createStatusShelfProxy({
    coreShelfUrl: process.env.ASCEND_CORE_SHELF_URL,
    readCredential: process.env.ASCEND_SHELF_READ_CREDENTIAL,
  })();
}
