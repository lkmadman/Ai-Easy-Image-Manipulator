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
}

export interface ApiError {
  message: string;
}

export interface PromptSuggestion {
  label: string;
  prompt: string;
}
