import type {
  ChurnFlowConfig,
  ConfirmStep,
  FeedbackStep,
  LossAversionStep,
  Offer,
  SurveyReason,
  SurveyStep,
} from "./types";

export type ChurnScreen =
  | "survey"
  | "offer"
  | "lossAversion"
  | "feedback"
  | "confirm"
  | "success";
export type ChurnOutcome = "saved" | "canceled";
export type ChurnApplyOutcome =
  | "saved"
  | "already_discounted"
  | "already_paused"
  | "already_downgraded"
  | "not_eligible";

export interface ChurnMachineState {
  screen: ChurnScreen;
  selectedReason: string | null;
  feedback: string;
  timing: "immediate" | "end_of_period";
  outcome: ChurnOutcome | null;
  isProcessing: boolean;
  error: string | null;
  notice: string | null;
}

export interface ChurnMachineContext {
  hasActiveDiscount?: boolean;
  isPaused?: boolean;
}

const SERVER_OFFER_TYPES = ["discount", "pause", "downgrade"] as const;

export type ChurnLogEvent =
  | { type: "flow_started" }
  | { type: "survey_submitted"; reason: string; feedback?: string }
  | { type: "offer_shown"; reason: string; offer: Offer }
  | { type: "offer_accepted"; reason: string; offer: Offer }
  | { type: "offer_declined"; reason: string; offer: Offer }
  | { type: "canceled"; reason?: string; feedback?: string }
  | { type: "abandoned" };

export interface ChurnHandlers {
  applyOffer: (reason: string) => Promise<ChurnApplyOutcome>;
  cancel: (
    timing: "immediate" | "end_of_period",
    reason?: string,
    feedback?: string,
  ) => Promise<void>;
  onLog?: (event: ChurnLogEvent) => void;
  onDone?: (outcome: ChurnOutcome) => void;
  onClose?: () => void;
}

/**
 * Pure, framework-light churn flow state machine. No JSX, no fetch — it drives
 * screen transitions and calls injected async handlers. The renderer subscribes
 * via getState/subscribe (useSyncExternalStore); the builder reuses it with stub
 * handlers for live preview.
 *
 * Cancel is structurally the last step: it is only reachable from the confirm
 * screen, and `success` is a terminal sink where every action is a no-op.
 */
export class ChurnMachine {
  private state: ChurnMachineState;
  private readonly listeners = new Set<() => void>();
  // Handlers are injected post-construction via setHandlers so the React renderer
  // can keep them fresh (in an effect) without recreating the machine — and
  // without reading a ref during render. Default to inert no-ops.
  private handlers: ChurnHandlers = {
    applyOffer: async () => "not_eligible",
    cancel: async () => {},
  };

  constructor(
    private readonly config: ChurnFlowConfig,
    private readonly context: ChurnMachineContext = {},
  ) {
    this.state = {
      screen: this.hasSurvey() ? "survey" : "confirm",
      selectedReason: null,
      feedback: "",
      timing: "end_of_period",
      outcome: null,
      isProcessing: false,
      error: null,
      notice: null,
    };
  }

  setHandlers = (handlers: ChurnHandlers): void => {
    this.handlers = handlers;
  };

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getState = (): ChurnMachineState => this.state;

  start = (): void => {
    this.log({ type: "flow_started" });
  };

  getSurveyStep(): SurveyStep | undefined {
    return this.config.steps.find((s): s is SurveyStep => s.type === "survey");
  }

  getConfirmStep(): ConfirmStep | undefined {
    return this.config.steps.find(
      (s): s is ConfirmStep => s.type === "confirm",
    );
  }

  getLossAversionStep(): LossAversionStep | undefined {
    return this.config.steps.find(
      (s): s is LossAversionStep => s.type === "lossAversion",
    );
  }

  getFeedbackStep(): FeedbackStep | undefined {
    return this.config.steps.find(
      (s): s is FeedbackStep => s.type === "feedback",
    );
  }

  getReason(key: string | null): SurveyReason | undefined {
    if (!key) return undefined;
    return this.getSurveyStep()?.reasons.find((r) => r.key === key);
  }

  getCurrentOffer(): Offer | undefined {
    return this.getReason(this.state.selectedReason)?.offer;
  }

  selectReason = (key: string): void => {
    if (this.terminal()) return;
    this.set({ selectedReason: key, error: null });
  };

  setFeedback = (feedback: string): void => {
    if (this.terminal()) return;
    this.set({ feedback });
  };

  setTiming = (timing: "immediate" | "end_of_period"): void => {
    if (this.terminal()) return;
    this.set({ timing });
  };

  submitSurvey = (): void => {
    if (this.terminal()) return;
    const reason = this.state.selectedReason;
    if (!reason) return;

    this.log({
      type: "survey_submitted",
      reason,
      feedback: this.state.feedback || undefined,
    });

    const next = this.nextScreen("survey");
    if (next === "offer") {
      const offer = this.getCurrentOffer();
      if (offer) this.log({ type: "offer_shown", reason, offer });
      this.set({ screen: "offer" });
    } else {
      // Offer skipped (none, disabled, or the customer is already in its
      // end-state). Carry a friendly note through to the confirm screen.
      this.set({ screen: next, notice: this.offerSkipNotice() });
    }
  };

  continueFromLossAversion = (): void => {
    if (this.terminal() || this.state.screen !== "lossAversion") return;
    this.set({ screen: this.nextScreen("lossAversion") });
  };

  continueFromFeedback = (): void => {
    if (this.terminal() || this.state.screen !== "feedback") return;
    this.set({ screen: this.nextScreen("feedback") });
  };

  /**
   * Builder-only: jump the preview to a specific screen without running the
   * normal transition guards. The portal flow never calls this.
   */
  previewGoTo = (screen: ChurnScreen, outcome?: ChurnOutcome): void => {
    const patch: Partial<ChurnMachineState> = {
      screen,
      error: null,
      notice: null,
      isProcessing: false,
    };
    if (screen === "offer") {
      const reasons = this.getSurveyStep()?.reasons ?? [];
      patch.selectedReason =
        reasons.find((r) => r.offer)?.key ?? reasons[0]?.key ?? null;
    }
    patch.outcome = screen === "success" ? (outcome ?? "canceled") : null;
    this.set(patch);
  };

  /** Ordered walk over the post-survey screens, skipping disabled/ineligible ones. */
  private nextScreen(from: ChurnScreen): ChurnScreen {
    const order: ChurnScreen[] = [
      "offer",
      "lossAversion",
      "feedback",
      "confirm",
    ];
    const start = from === "survey" ? 0 : order.indexOf(from) + 1;
    for (let i = start; i < order.length; i++) {
      const s = order[i];
      if (s === "offer" && this.shouldShowOffer()) return "offer";
      if (s === "lossAversion" && this.lossAversionEnabled())
        return "lossAversion";
      if (s === "feedback" && this.feedbackEnabled()) return "feedback";
      if (s === "confirm") return "confirm";
    }
    return "confirm";
  }

  private shouldShowOffer(): boolean {
    const offer = this.getCurrentOffer();
    if (!offer) return false;
    if (this.config.settings?.offerEnabled === false) return false;
    // Skip when already in the offer's end-state — re-granting a discount resets
    // its duration; re-pausing a paused sub is a no-op (handled server-side too).
    if (offer.type === "discount" && this.context.hasActiveDiscount)
      return false;
    if (offer.type === "pause" && this.context.isPaused) return false;
    return true;
  }

  private offerSkipNotice(): string | null {
    const offer = this.getCurrentOffer();
    if (!offer || this.config.settings?.offerEnabled === false) return null;
    if (offer.type === "discount" && this.context.hasActiveDiscount)
      return "You're already on a discounted plan.";
    if (offer.type === "pause" && this.context.isPaused)
      return "Your subscription is already paused.";
    return null;
  }

  private lossAversionEnabled(): boolean {
    const step = this.getLossAversionStep();
    return !!step && step.enabled !== false && (step.features?.length ?? 0) > 0;
  }

  private feedbackEnabled(): boolean {
    const step = this.getFeedbackStep();
    return !!step && step.enabled !== false;
  }

  acceptOffer = async (): Promise<void> => {
    if (this.terminal() || this.state.screen !== "offer") return;
    const reason = this.state.selectedReason;
    const offer = this.getCurrentOffer();
    if (
      !reason ||
      !offer ||
      !SERVER_OFFER_TYPES.includes(
        offer.type as (typeof SERVER_OFFER_TYPES)[number],
      )
    )
      return;

    this.set({ isProcessing: true, error: null });
    try {
      // Server records `offer_accepted` authoritatively on a successful apply —
      // the client does not log it (avoids double-counting). The server resolves
      // the offer from stored config, so a single applyOffer(reason) covers every
      // executable offer type.
      const result = await this.handlers.applyOffer(reason);
      if (result === "saved") {
        this.set({ screen: "success", outcome: "saved", isProcessing: false });
        this.handlers.onDone?.("saved");
      } else {
        // Not eligible (already in the end-state / one-time already used) — fall
        // through to confirm rather than error, with a friendly note.
        this.set({
          screen: "confirm",
          isProcessing: false,
          notice:
            result === "already_discounted"
              ? "You're already getting this discount."
              : result === "already_paused"
                ? "Your subscription is already paused."
                : result === "already_downgraded"
                  ? "A plan change is already scheduled."
                  : "This offer isn't available again.",
        });
      }
    } catch (err) {
      this.set({
        isProcessing: false,
        error:
          err instanceof Error
            ? err.message
            : "Could not apply the offer. Please try again.",
      });
    }
  };

  /** Contact/redirect offers are escape hatches — logged, URL opened by renderer. */
  noteContactOffer = (): void => {
    if (this.terminal()) return;
    const reason = this.state.selectedReason;
    const offer = this.getCurrentOffer();
    if (!reason || !offer) return;
    this.log({ type: "offer_accepted", reason, offer });
  };

  declineOffer = (): void => {
    if (this.terminal() || this.state.screen !== "offer") return;
    const reason = this.state.selectedReason;
    const offer = this.getCurrentOffer();
    if (reason && offer) {
      this.log({ type: "offer_declined", reason, offer });
    }
    this.set({ screen: this.nextScreen("offer"), error: null });
  };

  confirmCancel = async (): Promise<void> => {
    if (this.terminal() || this.state.screen !== "confirm") return;
    this.set({ isProcessing: true, error: null });
    try {
      // Server records `canceled` authoritatively in the cancel handler — the
      // client does not log it here (avoids double-counting).
      await this.handlers.cancel(
        this.state.timing,
        this.state.selectedReason || undefined,
        this.state.feedback || undefined,
      );
      this.set({ screen: "success", outcome: "canceled", isProcessing: false });
      this.handlers.onDone?.("canceled");
    } catch (err) {
      this.set({
        isProcessing: false,
        error:
          err instanceof Error
            ? err.message
            : "Could not cancel the subscription. Please try again.",
      });
    }
  };

  close = (): void => {
    if (!this.terminal()) {
      this.log({ type: "abandoned" });
    }
    this.handlers.onClose?.();
  };

  private hasSurvey(): boolean {
    return this.config.steps.some((s) => s.type === "survey");
  }

  private terminal(): boolean {
    return this.state.outcome !== null;
  }

  private set(patch: Partial<ChurnMachineState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private log(event: ChurnLogEvent): void {
    this.handlers.onLog?.(event);
  }
}
