export type AgentContext = {
  userId: string;
  entryId: string;
  threadId: string;
};

export type AgentResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export interface Agent<TIn = unknown, TOut = unknown> {
  readonly name: string;
  run(input: TIn, ctx: AgentContext): Promise<AgentResult<TOut>>;
}
