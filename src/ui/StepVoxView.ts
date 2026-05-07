import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_STEPVOX, DISPLAY_NAME } from "../constants";
import type { PipelineState, ConversationEntry } from "../types";

export class StepVoxView extends ItemView {
  private pipelineState: PipelineState = "idle";
  private conversation: ConversationEntry[] = [];

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

    const status = container.createDiv({ cls: "stepvox-status" });
    status.createEl("span", { text: "Ready", cls: "stepvox-status-text" });

    const conversationEl = container.createDiv({ cls: "stepvox-conversation" });
    conversationEl.createEl("p", {
      text: "Press the hotkey or say the wake word to start.",
      cls: "stepvox-empty-state",
    });
  }

  async onClose(): Promise<void> {}

  setPipelineState(state: PipelineState): void {
    this.pipelineState = state;
  }

  addEntry(entry: ConversationEntry): void {
    this.conversation.push(entry);
  }
}
