
import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, RotateCcw, RotateCw, Wand2, Download, Eraser, Scan, 
  ImagePlus, Sparkles, Scissors, History, ChevronDown, Check,
  Palette, Layers, Sun, Zap, Mic, Shirt, Image as ImageIcon, Briefcase, Camera,
  User, Car, ShoppingBag, PawPrint, Mountain, MoreHorizontal, Tag, Box,
  Eye, Monitor, EyeOff, LayoutTemplate, Brush, AlertTriangle, XCircle, Move,
  Type as TypeIcon, FileText, WifiOff, HelpCircle, X, Moon, Grid, Instagram, Share2, Plus, ArrowRight,
  Smile, UserCheck, Droplet, Crown, CloudSun, Snowflake, Sunset, MonitorPlay, Coins, 
  Smartphone, Aperture, Layout, Palette as PaletteIcon, MessageCircle, Play, ZoomIn, Search, Eye as EyeIcon, 
  Maximize, Activity, AlertCircle, RefreshCw, Pin
} from 'lucide-react';
import { ImageEditor, ImageEditorHandle } from './components/ImageEditor';
import { LoadingSpinner } from './components/LoadingSpinner';
import { fileToBase64, cropImage, applyAlphaMask, downloadImage } from './utils/imageUtils';
import { editImageWithGemini, analyzeSelection, generateSegmentationMask, analyzeGlobalImage, generateSocialCaption, generateVideoFromImage } from './services/geminiService';
import { HistoryItem, SelectionBox, EditMode, PromptSuggestion, ExportFormat, GlobalAnalysisResult, TextOverlay, AppError, BatchItem, AppTheme, EditTab, InspectorOverlay, ReferenceOverlayState, QuickLabel } from './types';

// Preset Scenes
const SCENES = [
  { label: "Luxury Garden", icon: "🌿" },
  { label: "Cyberpunk City", icon: "🌃" },
  { label: "Beach Dawn", icon: "🌅" },
  { label: "City Night Neon", icon: "🌆" },
  { label: "Classic Studio", icon: "📷" },
  { label: "Temple Courtyard", icon: "🏯" },
  { label: "Forest Mist", icon: "🌲" },
  { label: "Desert Sunset", icon: "🏜️" },
  { label: "Royal Hall", icon: "👑" },
  { label: "Minimal Mono", icon: "⚪" },
  { label: "Festive Lights", icon: "✨" },
];

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
  
  // Auto-Fix / Notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Analysis State
  const [isAnalyzingGlobal, setIsAnalyzingGlobal] = useState(false);
  const [globalAnalysis, setGlobalAnalysis] = useState<GlobalAnalysisResult | null>(null);

  // Selection & Reference State
  const [currentSelection, setCurrentSelection] = useState<SelectionBox | null>(null);
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [identifiedInfo, setIdentifiedInfo] = useState<{label: string, material: string, color: string}>({ label: "", material: "", color: "" });
  
  // Style Reference & Overlay
  const [styleReference, setStyleReference] = useState<string | null>(null);
  const [styleRefFeatures, setStyleRefFeatures] = useState<string[]>([]);
  const [referenceOverlay, setReferenceOverlay] = useState<ReferenceOverlayState | null>(null);
  const [showReferenceUI, setShowReferenceUI] = useState(false);

  // Quick Labels
  const [quickLabels, setQuickLabels] = useState<QuickLabel[]>([]);
  const [quickLabelInput, setQuickLabelInput] = useState("");

  // Cleanup Mode State
  const [isCleanupMode, setIsCleanupMode] = useState(false);

  // Text Mode State
  const [textOverlay, setTextOverlay] = useState<TextOverlay | null>(null);

  // Inspector State (Review Tab)
  const [inspectorOverlay, setInspectorOverlay] = useState<InspectorOverlay>('none');
  const [zoomLevel, setZoomLevel] = useState<number | 'fit'>('fit');
  const [qualityIssues, setQualityIssues] = useState<string[] | null>(null);

  // Storytelling State
  const [generatedStory, setGeneratedStory] = useState<string | null>(null);

  // UI State
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
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

  // Workspace Auto-Fix Monitor
  useEffect(() => {
      // 1. Ghost Image Check
      if (history.length === 0 && currentImage) {
          clearMainImage();
          showToast("Workspace Auto-Fixed: Cleared ghost image");
      }
      // 2. Selection Mode Fix
      if (mode === EditMode.SELECT && !currentImage) {
          setMode(EditMode.VIEW);
      }
  }, [history, currentImage, mode]);

  const showToast = (msg: string) => {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 3000);
  };

  const clearMainImage = () => {
      setHistory([]);
      setCurrentIndex(-1);
      setGlobalAnalysis(null);
      setPrompt("");
      setGeneratedStory(null);
      setCurrentSelection(null);
      setStyleReference(null);
      setTextOverlay(null);
      setSuggestions([]);
      setReferenceOverlay(null);
      setQuickLabels([]);
      setIdentifiedInfo({ label: "", material: "", color: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Force canvas clear via ref
      editorRef.current?.forceRedraw();
  };

  const performGlobalAnalysis = async (base64: string) => {
    setIsAnalyzingGlobal(true);
    try {
        const result = await analyzeGlobalImage(base64);
        setGlobalAnalysis(result);
        if (result?.category === 'Human') setActiveTab(EditTab.PORTRAIT);
        if (result?.category === 'Product') setActiveTab(EditTab.PRODUCT);
    } catch(e) {
        console.warn("Analysis failed silently");
    } finally {
        setIsAnalyzingGlobal(false);
    }
  };

  const handleError = (error: any, retry?: () => void) => {
    console.error("App Error:", error);
    const msg = error instanceof Error ? error.message : "An unexpected error occurred";
    setErrorState({
        title: "Error",
        message: msg,
        retry: retry
    });
    showToast(msg);
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
    if (e.target.files && e.target.files[0]) {
        try {
          const base64 = await fileToBase64(e.target.files[0]);
          setHistory([{ dataUrl: base64, timestamp: Date.now() }]);
          setCurrentIndex(0);
          setPrompt("");
          setMode(EditMode.VIEW);
          setCurrentSelection(null);
          setSuggestions([]);
          setGlobalAnalysis(null); 
          setStyleReference(null);
          setStyleRefFeatures([]);
          setIsCleanupMode(false);
          setTextOverlay(null);
          setGeneratedStory(null);
          setBatchQueue([]);
          setIsBatchMode(false);
          setActiveTab(EditTab.CORE);
        } catch (err) {
          handleError(err);
        }
    }
  };

  const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          try {
              const base64 = await fileToBase64(e.target.files[0]);
              setReferenceOverlay({
                  url: base64,
                  opacity: 0.5,
                  x: 0,
                  y: 0,
                  scale: 0.5,
                  isDragging: false
              });
              setMode(EditMode.REFERENCE);
              setShowReferenceUI(true);
          } catch(err) { handleError(err); }
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

  const handleAddQuickLabel = (text: string) => {
      setQuickLabels(prev => [...prev, { id: Date.now().toString(), text, x: 100 + prev.length * 20, y: 100 + prev.length * 20 }]);
      setQuickLabelInput("");
  };

  const handleGenerate = async (forcedPrompt?: string, invertMask: boolean = false) => {
    const promptToUse = forcedPrompt || prompt;
    if (!currentImage || !promptToUse.trim()) return;

    if (isOffline) {
        setErrorState({ title: "No Connection", message: "You are offline." });
        return;
    }

    setIsProcessing(true);
    setGeneratedStory(null);
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
                styleReference || undefined,
                styleRefFeatures
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

  const handleUndo = () => currentIndex > 0 && setCurrentIndex(prev => prev - 1);
  const handleRedo = () => currentIndex < history.length - 1 && setCurrentIndex(prev => prev + 1);
  
  const handleAutoSelect = async (tag: string) => {
      if (!currentImage) return;
      setIsProcessing(true);
      try {
          const maskBase64 = await generateSegmentationMask(currentImage, tag);
          setPrompt(`Selected ${tag}. Describe edit...`);
          const enhanced = await editImageWithGemini(currentImage, `Enhance the appearance of the ${tag}`, maskBase64, false);
           const newItem: HistoryItem = {
              dataUrl: enhanced,
              timestamp: Date.now(),
              prompt: `Auto-Enhanced ${tag}`
            };
            setHistory(prev => [...prev.slice(0, currentIndex + 1), newItem]);
            setCurrentIndex(prev => prev + 1);
      } catch(e) {
          handleError(e);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleStoryGeneration = async (theme: string) => {
      if (!currentImage) return;
      if (isOffline) {
          setErrorState({ title: "No Connection", message: "You are offline." });
          return;
      }
      setIsProcessing(true);
      setGeneratedStory(null);
      try {
          const promptText = `Place the subject in a ${theme} environment. Photorealistic, high quality, consistent lighting.`;
          
          let maskBase64: string | undefined = undefined;
          if (currentSelection && editorRef.current) {
             maskBase64 = editorRef.current.getMaskDataUrl() || undefined;
          }

          const newImageBase64 = await editImageWithGemini(
              currentImage, 
              promptText, 
              maskBase64, 
              false, 
              undefined,
              styleRefFeatures
          );
          
          const caption = await generateSocialCaption(newImageBase64, theme);
          
          const newItem: HistoryItem = {
              dataUrl: newImageBase64,
              timestamp: Date.now(),
              prompt: promptText
          };
          setHistory(prev => [...prev.slice(0, currentIndex + 1), newItem]);
          setCurrentIndex(prev => prev + 1);
          setGeneratedStory(caption); 
          
      } catch (err) {
          handleError(err);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleVirtualModel = async (modelType: string) => {
      if (!currentSelection) {
          handleError({ message: "Please select the clothing item first using the Select tool." });
          return;
      }
      const promptText = `Generate a photorealistic full body ${modelType} model wearing this specific clothing item. The clothing must remain exactly as selected. Generate the rest of the body, face, and a professional studio background.`;
      await handleGenerate(promptText, true); 
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

  const handleDownload = () => { if (currentImage) downloadImage(currentImage, `nano-edit`, exportFormat); };
  const appendToPrompt = (text: string) => setPrompt(prev => prev.trim() ? prev.trim() + ". " + text : text);
  const handleAnalyzeQuality = async () => { if (globalAnalysis) setQualityIssues(globalAnalysis.anomalies); };

  // --- Render Functions ---

  const renderCoreTab = () => (
      <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
           {/* Smart Selection */}
           <div>
              <h3 className="panel-title flex items-center gap-2"><Scan className="w-3 h-3 text-blue-500"/> Smart Selection</h3>
              <p className="text-[10px] text-gray-400 mb-2">Auto-detect and enhance objects</p>
              <div className="flex flex-wrap gap-2">
                  {globalAnalysis ? globalAnalysis.tags.map(tag => (
                      <button 
                        key={tag}
                        onClick={() => handleAutoSelect(tag)}
                        className="text-[10px] bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 hover:border-blue-500 text-slate-600 dark:text-slate-300 px-2 py-1 rounded transition flex items-center gap-1"
                      >
                          <Scan className="w-3 h-3"/> {tag}
                      </button>
                  )) : (
                      <div className="text-[10px] text-gray-400 italic p-2 border border-dashed border-gray-300 dark:border-slate-700 rounded w-full text-center">
                          Analyzing image content...
                      </div>
                  )}
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
          {/* AI Scene Storytelling */}
          <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-3 rounded-lg border border-indigo-500/20">
               <h3 className="panel-title flex items-center gap-2 text-indigo-500 dark:text-indigo-400">
                   <MessageCircle className="w-3 h-3"/> Scene Storytelling
               </h3>
               <p className="text-[10px] text-gray-400 mb-2">Transport your subject to a new world.</p>
               <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                   {SCENES.map((scene) => (
                       <button 
                         key={scene.label}
                         onClick={() => handleStoryGeneration(scene.label)} 
                         className="tool-chip bg-white dark:bg-slate-800 justify-start"
                       >
                           <span className="mr-1">{scene.icon}</span> {scene.label}
                       </button>
                   ))}
               </div>
          </div>
          
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
          </div>
      </div>
  );

  const renderProductTab = () => (
      <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
           {/* Virtual Model Generator */}
           <div className="bg-gradient-to-br from-green-500/10 to-teal-500/10 p-3 rounded-lg border border-green-500/20">
                <h3 className="panel-title flex items-center gap-2 text-green-600 dark:text-green-400">
                    <User className="w-3 h-3"/> Virtual Model Studio
                </h3>
                <p className="text-[10px] text-gray-400 mb-2">Select clothing item first.</p>
                <div className="grid grid-cols-2 gap-2">
                    <button disabled={!currentSelection} onClick={() => handleVirtualModel("female")} className="tool-chip bg-white dark:bg-slate-800 justify-center disabled:opacity-50">
                        👩 Female Model
                    </button>
                    <button disabled={!currentSelection} onClick={() => handleVirtualModel("male")} className="tool-chip bg-white dark:bg-slate-800 justify-center disabled:opacity-50">
                        👨 Male Model
                    </button>
                </div>
           </div>
           
           <div>
              <h3 className="panel-title flex items-center gap-2"><ShoppingBag className="w-3 h-3 text-green-500"/> E-Commerce Tools</h3>
              <div className="grid grid-cols-1 gap-2">
                 <button onClick={() => handleGenerate("Remove background and leave pure white", false)} className="tool-row-btn">
                    <Scissors className="w-4 h-4"/> White Background
                 </button>
                 <button onClick={() => appendToPrompt("Add soft reflection and shadow at the bottom")} className="tool-row-btn">
                    <Droplet className="w-4 h-4"/> Reflection & Shadow
                 </button>
              </div>
          </div>
      </div>
  );

  const renderReferenceUI = () => (
      <div className="absolute top-20 right-6 w-64 bg-white/90 dark:bg-slate-800/90 backdrop-blur border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl p-3 z-30 animate-in fade-in slide-in-from-right-4">
           <div className="flex justify-between items-center mb-2">
               <h3 className="text-xs font-bold text-blue-500 uppercase flex items-center gap-2"><Layers className="w-3 h-3"/> Reference Layer</h3>
               <button onClick={() => setShowReferenceUI(false)}><X className="w-3 h-3"/></button>
           </div>
           <div className="space-y-3">
               <div>
                   <label className="text-[10px] text-gray-500 block mb-1">Opacity</label>
                   <input 
                      type="range" min="0.1" max="1" step="0.1" 
                      value={referenceOverlay?.opacity || 0.5} 
                      onChange={e => referenceOverlay && setReferenceOverlay({...referenceOverlay, opacity: parseFloat(e.target.value)})}
                      className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                   />
               </div>
               <div>
                   <label className="text-[10px] text-gray-500 block mb-1">Scale</label>
                   <input 
                      type="range" min="0.1" max="2" step="0.1" 
                      value={referenceOverlay?.scale || 0.5} 
                      onChange={e => referenceOverlay && setReferenceOverlay({...referenceOverlay, scale: parseFloat(e.target.value)})}
                      className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                   />
               </div>
               <button onClick={() => setReferenceOverlay(null)} className="w-full text-xs text-red-500 hover:bg-red-50 p-1 rounded">Remove Overlay</button>
           </div>
      </div>
  );

  const renderReviewTab = () => (
      <div className="space-y-5 animate-in fade-in slide-in-from-left-4 duration-300">
          
          {/* Zoom Tools */}
          <div>
              <h3 className="panel-title flex items-center gap-2"><Search className="w-3 h-3 text-cyan-500"/> Inspector Tools</h3>
              <div className="grid grid-cols-3 gap-2 mb-2">
                  <button onClick={() => { setMode(EditMode.INSPECT); setZoomLevel('fit'); }} className={`tool-chip justify-center ${zoomLevel === 'fit' ? 'bg-cyan-100 dark:bg-cyan-900/30 border-cyan-500' : ''}`}>Fit</button>
                  <button onClick={() => { setMode(EditMode.INSPECT); setZoomLevel(1); }} className={`tool-chip justify-center ${zoomLevel === 1 ? 'bg-cyan-100 dark:bg-cyan-900/30 border-cyan-500' : ''}`}>100%</button>
                  <button onClick={() => { setMode(EditMode.INSPECT); setZoomLevel(2); }} className={`tool-chip justify-center ${zoomLevel === 2 ? 'bg-cyan-100 dark:bg-cyan-900/30 border-cyan-500' : ''}`}>200%</button>
              </div>
          </div>

          {/* Quick Labels */}
          <div>
              <h3 className="panel-title flex items-center gap-2"><Pin className="w-3 h-3 text-orange-500"/> Quick Labels</h3>
              <div className="flex gap-1 mb-2">
                  <input 
                    value={quickLabelInput} onChange={e => setQuickLabelInput(e.target.value)} 
                    placeholder="Label..." className="flex-1 bg-gray-50 dark:bg-slate-800 text-xs p-1 rounded border border-gray-200 dark:border-slate-700"
                  />
                  <button onClick={() => handleAddQuickLabel(quickLabelInput)} disabled={!quickLabelInput} className="bg-orange-500 text-white px-2 rounded text-xs">+</button>
              </div>
              <div className="flex flex-wrap gap-1">
                  {['Hair', 'Skin', 'Fabric', 'Sky'].map(l => (
                      <button key={l} onClick={() => handleAddQuickLabel(l)} className="text-[10px] bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-gray-200 hover:bg-orange-100">{l}</button>
                  ))}
                  {quickLabels.length > 0 && <button onClick={() => setQuickLabels([])} className="text-[10px] text-red-500 ml-auto">Clear</button>}
              </div>
          </div>

          {/* Overlays */}
          <div>
              <h3 className="panel-title flex items-center gap-2"><EyeIcon className="w-3 h-3 text-yellow-500"/> Analysis & Fix</h3>
              <div className="space-y-2">
                  <button onClick={() => setInspectorOverlay(prev => prev === 'grid' ? 'none' : 'grid')} className={`tool-row-btn justify-between ${inspectorOverlay === 'grid' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500/50' : ''}`}>
                      <span className="flex items-center gap-2"><Grid className="w-4 h-4"/> Composition Grid</span>
                  </button>
                  <button onClick={() => setInspectorOverlay(prev => prev === 'exposure' ? 'none' : 'exposure')} className={`tool-row-btn justify-between ${inspectorOverlay === 'exposure' ? 'bg-red-50 dark:bg-red-900/20 border-red-500/50' : ''}`}>
                      <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4"/> Exposure Warnings</span>
                  </button>
              </div>
              {/* Fix Actions */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => handleGenerate("Fix overexposed highlights and balance exposure", false)} className="tool-chip bg-slate-100 dark:bg-slate-800 text-[10px] justify-center">Fix Highlights</button>
                  <button onClick={() => handleGenerate("Remove purple fringing and chromatic aberration", false)} className="tool-chip bg-slate-100 dark:bg-slate-800 text-[10px] justify-center">Fix Fringing</button>
                  <button onClick={() => handleGenerate("Smooth gradient banding/dither", false)} className="tool-chip bg-slate-100 dark:bg-slate-800 text-[10px] justify-center">Fix Banding</button>
                  <button onClick={() => handleGenerate("Sharpen details and remove blur", false)} className="tool-chip bg-slate-100 dark:bg-slate-800 text-[10px] justify-center">Sharpen</button>
              </div>
          </div>

          {/* Workspace Fixes */}
          <div className="bg-orange-50 dark:bg-orange-950/20 p-3 rounded border border-orange-200 dark:border-orange-900/50">
              <h3 className="panel-title flex items-center gap-2 text-orange-600 dark:text-orange-400"><RefreshCw className="w-3 h-3"/> Auto-Repair</h3>
              <div className="grid grid-cols-2 gap-2">
                   <button onClick={() => { if (editorRef.current) editorRef.current.resetZoom(); setZoomLevel('fit'); }} className="tool-chip bg-white dark:bg-slate-800 justify-center">Reset View</button>
                   <button onClick={() => { clearMainImage(); }} className="tool-chip bg-white dark:bg-slate-800 text-red-500 justify-center">Clear All</button>
                   <button onClick={() => { setCompareToggle(false); setTimeout(() => setCompareToggle(true), 100); }} className="tool-chip bg-white dark:bg-slate-800 justify-center col-span-2">Resync Compare</button>
              </div>
          </div>
      </div>
  );

  const renderLeftPanel = () => (
      <aside className="w-80 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 flex flex-col z-20 transition-colors shrink-0">
          <div className="flex p-2 gap-1 border-b border-gray-200 dark:border-slate-800 overflow-x-auto scrollbar-hide shrink-0">
              <button onClick={() => setActiveTab(EditTab.CORE)} className={`tab-btn ${activeTab === EditTab.CORE ? 'active' : ''}`}>Core</button>
              <button onClick={() => setActiveTab(EditTab.PORTRAIT)} className={`tab-btn ${activeTab === EditTab.PORTRAIT ? 'active' : ''}`}>Portrait</button>
              <button onClick={() => setActiveTab(EditTab.CREATIVE)} className={`tab-btn ${activeTab === EditTab.CREATIVE ? 'active' : ''}`}>Creative</button>
              <button onClick={() => setActiveTab(EditTab.PRODUCT)} className={`tab-btn ${activeTab === EditTab.PRODUCT ? 'active' : ''}`}>Product</button>
              <button onClick={() => { setActiveTab(EditTab.REVIEW); setMode(EditMode.INSPECT); }} className={`tab-btn ${activeTab === EditTab.REVIEW ? 'active-cyan' : ''}`}>Review</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {activeTab === EditTab.CORE && renderCoreTab()}
              {activeTab === EditTab.PORTRAIT && renderPortraitTab()}
              {activeTab === EditTab.CREATIVE && renderCreativeTab()}
              {activeTab === EditTab.PRODUCT && renderProductTab()}
              {activeTab === EditTab.REVIEW && renderReviewTab()}
          </div>
          
          {/* Analysis Footer */}
          {globalAnalysis && (
              <div className="p-3 bg-gray-50 dark:bg-slate-950 border-t border-gray-200 dark:border-slate-800 shrink-0">
                  <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">Analysis</span>
                      <span className="text-[10px] bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded border border-green-500/20">
                          {globalAnalysis.confidence}% Conf
                      </span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{globalAnalysis.category} • {globalAnalysis.scene}</span>
                  </div>
              </div>
          )}
      </aside>
  );

  return (
    <div className={`flex flex-col h-screen w-full transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-950 text-slate-200' : 'bg-gray-50 text-gray-900'}`}>
      
      {/* Toast Notification */}
      {toastMessage && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-full shadow-xl z-[100] text-xs font-bold animate-in slide-in-from-top-4 fade-in flex items-center gap-2">
              <Check className="w-3 h-3 text-green-400"/> {toastMessage}
              <button className="ml-2 text-gray-400 hover:text-white" onClick={handleUndo}>UNDO</button>
          </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 z-50 shrink-0 transition-colors relative">
         <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-yellow-400/20">
                <Wand2 className="w-5 h-5 text-slate-900" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Nano<span className="text-yellow-500 font-light">Edit</span></h1>
         </div>

         {/* Center Toolbar */}
         <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-4">
             <div className="flex items-center bg-gray-100 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-slate-700 shadow-sm">
                <button onClick={() => { setMode(EditMode.SELECT); setIsCleanupMode(false); }} className={`tool-icon-btn ${mode === EditMode.SELECT && !isCleanupMode ? 'active' : ''}`} title="Select"><Scan className="w-4 h-4"/></button>
                <button onClick={() => { setMode(EditMode.SELECT); setIsCleanupMode(true); }} className={`tool-icon-btn ${isCleanupMode ? 'active-red' : ''}`} title="Cleanup"><Eraser className="w-4 h-4"/></button>
                <button onClick={() => handleAddTextMode()} className={`tool-icon-btn ${mode === EditMode.TEXT ? 'active-indigo' : ''}`} title="Text"><TypeIcon className="w-4 h-4"/></button>
             </div>
             
             {/* Reference Toggle */}
             <button onClick={() => referenceInputRef.current?.click()} className={`p-2 rounded-lg transition ${mode === EditMode.REFERENCE ? 'bg-blue-500 text-white' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'}`} title="Reference Overlay">
                 <Layers className="w-5 h-5"/>
             </button>
             <input type="file" ref={referenceInputRef} onChange={handleReferenceUpload} className="hidden"/>

             <button onClick={() => { setActiveTab(EditTab.REVIEW); setMode(EditMode.INSPECT); }} className={`p-2 rounded-lg transition ${mode === EditMode.INSPECT ? 'bg-cyan-500 text-white' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'}`} title="Inspect"><ZoomIn className="w-5 h-5"/></button>
         </div>

         <div className="flex items-center gap-4 shrink-0">
             <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="header-icon-btn">{theme === 'dark' ? <Sun className="w-5 h-5"/> : <Moon className="w-5 h-5"/>}</button>
             <div className="h-6 w-px bg-gray-200 dark:bg-slate-800"></div>
             <button onClick={handleUndo} disabled={currentIndex <= 0} className="header-icon-btn"><RotateCcw className="w-5 h-5"/></button>
             <button onClick={handleRedo} disabled={currentIndex >= history.length - 1} className="header-icon-btn"><RotateCw className="w-5 h-5"/></button>
         </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 flex overflow-hidden">
          {renderLeftPanel()}

          <div className="flex-1 relative bg-gray-100 dark:bg-slate-950 transition-colors flex flex-col">
             {!currentImage && (
                 <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                     <div className="bg-white dark:bg-slate-900/50 backdrop-blur p-8 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-xl text-center pointer-events-auto cursor-pointer hover:scale-105 transition" onClick={() => fileInputRef.current?.click()}>
                         <Upload className="w-8 h-8 text-blue-500 mx-auto mb-4"/>
                         <h2 className="text-xl font-bold dark:text-white mb-2">Upload Image</h2>
                         <button className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium">Select File</button>
                     </div>
                 </div>
             )}

             {isProcessing && <LoadingSpinner />}
             
             <div className="flex-1 relative overflow-hidden">
                 {currentImage && <button onClick={clearMainImage} className="absolute top-4 right-4 z-50 p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg hover:scale-110 transition"><X className="w-5 h-5"/></button>}
                 
                 {showReferenceUI && referenceOverlay && renderReferenceUI()}

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
                    inspectorOverlay={inspectorOverlay}
                    zoomLevel={zoomLevel}
                    referenceOverlay={referenceOverlay}
                    onReferenceChange={setReferenceOverlay}
                    quickLabels={quickLabels}
                />
             </div>

             {/* Bottom Floating Controls */}
             {currentImage && (
                 <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/90 dark:bg-slate-800/90 backdrop-blur px-4 py-2 rounded-full shadow-xl border border-gray-200 dark:border-slate-700 z-10">
                     <button onClick={() => setCompareToggle(!compareToggle)} className={`icon-toggle ${compareToggle ? 'active' : ''}`}><LayoutTemplate className="w-5 h-5"/></button>
                     <div className="w-px h-4 bg-gray-300 dark:bg-slate-600"></div>
                     <button onClick={() => { setIs3DMode(!is3DMode); setMode(EditMode.VIEW); }} className={`icon-toggle ${is3DMode ? 'active' : ''}`}><Box className="w-5 h-5"/></button>
                 </div>
             )}
          </div>
      </main>
      
      <input type="file" ref={fileInputRef} onChange={handleUpload} accept="image/*" className="hidden" />
      <style>{`
        .header-icon-btn { @apply p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition disabled:opacity-30; }
        .panel-title { @apply text-xs font-bold text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-3; }
        .tool-chip { @apply flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-slate-800 border border-transparent rounded-lg text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:border-gray-300 dark:hover:border-slate-600 transition; }
        .tool-row-btn { @apply w-full flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-slate-800 border border-transparent hover:border-gray-300 dark:hover:border-slate-700 text-xs font-medium text-gray-700 dark:text-slate-300 transition; }
        .tab-btn { @apply px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800; }
        .tab-btn.active { @apply bg-blue-500 text-white shadow-blue-500/20; }
        .tab-btn.active-cyan { @apply bg-cyan-600 text-white shadow-cyan-500/20; }
        .tool-icon-btn { @apply p-2 rounded-md text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition; }
        .tool-icon-btn.active { @apply bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 font-bold; }
        .tool-icon-btn.active-red { @apply bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 font-bold; }
        .tool-icon-btn.active-indigo { @apply bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 font-bold; }
        .icon-toggle { @apply p-2 rounded-full text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition; }
        .icon-toggle.active { @apply text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; }
      `}</style>
    </div>
  );
}

export default App;
