import type { Agent } from "@/lib/mas/types";
import { MasOrchestrator } from "@/lib/mas/orchestrator";
import { JournalComposerAgent } from "@/lib/mas/agents/journal-composer";
import { PlutchikEmotionAgent } from "@/lib/mas/agents/plutchik-emotion";

export function createDefaultOrchestrator(): MasOrchestrator {
  return new MasOrchestrator(
    new Map<string, Agent>([
      ["journal-composer", new JournalComposerAgent()],
      ["plutchik-emotion", new PlutchikEmotionAgent()],
    ]),
  );
}
