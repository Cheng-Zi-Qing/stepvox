import type { Plugin } from "obsidian";
import type { PipelineState } from "../types";

const STATE_LABELS: Record<PipelineState, string> = {
  idle: "🎙️ Ready",
  listening: "🔴 Listening...",
  transcribing: "✍️ Transcribing...",
  thinking: "🧠 Thinking...",
  speaking: "🔊 Speaking...",
};

export class StatusBarWidget {
  private el: HTMLElement;
  private state: PipelineState = "idle";

  constructor(plugin: Plugin) {
    this.el = plugin.addStatusBarItem();
    this.el.addClass("stepvox-statusbar");
    this.render();
  }

  setState(state: PipelineState): void {
    this.state = state;
    this.render();
  }

  private render(): void {
    this.el.setText(STATE_LABELS[this.state]);
  }
}
