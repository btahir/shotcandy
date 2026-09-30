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

// Multi-screen layouts (screen 0 is the content; extra screens live in scene.slots)
export {
  LAYOUTS,
  LAYOUT_IDS,
  MAX_SCREENS,
  getLayoutDef,
  resolveParams,
  activeLayout,
  screenContent,
  type LayoutDef,
  type LayoutParamDef,
  type ActiveLayout,
} from "./scene/layouts";
export {
  setLayout,
  setLayoutParam,
  setScreenCount,
  fillSlot,
  fillEmptySlots,
  swapSlots,
  clearSlot,
  placeScreen,
  screenSlot,
  screenCount,
  shownScreens,
  emptySlots,
} from "./scene/slots";

// Layout and geometry
export {
  computeLayout,
  computeCardGeometry,
  contentUnits,
  contentToCanvas,
  canvasToContent,
  hitContent,
  notesRect,
  outputSize,
  referenceSide,
  effectiveCrop,
  upscaleFactor,
  CONTENT_UNITS,
  MAX_CANVAS_SIDE,
  TALL_THRESHOLD,
  type SceneLayout,
  type CardGeometry,
} from "./layout/layout";
export {
  computeGroupLayout,
  balanceSizes,
  fanPositions,
  GROUP_MAX_SIDE,
  type GroupLayout,
  type SlotLayout,
  type Placement,
} from "./layout/group";
export {
  captionLayout,
  captionActive,
  DEFAULT_CAPTION,
  type CaptionLayout,
  type CaptionBlock,
} from "./layout/caption";
export {
  REDACT_ON_DARK,
  REDACT_ON_LIGHT,
  redactAutoFill,
  sourceAdvice,
  surroundLightness,
  themeForLightness,
  topBandLightness,
  type SourceAdvice,
} from "./analysis/tone";
export type { Point, Size, Rect, Radii } from "./math/geometry";

// Rendering
export {
  renderScene,
  renderToCanvas,
  layoutScene,
  layoutGroupScene,
  slotRects,
  slotAt,
  slotScene,
  scenePalette,
  resolveFrameTheme,
  type RenderOptions,
  type RenderResult,
  type SlotRect,
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

// Text measurement (content kinds made of text)
export {
  measureText,
  wrapText,
  setMeasureEnvironment,
  clearTextMeasureCache,
  measureGeneration,
} from "./render/measure";

// Code images
export { codeLayout, codeLines, codeTokensKey, type CodeLayout } from "./code/render";
export {
  CODE_THEMES,
  CODE_CATEGORIES,
  getCodeTheme,
  categoryColor,
  type CodeTheme,
  type CodeCategory,
} from "./code/themes";
export {
  CODE_LANGUAGES,
  detectLanguage,
  resolveLanguage,
  getCodeLanguage,
  type CodeLanguage,
} from "./code/languages";
export {
  CODE_STYLES,
  getCodeStyle,
  codeStylePatch,
  SAMPLE_CODE,
  type CodeStyle,
} from "./code/presets";

// Post and testimonial cards
export { postLayout, initials, richRuns, type PostLayout } from "./post/render";
export {
  POST_THEMES,
  POST_STYLES,
  getPostTheme,
  getPostStyle,
  samplePost,
  type PostTheme,
  type PostStyle,
} from "./post/themes";

// App Store screenshot sets (packing lives in appstore/pack.ts: import it lazily)
export {
  createSet,
  createSetTemplate,
  slideScene,
  normalizeSet,
  setCanvasSize,
  newSlideId,
  headlineWidth,
  headlineLineCount,
  reservedTextHeight,
  orientationMismatch,
  deviceCrop,
  isTabletSize,
  APPSTORE_SIZES,
  SET_STYLES,
  SET_MIN_SLIDES,
  SET_MAX_SLIDES,
  getSetStyle,
  type AppStoreSet,
  type AppStoreSlide,
  type SetText,
  type SetStyle,
} from "./appstore/set";

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
  withVideoFrame,
  type AssetResolver,
  type AssetSource,
  type AssetImage,
} from "./assets/types";
export { AssetLibrary } from "./assets/library";
export {
  BUILTIN_PREFIX,
  isBuiltinAssetId,
  builtinAssetUrl,
  fetchBuiltinAsset,
} from "./assets/builtin";
export {
  ACCEPT_ATTRIBUTE,
  ACCEPT_IMAGES,
  ACCEPTED_MIME,
  ACCEPTED_VIDEO_MIME,
  isVideoFile,
  sniffVideoKind,
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

// Screen recordings (the importer and exporter load Mediabunny on demand)
export {
  AUDIO_ENCODE_BITRATE,
  GIF_CLIP_WARN_SECONDS,
  MAX_CLIP_SECONDS,
  MAX_STORED_VIDEO_BYTES,
  MAX_VIDEO_BYTES,
  MIN_CLIP_SECONDS,
  STILL_MOTION_ID,
  audioPlan,
  clipLength,
  createClip,
  formatClipTime,
  isVideoScene,
  motionTimeInClip,
  sceneClip,
  sourceTime,
  timelineDuration,
  trimClip,
  type AudioPlan,
} from "./video/clip";
export { videoAssetId, videoIdForBytes } from "./video/id";
export type { VideoInfo } from "./video/import";
import type { importVideo as ImportVideo } from "./video/import";

/** Open a screen recording (loads the demuxer on first use). */
export async function importVideo(
  ...args: Parameters<typeof ImportVideo>
): ReturnType<typeof ImportVideo> {
  return (await import("./video/import")).importVideo(...args);
}

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
export {
  STYLE_PRESETS,
  STYLE_FAMILIES,
  STYLE_BASE,
  DEFAULT_STYLE_ID,
  getStylePreset,
  completeStylePatch,
  type StylePreset,
} from "./presets/styles";
export {
  SHADOW_PRESETS,
  getShadowPreset,
  resolveShadowLayers,
  type ShadowPreset,
} from "./presets/shadows";
export {
  BACKGROUND_PRESETS,
  BACKGROUND_GROUPS,
  GRADIENT_PRESETS,
  MESH_PRESETS,
  WALLPAPER_PRESETS,
  SOLID_PRESETS,
  getBackgroundPreset,
  type BackgroundPreset,
  type BackgroundGroup,
} from "./presets/backgrounds";

export {
  GRADIENT_TYPES,
  GRADIENT_ANGLES,
  MIN_STOPS,
  MAX_STOPS,
  toGradientEdit,
  fromGradientEdit,
  setStopCount,
  normalizeStops,
  colorAt,
  shuffleMesh,
  hueShiftFill,
  paletteStopSuggestions,
  type GradientEdit,
  type GradientType,
} from "./presets/gradient";

// Export
export {
  EXPORT_FORMATS,
  EXPORT_SCALES,
  MIME_TYPES,
  FILE_EXTENSIONS,
  maxExportScale,
  exportScaleCap,
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
export { Exporter, supportsWorkerExport, type ExporterOptions } from "./export/client";
export {
  formatFilename,
  sanitizeFilename,
  DEFAULT_FILENAME_PATTERN,
  type FilenameVars,
} from "./export/filename";
export { copyImageToClipboard, canCopyImages, ClipboardUnavailableError } from "./export/clipboard";

// Animation (timeline, motion presets, animated export client).
// Encoders are reached only via the worker or a dynamic import.
export {
  evaluateScene,
  evaluateFrame,
  motionFrame,
  motionReference,
  createAnimation,
  frameCount,
  frameTime,
  gifDelays,
  revealAnnotations,
} from "./animation/timeline";
export {
  registerMotionPreset,
  getMotionPreset,
  listMotionPresets,
  driftFill,
  scrollViewport,
} from "./animation/presets";
export { EASING_LABELS, cubicBezier, getEasing } from "./animation/easing";
export type { MotionContext, MotionFrame, MotionPreset } from "./animation/types";
export {
  planAnimation,
  videoBitrate,
  extrapolateVideoBytes,
  extrapolateGifBytes,
  roughAnimationBytes,
  GIF_AREA_EXPONENT,
  MIME_BY_FORMAT,
  GIF_MAX_FPS,
  AnimationCancelledError,
  type AnimationFormat,
  type AnimationQuality,
  type AnimationExportOptions,
  type AnimationExportResult,
  type AnimationPlan,
  type AnimationProgress,
  type GifColors,
} from "./animation/plan";
export {
  AnimationExporter,
  canEncodeFormat,
  canEncodeVideo,
  isAbortError,
  type AnimationRun,
} from "./animation/client";

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
export { collectKeepIds, patchAssetIds, type KeepSources } from "./storage/keep";
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
