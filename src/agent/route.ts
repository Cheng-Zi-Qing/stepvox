import { TOOL_DEFINITIONS } from "./tools";
import type { ToolDefinition } from "../providers";

const QUERY_KEYWORDS = ["读", "看", "查", "找", "有什么", "哪些", "显示", "列出", "当前", "打开", "是什么", "内容"];
const MUTATE_KEYWORDS = ["写", "建", "创建", "改", "更新", "加", "添加", "记", "修改", "删", "移动", "重命名", "新建"];
const EXTERNAL_KEYWORDS = ["网上", "搜一下", "查一下", "网络", "互联网", "上网查", "网上查"];

const QUERY_TOOLS = new Set(["read_file", "list_files", "search", "get_properties", "get_active_file", "open_file"]);
const MUTATE_TOOLS = new Set(["create_file", "append", "prepend", "update_content", "set_property"]);
const EXTERNAL_TOOLS = new Set(["web_search"]);
const ALWAYS_TOOLS = new Set(["read_memory", "update_memory"]);

export function routeTools(input: string): ToolDefinition[] {
  const matched = new Set<string>();

  for (const kw of QUERY_KEYWORDS) {
    if (input.includes(kw)) { QUERY_TOOLS.forEach((t) => matched.add(t)); break; }
  }
  for (const kw of MUTATE_KEYWORDS) {
    if (input.includes(kw)) { MUTATE_TOOLS.forEach((t) => matched.add(t)); break; }
  }
  for (const kw of EXTERNAL_KEYWORDS) {
    if (input.includes(kw)) { EXTERNAL_TOOLS.forEach((t) => matched.add(t)); break; }
  }

  ALWAYS_TOOLS.forEach((t) => matched.add(t));

  return TOOL_DEFINITIONS.filter((t) => matched.has(t.name));
}
