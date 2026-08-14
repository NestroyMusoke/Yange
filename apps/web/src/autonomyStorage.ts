import type { WearCastExecution, WorkflowRepository } from "@yange/orchestrator";

const WORKFLOW_KEY = "yange.autonomy-workflows.v1";

function readAll(): Record<string, WearCastExecution> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(WORKFLOW_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, WearCastExecution>
      : {};
  } catch {
    return {};
  }
}

export const localWorkflowRepository = {
  read(triggerId) {
    return structuredClone(readAll()[triggerId] ?? null);
  },
  latest() {
    return structuredClone(
      Object.values(readAll()).sort(
        (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      )[0] ?? null,
    );
  },
  save(execution) {
    const current = readAll();
    current[execution.triggerId] = structuredClone(execution);
    window.localStorage.setItem(WORKFLOW_KEY, JSON.stringify(current));
  },
  reset() {
    window.localStorage.removeItem(WORKFLOW_KEY);
  },
} satisfies WorkflowRepository;
