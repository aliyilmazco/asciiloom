export interface CopiedFeedback {
  show(button: HTMLButtonElement): void;
  reset(button: HTMLButtonElement): void;
  dispose(): void;
}

interface ButtonFeedbackState {
  label: string;
  timeout: number;
}

export function createCopiedFeedback(
  timerHost: Pick<Window, 'clearTimeout' | 'setTimeout'>,
  durationMs = 1_200,
): CopiedFeedback {
  const states = new Map<HTMLButtonElement, ButtonFeedbackState>();

  return {
    show(button: HTMLButtonElement): void {
      const previous = states.get(button);
      const label = previous?.label ?? button.textContent ?? '';
      if (previous) timerHost.clearTimeout(previous.timeout);

      button.textContent = 'Copied';
      const timeout = timerHost.setTimeout(() => {
        button.textContent = label;
        states.delete(button);
      }, durationMs);
      states.set(button, { label, timeout });
    },

    reset(button: HTMLButtonElement): void {
      const state = states.get(button);
      if (!state) return;
      timerHost.clearTimeout(state.timeout);
      button.textContent = state.label;
      states.delete(button);
    },

    dispose(): void {
      for (const [button, { label, timeout }] of states) {
        timerHost.clearTimeout(timeout);
        button.textContent = label;
      }
      states.clear();
    },
  };
}
