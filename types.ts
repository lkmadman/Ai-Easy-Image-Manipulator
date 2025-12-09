
export interface SelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface HistoryItem {
  dataUrl: string; // Base64 image
  timestamp: number;
  prompt?: string;
}

export enum EditMode {
  VIEW = 'VIEW',
  SELECT = 'SELECT', // Default box selection
  MAGIC_WAND = 'MAGIC_WAND', // Point selection
  CAPTION = 'CAPTION', // Click to Caption
  ERASE = 'ERASE',   // Refine mask
  TEXT = 'TEXT',     // Add Text mode
  INSPECT = 'INSPECT', // Image Inspection (Zoom/Pan)
  REFERENCE_EDIT = 'REFERENCE_EDIT' // Editing the reference image itself
}

export type CaptionTone = 'funny' | 'angry';

export enum EditTab {
  CORE = 'CORE',
  PORTRAIT = 'PORTRAIT',
  CREATIVE = 'CREATIVE',
  PRODUCT = 'PRODUCT',
  REVIEW = 'REVIEW'
}

export type InspectorOverlay = 'none' | 'grid' | 'exposure';

export interface ApiError {
  message: string;
}

export interface PromptSuggestion {
  label: string;
  prompt: string;
  icon?: any;
}

export type ExportFormat = 'png' | 'jpeg' | 'webp';

export interface ExportConfig {
  format: ExportFormat;
  quality: number;
  scale: number; // 1, 2, 4
  upscale: boolean;
  filename: string;
}

export type ImageCategory = 'Human' | 'Vehicle' | 'Product' | 'Animal' | 'Landscape' | 'Other';

export interface GlobalAnalysisResult {
  category: ImageCategory;
  scene: string;
  confidence: number;
  tags: string[];
  suggestions: PromptSuggestion[];
  anomalies: string[];
}

export interface TextOverlay {
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  fontFamily: string;
  fontWeight?: string;
  shadowColor?: string;
  shadowBlur?: number;
  isDragging?: boolean;
}

export interface ReferenceSubject {
  id: string;
  url: string; // The cutout image
  label: string; // e.g., "Saree", "Car"
  opacity: number;
  x: number; 
  y: number;
  scale: number;
  rotation: number;
  visible: boolean;
  zOrder: number;
  isDragging?: boolean;
}

export interface AppError {
  title: string;
  message: string;
  retry?: () => void;
  isFatal?: boolean;
}

export interface BatchItem {
  id: string;
  file: File;
  previewUrl: string;
  status: 'pending' | 'processing' | 'done' | 'error';
}

export type AppTheme = 'dark' | 'light';

// New types for Structured Prompt Builder
export type PromptTask = 'Inspect' | 'Overlay' | 'Retouch' | 'Scene' | 'Export';

export interface PromptBuilderState {
  task: PromptTask;
  subject: string;
  intent: string;
  modifiers: string[]; // List of selected style/material modifiers
  controls: Record<string, any>;
  sectionsOpen: {
      overlay: boolean;
      scene: boolean;
      inspection: boolean;
  };
}
