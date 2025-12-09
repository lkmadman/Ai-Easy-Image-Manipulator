
export interface SelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HistoryItem {
  dataUrl: string; // Base64 image
  timestamp: number;
  prompt?: string;
}

export enum EditMode {
  VIEW = 'VIEW',
  SELECT = 'SELECT', // Default box selection
  ERASE = 'ERASE',   // Refine mask
  TEXT = 'TEXT',     // Add Text mode
  INSPECT = 'INSPECT', // Image Inspection (Zoom/Pan)
  REFERENCE = 'REFERENCE' // Reference positioning mode
}

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

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'mp4';

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

export interface ReferenceOverlayState {
  url: string;
  opacity: number;
  x: number; // 0-1 relative to canvas width (screen space for overlay) or image space? Let's use image space relative
  y: number;
  scale: number;
  isDragging?: boolean;
}

export interface QuickLabel {
  id: string;
  text: string;
  x: number; // Image coordinates
  y: number;
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
