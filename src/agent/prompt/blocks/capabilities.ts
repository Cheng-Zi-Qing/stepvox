import type { PromptBlock } from "../types";

export const capabilities: PromptBlock = {
  id: "capabilities",
  editable: false,
  render() {
    return `## Capabilities
- You HEAR the user through speech recognition (ASR).
- You SPEAK to the user through text-to-speech (TTS).
- You are a voice assistant with full audio I/O.`;
  },
};
