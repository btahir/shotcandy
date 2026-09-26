/**
 * Shotcandy engine: public API.
 *
 * Framework-free, deterministic, worker-safe. The UI imports only from here.
 */

// Scene model
export * from "./scene/types";
export { createScene, createAnnotation, DEFAULT_CARD, DEFAULT_BACKGROUND } from "./scene/defaults";
export { normalizeScene, type NormalizeResult } from "./scene/normalize";
export {
  loadScene,
  createMigrator,
  sceneMigrator,
  SCENE_MIGRATIONS,
  MigrationError,
  type MigrationStep,
  type Migrator,
} from "./scene/migrate";
export {
  applyStylePatch,
  extractStylePatch,
  deepMerge,
  setIn,
  getIn,
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
  sceneAssetIds,
} from "./scene/patch";

// Layout and geometry
export {
  computeLayout,
  computeCardGeometry,
  contentUnits,
  contentToCanvas,
  canvasToContent,
  hitContent,
  outputSize,
  CONTENT_UNITS,
  MAX_CANVAS_SIDE,
  type SceneLayout,
  type CardGeometry,
} from "./layout/layout";
export type { Point, Size, Rect, Radii } from "./math/geometry";

// Rendering
export {
  renderScene,
  renderToCanvas,
  layoutScene,
  scenePalette,
  type RenderOptions,
  type RenderResult,
} from "./render/render";
export { RenderCache } from "./render/cache";
export {
  defaultEnvironment,
  type RenderEnvironment,
  type CanvasLike,
  type Ctx2D,
  type ImageLike,
} from "./render/env";
export { registerFont, getFont, listFonts, type FontDefinition } from "./render/fonts";
export {
  registerContentRenderer,
  getContentRenderer,
  type ContentRenderer,
} from "./render/content";

// Frames
export {
  registerFrame,
  registerFrameKind,
  resolveFrame,
  listFrames,
  getFrameSpec,
} from "./frames/registry";
export type * from "./frames/types";

// Assets and input
export {
  MapAssetResolver,
  EMPTY_ASSETS,
  pickImage,
  type AssetResolver,
  type AssetSource,
  type AssetImage,
} from "./assets/types";
export { AssetLibrary } from "./assets/library";
export {
  ACCEPT_ATTRIBUTE,
  ACCEPTED_MIME,
  ImportError,
  type ImportErrorCode,
  imageFromClipboardEvent,
  imageFromDataTransfer,
  dragHasFiles,
  readClipboardImage,
  sniffImageKind,
  validateImageBytes,
} from "./input/input";
export {
  importImage,
  assetIdForBytes,
  paletteFromImage,
  DEFAULT_PROXY_SIDE,
  MAX_INPUT_PIXELS,
  type ImportedImage,
} from "./input/import";

// Palette
export { extractPalette, type Palette, type Swatch } from "./palette/extract";
export { suggestBackgrounds, suggestMixed, resolveAutoFill } from "./palette/suggest";
export { quantize } from "./palette/quantize";

// Presets
export {
  SIZE_PRESETS,
  getSizePreset,
  rotateSize,
  type SizePreset,
  type SizeGroup,
} from "./presets/sizes";
export { STYLE_PRESETS, getStylePreset, type StylePreset } from "./presets/styles";
export {
  SHADOW_PRESETS,
  getShadowPreset,
  resolveShadowLayers,
  type ShadowPreset,
} from "./presets/shadows";
export {
  GRADIENT_PRESETS,
  MESH_PRESETS,
  SOLID_PRESETS,
  type BackgroundPreset,
} from "./presets/backgrounds";

// Export
export {
  EXPORT_FORMATS,
  EXPORT_SCALES,
  MIME_TYPES,
  FILE_EXTENSIONS,
  maxExportScale,
  detectCanvasLimits,
  canvasToBlob,
  type ExportFormat,
  type ExportOptions,
  type CanvasLimits,
} from "./export/formats";
export {
  exportScene,
  exportWithResolver,
  decodeAssets,
  type ExportAsset,
  type ExportResult,
} from "./export/export";
export { Exporter, supportsWorkerExport, createExportWorker } from "./export/client";
export {
  formatFilename,
  sanitizeFilename,
  DEFAULT_FILENAME_PATTERN,
  type FilenameVars,
} from "./export/filename";
export { copyImageToClipboard, canCopyImages, ClipboardUnavailableError } from "./export/clipboard";

// Project files and storage
export {
  createProjectFile,
  serializeProject,
  parseProject,
  projectToBlob,
  PROJECT_EXTENSION,
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  PROJECT_MIME,
  ProjectError,
  type ProjectFile,
  type LoadedProject,
} from "./project/project";
export { openStore, createMemoryStore } from "./storage/memory";
export { createIndexedDBStore } from "./storage/idb";
export type * from "./storage/types";

// Colour helpers useful to UI pickers
export {
  parseColor,
  normalizeColor,
  toHex,
  toCss,
  mixColors,
  contrastRatio,
  isDark,
  colorToOklch,
  oklchToHex,
} from "./math/color";
