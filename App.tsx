import React, { useState, useRef, useEffect } from 'react';
import { Upload, RotateCcw, RotateCw, Wand2, Download, Eraser, Scan, ImagePlus, Sparkles, Scissors } from 'lucide-react';
import { ImageEditor, ImageEditorHandle } from './components/ImageEditor';
import { LoadingSpinner } from './components/LoadingSpinner';
import { fileToBase64, cropImage, applyAlphaMask } from './utils/imageUtils';
import { editImageWithGemini, identifyObject, generateSegmentationMask } from './services/geminiService';
import { HistoryItem, SelectionBox, EditMode, PromptSuggestion } from './types';

function App() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<EditMode>(EditMode.VIEW);
  
  // Selection State
  const [currentSelection, setCurrentSelection] = useState<SelectionBox | null>(null);
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [identifiedLabel, setIdentifiedLabel] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<ImageEditorHandle>(null);

  // Computed current image
  const currentImage = currentIndex >= 0 ? history[currentIndex].dataUrl : null;

  // Identification Logic
  useEffect(() => {
    const identify = async () => {
      if (!currentImage || !currentSelection) {
        setSuggestions([]);
        setIdentifiedLabel("");
        return;
      }

      setIsIdentifying(true);
      try {
        const crop = await cropImage(currentImage, currentSelection);
        const label = await identifyObject(crop);
        const cleanLabel = label.toLowerCase().replace(/[^\w\s]/gi, '');
        
        setIdentifiedLabel(cleanLabel);
        generateSuggestions(cleanLabel);
      } catch (e) {
        console.error("Identification error", e);
      } finally {
        setIsIdentifying(false);
      }
    };
    
    // Debounce slightly to avoid rapid calls if user adjusts box
    const timer = setTimeout(identify, 500);
    return () => clearTimeout(timer);
  }, [currentImage, currentSelection]);

  const generateSuggestions = (label: string) => {
    const s: PromptSuggestion[] = [];
    if (label.includes("hair")) {
      s.push({ label: "Curly Black", prompt: "Change hair to curly black" });
      s.push({ label: "Blonde", prompt: "Dye hair blonde" });
      s.push({ label: "Red", prompt: "Dye hair red" });
      s.push({ label: "Pixie Cut", prompt: "Change hair to a short pixie cut" });
    } else if (label.includes("shirt") || label.includes("cloth") || label.includes("jacket") || label.includes("top") || label.includes("dress")) {
      s.push({ label: "Red Jacket", prompt: "Change clothes to a red leather jacket" });
      s.push({ label: "Blue Suit", prompt: "Change clothes to a blue suit" });
      s.push({ label: "Floral Pattern", prompt: "Add a floral pattern to the clothes" });
    } else if (label.includes("hand") || label.includes("finger")) {
      s.push({ label: "Add Ring", prompt: "Add a gold ring on the finger" });
      s.push({ label: "Gloves", prompt: "Put leather gloves on the hands" });
    } else if (label.includes("face") || label.includes("head")) {
      s.push({ label: "Sunglasses", prompt: "Add sunglasses to the face" });
      s.push({ label: "Smile", prompt: "Make the person smile" });
    } else if (label.includes("sky")) {
      s.push({ label: "Sunset", prompt: "Change sky to a sunset" });
      s.push({ label: "Starry Night", prompt: "Change sky to a starry night" });
    } else {
      // Fallback generics
      s.push({ label: "Remove Object", prompt: "Remove the selected object and fill background" });
      s.push({ label: "Recolor Blue", prompt: `Change the color of the ${label || 'object'} to blue` });
      s.push({ label: "Sketch Style", prompt: "Turn the selected area into a pencil sketch" });
    }
    setSuggestions(s);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const base64 = await fileToBase64(file);
        setHistory([{ dataUrl: base64, timestamp: Date.now() }]);
        setCurrentIndex(0);
        setPrompt("");
        setMode(EditMode.VIEW);
        setCurrentSelection(null);
        setSuggestions([]);
      } catch (err) {
        console.error("Failed to load image", err);
      }
    }
  };

  const handleUndo = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setCurrentSelection(null);
    }
  };

  const handleRedo = () => {
    if (currentIndex < history.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setCurrentSelection(null);
    }
  };

  const handleRemoveBackground = async () => {
    if (!currentImage || !currentSelection) return;
    
    setIsProcessing(true);
    try {
      // 1. Crop
      const cropBase64 = await cropImage(currentImage, currentSelection);
      
      // 2. Generate Mask
      const label = identifiedLabel || 'object';
      const maskBase64 = await generateSegmentationMask(cropBase64, label);
      
      // 3. Apply Mask
      const transparentImage = await applyAlphaMask(cropBase64, maskBase64);
      
      // 4. Update History
      const newItem: HistoryItem = {
        dataUrl: transparentImage,
        timestamp: Date.now(),
        prompt: `Remove background of ${label}`
      };
      
      const newHistory = [...history.slice(0, currentIndex + 1), newItem];
      setHistory(newHistory);
      setCurrentIndex(newHistory.length - 1);
      setMode(EditMode.VIEW);
      setCurrentSelection(null);

    } catch (error) {
      console.error(error);
      alert("Failed to remove background");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerate = async () => {
    if (!currentImage || !prompt.trim()) return;

    setIsProcessing(true);
    try {
      // Get mask from editor if selection exists
      let maskBase64: string | undefined = undefined;
      
      // If we have a selection box, we assume the user wants to use the mask.
      if (currentSelection && editorRef.current) {
         const m = editorRef.current.getMaskDataUrl();
         if (m) maskBase64 = m;
      }

      const resultBase64 = await editImageWithGemini(currentImage, prompt, maskBase64);

      const newItem: HistoryItem = {
        dataUrl: resultBase64,
        timestamp: Date.now(),
        prompt: prompt
      };

      const newHistory = [...history.slice(0, currentIndex + 1), newItem];
      setHistory(newHistory);
      setCurrentIndex(newHistory.length - 1);
      setMode(EditMode.VIEW);
      setCurrentSelection(null); // Clear selection after generate

    } catch (error) {
      alert("Error generating edit: " + (error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!currentImage) return;
    const link = document.createElement('a');
    link.href = currentImage;
    link.download = `nano-edit-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const applyPreset = (text: string) => {
    setPrompt(text);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-200">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center">
             <Wand2 className="w-5 h-5 text-slate-900" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">Nano<span className="text-yellow-400">Edit</span></h1>
        </div>

        <div className="flex items-center gap-3">
           <button 
            onClick={handleUndo} 
            disabled={currentIndex <= 0 || isProcessing}
            className="p-2 hover:bg-slate-800 rounded-full disabled:opacity-30 transition"
            title="Undo"
           >
             <RotateCcw className="w-5 h-5" />
           </button>
           <button 
            onClick={handleRedo} 
            disabled={currentIndex >= history.length - 1 || isProcessing}
            className="p-2 hover:bg-slate-800 rounded-full disabled:opacity-30 transition"
            title="Redo"
           >
             <RotateCw className="w-5 h-5" />
           </button>
           <div className="w-px h-6 bg-slate-800 mx-1"></div>
           <button 
             onClick={handleDownload}
             disabled={!currentImage}
             className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium transition disabled:opacity-50"
           >
             <Download className="w-4 h-4" /> Export
           </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Left Toolbar / Sidebar */}
        <aside className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col z-10 shadow-xl">
          <div className="p-6 flex-1 overflow-y-auto">
            
            {/* Upload Section */}
            <div className="mb-8">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleUpload} 
                accept="image/*" 
                className="hidden" 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-32 border-2 border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-yellow-400/50 hover:bg-slate-800/50 transition group"
              >
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center group-hover:bg-slate-700 transition">
                  <ImagePlus className="w-5 h-5 text-slate-400 group-hover:text-yellow-400" />
                </div>
                <span className="text-sm font-medium text-slate-400 group-hover:text-slate-300">
                  {currentImage ? "Replace Image" : "Upload Image"}
                </span>
              </button>
            </div>

            {/* Tools Section */}
            {currentImage && (
              <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
                
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                    Tools
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => { setMode(EditMode.SELECT); }}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border transition ${mode === EditMode.SELECT ? 'bg-yellow-400/10 border-yellow-400/50 text-yellow-400' : 'bg-slate-800 border-transparent hover:bg-slate-700 text-slate-300'}`}
                      title="Draw Box"
                    >
                      <Scan className="w-5 h-5 mb-1" />
                      <span className="text-[10px]">Select</span>
                    </button>
                     <button
                      onClick={() => { setMode(EditMode.ERASE); }}
                      disabled={!currentSelection}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border transition ${mode === EditMode.ERASE ? 'bg-red-400/10 border-red-400/50 text-red-400' : 'bg-slate-800 border-transparent hover:bg-slate-700 text-slate-300 disabled:opacity-30'}`}
                      title="Refine Mask"
                    >
                      <Eraser className="w-5 h-5 mb-1" />
                      <span className="text-[10px]">Refine</span>
                    </button>
                    <button
                      onClick={() => { setMode(EditMode.VIEW); setCurrentSelection(null); }}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border transition ${mode === EditMode.VIEW ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400' : 'bg-slate-800 border-transparent hover:bg-slate-700 text-slate-300'}`}
                      title="Edit Whole Image"
                    >
                      <Wand2 className="w-5 h-5 mb-1" />
                      <span className="text-[10px]">Global</span>
                    </button>
                  </div>
                </div>

                {/* Suggestions Section */}
                {currentSelection && (
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                        <Sparkles className="w-3 h-3 text-yellow-400" />
                        {isIdentifying ? "Scanning..." : identifiedLabel ? `Detected: ${identifiedLabel}` : "Suggestions"}
                      </label>
                    </div>
                    
                    {isIdentifying ? (
                       <div className="h-12 flex items-center justify-center">
                         <div className="w-4 h-4 border-2 border-slate-600 border-t-yellow-400 rounded-full animate-spin"></div>
                       </div>
                    ) : (
                      <div className="space-y-2">
                         <button 
                            onClick={handleRemoveBackground}
                            disabled={isProcessing}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-200 border border-slate-600 transition"
                          >
                            <Scissors className="w-3 h-3 text-red-400" />
                            Remove Background
                         </button>
                         <div className="flex flex-wrap gap-2">
                          {suggestions.length > 0 ? suggestions.map((s, i) => (
                             <button 
                               key={i} 
                               onClick={() => applyPreset(s.prompt)} 
                               className="px-2 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-[10px] text-slate-200 border border-slate-600 transition text-left"
                             >
                               {s.label}
                             </button>
                          )) : (
                            <p className="text-xs text-slate-500 italic">Select an object to see quick actions.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                    Prompt
                  </label>
                  <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={currentSelection ? `Describe how to change the ${identifiedLabel || 'selected area'}...` : "Describe how to edit the image..."}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 outline-none resize-none h-24 placeholder:text-slate-600"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={handleGenerate}
                      disabled={!prompt || isProcessing}
                      className="bg-yellow-400 hover:bg-yellow-500 disabled:bg-slate-800 disabled:text-slate-600 text-slate-900 font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition w-full justify-center shadow-lg shadow-yellow-400/10"
                    >
                      {isProcessing ? <span className="animate-pulse">Thinking...</span> : (
                        <>
                          <Wand2 className="w-4 h-4" />
                          Generate Edit
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </div>
            )}
          </div>
        </aside>

        {/* Editor Area */}
        <div className="flex-1 relative bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
          {isProcessing && <LoadingSpinner message="Nano Banana is transforming your image..." />}
          
          <ImageEditor 
            ref={editorRef}
            imageDataUrl={currentImage} 
            mode={mode}
            onSelectionChange={setCurrentSelection}
            isProcessing={isProcessing}
          />

          {/* Floating Action Hint */}
          {currentImage && !currentSelection && mode === EditMode.SELECT && (
             <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/90 text-yellow-400 px-4 py-2 rounded-full text-sm font-medium shadow-xl border border-yellow-400/20 animate-bounce">
                Draw a box around the object you want to edit
             </div>
          )}
        </div>

      </main>
    </div>
  );
}

export default App;