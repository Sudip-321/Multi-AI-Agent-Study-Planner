import { ok } from "@/lib/api-helpers";

export async function GET() {
  return ok({ status: "ok", time: new Date().toISOString() });
}
