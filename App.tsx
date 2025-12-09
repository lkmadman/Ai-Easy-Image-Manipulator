import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, RotateCcw, RotateCw, Wand2, Download, Eraser, Scan, 
  ImagePlus, Sparkles, Scissors, History, ChevronDown, Check,
  Palette, Layers, Sun, Zap, Mic, Shirt, Image as ImageIcon, Briefcase, Camera,
  User, Car, ShoppingBag, PawPrint, Mountain, MoreHorizontal, Tag, Box,
  Eye, Monitor, EyeOff, LayoutTemplate, Brush, AlertTriangle, XCircle, Move,
  Type as TypeIcon, FileText, WifiOff, HelpCircle, X, Moon, Grid, Instagram, Share2, Plus, ArrowRight,
  Smile, UserCheck, Droplet, Crown, CloudSun, Snowflake, Sunset, MonitorPlay, Coins, 
  Smartphone, Aperture, Layout, Palette as PaletteIcon
} from 'lucide-react';
import { ImageEditor, ImageEditorHandle } from './components/ImageEditor';
import { LoadingSpinner } from './components/LoadingSpinner';
import { fileToBase64, cropImage, applyAlphaMask, downloadImage } from './utils/imageUtils';
import { editImageWithGemini, analyzeSelection, generateSegmentationMask, analyzeGlobalImage } from './services/geminiService';
import { HistoryItem, SelectionBox, EditMode, PromptSuggestion, ExportFormat, GlobalAnalysisResult, TextOverlay, AppError, BatchItem, AppTheme, EditTab } from './types';

function App() {
  const [theme, setTheme] = useState<AppTheme>('dark');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<EditMode>(EditMode.VIEW);
  const [activeTab, setActiveTab] = useState<EditTab>(EditTab.CORE);
  
  const [is3DMode, setIs3DMode] = useState(false);
  const [showMask, setShowMask] = useState(false);
  const [compareToggle, setCompareToggle] = useState(false); 

  // Batch & Queue
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([]);
  const [isBatchMode, setIsBatchMode] = useState(false);

  // Error & Offline State
  const [errorState, setErrorState] = useState<AppError | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showHelp, setShowHelp] = useState(false);

  // Analysis State
  const [isAnalyzingGlobal, setIsAnalyzingGlobal] = useState(false);
  const [globalAnalysis, setGlobalAnalysis] = useState<GlobalAnalysisResult | null>(null);

  // Selection & Reference State
  const [currentSelection, setCurrentSelection] = useState<SelectionBox | null>(null);
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [identifiedInfo, setIdentifiedInfo] = useState<{label: string, material: string, color: string}>({ label: "", material: "", color: "" });
  
  // Style Reference
  const [styleReference, setStyleReference] = useState<string | null>(null);

  // Cleanup Mode State
  const [isCleanupMode, setIsCleanupMode] = useState(false);

  // Text Mode State
  const [textOverlay, setTextOverlay] = useState<TextOverlay | null>(null);

  // UI State
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<ImageEditorHandle>(null);

  // Computed current image
  const currentImage = currentIndex >= 0 ? history[currentIndex].dataUrl : null;
  const compareImage = currentIndex > 0 ? history[currentIndex - 1].dataUrl : (history[0]?.dataUrl || null);
  const activeCompare = compareToggle;

  // Listen for system theme preference
  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      setTheme('light');
    }
  }, []);

  // Offline Listeners
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Global Analysis
  useEffect(() => {
     if (history.length === 1 && currentIndex === 0 && !globalAnalysis && !isAnalyzingGlobal) {
        performGlobalAnalysis(history[0].dataUrl);
     }
  }, [history, currentIndex]);

  const handleError = (error: any, retryAction?: () => void) => {
      console.error(error);
      const msg = error.message || "Something went wrong.";
      const isSafety = msg.includes("safety") || msg.includes("filters") || msg.includes("IMAGE_OTHER") || msg.includes("recitation") || msg.includes("copyright");
      
      setErrorState({
          title: isSafety ? "Content Filtered" : "Oops!",
          message: isSafety 
            ? "This edit was blocked by safety or copyright filters. Please try a different prompt or image." 
            : msg.includes("500") ? "Our AI artists are currently overwhelmed. Please try again." : msg,
          retry: retryAction
      });
  };

  const performGlobalAnalysis = async (base64: string) => {
    setIsAnalyzingGlobal(true);
    try {
        const result = await analyzeGlobalImage(base64);
        setGlobalAnalysis(result);
        // Auto-switch tabs based on category
        if (result?.category === 'Human') setActiveTab(EditTab.PORTRAIT);
        if (result?.category === 'Product') setActiveTab(EditTab.PRODUCT);
    } catch(e) {
        console.warn("Analysis failed silently");
    } finally {
        setIsAnalyzingGlobal(false);
    }
  };

  // Identification Logic
  useEffect(() => {
    const identify = async () => {
      if (!currentImage || !currentSelection) {
        setSuggestions([]);
        setIdentifiedInfo({ label: "", material: "", color: "" });
        return;
      }
      if (isCleanupMode) {
          setIdentifiedInfo({ label: "Selection", material: "", color: "" });
          setSuggestions([{ label: "Confirm Removal", prompt: "Remove the selected object and fill the background seamlessly" }]);
          return;
      }
      setIsIdentifying(true);
      try {
        const crop = await cropImage(currentImage, currentSelection);
        const info = await analyzeSelection(crop);
        setIdentifiedInfo(info);
        // generateSuggestions(info.label, info.material); // Deprecated in favor of UI buttons
      } catch (e) {
        console.error("Identification error", e);
      } finally {
        setIsIdentifying(false);
      }
    };
    const timer = setTimeout(identify, 500);
    return () => clearTimeout(timer);
  }, [currentImage, currentSelection, isCleanupMode]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      if (e.target.files.length > 1) {
          // Batch upload
          const newQueue: BatchItem[] = [];
          for (let i = 0; i < e.target.files.length; i++) {
              const file = e.target.files[i];
              try {
                  const base64 = await fileToBase64(file);
                  newQueue.push({ id: `img-${Date.now()}-${i}`, file, previewUrl: base64, status: 'pending' });
              } catch (e) {}
          }
          setBatchQueue(newQueue);
          setIsBatchMode(true);
          // Load first image to editor
          setHistory([{ dataUrl: newQueue[0].previewUrl, timestamp: Date.now() }]);
          setCurrentIndex(0);
      } else if (e.target.files[0]) {
        const file = e.target.files[0];
        try {
          const base64 = await fileToBase64(file);
          setHistory([{ dataUrl: base64, timestamp: Date.now() }]);
          setCurrentIndex(0);
          setPrompt("");
          setMode(EditMode.VIEW);
          setCurrentSelection(null);
          setSuggestions([]);
          setGlobalAnalysis(null); 
          setStyleReference(null);
          setIsCleanupMode(false);
          setTextOverlay(null);
          setBatchQueue([]);
          setIsBatchMode(false);
          setActiveTab(EditTab.CORE);
        } catch (err) {
          handleError(err);
        }
      }
    }
  };

  const handleStyleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          try {
              const base64 = await fileToBase64(e.target.files[0]);
              setStyleReference(base64);
              setPrompt(prev => prev + " Apply the style from the reference image.");
          } catch(err) {
              handleError(err);
          }
      }
  };

  const handleUndo = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setCurrentSelection(null);
      setTextOverlay(null);
    }
  };

  const handleRedo = () => {
    if (currentIndex < history.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setCurrentSelection(null);
      setTextOverlay(null);
    }
  };

  const handleGenerate = async (forcedPrompt?: string, invertMask: boolean = false) => {
    const promptToUse = forcedPrompt || prompt;
    if (!currentImage || !promptToUse.trim()) return;

    if (isOffline) {
        setErrorState({ title: "No Connection", message: "You are offline. Check your internet connection." });
        return;
    }

    setIsProcessing(true);
    const execute = async () => {
        try {
            let maskBase64: string | undefined = undefined;
            if (currentSelection && editorRef.current) {
                const m = editorRef.current.getMaskDataUrl();
                if (m) maskBase64 = m;
            }
            const resultBase64 = await editImageWithGemini(
                currentImage, 
                promptToUse, 
                maskBase64, 
                invertMask,
                styleReference || undefined
            );
            const newItem: HistoryItem = {
                dataUrl: resultBase64,
                timestamp: Date.now(),
                prompt: promptToUse
            };
            const newHistory = [...history.slice(0, currentIndex + 1), newItem];
            setHistory(newHistory);
            setCurrentIndex(newHistory.length - 1);
            setMode(EditMode.VIEW);
            setCurrentSelection(null);
            setPrompt("");
            setIsCleanupMode(false);
        } catch (error) {
            handleError(error, () => handleGenerate(promptToUse, invertMask));
        } finally {
            setIsProcessing(false);
        }
    };
    execute();
  };

  const handleAddTextMode = (presetText?: string, presetColor?: string) => {
      setMode(EditMode.TEXT);
      setTextOverlay({
          text: presetText || "Double click to edit",
          x: 100,
          y: 100,
          color: presetColor || "#ffffff",
          fontSize: 60,
          fontFamily: "sans-serif",
          fontWeight: "bold",
          shadowBlur: 4,
          shadowColor: "black"
      });
      setIsCleanupMode(false);
      setCurrentSelection(null);
  };

  const handleApplyText = () => {
      if (!editorRef.current) return;
      const canvasUrl = editorRef.current.getCanvasDataUrl();
      if (canvasUrl) {
          const newItem: HistoryItem = {
              dataUrl: canvasUrl,
              timestamp: Date.now(),
              prompt: "Add text overlay"
          };
          const newHistory = [...history.slice(0, currentIndex + 1), newItem];
          setHistory(newHistory);
          setCurrentIndex(newHistory.length - 1);
          setMode(EditMode.VIEW);
          setTextOverlay(null);
      }
  };

  const handleRemoveWatermark = () => {
      setMode(EditMode.SELECT);
      setIsCleanupMode(true);
      setPrompt("Reconstruct the background in the selected area to seamlessly remove text and watermarks");
  };

  const handleDownload = () => {
    if (!currentImage) return;
    downloadImage(currentImage, `nano-edit-${Date.now()}`, exportFormat);
  };

  const appendToPrompt = (text: string) => setPrompt(prev => prev.trim() ? prev.trim() + ". " + text : text);

  // --- TAB RENDERERS ---

  const renderCoreTab = () => (
      <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
          <div>
              <h3 className="panel-title">Essential Tools</h3>
              <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setMode(EditMode.SELECT); setIsCleanupMode(false); }} className={`tool-btn-lg ${mode === EditMode.SELECT && !isCleanupMode ? 'active' : ''}`}>
                      <Scan className="w-5 h-5 mb-1" /> <span className="text-[10px]">Select</span>
                  </button>
                  <button onClick={() => { setMode(EditMode.SELECT); setIsCleanupMode(true); setPrompt("Remove object"); }} className={`tool-btn-lg ${isCleanupMode ? 'active-red' : ''}`}>
                      <Eraser className="w-5 h-5 mb-1" /> <span className="text-[10px]">Cleanup</span>
                  </button>
                  <button onClick={() => handleAddTextMode()} className={`tool-btn-lg ${mode === EditMode.TEXT ? 'active-blue' : ''}`}>
                      <TypeIcon className="w-5 h-5 mb-1" /> <span className="text-[10px]">Add Text</span>
                  </button>
                  <button onClick={handleRemoveWatermark} className="tool-btn-lg hover:bg-red-500/10 hover:text-red-400">
                      <WifiOff className="w-5 h-5 mb-1" /> <span className="text-[10px]">Del Text</span>
                  </button>
              </div>
          </div>
          
          <div>
              <h3 className="panel-title flex items-center gap-2"><Sparkles className="w-3 h-3 text-yellow-500"/> Selection Actions</h3>
              <p className="text-[10px] text-gray-400 mb-2">Select an area first to enable</p>
              <div className="grid grid-cols-1 gap-2">
                 <button disabled={!currentSelection} onClick={() => handleGenerate("Remove background from selection", false)} className="tool-row-btn disabled:opacity-50">
                    <Scissors className="w-4 h-4"/> Remove BG (Select)
                 </button>
                 <button disabled={!currentSelection} onClick={() => handleGenerate("Keep only the selection and remove everything else", true)} className="tool-row-btn disabled:opacity-50">
                    <UserCheck className="w-4 h-4"/> Extract Object
                 </button>
              </div>
          </div>
      </div>
  );

  const renderPortraitTab = () => (
      <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
          <div>
              <h3 className="panel-title flex items-center gap-2"><User className="w-3 h-3 text-pink-400"/> Portrait Studio</h3>
              <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => appendToPrompt("Retouch skin to look smooth and natural, removing blemishes while keeping texture")} className="tool-chip bg-pink-500/10 text-pink-500 border-pink-500/20">
                      <Smile className="w-3 h-3"/> Smooth Skin
                  </button>
                  <button onClick={() => appendToPrompt("Enhance teeth whiteness naturally")} className="tool-chip bg-blue-500/10 text-blue-500 border-blue-500/20">
                      <Sparkles className="w-3 h-3"/> Whiten Teeth
                  </button>
                  <button onClick={() => appendToPrompt("Apply professional studio lighting with soft shadows")} className="tool-chip bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                      <Zap className="w-3 h-3"/> Studio Light
                  </button>
                  <button onClick={() => appendToPrompt("Improve posture and alignment for a professional look")} className="tool-chip bg-green-500/10 text-green-500 border-green-500/20">
                      <UserCheck className="w-3 h-3"/> Fix Pose
                  </button>
              </div>
          </div>

          <div>
             <h3 className="panel-title flex items-center gap-2"><Briefcase className="w-3 h-3 text-purple-400"/> Wardrobe & Style</h3>
             <div className="space-y-2">
                 <button onClick={() => appendToPrompt("Change clothing to professional business suit and tie")} className="tool-row-btn">
                     <Briefcase className="w-4 h-4"/> Business Attire
                 </button>
                 <button onClick={() => appendToPrompt("Change clothing to casual chic outfit")} className="tool-row-btn">
                     <Shirt className="w-4 h-4"/> Casual Chic
                 </button>
                 <button onClick={() => appendToPrompt("Change hair color to blonde")} className="tool-row-btn">
                     <PaletteIcon className="w-4 h-4"/> Blonde Hair
                 </button>
                 <button onClick={() => appendToPrompt("Add elegant jewelry accessories")} className="tool-row-btn">
                     <Crown className="w-4 h-4"/> Add Jewelry
                 </button>
             </div>
          </div>
      </div>
  );

  const renderCreativeTab = () => (
      <div className="space-y-5 animate-in fade-in slide-in-from-left-4 duration-300">
          
          {/* Style Reference */}
          <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-slate-700">
              <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <Palette className="w-3 h-3"/> Style Reference
              </h3>
              <div className="flex items-center gap-2">
                  <div className="w-12 h-12 bg-gray-200 dark:bg-slate-700 rounded overflow-hidden flex-shrink-0 border border-gray-300 dark:border-slate-600">
                      {styleReference ? <img src={styleReference} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">None</div>}
                  </div>
                  <button onClick={() => styleInputRef.current?.click()} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition">
                      Upload Ref
                  </button>
                  <input type="file" ref={styleInputRef} onChange={handleStyleUpload} className="hidden" accept="image/*"/>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Upload an image to copy its color tone and vibe.</p>
          </div>

          {/* Backgrounds */}
          <div>
              <h3 className="panel-title">Backgrounds & Scenes</h3>
              <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => handleGenerate("Replace background with a sunny beach scene", false)} className="tool-chip">
                      <CloudSun className="w-3 h-3"/> Summer
                  </button>
                  <button onClick={() => handleGenerate("Replace background with a snowy winter scene", false)} className="tool-chip">
                      <Snowflake className="w-3 h-3"/> Winter
                  </button>
                  <button onClick={() => handleGenerate("Replace background with a modern urban street with depth of field blur", false)} className="tool-chip">
                      <Sunset className="w-3 h-3"/> Urban
                  </button>
                  <button onClick={() => handleGenerate("Replace background with a professional gradient studio backdrop", false)} className="tool-chip">
                      <MonitorPlay className="w-3 h-3"/> Studio
                  </button>
              </div>
          </div>

          {/* Color Grading */}
          <div>
              <h3 className="panel-title">Color Grading</h3>
              <div className="space-y-2">
                  <button onClick={() => appendToPrompt("Apply cinematic color grading with teal and orange tones")} className="tool-row-btn">
                      <Aperture className="w-4 h-4"/> Cinematic Teal/Orange
                  </button>
                  <button onClick={() => appendToPrompt("Apply moody, high contrast black and white style")} className="tool-row-btn">
                      <Layout className="w-4 h-4"/> Moody B&W
                  </button>
                  <button onClick={() => appendToPrompt("Enhance image with vibrant colors and warm lighting")} className="tool-row-btn">
                      <Sun className="w-4 h-4"/> Vibrant Warmth
                  </button>
              </div>
          </div>
          
          <button onClick={() => appendToPrompt("Transform into an oil painting style")} className="w-full py-2 border border-purple-500/30 text-purple-500 rounded text-xs hover:bg-purple-500/10 transition">
              Artistic Style Transfer
          </button>
      </div>
  );

  const renderProductTab = () => (
      <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
           <div>
              <h3 className="panel-title flex items-center gap-2"><ShoppingBag className="w-3 h-3 text-green-500"/> E-Commerce Tools</h3>
              <div className="grid grid-cols-1 gap-2">
                 <button onClick={() => handleGenerate("Remove background and leave pure white", false)} className="tool-row-btn">
                    <Scissors className="w-4 h-4"/> White Background
                 </button>
                 <button onClick={() => appendToPrompt("Add soft reflection and shadow at the bottom")} className="tool-row-btn">
                    <Droplet className="w-4 h-4"/> Reflection & Shadow
                 </button>
                 <button onClick={() => appendToPrompt("Enhance product texture and sharpness for high quality catalog")} className="tool-row-btn">
                    <Sparkles className="w-4 h-4"/> Texture Enhance
                 </button>
              </div>
          </div>

          <div>
              <h3 className="panel-title">Price Tags & Badges</h3>
              <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => handleAddTextMode("$99.99", "#000000")} className="tool-chip justify-center">
                      <Tag className="w-3 h-3"/> Price Tag
                  </button>
                  <button onClick={() => handleAddTextMode("SALE", "#ef4444")} className="tool-chip justify-center text-red-500 border-red-200">
                      <Coins className="w-3 h-3"/> Sale Badge
                  </button>
                  <button onClick={() => handleAddTextMode("NEW", "#facc15")} className="tool-chip justify-center text-yellow-600 border-yellow-200">
                      <Sparkles className="w-3 h-3"/> New Arrival
                  </button>
                  <button onClick={() => handleAddTextMode("50% OFF", "#3b82f6")} className="tool-chip justify-center text-blue-500 border-blue-200">
                      <Tag className="w-3 h-3"/> Discount
                  </button>
              </div>
          </div>

          <div>
             <h3 className="panel-title">Virtual Try-On (Beta)</h3>
             <p className="text-[10px] text-gray-400 mb-2">Select a clothing item first.</p>
             <button disabled={!currentSelection} onClick={() => appendToPrompt("Change material to silk")} className="tool-row-btn mb-2 disabled:opacity-50">
                 Swap to Silk
             </button>
             <button disabled={!currentSelection} onClick={() => appendToPrompt("Change material to denim")} className="tool-row-btn disabled:opacity-50">
                 Swap to Denim
             </button>
          </div>
      </div>
  );

  const renderLeftPanel = () => (
      <aside className="w-80 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 flex flex-col z-20 overflow-y-auto transition-colors">
          
          {/* Navigation Tabs */}
          <div className="flex border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950">
              <button onClick={() => setActiveTab(EditTab.CORE)} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition border-b-2 ${activeTab === EditTab.CORE ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900' : 'border-transparent text-gray-500 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-900'}`}>Core</button>
              <button onClick={() => setActiveTab(EditTab.PORTRAIT)} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition border-b-2 ${activeTab === EditTab.PORTRAIT ? 'border-pink-500 text-pink-600 dark:text-pink-400 bg-white dark:bg-slate-900' : 'border-transparent text-gray-500 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-900'}`}>Portrait</button>
              <button onClick={() => setActiveTab(EditTab.CREATIVE)} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition border-b-2 ${activeTab === EditTab.CREATIVE ? 'border-purple-500 text-purple-600 dark:text-purple-400 bg-white dark:bg-slate-900' : 'border-transparent text-gray-500 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-900'}`}>Create</button>
              <button onClick={() => setActiveTab(EditTab.PRODUCT)} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition border-b-2 ${activeTab === EditTab.PRODUCT ? 'border-green-500 text-green-600 dark:text-green-400 bg-white dark:bg-slate-900' : 'border-transparent text-gray-500 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-900'}`}>Shop</button>
          </div>

          <div className="p-4 flex-1">
              
              {/* Batch Queue */}
              {isBatchMode && batchQueue.length > 0 && (
                  <div className="mb-4">
                      <h3 className="panel-title flex items-center gap-2">
                          <Layers className="w-3 h-3"/> Batch Queue
                      </h3>
                      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                          {batchQueue.map((item, idx) => (
                              <button key={item.id} onClick={() => { setHistory([{dataUrl: item.previewUrl, timestamp: Date.now()}]); setCurrentIndex(0); }} className="relative flex-shrink-0 w-12 h-12 rounded overflow-hidden border border-slate-700 hover:border-yellow-400 transition-all hover:scale-105">
                                  <img src={item.previewUrl} className="w-full h-full object-cover"/>
                              </button>
                          ))}
                          <button onClick={() => batchInputRef.current?.click()} className="flex-shrink-0 w-12 h-12 rounded border border-dashed border-slate-600 flex items-center justify-center hover:bg-slate-800"><Plus className="w-4 h-4 text-slate-400"/></button>
                      </div>
                      <input type="file" ref={batchInputRef} multiple className="hidden" onChange={handleUpload}/>
                  </div>
              )}

              {/* Dynamic Tab Content */}
              {activeTab === EditTab.CORE && renderCoreTab()}
              {activeTab === EditTab.PORTRAIT && renderPortraitTab()}
              {activeTab === EditTab.CREATIVE && renderCreativeTab()}
              {activeTab === EditTab.PRODUCT && renderProductTab()}

              {/* Context Smart Info */}
              {globalAnalysis && (
                  <div className="mt-6 pt-4 border-t border-gray-100 dark:border-slate-800">
                      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Detected Scene</h3>
                      <div className="flex flex-wrap gap-1">
                          <span className="text-[10px] bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded text-gray-500">{globalAnalysis.category}</span>
                          <span className="text-[10px] bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded text-gray-500">{globalAnalysis.scene}</span>
                          {globalAnalysis.tags.slice(0, 3).map(t => <span key={t} className="text-[10px] bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded text-gray-500">{t}</span>)}
                      </div>
                  </div>
              )}

              {/* Text Editor (Shared across tabs if text is active) */}
              {mode === EditMode.TEXT && textOverlay && (
                  <div className="mt-6 bg-gray-100 dark:bg-slate-800 rounded-lg p-3 animate-in slide-in-from-bottom">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">Text Editor</h3>
                        <button onClick={() => {setMode(EditMode.VIEW); setTextOverlay(null);}} className="text-gray-400 hover:text-red-400"><X className="w-3 h-3"/></button>
                      </div>
                      <input 
                          value={textOverlay.text} 
                          onChange={e => setTextOverlay({...textOverlay, text: e.target.value})}
                          className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded p-2 text-sm mb-2 text-gray-900 dark:text-gray-100"
                      />
                      <div className="grid grid-cols-2 gap-2 mb-2">
                          <input type="color" value={textOverlay.color} onChange={e => setTextOverlay({...textOverlay, color: e.target.value})} className="h-8 w-full rounded cursor-pointer" />
                          <select 
                            value={textOverlay.fontWeight} 
                            onChange={e => setTextOverlay({...textOverlay, fontWeight: e.target.value})}
                            className="bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded p-1 text-xs text-gray-900 dark:text-gray-100"
                          >
                              <option value="normal">Normal</option>
                              <option value="bold">Bold</option>
                              <option value="italic">Italic</option>
                          </select>
                      </div>
                      <button onClick={handleApplyText} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-1.5 rounded text-xs">Apply</button>
                  </div>
              )}
          </div>
      </aside>
  );

  const renderRightPanel = () => (
      <aside className="w-64 bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-800 flex flex-col z-20 p-4 transition-colors">
          <div className="space-y-6">
              
              {/* Finish & Export */}
              <div>
                  <h3 className="panel-title flex items-center gap-2">
                      <Download className="w-3 h-3"/> Finish & Export
                  </h3>
                  
                  <div className="space-y-3">
                      <div className="space-y-1">
                          <label className="text-[10px] text-gray-400 uppercase">Format</label>
                          <div className="flex bg-gray-100 dark:bg-slate-800 rounded p-1">
                              {(['png', 'jpeg', 'webp'] as const).map(fmt => (
                                  <button
                                    key={fmt}
                                    onClick={() => setExportFormat(fmt)}
                                    className={`flex-1 text-xs py-1 rounded capitalize transition ${exportFormat === fmt ? 'bg-white dark:bg-slate-600 shadow text-blue-500 dark:text-blue-300 font-bold' : 'text-gray-500 hover:text-gray-700 dark:text-slate-400'}`}
                                  >
                                      {fmt}
                                  </button>
                              ))}
                          </div>
                      </div>

                      <div className="space-y-1">
                         <label className="text-[10px] text-gray-400 uppercase">Social Presets</label>
                         <div className="grid grid-cols-2 gap-2">
                             <button onClick={() => appendToPrompt("Crop to square aspect ratio for Instagram")} className="social-btn"><Instagram className="w-3 h-3"/> IG Post</button>
                             <button onClick={() => appendToPrompt("Crop to 9:16 aspect ratio for Story")} className="social-btn"><Smartphone className="w-3 h-3"/> Story</button>
                         </div>
                      </div>
                      
                      <button 
                         onClick={() => appendToPrompt("Enhance resolution, make it 4k, high fidelity")} 
                         className="w-full py-2 bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20 rounded hover:bg-purple-500/20 text-xs font-medium flex items-center justify-center gap-2"
                      >
                         <Sparkles className="w-3 h-3"/> Upscale (Enhance)
                      </button>

                      <div className="pt-4 border-t border-gray-200 dark:border-slate-800">
                          <button onClick={handleDownload} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02]">
                              <Download className="w-4 h-4"/> Export Image
                          </button>
                      </div>
                  </div>
              </div>

              {/* Global Prompt */}
              <div className="pt-2">
                 <h3 className="panel-title">Prompt</h3>
                 <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={isCleanupMode ? "Describe what to remove..." : "Describe edit..."}
                    className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-300 dark:border-slate-700 rounded-lg p-3 text-sm focus:border-yellow-400 outline-none resize-none h-24 mb-2 text-gray-900 dark:text-gray-100"
                 />
                 <button
                    onClick={() => handleGenerate(undefined, false)}
                    disabled={!prompt || isProcessing}
                    className="w-full bg-yellow-400 hover:bg-yellow-500 text-slate-900 font-bold py-2 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                    {isProcessing ? "Processing..." : <><Wand2 className="w-4 h-4" /> Generate</>}
                 </button>
              </div>
          </div>
      </aside>
  );

  return (
    <div className={`flex flex-col h-screen w-full transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-950 text-slate-200' : 'bg-gray-50 text-gray-900'}`}>
      
      {/* Offline Banner */}
      {isOffline && (
          <div className="bg-red-500 text-white text-xs font-bold text-center py-1 flex items-center justify-center gap-2">
              <WifiOff className="w-3 h-3" /> You are currently offline
          </div>
      )}

      {/* Error Modal */}
      {errorState && (
          <div className="absolute inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl p-6 max-w-sm w-full animate-in fade-in zoom-in duration-300">
                  <div className="flex items-center gap-2 text-red-500 dark:text-red-400 mb-2">
                      <AlertTriangle className="w-6 h-6" />
                      <h3 className="font-bold text-lg">{errorState.title}</h3>
                  </div>
                  <p className="text-gray-600 dark:text-slate-300 text-sm mb-4">{errorState.message}</p>
                  <div className="flex gap-2">
                      {errorState.retry && (
                          <button onClick={() => { errorState.retry?.(); setErrorState(null); }} className="flex-1 bg-yellow-400 hover:bg-yellow-500 text-slate-900 font-bold py-2 rounded">Retry</button>
                      )}
                      <button onClick={() => setErrorState(null)} className="flex-1 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-900 dark:text-white font-bold py-2 rounded">Dismiss</button>
                  </div>
              </div>
          </div>
      )}

      {/* Help Modal */}
      {showHelp && (
          <div className="absolute inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowHelp(false)}>
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl p-6 max-w-2xl w-full h-[80vh] overflow-y-auto animate-in fade-in zoom-in duration-300 relative" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setShowHelp(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-white"><X className="w-6 h-6"/></button>
                  <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2"><HelpCircle className="w-6 h-6 text-yellow-500"/> Help Center</h2>
                  
                  <div className="space-y-6">
                      <section>
                          <h3 className="text-lg font-bold mb-2 text-blue-500">Feature Guide</h3>
                          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 dark:text-slate-300">
                              <div>
                                  <strong className="block text-gray-900 dark:text-white mb-1">Portrait Studio</strong>
                                  Retouch skin, whiten teeth, fix poses, or change outfits to business attire.
                              </div>
                              <div>
                                  <strong className="block text-gray-900 dark:text-white mb-1">Creative Mode</strong>
                                  Change backgrounds to summer/winter, apply cinematic color grading, or use style references.
                              </div>
                              <div>
                                  <strong className="block text-gray-900 dark:text-white mb-1">E-Commerce</strong>
                                  Remove backgrounds, add price tags, and enhance product textures.
                              </div>
                              <div>
                                  <strong className="block text-gray-900 dark:text-white mb-1">Style Reference</strong>
                                  Upload an image in the Creative tab to copy its color palette and mood.
                              </div>
                          </div>
                      </section>
                  </div>
              </div>
          </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 z-50 shrink-0 transition-colors">
         <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-yellow-400/20">
                <Wand2 className="w-5 h-5 text-slate-900" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Nano<span className="text-yellow-500 font-light">Edit</span></h1>
         </div>
         <div className="flex items-center gap-4">
             <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="header-icon-btn" title="Toggle Theme">
                 {theme === 'dark' ? <Sun className="w-5 h-5"/> : <Moon className="w-5 h-5"/>}
             </button>
             <button onClick={() => setShowHelp(true)} className="header-icon-btn" title="Help">
                 <HelpCircle className="w-5 h-5"/>
             </button>
             <div className="h-6 w-px bg-gray-200 dark:bg-slate-800"></div>
             <button onClick={handleUndo} disabled={currentIndex <= 0} className="header-icon-btn" title="Undo"><RotateCcw className="w-5 h-5"/></button>
             <button onClick={handleRedo} disabled={currentIndex >= history.length - 1} className="header-icon-btn" title="Redo"><RotateCw className="w-5 h-5"/></button>
         </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 flex overflow-hidden">
          
          {/* Left Panel: Tools */}
          {renderLeftPanel()}

          {/* Center Panel: Canvas */}
          <div className="flex-1 relative bg-gray-100 dark:bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] dark:bg-slate-950 transition-colors flex flex-col">
             
             {/* Empty State */}
             {!currentImage && (
                 <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                     <div className="bg-white dark:bg-slate-900/50 backdrop-blur p-8 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-xl text-center pointer-events-auto cursor-pointer transition transform hover:scale-105" onClick={() => fileInputRef.current?.click()}>
                         <div className="w-16 h-16 bg-blue-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                             <Upload className="w-8 h-8 text-blue-500 dark:text-blue-400"/>
                         </div>
                         <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Upload Image</h2>
                         <p className="text-gray-500 dark:text-slate-400 text-sm mb-4">Drag & drop or click to browse</p>
                         <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium">Select File</button>
                     </div>
                 </div>
             )}

             {isProcessing && <LoadingSpinner />}
             
             <div className="flex-1 relative">
                <ImageEditor 
                    ref={editorRef}
                    imageDataUrl={currentImage}
                    mode={mode}
                    onSelectionChange={setCurrentSelection}
                    isProcessing={isProcessing}
                    showMask={showMask}
                    compareImageDataUrl={activeCompare ? compareImage : null}
                    textOverlay={textOverlay}
                    onTextChange={setTextOverlay}
                    enable3D={is3DMode}
                />
             </div>

             {/* Canvas Floating Controls */}
             {currentImage && (
                 <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/90 dark:bg-slate-800/90 backdrop-blur px-4 py-2 rounded-full shadow-xl border border-gray-200 dark:border-slate-700 z-10">
                     <button onClick={() => setCompareToggle(!compareToggle)} className={`icon-toggle ${compareToggle ? 'active' : ''}`} title="Compare">
                         <LayoutTemplate className="w-5 h-5"/>
                     </button>
                     <div className="w-px h-4 bg-gray-300 dark:bg-slate-600"></div>
                     <button onClick={() => { setIs3DMode(!is3DMode); setMode(EditMode.VIEW); }} className={`icon-toggle ${is3DMode ? 'active' : ''}`} title="3D View">
                         <Box className="w-5 h-5"/>
                     </button>
                 </div>
             )}
          </div>

          {/* Right Panel: Export */}
          {currentImage && renderRightPanel()}
      </main>

      {/* Hidden File Inputs */}
      <input type="file" ref={fileInputRef} onChange={handleUpload} accept="image/*" className="hidden" />
      
      <style>{`
        .header-icon-btn { @apply p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition disabled:opacity-30; }
        .panel-title { @apply text-xs font-bold text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-3; }
        .tool-btn-lg { @apply flex flex-col items-center justify-center p-3 rounded-lg bg-gray-50 dark:bg-slate-800 border border-transparent hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-300 transition h-20 w-full; }
        .tool-btn-lg.active { @apply bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/50 text-blue-600 dark:text-blue-400; }
        .tool-btn-lg.active-red { @apply bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/50 text-red-600 dark:text-red-400; }
        .tool-btn-lg.active-blue { @apply bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/50 text-indigo-600 dark:text-indigo-400; }
        .tool-chip { @apply flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-slate-800 border border-transparent rounded-lg text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:border-gray-300 dark:hover:border-slate-600 transition; }
        .tool-row-btn { @apply w-full flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-slate-800 border border-transparent hover:border-gray-300 dark:hover:border-slate-700 text-xs font-medium text-gray-700 dark:text-slate-300 transition; }
        .social-btn { @apply flex items-center justify-center gap-2 p-2 bg-gray-100 dark:bg-slate-800 rounded text-xs text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700; }
        .icon-toggle { @apply p-2 rounded-full text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition; }
        .icon-toggle.active { @apply text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

export default App;