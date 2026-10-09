import { ok, handle, getUser } from "@/lib/api-helpers";
import { dailyBriefPipeline } from "@/lib/agents/orchestrator";

export async function POST() {
  return handle(async () => {
    const user = await getUser();
    const brief = await dailyBriefPipeline(user.id);
    return ok(brief);
  });
}
