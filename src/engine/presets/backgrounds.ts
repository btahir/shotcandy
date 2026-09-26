/**
 * Curated background library for the picker. Pure data; the design team is
 * expected to tune these to the final identity.
 */
import type { BackgroundFill } from "../scene/types";

export interface BackgroundPreset {
  id: string;
  label: string;
  fill: BackgroundFill;
}

const lin = (angle: number, ...colors: string[]): BackgroundFill => ({
  kind: "linear",
  angle,
  stops: colors.map((color, i) => ({
    offset: colors.length === 1 ? 0 : i / (colors.length - 1),
    color,
  })),
});

export const GRADIENT_PRESETS: readonly BackgroundPreset[] = [
  { id: "peach", label: "Peach", fill: lin(135, "#ffd3a5", "#fd6585") },
  { id: "candy", label: "Candy", fill: lin(135, "#ffb38a", "#ff6f91") },
  { id: "lagoon", label: "Lagoon", fill: lin(135, "#a8edea", "#5fb6d9") },
  { id: "lilac", label: "Lilac", fill: lin(135, "#e0c3fc", "#8ec5fc") },
  { id: "citrus", label: "Citrus", fill: lin(135, "#fdfc9b", "#f6a04d") },
  { id: "mint", label: "Mint", fill: lin(135, "#d4fc79", "#96e6a1") },
  { id: "dusk", label: "Dusk", fill: lin(160, "#43347a", "#e76f8b", "#ffb88c") },
  { id: "ocean", label: "Ocean", fill: lin(135, "#2e3192", "#1bffff") },
  { id: "berry", label: "Berry", fill: lin(135, "#8e2de2", "#f45c9b") },
  { id: "ember", label: "Ember", fill: lin(135, "#f83600", "#f9d423") },
  { id: "forest", label: "Forest", fill: lin(135, "#134e5e", "#71b280") },
  { id: "slate", label: "Slate", fill: lin(180, "#434a57", "#1f232b") },
  { id: "cloud", label: "Cloud", fill: lin(180, "#fdfbfb", "#e6e9f0") },
  { id: "sand", label: "Sand", fill: lin(135, "#f5e6d3", "#e3c5a8") },
  {
    id: "night",
    label: "Night",
    fill: {
      kind: "radial",
      cx: 0.5,
      cy: 0.1,
      radius: 1.2,
      stops: [
        { offset: 0, color: "#3a3f7a" },
        { offset: 1, color: "#0b0d1f" },
      ],
    },
  },
  {
    id: "halo",
    label: "Halo",
    fill: {
      kind: "radial",
      cx: 0.5,
      cy: 0.5,
      radius: 1,
      stops: [
        { offset: 0, color: "#fff5e6" },
        { offset: 0.6, color: "#ffc4a3" },
        { offset: 1, color: "#ff8a8a" },
      ],
    },
  },
  {
    id: "prism",
    label: "Prism",
    fill: {
      kind: "conic",
      cx: 0.5,
      cy: 0.5,
      angle: 0,
      stops: [
        { offset: 0, color: "#ff9a9e" },
        { offset: 0.33, color: "#fad0c4" },
        { offset: 0.66, color: "#a1c4fd" },
        { offset: 1, color: "#ff9a9e" },
      ],
    },
  },
];

export const MESH_PRESETS: readonly BackgroundPreset[] = [
  {
    id: "aurora",
    label: "Aurora",
    fill: {
      kind: "mesh",
      base: "#e9e4ff",
      points: [
        { x: 0.1, y: 0.1, color: "#a78bfa", radius: 0.55 },
        { x: 0.9, y: 0.15, color: "#5eead4", radius: 0.5 },
        { x: 0.75, y: 0.95, color: "#f0abfc", radius: 0.55 },
        { x: 0.1, y: 0.9, color: "#93c5fd", radius: 0.5 },
      ],
    },
  },
  {
    id: "sherbet",
    label: "Sherbet",
    fill: {
      kind: "mesh",
      base: "#fff1e6",
      points: [
        { x: 0.05, y: 0.2, color: "#ffb4a2", radius: 0.55 },
        { x: 0.95, y: 0.1, color: "#ffd6a5", radius: 0.5 },
        { x: 0.8, y: 0.9, color: "#ff8fab", radius: 0.55 },
        { x: 0.2, y: 0.95, color: "#fdffb6", radius: 0.45 },
      ],
    },
  },
  {
    id: "lagoon-mesh",
    label: "Lagoon",
    fill: {
      kind: "mesh",
      base: "#e0f7f4",
      points: [
        { x: 0.1, y: 0.1, color: "#67e8f9", radius: 0.5 },
        { x: 0.9, y: 0.2, color: "#a7f3d0", radius: 0.5 },
        { x: 0.85, y: 0.9, color: "#60a5fa", radius: 0.55 },
        { x: 0.15, y: 0.85, color: "#c4b5fd", radius: 0.5 },
      ],
    },
  },
  {
    id: "velvet",
    label: "Velvet",
    fill: {
      kind: "mesh",
      base: "#1a1033",
      points: [
        { x: 0.1, y: 0.15, color: "#7c3aed", radius: 0.5 },
        { x: 0.9, y: 0.1, color: "#db2777", radius: 0.45 },
        { x: 0.8, y: 0.95, color: "#2563eb", radius: 0.55 },
        { x: 0.15, y: 0.9, color: "#0f172a", radius: 0.5 },
      ],
    },
  },
  {
    id: "meadow",
    label: "Meadow",
    fill: {
      kind: "mesh",
      base: "#f3fbe8",
      points: [
        { x: 0.1, y: 0.1, color: "#bef264", radius: 0.5 },
        { x: 0.9, y: 0.25, color: "#fde68a", radius: 0.5 },
        { x: 0.7, y: 0.95, color: "#6ee7b7", radius: 0.55 },
        { x: 0.1, y: 0.9, color: "#a5f3fc", radius: 0.45 },
      ],
    },
  },
  {
    id: "ember-mesh",
    label: "Ember",
    fill: {
      kind: "mesh",
      base: "#2a0f0a",
      points: [
        { x: 0.15, y: 0.1, color: "#f97316", radius: 0.5 },
        { x: 0.9, y: 0.2, color: "#e11d48", radius: 0.5 },
        { x: 0.8, y: 0.95, color: "#facc15", radius: 0.45 },
        { x: 0.1, y: 0.9, color: "#7c2d12", radius: 0.5 },
      ],
    },
  },
];

export const SOLID_PRESETS: readonly string[] = [
  "#ffffff",
  "#f4f4f5",
  "#fef3c7",
  "#fde2e4",
  "#dbeafe",
  "#dcfce7",
  "#ede9fe",
  "#111827",
  "#000000",
];
