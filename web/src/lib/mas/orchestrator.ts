import type { Agent, AgentContext, AgentResult } from "@/lib/mas/types";

export class MasOrchestrator {
  constructor(private readonly agents: Map<string, Agent>) {}

  getAgent(name: string): Agent | undefined {
    return this.agents.get(name);
  }

  async runAgent<TIn, TOut>(
    name: string,
    input: TIn,
    ctx: AgentContext,
  ): Promise<AgentResult<TOut>> {
    const agent = this.agents.get(name);
    if (!agent) return { ok: false, error: `agent not found: ${name}` };
    return agent.run(input as never, ctx) as Promise<AgentResult<TOut>>;
  }
}
