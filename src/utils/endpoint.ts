/**
 * Construct StepFun API endpoint based on region and mode
 */
function getStepFunEndpoint(
  region: "china" | "global",
  mode: "api" | "plan",
  service: string
): string {
  const domain = region === "china" ? "stepfun.com" : "stepfun.ai";
  const prefix = mode === "plan" ? "step_plan/" : "";
  return `https://api.${domain}/${prefix}v1/${service}`;
}

/**
 * Get endpoint for ASR service
 */
export function getASREndpoint(
  region: "china" | "global",
  mode: "api" | "plan"
): string {
  return getStepFunEndpoint(region, mode, "audio/asr/sse");
}

/**
 * Get endpoint for TTS service
 */
export function getTTSEndpoint(
  region: "china" | "global",
  mode: "api" | "plan"
): string {
  return getStepFunEndpoint(region, mode, "audio/speech");
}

/**
 * Get endpoint for LLM chat completions
 */
export function getChatEndpoint(
  region: "china" | "global",
  mode: "api" | "plan"
): string {
  return getStepFunEndpoint(region, mode, "chat/completions");
}
