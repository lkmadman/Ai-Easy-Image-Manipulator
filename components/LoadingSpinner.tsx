import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message = "Processing..." }) => {
  return (
    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-50">
      <Loader2 className="w-12 h-12 text-yellow-400 animate-spin mb-4" />
      <p className="text-lg font-medium text-slate-200 animate-pulse">{message}</p>
      <p className="text-xs text-slate-400 mt-2">Powered by Gemini Nano Banana</p>
    </div>
  );
};
