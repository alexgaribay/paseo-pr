export interface AssignmentAutomationWake {
  processCurrent: boolean;
}

let wake: ((input: AssignmentAutomationWake) => void) | null = null;

export function registerAssignmentAutomationWake(
  fn: (input: AssignmentAutomationWake) => void,
): () => void {
  wake = fn;
  return () => {
    if (wake === fn) wake = null;
  };
}

export function wakeAssignmentAutomation(input: AssignmentAutomationWake): void {
  wake?.(input);
}
