// Compatibility shim. The canonical tool definitions live in
// `src/agent/tools/` (see D55). This file re-exports from there so existing
// consumers (orchestrator, executor, tests) keep working without churn.
// New code should import directly from `./tools/index` (or just `./tools`
// once this shim is removed in a future cleanup).

import type { ToolDefinition } from "../providers";
import {
  TOOL_REGISTRY,
  getToolByName as registryGetToolByName,
  getToolLayer as registryGetToolLayer,
} from "./tools/index";

export type { Tool, ToolContext, ToolLayer, ToolServices } from "./tools/index";

export const TOOL_DEFINITIONS: ToolDefinition[] = TOOL_REGISTRY.map((t) => ({
  name: t.name,
  description: t.description,
  parameters: t.parameters,
}));

export const getToolLayer = registryGetToolLayer;
export const getToolByName = registryGetToolByName;
