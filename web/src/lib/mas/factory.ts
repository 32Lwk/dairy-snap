import { MasOrchestrator } from "@/lib/mas/orchestrator";
import { JournalComposerAgent } from "@/lib/mas/agents/journal-composer";

export function createDefaultOrchestrator(): MasOrchestrator {
  return new MasOrchestrator(
    new Map([["journal-composer", new JournalComposerAgent()]]),
  );
}
