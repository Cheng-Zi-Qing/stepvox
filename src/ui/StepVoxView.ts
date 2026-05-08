import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_STEPVOX, DISPLAY_NAME } from "../constants";
import type { PipelineState, ConversationEntry } from "../types";

const STATE_LABELS: Record<PipelineState, string> = {
  idle: "Ready",
  listening: "Listening...",
  transcribing: "Transcribing...",
  thinking: "Thinking...",
  executing: "Executing...",
  speaking: "Speaking...",
};

export class StepVoxView extends ItemView {
  private pipelineState: PipelineState = "idle";
  private conversation: ConversationEntry[] = [];
  private statusEl: HTMLElement | null = null;
  private conversationEl: HTMLElement | null = null;
  private partialEl: HTMLElement | null = null;
  private micBtn: HTMLButtonElement | null = null;
  private onToggle: (() => void) | null = null;

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

    const header = container.createDiv({ cls: "stepvox-header" });
    header.createEl("h4", { text: DISPLAY_NAME });

    this.micBtn = header.createEl("button", { cls: "stepvox-mic-btn" });
    this.micBtn.setAttribute("aria-label", "Toggle recording");
    setIcon(this.micBtn, "mic");
    this.micBtn.addEventListener("click", () => this.onToggle?.());

    this.statusEl = container.createDiv({ cls: "stepvox-status" });
    this.renderStatus();

    this.conversationEl = container.createDiv({ cls: "stepvox-conversation" });
    this.renderConversation();
  }

  async onClose(): Promise<void> {
    this.statusEl = null;
    this.conversationEl = null;
    this.partialEl = null;
    this.micBtn = null;
  }

  setOnToggle(fn: () => void): void {
    this.onToggle = fn;
  }

  setPipelineState(state: PipelineState): void {
    this.pipelineState = state;
    this.renderStatus();
    this.updateMicBtn();

    if (state === "idle" || state === "listening") {
      this.clearPartial();
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

  addEntry(entry: ConversationEntry): void {
    this.conversation.push(entry);
    this.clearPartial();
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

  private renderStatus(): void {
    if (!this.statusEl) return;
    this.statusEl.empty();

    const label = STATE_LABELS[this.pipelineState];
    this.statusEl.createEl("span", { text: label, cls: "stepvox-status-text" });
    this.statusEl.dataset.state = this.pipelineState;
  }

  private renderConversation(): void {
    if (!this.conversationEl) return;
    this.conversationEl.empty();

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
    const active = this.pipelineState === "listening";
    this.micBtn.toggleClass("stepvox-mic-active", active);
    setIcon(this.micBtn, active ? "mic-off" : "mic");
  }
}
