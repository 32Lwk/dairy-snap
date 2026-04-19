import { CloudTasksClient } from "@google-cloud/tasks";
import { runSecurityReviewJob, type SecurityReviewJobPayload } from "@/server/security-review-job";
import { computeSecuritySyncRuleTags } from "@/lib/security-sync-rules";
import { shouldEnqueueSecurityReviewLlm } from "@/lib/security-review-config";

export function buildSecurityReviewPayload(params: {
  messageId: string;
  userId: string;
  threadId: string;
  entryId: string;
  userMessage: string;
  assistantContent: string;
}): SecurityReviewJobPayload | null {
  const syncRuleTags = computeSecuritySyncRuleTags({
    userMessage: params.userMessage,
    assistantContent: params.assistantContent,
  });
  const runLlm = shouldEnqueueSecurityReviewLlm({
    assistantContent: params.assistantContent,
    syncRuleTags,
  });
  if (!runLlm) return null;
  return {
    messageId: params.messageId,
    userId: params.userId,
    threadId: params.threadId,
    entryId: params.entryId,
    runLlm,
    syncRuleTags,
  };
}

function gcpProjectId(): string | undefined {
  return (
    process.env.GCP_PROJECT_ID?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    undefined
  );
}

function cloudTasksConfigured(): boolean {
  return !!(
    gcpProjectId() &&
    process.env.CLOUD_TASKS_LOCATION?.trim() &&
    process.env.CLOUD_TASKS_QUEUE_ID?.trim() &&
    process.env.SECURITY_REVIEW_WORKER_URL?.trim()
  );
}

/**
 * Enqueue security review without blocking the chat response path.
 * Uses Cloud Tasks when configured; otherwise deferred in-process execution.
 */
export function scheduleSecurityReview(payload: SecurityReviewJobPayload): void {
  if (cloudTasksConfigured()) {
    void enqueueCloudTask(payload).catch((e) => {
      console.error("[security-review] Cloud Tasks enqueue failed", e);
      void runSecurityReviewJob(payload).catch((e2) => {
        console.error("[security-review] fallback job failed", e2);
      });
    });
    return;
  }

  void Promise.resolve()
    .then(() => runSecurityReviewJob(payload))
    .catch((e) => {
      console.error("[security-review] in-process job failed", e);
    });
}

async function enqueueCloudTask(payload: SecurityReviewJobPayload): Promise<void> {
  const project = gcpProjectId()!;
  const location = process.env.CLOUD_TASKS_LOCATION!.trim();
  const queue = process.env.CLOUD_TASKS_QUEUE_ID!.trim();
  const url = process.env.SECURITY_REVIEW_WORKER_URL!.trim();

  const client = new CloudTasksClient();
  const parent = client.queuePath(project, location, queue);
  const body = Buffer.from(JSON.stringify(payload)).toString("base64");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const secret = process.env.INTERNAL_SECURITY_WEBHOOK_SECRET?.trim();
  if (secret) {
    headers["x-internal-security-secret"] = secret;
  }

  const oidcEmail = process.env.SECURITY_TASKS_OIDC_SERVICE_ACCOUNT_EMAIL?.trim();
  const oidcAudience = process.env.SECURITY_TASKS_OIDC_AUDIENCE?.trim();

  const httpRequest: {
    httpMethod: "POST";
    url: string;
    headers: Record<string, string>;
    body: string;
    oidcToken?: { serviceAccountEmail: string; audience: string };
  } = {
    httpMethod: "POST",
    url,
    headers,
    body,
  };
  if (oidcEmail && oidcAudience) {
    httpRequest.oidcToken = { serviceAccountEmail: oidcEmail, audience: oidcAudience };
  }

  const taskId = `msg-${payload.messageId}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 400);

  try {
    await client.createTask({
      parent,
      task: {
        name: `${parent}/tasks/${taskId}`,
        httpRequest,
      },
    });
  } catch (e) {
    const s = String(e);
    if (/ALREADY_EXISTS|exists/i.test(s)) return;
    throw e;
  }
}
