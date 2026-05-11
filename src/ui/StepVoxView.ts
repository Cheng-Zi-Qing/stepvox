import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_STEPVOX, DISPLAY_NAME, STATE_LABELS } from "../constants";
import type { PipelineState, ConversationEntry } from "../types";
import type { PerformanceMetrics } from "../utils/performance-stats";

export class StepVoxView extends ItemView {
  private pipelineState: PipelineState = "idle";
  private sessionMode = false;
  private conversation: ConversationEntry[] = [];
  private performanceHistory: PerformanceMetrics[] = [];
  private statusEl: HTMLElement | null = null;
  private conversationEl: HTMLElement | null = null;
  private partialEl: HTMLElement | null = null;
  private toolStatusEl: HTMLElement | null = null;
  private perfEl: HTMLElement | null = null;
  private micBtn: HTMLButtonElement | null = null;
  private clearBtn: HTMLButtonElement | null = null;
  private onToggle: (() => void) | null = null;
  private onClearHistory: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_STEPVOX;
  }

  getDisplayText(): string {
    return DISPLAY_NAME;
  }

  getIcon(): string {
    return "mic";
  }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("stepvox-container");

    // Header: title + clear button + status
    const header = container.createDiv({ cls: "stepvox-header" });
    header.createEl("span", { text: DISPLAY_NAME, cls: "stepvox-title" });

    this.clearBtn = header.createEl("button", { cls: "stepvox-clear-btn" });
    this.clearBtn.setAttribute("aria-label", "Clear conversation history");
    setIcon(this.clearBtn, "eraser");
    this.clearBtn.addEventListener("click", () => this.onClearHistory?.());

    this.statusEl = header.createDiv({ cls: "stepvox-status" });
    this.renderStatus();

    // Conversation
    this.conversationEl = container.createDiv({ cls: "stepvox-conversation" });
    this.renderConversation();

    // Performance (collapsed by default)
    this.perfEl = container.createDiv({ cls: "stepvox-performance" });
    this.renderPerformance();

    // Mic button at bottom
    const footer = container.createDiv({ cls: "stepvox-footer" });

    // Mic button
    this.micBtn = footer.createEl("button", { cls: "stepvox-mic-btn" });
    this.micBtn.setAttribute("aria-label", "Toggle recording");
    setIcon(this.micBtn, "mic");
    this.micBtn.addEventListener("click", () => this.onToggle?.());
  }

  async onClose(): Promise<void> {
    this.statusEl = null;
    this.conversationEl = null;
    this.partialEl = null;
    this.toolStatusEl = null;
    this.micBtn = null;
  }

  setOnToggle(fn: () => void): void {
    this.onToggle = fn;
  }

  setOnClearHistory(fn: () => void): void {
    this.onClearHistory = fn;
  }

  setPipelineState(state: PipelineState): void {
    this.pipelineState = state;
    this.renderStatus();
    this.updateMicBtn();

    if (state === "idle" || state === "listening") {
      this.clearPartial();
      this.clearToolStatus();
    }
  }

  setPartialTranscript(text: string): void {
    if (!this.conversationEl) return;

    if (!this.partialEl) {
      this.partialEl = this.conversationEl.createDiv({
        cls: "stepvox-message stepvox-message-user stepvox-partial",
      });
    }
    this.partialEl.textContent = text;
    this.scrollToBottom();
  }

  /** Ephemeral status row (e.g. "正在搜索 X")—replaced/cleared, not appended to conversation. */
  setToolStatus(text: string): void {
    if (!this.conversationEl) return;
    if (!this.toolStatusEl) {
      this.toolStatusEl = this.conversationEl.createDiv({
        cls: "stepvox-message stepvox-tool-status",
      });
    }
    this.toolStatusEl.textContent = text;
    this.scrollToBottom();
  }

  clearToolStatus(): void {
    this.toolStatusEl?.remove();
    this.toolStatusEl = null;
  }

  addEntry(entry: ConversationEntry): void {
    this.conversation.push(entry);
    this.clearPartial();
    this.clearToolStatus();
    this.renderEntry(entry);
    this.scrollToBottom();
  }

  showError(message: string): void {
    if (!this.conversationEl) return;
    const el = this.conversationEl.createDiv({
      cls: "stepvox-message stepvox-message-error",
    });
    el.textContent = message;
    this.scrollToBottom();
  }

  addPerformanceMetrics(metrics: PerformanceMetrics): void {
    this.performanceHistory.push(metrics);
    if (this.performanceHistory.length > 5) {
      this.performanceHistory.shift();
    }
    this.renderPerformance();
  }

  private renderStatus(): void {
    if (!this.statusEl) return;
    this.statusEl.empty();
    this.statusEl.dataset.state = this.pipelineState;

    const label = STATE_LABELS[this.pipelineState];
    this.statusEl.createEl("span", { text: label, cls: "stepvox-status-text" });

    if (this.pipelineState !== "idle") {
      this.statusEl.createEl("span", { cls: "stepvox-status-dots" });
    }
  }

  private renderConversation(): void {
    if (!this.conversationEl) return;
    this.conversationEl.empty();
    // .empty() destroyed the DOM nodes — drop references to match.
    this.partialEl = null;
    this.toolStatusEl = null;

    if (this.conversation.length === 0) {
      this.conversationEl.createEl("p", {
        text: "Press the hotkey or say the wake word to start.",
        cls: "stepvox-empty-state",
      });
      return;
    }

    for (const entry of this.conversation) {
      this.renderEntry(entry);
    }
  }

  private renderEntry(entry: ConversationEntry): void {
    if (!this.conversationEl) return;

    const cls =
      entry.role === "user"
        ? "stepvox-message stepvox-message-user"
        : "stepvox-message stepvox-message-assistant";

    const el = this.conversationEl.createDiv({ cls });
    el.textContent = entry.text;
  }

  private clearPartial(): void {
    this.partialEl?.remove();
    this.partialEl = null;
  }

  private scrollToBottom(): void {
    if (!this.conversationEl) return;
    this.conversationEl.scrollTop = this.conversationEl.scrollHeight;
  }

  private updateMicBtn(): void {
    if (!this.micBtn) return;
    // Mic is "live" iff a runtime session is alive. Driven by
    // PipelineCallbacks.onSessionActiveChange — see main.ts.
    const active = this.sessionMode;
    this.micBtn.toggleClass("stepvox-mic-active", active);
    setIcon(this.micBtn, active ? "mic-off" : "mic");
  }

  setSessionMode(enabled: boolean): void {
    this.sessionMode = enabled;
    this.updateMicBtn();
  }

  private renderPerformance(): void {
    if (!this.perfEl) return;
    this.perfEl.empty();

    if (this.performanceHistory.length === 0) {
      this.perfEl.createEl("p", {
        text: "No performance data yet",
        cls: "stepvox-perf-empty",
      });
      return;
    }

    this.perfEl.createEl("h5", { text: "Performance (last 5)" });

    for (const m of this.performanceHistory) {
      const entry = this.perfEl.createDiv({ cls: "stepvox-perf-entry" });
      const fmt = (ms: number) => (ms / 1000).toFixed(2) + "s";
      entry.createEl("div", { text: `ASR: ${fmt(m.asrDuration)}` });
      entry.createEl("div", { text: `LLM: ${fmt(m.llmDuration)}` });
      entry.createEl("div", { text: `TTS: ${fmt(m.ttsFirstTokenLatency)}` });
      entry.createEl("div", { text: `Total: ${fmt(m.totalDuration)}`, cls: "stepvox-perf-total" });
    }
  }
}
