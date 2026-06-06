import type { WorkflowStackComponent } from "./types";

export const REQUIRED_WORKFLOW_STACK = [
  {
    name: "superpowers",
    role: "workflow-spine",
    description: "Drives brainstorming, planning, implementation, debugging, review, and verification discipline."
  },
  {
    name: "gstack",
    role: "review-gate",
    description: "Adds CSO, QA, executive, and office-hours review gates before risky implementation or release decisions."
  },
  {
    name: "compound",
    role: "learning-layer",
    description: "Captures reusable decisions, repeated failure modes, and durable workflow improvements after each cycle."
  }
] as const;

export function defaultWorkflowStack(): WorkflowStackComponent[] {
  return REQUIRED_WORKFLOW_STACK.map((item) => ({
    ...item,
    required: true
  }));
}

export function missingWorkflowStackComponents(stack: readonly WorkflowStackComponent[]): string[] {
  return REQUIRED_WORKFLOW_STACK
    .filter((required) => !stack.some((item) => normalized(item.name) === required.name && item.required))
    .map((item) => item.name);
}

export function workflowStackRolesMatch(stack: readonly WorkflowStackComponent[]): boolean {
  return REQUIRED_WORKFLOW_STACK.every((required) =>
    stack.some((item) => normalized(item.name) === required.name && normalized(item.role) === required.role)
  );
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}
