
import React, { useEffect, useState } from 'react';

interface LoadingSpinnerProps {
  message?: string; // Optional override, though we mostly use internal rotation now
}

const PHRASES = [
  "Creating your masterpiece...",
  "Applying AI magic...",
  "Polishing every pixel...",
  "Designing brilliance...",
  "Enhancing details...",
  "Perfecting colors...",
  "Crafting visual excellence..."
];

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = () => {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % PHRASES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center z-50 animate-in fade-in duration-500">
      <div className="relative w-32 h-32 mb-8">
        {/* Elegant Gradient Ring */}
        <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-yellow-400 border-r-orange-500 animate-spin [animation-duration:1.5s]"></div>
        
        {/* Inner Glow */}
        <div className="absolute inset-0 rounded-full shadow-[0_0_30px_rgba(250,204,21,0.2)]"></div>
        
        {/* Center Sparkle */}
        <div className="absolute inset-0 flex items-center justify-center animate-pulse">
           <svg className="w-8 h-8 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24">
             <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
           </svg>
        </div>
      </div>
      
      <div className="h-8 overflow-hidden relative w-full text-center">
        {PHRASES.map((phrase, idx) => (
          <p 
            key={idx}
            className={`absolute w-full text-xl font-light tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 transition-all duration-700 ease-in-out transform ${
              idx === phraseIndex 
                ? 'opacity-100 translate-y-0 scale-100' 
                : 'opacity-0 translate-y-4 scale-95'
            }`}
          >
            {phrase}
          </p>
        ))}
      </div>
      
      <p className="text-xs text-slate-500 mt-4 uppercase tracking-[0.2em] animate-pulse">Processing</p>
    </div>
  );
};
