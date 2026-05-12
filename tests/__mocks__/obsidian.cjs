// Test-only mock for the `obsidian` package.
// The real obsidian package ships only TypeScript declarations (`main: ""`),
// so any `import { App, TFile, TFolder, ... } from "obsidian"` blows up at
// runtime under bun/node test runners. This stub provides empty class
// shells sufficient for `instanceof` checks and type imports during tests.
// At build time, esbuild marks `obsidian` as external (esbuild.config.mjs)
// and Obsidian itself injects the real implementation at plugin load.

class TAbstractFile {}
class TFile extends TAbstractFile {}
class TFolder extends TAbstractFile {}
class App {}
class Plugin {}
class PluginSettingTab {}
class Notice {}
class Setting {}
class Modal {}
class ItemView {}
class WorkspaceLeaf {}
class Vault {}

module.exports = {
  TAbstractFile,
  TFile,
  TFolder,
  App,
  Plugin,
  PluginSettingTab,
  Notice,
  Setting,
  Modal,
  ItemView,
  WorkspaceLeaf,
  Vault,
};
