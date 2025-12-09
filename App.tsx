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
  Maximize, Activity, AlertCircle, RefreshCw, Pin, Crop, ChevronRight, Settings, Sliders, Trash2, 
  MousePointer2, Scale, Rotate3D, FileDown, Sparkle, Link as LinkIcon, MessageSquare, Frown, Copy, Type
} from 'lucide-react';
import { ImageEditor, ImageEditorHandle } from './components/ImageEditor';
import { LoadingSpinner } from './components/LoadingSpinner';
import { fileToBase64, cropImage, applyAlphaMask, downloadImage, loadImage } from './utils/imageUtils';
import { editImageWithGemini, analyzeSelection, generateSegmentationMask, analyzeGlobalImage, generateSocialCaption, generateVideoFromImage, upscaleImage, generateClickCaption } from './services/geminiService';
import { HistoryItem, SelectionBox, EditMode, PromptSuggestion, ExportFormat, GlobalAnalysisResult, TextOverlay, AppError, BatchItem, AppTheme, EditTab, InspectorOverlay, ReferenceSubject, PromptBuilderState, PromptTask, ImageCategory, ExportConfig, Point, CaptionTone } from './types';

// Preset Scenes - Context Aware
const HUMAN_SCENES = [
  { label: "Luxury Garden", icon: "🌿" },
  { label: "Beach Dawn", icon: "🌅" },
  { label: "City Night Neon", icon: "🌆" },
  { label: "Classic Studio", icon: "📷" },
  { label: "Royal Hall", icon: "👑" },
];

const VEHICLE_SCENES = [
  { label: "Showroom", icon: "🏢" },
  { label: "Mountain Pass", icon: "⛰️" },
  { label: "City Street", icon: "🏙️" },
  { label: "Desert Road", icon: "🏜️" },
  { label: "Racing Track", icon: "🏁" },
];

const PRODUCT_SCENES = [
  { label: "Minimal Studio", icon: "⚪" },
  { label: "Marble Counter", icon: "🏛️" },
  { label: "Wooden Table", icon: "🪵" },
  { label: "Soft Sunlight", icon: "🌤️" },
  { label: "Podium", icon: "🏆" },
];

const DEFAULT_SCENES = [
  { label: "Minimal Mono", icon: "⚪" },
  { label: "Festive Lights", icon: "✨" },
  { label: "Forest Mist", icon: "🌲" },
];

// Modifiers Configuration
interface Modifier {
  label: string;
  value: string;
  icon?: string;
  color?: string; // Optional visual cue
}

const MODIFIERS: Record<string, Modifier[]> = {
  'Human': [
      { label: 'Soft Skin', value: 'smooth skin texture, soft focus', icon: '✨' },
      { label: 'Cinematic', value: 'dramatic lighting, movie color grading', icon: '🎬' },
      { label: 'B&W', value: 'black and white photography, high contrast', icon: '⚫' },
      { label: 'Warm', value: 'golden hour lighting, warm tones', icon: '☀️' },
      { label: 'Vibrant', value: 'vibrant colors, high saturation', icon: '🌈' }
  ],
  'Vehicle': [
      { label: 'Matte', value: 'matte paint finish, non-reflective', icon: '🌑' },
      { label: 'Chrome', value: 'chrome plated, highly reflective', icon: '🔩' },
      { label: 'Speed', value: 'motion blur background, sense of speed', icon: '💨' },
      { label: 'Midnight', value: 'dark environment, studio lights', icon: '🌃' },
      { label: 'Clean', value: 'pristine condition, freshly washed', icon: '✨' }
  ],
  'Product': [
      { label: 'Silk', value: 'silk fabric texture, smooth, shiny', icon: '🧣' },
      { label: 'Leather', value: 'leather texture, detailed grain', icon: '👜' },
      { label: 'Wood', value: 'natural wood texture', icon: '🪵' },
      { label: 'Gold', value: 'gold material, metallic', icon: '🪙' },
      { label: 'Minimal', value: 'minimalist composition, clean lines', icon: '⬜' }
  ],
  'General': [
      { label: 'High Contrast', value: 'high contrast, dramatic shadows', icon: '🌗' },
      { label: 'Soft Light', value: 'soft diffused lighting', icon: '☁️' },
      { label: 'HDR', value: 'HDR, high dynamic range, detailed', icon: '👁️' },
      { label: 'Cyberpunk', value: 'neon lights, cyan and magenta', icon: '🤖' },
      { label: 'Vintage', value: 'vintage film grain, retro style', icon: '🎞️' }
  ]
};

function App() {
  const [theme, setTheme] = useState<AppTheme>('dark');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isProcessing, setIsProcessing] = useState(false);
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
  const [referenceSubjects, setReferenceSubjects] = useState<ReferenceSubject[]>([]);
  const [activeReferenceId, setActiveReferenceId] = useState<string | null>(null);
  const [tempReferenceImage, setTempReferenceImage] = useState<string | null>(null); // For extraction mode
  const [isSelectingReference, setIsSelectingReference] = useState(false);

  // Cleanup Mode State
  const [isCleanupMode, setIsCleanupMode] = useState(false);

  // Text Mode State
  const [textOverlay, setTextOverlay] = useState<TextOverlay | null>(null);

  // Inspector State (Review Tab)
  const [inspectorOverlay, setInspectorOverlay] = useState<InspectorOverlay>('none');
  const [zoomLevel, setZoomLevel] = useState<number | 'fit'>('fit');
  const [qualityIssues, setQualityIssues] = useState<string[] | null>(null);

  // Prompt Builder State
  const [promptState, setPromptState] = useState<PromptBuilderState>({
      task: 'Retouch',
      subject: '',
      intent: '',
      modifiers: [],
      controls: {},
      sectionsOpen: { overlay: true, scene: false, inspection: false }
  });
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  // Caption Mode
  const [captionTone, setCaptionTone] = useState<CaptionTone>('funny');
  const [captionResult, setCaptionResult] = useState<{text: string, subject: string} | null>(null);

  // Export State
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportConfig, setExportConfig] = useState<ExportConfig>({
      format: 'png',
      quality: 0.9,
      scale: 1,
      upscale: false,
      filename: 'nano-edit'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<ImageEditorHandle>(null);

  // Computed current image
  // If in REFERENCE_EDIT mode, we show the temporary reference image instead of main history
  const displayImage = mode === EditMode.REFERENCE_EDIT && tempReferenceImage ? tempReferenceImage : (currentIndex >= 0 ? history[currentIndex].dataUrl : null);
  const compareImage = currentIndex > 0 ? history[currentIndex - 1].dataUrl : (history[0]?.dataUrl || null);
  const activeCompare = compareToggle && mode !== EditMode.REFERENCE_EDIT;

  // Listen for system theme preference
  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      setTheme('light');
    }
  }, []);

  const showToast = (msg: string) => {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 3000);
  };

  const handleUndo = () => currentIndex > 0 && setCurrentIndex(prev => prev - 1);
  const handleRedo = () => currentIndex < history.length - 1 && setCurrentIndex(prev => prev + 1);

  const clearMainImage = () => {
      setHistory([]);
      setCurrentIndex(-1);
      setGlobalAnalysis(null);
      setPromptState(prev => ({ ...prev, intent: '', subject: '', modifiers: [] }));
      setCurrentSelection(null);
      setReferenceSubjects([]);
      setTextOverlay(null);
      setSuggestions([]);
      setIdentifiedInfo({ label: "", material: "", color: "" });
      setIsSelectingReference(false);
      setTempReferenceImage(null);
      setCaptionResult(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      editorRef.current?.forceRedraw();
  };

  const performGlobalAnalysis = async (base64: string) => {
    setIsAnalyzingGlobal(true);
    try {
        const result = await analyzeGlobalImage(base64);
        setGlobalAnalysis(result);
        if (result?.category === 'Human') setActiveTab(EditTab.PORTRAIT);
        else if (result?.category === 'Product') setActiveTab(EditTab.PRODUCT);
        else if (result?.category === 'Vehicle') {
             setActiveTab(EditTab.CREATIVE);
             setPromptState(prev => ({...prev, subject: 'Vehicle'}));
        }
        else setActiveTab(EditTab.CREATIVE);
        
        // Auto-populate subject
        if (result && result.tags.length > 0) {
            setPromptState(prev => ({ ...prev, subject: result.tags[0] }));
        }

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
      if (!displayImage || !currentSelection) {
        setSuggestions([]);
        setIdentifiedInfo({ label: "", material: "", color: "" });
        return;
      }
      
      // If we are in "Select Reference" mode, do NOT run identification
      if (isSelectingReference) {
          return;
      }

      if (isCleanupMode) {
          setIdentifiedInfo({ label: "Selection", material: "", color: "" });
          setSuggestions([{ label: "Confirm Removal", prompt: "Remove the selected object and fill the background seamlessly" }]);
          return;
      }
      setIsIdentifying(true);
      try {
        const crop = await cropImage(displayImage, currentSelection);
        const info = await analyzeSelection(crop);
        setIdentifiedInfo(info);
        // Update prompt builder subject automatically
        setPromptState(prev => ({ ...prev, subject: info.label }));
      } catch (e) {
        console.error("Identification error", e);
      } finally {
        setIsIdentifying(false);
      }
    };
    const timer = setTimeout(identify, 500);
    return () => clearTimeout(timer);
  }, [displayImage, currentSelection, isCleanupMode, isSelectingReference]);

  // Handle Selection Change (Main vs Reference)
  const handleSelectionChange = async (box: SelectionBox | null) => {
      // Always update local selection state first
      setCurrentSelection(box);

      if (box && isSelectingReference && displayImage) {
          try {
             const cropped = await cropImage(displayImage, box);
             addReferenceSubject(cropped, "Canvas Capture");
             setIsSelectingReference(false);
             setMode(EditMode.VIEW);
             setCurrentSelection(null);
          } catch(e) {
              console.error("Failed to crop reference", e);
          }
      }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        try {
          const base64 = await fileToBase64(e.target.files[0]);
          setHistory([{ dataUrl: base64, timestamp: Date.now() }]);
          setCurrentIndex(0);
          setPromptState({ task: 'Retouch', subject: '', intent: '', modifiers: [], controls: {}, sectionsOpen: { overlay: true, scene: false, inspection: false } });
          setMode(EditMode.VIEW);
          setCurrentSelection(null);
          setSuggestions([]);
          setGlobalAnalysis(null); 
          setReferenceSubjects([]);
          setIsCleanupMode(false);
          setTextOverlay(null);
          setBatchQueue([]);
          setIsBatchMode(false);
          setActiveTab(EditTab.CORE);
          performGlobalAnalysis(base64);
        } catch (err) {
          handleError(err);
        }
    }
  };

  const addReferenceSubject = (base64: string, label: string) => {
      const newSubject: ReferenceSubject = {
          id: `ref-${Date.now()}`,
          url: base64,
          label: label,
          x: 0,
          y: 0,
          scale: 0.5,
          rotation: 0,
          opacity: 1,
          visible: true,
          zOrder: referenceSubjects.length
      };
      setReferenceSubjects(prev => [...prev, newSubject]);
      setActiveReferenceId(newSubject.id);
      showToast(`${label} added to reference!`);
  };

  const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          try {
              const base64 = await fileToBase64(e.target.files[0]);
              // Enter Reference Extraction Mode
              setTempReferenceImage(base64);
              setMode(EditMode.REFERENCE_EDIT);
              setActiveTab(EditTab.CREATIVE);
              showToast("Click object in reference to extract, or click 'Use Full' to use whole image.");
          } catch(err) { handleError(err); }
      }
  };

  const handleUseFullReference = () => {
      if (tempReferenceImage) {
          addReferenceSubject(tempReferenceImage, "Reference");
          setMode(EditMode.VIEW);
          setTempReferenceImage(null);
      }
  };

  const handleManualReferenceSelect = () => {
    if (isSelectingReference) {
      setIsSelectingReference(false);
      setMode(EditMode.VIEW);
    } else {
      setIsSelectingReference(true);
      setMode(EditMode.SELECT);
      setCurrentSelection(null);
      showToast("Draw a box to capture style/texture.");
    }
  };

  const handleCanvasClick = (point: Point) => {
      if (mode === EditMode.CAPTION) {
          handleCaptionClick(point);
      } else {
          handleSmartExtract(point);
      }
  };

  const handleCaptionClick = async (point: Point) => {
      if (!displayImage) return;
      setIsProcessing(true);
      showToast("Generating caption...");
      try {
           const boxSize = 300;
           // Clamp box to image bounds
           const cropBox: SelectionBox = {
              x: Math.max(0, point.x - boxSize/2),
              y: Math.max(0, point.y - boxSize/2),
              width: boxSize,
              height: boxSize
           };
           
           const cropBase64 = await cropImage(displayImage, cropBox);
           const result = await generateClickCaption(cropBase64, captionTone);
           
           setCaptionResult({ text: result.caption, subject: result.subject });
           showToast("Caption ready!");

      } catch(e) {
          handleError(e);
      } finally {
          setIsProcessing(false);
      }
  };

  // Smart Extract logic - can work on Main Image OR Reference Edit Image
  const handleSmartExtract = async (point: Point) => {
      if (!displayImage) return;
      setIsProcessing(true);
      showToast("Identifying object...");
      
      try {
          // 1. Crop a small area around the point to Identify
          const boxSize = 200;
          const cropBox: SelectionBox = {
              x: Math.max(0, point.x - boxSize/2),
              y: Math.max(0, point.y - boxSize/2),
              width: boxSize,
              height: boxSize
          };
          const cropBase64 = await cropImage(displayImage, cropBox);
          const analysis = await analyzeSelection(cropBase64);
          
          if (!analysis.label || analysis.label === "Object") {
             // Fallback
             analysis.label = "Subject";
          }
          
          showToast(`Extracting ${analysis.label}...`);
          
          // 2. Generate mask for identified object
          const maskBase64 = await generateSegmentationMask(displayImage, analysis.label);
          
          // 3. Extract
          const cutoutBase64 = await applyAlphaMask(displayImage, maskBase64);
          
          // 4. Add as Reference Subject
          addReferenceSubject(cutoutBase64, analysis.label);
          
          // If we were in Reference Edit mode, exit back to view
          if (mode === EditMode.REFERENCE_EDIT) {
              setMode(EditMode.VIEW);
              setTempReferenceImage(null);
          } else {
              setMode(EditMode.VIEW); // Exit magic wand mode
          }

      } catch (e) {
          handleError(e);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleGenerate = async (forcedPrompt?: string, invertMask: boolean = false) => {
    const intent = forcedPrompt || promptState.intent;
    // Allow generate if modifiers exist, even if intent empty
    if (!displayImage || (!intent.trim() && promptState.modifiers.length === 0)) return;

    if (isOffline) {
        setErrorState({ title: "No Connection", message: "You are offline." });
        return;
    }

    setIsProcessing(true);
    const execute = async () => {
        try {
            let maskBase64: string | undefined = undefined;
            if (editorRef.current) {
                // If using brush or selection, we rely on the mask from the editor
                // This covers both SelectionBox (box is drawn on mask canvas) and Eraser/Brush strokes
                if (currentSelection || isCleanupMode) {
                   const m = editorRef.current.getMaskDataUrl();
                   if (m) maskBase64 = m;
                }
            }
            
            // Construct final prompt from builder if not forced
            let finalPrompt = forcedPrompt;
            if (!finalPrompt) {
                 finalPrompt = `${promptState.task}`;
                 if (promptState.subject) finalPrompt += `: ${promptState.subject}`;
                 if (intent) finalPrompt += ` - ${intent}`;
                 if (promptState.modifiers.length > 0) {
                     finalPrompt += `. Style/Finish: ${promptState.modifiers.join(', ')}`;
                 }
            }
            
            // Special case for Cleanup Mode if no prompt provided
            if (isCleanupMode && !finalPrompt) {
                finalPrompt = "Remove the selected object/area and fill the background seamlessly.";
            }

            // Reference logic: Use the first visible reference subject for now, or composite them
            // For simplicity in this API version, we take the active or first visible reference
            const activeRef = activeReferenceId 
               ? referenceSubjects.find(r => r.id === activeReferenceId)
               : referenceSubjects.find(r => r.visible);
            
            const resultBase64 = await editImageWithGemini(
                displayImage!, // ! safe because check above 
                finalPrompt!, 
                maskBase64, 
                invertMask,
                activeRef?.url,
                [] // Fixed: styleRefFeatures was undefined
            );
            const newItem: HistoryItem = {
                dataUrl: resultBase64,
                timestamp: Date.now(),
                prompt: finalPrompt
            };
            const newHistory = [...history.slice(0, currentIndex + 1), newItem];
            setHistory(newHistory);
            setCurrentIndex(newHistory.length - 1);
            setMode(EditMode.VIEW);
            setCurrentSelection(null);
            setIsCleanupMode(false);
        } catch (error) {
            handleError(error, () => handleGenerate(forcedPrompt, invertMask));
        } finally {
            setIsProcessing(false);
        }
    };
    execute();
  };
  
  const handleExport = async () => {
      if (!displayImage) return;
      setIsProcessing(true);
      try {
          let finalImage = displayImage;
          
          // Apply Upscale if requested
          if (exportConfig.upscale && exportConfig.scale > 1) {
              showToast(`Upscaling image by ${exportConfig.scale}x...`);
              finalImage = await upscaleImage(displayImage, exportConfig.scale);
          }
          
          await downloadImage(finalImage, exportConfig.filename, exportConfig.format);
          setIsExportOpen(false);
          showToast("Export successful!");
      } catch(e) {
          handleError(e);
      } finally {
          setIsProcessing(false);
      }
  };
  
  const handleAutoSelect = async (tag: string) => {
      if (!displayImage) return;
      setIsProcessing(true);
      try {
          const maskBase64 = await generateSegmentationMask(displayImage, tag);
          setPromptState(prev => ({...prev, subject: tag, intent: `Selected ${tag}. Describe edit...`}));
          const enhanced = await editImageWithGemini(displayImage, `Enhance the appearance of the ${tag}`, maskBase64, false);
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
      if (!displayImage) return;
      if (isOffline) {
          setErrorState({ title: "No Connection", message: "You are offline." });
          return;
      }
      setIsProcessing(true);
      try {
          const promptText = `Place the subject in a ${theme} environment. Photorealistic, high quality, consistent lighting.`;
          
          let maskBase64: string | undefined = undefined;
          if (currentSelection && editorRef.current) {
             maskBase64 = editorRef.current.getMaskDataUrl() || undefined;
          }

          const newImageBase64 = await editImageWithGemini(
              displayImage, 
              promptText, 
              maskBase64, 
              false, 
              undefined,
              [] // Fixed: styleRefFeatures was undefined
          );
          
          // Only generate caption if not vehicle (vehicles have no emotions in this context)
          if (globalAnalysis?.category !== 'Vehicle') {
             await generateSocialCaption(newImageBase64, theme);
          }
          
          const newItem: HistoryItem = {
              dataUrl: newImageBase64,
              timestamp: Date.now(),
              prompt: promptText
          };
          setHistory(prev => [...prev.slice(0, currentIndex + 1), newItem]);
          setCurrentIndex(prev => prev + 1);
          
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

  // --- Right Panel Components ---

  const renderQuickSuggestions = () => {
    let suggestions = [
       "Recover highlight detail",
       "Balance shadows",
       "Fix gradient banding",
       "Enhance texture"
    ];
    
    if (globalAnalysis) {
        if (globalAnalysis.category === 'Human') {
            suggestions = ["Refine skin tone", "Reduce halo on hair", "Brighten eyes", ...suggestions];
        } else if (globalAnalysis.category === 'Vehicle') {
            suggestions = ["Enhance reflections", "Sharpen rims", "Darken tires", "Clean windshield", ...suggestions];
        } else if (globalAnalysis.category === 'Product') {
            suggestions = ["Clean background", "Sharpen label text", "Add drop shadow", ...suggestions];
        }
    }

    return (
        <div className="mb-4">
            <h3 className="panel-title flex items-center gap-2"><Sparkles className="w-3 h-3 text-yellow-500"/> Quick Suggestions</h3>
            <div className="flex flex-wrap gap-2">
                {suggestions.map(s => (
                    <button 
                        key={s} 
                        onClick={() => setPromptState(prev => ({...prev, intent: s}))}
                        className="text-[10px] bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-blue-500 hover:text-blue-500 px-2 py-1 rounded-full transition"
                    >
                        {s}
                    </button>
                ))}
            </div>
        </div>
    );
  };

  const toggleModifier = (value: string) => {
      setPromptState(prev => {
          const exists = prev.modifiers.includes(value);
          if (exists) {
              return { ...prev, modifiers: prev.modifiers.filter(m => m !== value) };
          } else {
              return { ...prev, modifiers: [...prev.modifiers, value] };
          }
      });
  };

  const toggleSection = (section: keyof PromptBuilderState['sectionsOpen']) => {
      setPromptState(prev => ({
          ...prev,
          sectionsOpen: { ...prev.sectionsOpen, [section]: !prev.sectionsOpen[section] }
      }));
  };

  const renderPromptBuilder = () => {
      // Determine which modifiers to show based on category or fallback to general
      const category = globalAnalysis?.category || 'General';
      const availableModifiers = [...(MODIFIERS[category] || []), ...MODIFIERS['General']];
      
      const activeRef = referenceSubjects.find(r => r.id === activeReferenceId);

      return (
          <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700 mb-4 overflow-hidden">
              {/* Task Section */}
              <div className="p-3 border-b border-gray-200 dark:border-slate-700">
                  <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Task</label>
                  <div className="flex bg-white dark:bg-slate-900 rounded p-1 gap-1">
                      {(['Retouch', 'Overlay', 'Scene', 'Inspect'] as PromptTask[]).map(t => (
                          <button 
                             key={t} 
                             onClick={() => setPromptState(prev => ({...prev, task: t}))}
                             className={`flex-1 text-[10px] py-1 rounded ${promptState.task === t ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800'}`}
                          >
                              {t}
                          </button>
                      ))}
                  </div>
              </div>
              
              {/* Reference Actions (Conditional) */}
              {activeRef && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-800">
                      <h4 className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase mb-2 flex items-center gap-1">
                          <LinkIcon className="w-3 h-3"/> Use Reference: {activeRef.label}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                           <button onClick={() => setPromptState(prev => ({...prev, intent: prev.intent + ` Transfer the style of the ${activeRef.label} from the reference image.`}))} className="text-[10px] px-2 py-1 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 rounded text-blue-600 dark:text-blue-300 hover:bg-blue-50">Match Style</button>
                           <button onClick={() => setPromptState(prev => ({...prev, intent: prev.intent + ` Copy the ${activeRef.label} pattern and texture exactly.`}))} className="text-[10px] px-2 py-1 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 rounded text-blue-600 dark:text-blue-300 hover:bg-blue-50">Copy Texture</button>
                           <button onClick={() => setPromptState(prev => ({...prev, intent: prev.intent + ` Use the ${activeRef.label} color palette.`}))} className="text-[10px] px-2 py-1 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 rounded text-blue-600 dark:text-blue-300 hover:bg-blue-50">Match Color</button>
                      </div>
                  </div>
              )}

              {/* Subject & Intent */}
              <div className="p-3">
                  <div className="mb-3">
                      <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Subject</label>
                      <input 
                        type="text" 
                        value={promptState.subject}
                        onChange={e => setPromptState(prev => ({...prev, subject: e.target.value}))}
                        className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-2 py-1 text-xs"
                        placeholder="e.g. Red Car, Woman in Saree..."
                      />
                  </div>

                  {/* Modifiers Toggle */}
                  <div className="mb-3">
                      <button onClick={() => toggleSection('overlay')} className="w-full flex items-center justify-between text-[10px] font-bold text-gray-500 uppercase mb-1 hover:text-gray-700 dark:hover:text-gray-300">
                          <span>Visual Modifiers</span>
                          <ChevronDown className={`w-3 h-3 transition-transform ${promptState.sectionsOpen.overlay ? 'rotate-180' : ''}`}/>
                      </button>
                      
                      {promptState.sectionsOpen.overlay && (
                          <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto custom-scrollbar p-1 animate-in slide-in-from-top-2 duration-200">
                              {availableModifiers.map((mod, i) => {
                                  const isSelected = promptState.modifiers.includes(mod.value);
                                  return (
                                      <button
                                        key={i}
                                        onClick={() => toggleModifier(mod.value)}
                                        className={`flex items-center gap-2 p-1.5 rounded-lg border text-left transition text-[10px] ${isSelected ? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-slate-600'}`}
                                      >
                                          <span className="text-sm">{mod.icon}</span>
                                          <span className="font-medium truncate">{mod.label}</span>
                                          {isSelected && <Check className="w-3 h-3 ml-auto"/>}
                                      </button>
                                  )
                              })}
                          </div>
                      )}
                  </div>

                  <div className="mb-3">
                      <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Intent</label>
                      <textarea 
                        value={promptState.intent}
                        onChange={e => setPromptState(prev => ({...prev, intent: e.target.value}))}
                        className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-2 py-2 text-xs h-16 resize-none focus:ring-1 focus:ring-blue-500 outline-none"
                        placeholder="Describe specific changes..."
                      />
                  </div>

                  <div className="flex gap-2">
                      <button 
                         onClick={() => handleGenerate()} 
                         disabled={!promptState.intent && promptState.modifiers.length === 0 && !isCleanupMode}
                         className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold py-2 rounded-lg hover:shadow-lg disabled:opacity-50 disabled:shadow-none transition flex items-center justify-center gap-2"
                      >
                          <Wand2 className="w-3 h-3"/> Apply
                      </button>
                      <button 
                         onClick={() => setPromptState(prev => ({...prev, intent: '', subject: '', modifiers: []}))} 
                         className="px-3 bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-bold hover:bg-gray-300 dark:hover:bg-slate-600 flex items-center justify-center"
                      >
                          <Trash2 className="w-3 h-3"/>
                      </button>
                  </div>
              </div>
          </div>
      );
  };

  // --- Left Panel Content (Presets) ---
  
  const renderCoreTab = () => (
      <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
          <div>
              <h3 className="panel-title flex items-center gap-2"><Scan className="w-3 h-3 text-blue-500"/> Smart Selection</h3>
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

  const renderCreativeTab = () => {
      // Choose scenes based on category
      let scenes = DEFAULT_SCENES;
      if (globalAnalysis?.category === 'Human') scenes = HUMAN_SCENES;
      if (globalAnalysis?.category === 'Vehicle') scenes = VEHICLE_SCENES;
      if (globalAnalysis?.category === 'Product') scenes = PRODUCT_SCENES;

      return (
      <div className="space-y-5 animate-in fade-in slide-in-from-left-4 duration-300">
           {/* Enhanced Style Reference & Alignment */}
           <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm">
              <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <Palette className="w-3 h-3 text-blue-500"/> Style Reference
              </h3>
              
              {/* Reference Actions */}
              <div className="flex gap-2 mb-3">
                  <button onClick={() => referenceInputRef.current?.click()} className="flex-1 text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition flex items-center gap-1 justify-center">
                      <Upload className="w-3 h-3"/> Upload
                  </button>
                  <button onClick={handleManualReferenceSelect} className={`flex-1 text-[10px] px-2 py-1.5 rounded transition flex items-center gap-1 justify-center ${isSelectingReference ? 'bg-orange-500 text-white animate-pulse' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>
                      <Crop className="w-3 h-3"/> Canvas
                  </button>
              </div>

              {/* Reference List */}
              <div className="space-y-2 mb-3 max-h-40 overflow-y-auto custom-scrollbar p-1">
                  {referenceSubjects.map(subj => (
                      <div 
                        key={subj.id} 
                        className={`flex items-center gap-2 p-2 rounded-lg border transition cursor-pointer ${activeReferenceId === subj.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800'}`}
                        onClick={() => setActiveReferenceId(subj.id)}
                      >
                          <img src={subj.url} className="w-8 h-8 rounded object-cover bg-gray-200"/>
                          <div className="flex-1 min-w-0">
                              <div className="text-[10px] font-bold truncate">{subj.label}</div>
                              <div className="text-[9px] text-gray-400">{Math.round(subj.opacity * 100)}% Opacity</div>
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setReferenceSubjects(prev => prev.map(s => s.id === subj.id ? {...s, visible: !s.visible} : s)); }}
                            className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-600 ${!subj.visible ? 'text-gray-400' : 'text-gray-600 dark:text-gray-300'}`}
                          >
                              {subj.visible ? <EyeIcon className="w-3 h-3"/> : <EyeOff className="w-3 h-3"/>}
                          </button>
                          <button 
                             onClick={(e) => { e.stopPropagation(); setReferenceSubjects(prev => prev.filter(s => s.id !== subj.id)); if(activeReferenceId === subj.id) setActiveReferenceId(null); }}
                             className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500"
                          >
                              <X className="w-3 h-3"/>
                          </button>
                      </div>
                  ))}
                  {referenceSubjects.length === 0 && <div className="text-[10px] text-gray-400 text-center italic py-2">No reference subjects</div>}
              </div>

              {/* Overlay Controls (Active Subject) */}
              {activeReferenceId && (
                  <div className="space-y-2 mb-3 px-1 border-t border-gray-100 dark:border-slate-700 pt-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Transform Selected</p>
                      
                      {/* Opacity */}
                      {(() => {
                          const subj = referenceSubjects.find(s => s.id === activeReferenceId);
                          if (!subj) return null;
                          return (
                              <>
                                  <div>
                                      <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                                          <span>Opacity</span>
                                          <span>{Math.round(subj.opacity * 100)}%</span>
                                      </div>
                                      <input 
                                        type="range" min="0" max="1" step="0.1" 
                                        value={subj.opacity} 
                                        onChange={e => setReferenceSubjects(prev => prev.map(s => s.id === activeReferenceId ? {...s, opacity: parseFloat(e.target.value)} : s))}
                                        className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                      />
                                  </div>
                                  <div>
                                      <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                                          <span>Scale</span>
                                          <span>{subj.scale.toFixed(1)}x</span>
                                      </div>
                                      <input 
                                        type="range" min="0.1" max="2.0" step="0.1" 
                                        value={subj.scale} 
                                        onChange={e => setReferenceSubjects(prev => prev.map(s => s.id === activeReferenceId ? {...s, scale: parseFloat(e.target.value)} : s))}
                                        className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                      />
                                  </div>
                              </>
                          );
                      })()}
                  </div>
              )}
           </div>

           {/* Dynamic Scene Storytelling */}
          <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-3 rounded-lg border border-indigo-500/20">
               <h3 className="panel-title flex items-center gap-2 text-indigo-500 dark:text-indigo-400">
                   <MessageCircle className="w-3 h-3"/> Scene Presets
               </h3>
               <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                   {scenes.map((scene) => (
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
      </div>
  )};

  const renderPortraitTab = () => (
      <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
          <div>
              <h3 className="panel-title flex items-center gap-2"><Smile className="w-3 h-3 text-pink-500"/> Face & Skin</h3>
              <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => handleGenerate("Smooth skin texture naturally, keep pores visible", false)} className="tool-row-btn"><Droplet className="w-3 h-3"/> Smooth Skin</button>
                  <button onClick={() => handleGenerate("Whiten teeth naturally", false)} className="tool-row-btn"><Sparkles className="w-3 h-3"/> Whiten Teeth</button>
                  <button onClick={() => handleGenerate("Enhance eyes, make them sharp and bright", false)} className="tool-row-btn"><Eye className="w-3 h-3"/> Enhance Eyes</button>
                  <button onClick={() => handleGenerate("Remove blemishes and spots", false)} className="tool-row-btn"><Eraser className="w-3 h-3"/> Fix Blemishes</button>
              </div>
          </div>
          <div>
              <h3 className="panel-title flex items-center gap-2"><Shirt className="w-3 h-3 text-purple-500"/> Virtual Try-On</h3>
              <p className="text-[10px] text-gray-500 mb-2">Select clothing item first.</p>
              <div className="grid grid-cols-2 gap-2">
                  <button disabled={!currentSelection} onClick={() => handleVirtualModel("female")} className="tool-row-btn disabled:opacity-50"><User className="w-3 h-3"/> Female Model</button>
                  <button disabled={!currentSelection} onClick={() => handleVirtualModel("male")} className="tool-row-btn disabled:opacity-50"><User className="w-3 h-3"/> Male Model</button>
              </div>
          </div>
      </div>
  );

  const renderProductTab = () => (
      <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
          <div>
              <h3 className="panel-title flex items-center gap-2"><ShoppingBag className="w-3 h-3 text-blue-500"/> Commercial Look</h3>
              <div className="grid grid-cols-1 gap-2">
                  <button onClick={() => handleGenerate("Place on a clean white studio background with soft natural shadow", false)} className="tool-row-btn"><Monitor className="w-3 h-3"/> Studio White</button>
                  <button onClick={() => handleGenerate("Place on a wooden table with warm sunlight coming from window", false)} className="tool-row-btn"><Sun className="w-3 h-3"/> Lifestyle (Wood)</button>
                  <button onClick={() => handleGenerate("Add a realistic reflection on the surface below", false)} className="tool-row-btn"><Layers className="w-3 h-3"/> Add Reflection</button>
              </div>
          </div>
      </div>
  );

  const renderReviewTab = () => (
      <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
          <div>
               <h3 className="panel-title flex items-center gap-2"><Search className="w-3 h-3 text-cyan-500"/> Inspector</h3>
               <div className="flex gap-2 mb-2">
                   <button onClick={() => setInspectorOverlay(inspectorOverlay === 'grid' ? 'none' : 'grid')} className={`flex-1 text-xs p-2 rounded border ${inspectorOverlay === 'grid' ? 'bg-cyan-500 text-white border-cyan-500' : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'}`}>Grid</button>
                   <button onClick={() => setInspectorOverlay(inspectorOverlay === 'exposure' ? 'none' : 'exposure')} className={`flex-1 text-xs p-2 rounded border ${inspectorOverlay === 'exposure' ? 'bg-red-500 text-white border-red-500' : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'}`}>Exposure</button>
               </div>
               <div className="flex gap-2">
                   <button onClick={() => setZoomLevel('fit')} className={`flex-1 text-xs p-2 rounded border ${zoomLevel === 'fit' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'}`}>Fit</button>
                   <button onClick={() => setZoomLevel(1)} className={`flex-1 text-xs p-2 rounded border ${zoomLevel === 1 ? 'bg-blue-500 text-white border-blue-500' : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'}`}>100%</button>
                   <button onClick={() => setZoomLevel(2)} className={`flex-1 text-xs p-2 rounded border ${zoomLevel === 2 ? 'bg-blue-500 text-white border-blue-500' : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'}`}>200%</button>
               </div>
          </div>
          <div>
               <h3 className="panel-title flex items-center gap-2"><Activity className="w-3 h-3 text-orange-500"/> Quality Check</h3>
               {globalAnalysis?.anomalies && globalAnalysis.anomalies.length > 0 ? (
                   <ul className="list-disc pl-4 space-y-1">
                       {globalAnalysis.anomalies.map((issue, i) => (
                           <li key={i} className="text-[10px] text-red-500">{issue}</li>
                       ))}
                   </ul>
               ) : (
                   <p className="text-[10px] text-green-500 flex items-center gap-1"><Check className="w-3 h-3"/> No obvious anomalies detected.</p>
               )}
          </div>
      </div>
  );

  return (
    <div className={`flex flex-col h-screen w-full transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-950 text-slate-200' : 'bg-gray-50 text-gray-900'}`}>
      
      {/* Toast Notification */}
      {toastMessage && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-full shadow-xl z-[100] text-xs font-bold animate-in slide-in-from-top-4 fade-in flex items-center gap-2 pointer-events-auto">
              <Check className="w-3 h-3 text-green-400"/> {toastMessage}
              {toastMessage.includes("restored") && (
                <button onClick={handleUndo} className="ml-2 text-gray-400 hover:text-white border-l border-gray-600 pl-2">
                   UNDO
                </button>
              )}
          </div>
      )}

      {/* Caption Result Overlay */}
      {captionResult && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 p-4 rounded-xl shadow-2xl z-[100] w-96 animate-in slide-in-from-bottom-4 zoom-in-95">
              <div className="flex justify-between items-start mb-2">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-indigo-500"><MessageSquare className="w-4 h-4"/> Caption: {captionResult.subject}</h3>
                  <button onClick={() => setCaptionResult(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X className="w-4 h-4"/></button>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 italic">"{captionResult.text}"</p>
              <div className="flex gap-2">
                  <button 
                     onClick={() => { navigator.clipboard.writeText(captionResult.text); showToast("Copied to clipboard!"); }} 
                     className="flex-1 text-xs bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 py-2 rounded flex items-center justify-center gap-1 transition"
                  >
                      <Copy className="w-3 h-3"/> Copy
                  </button>
                  <button 
                     onClick={() => handleAddTextMode(captionResult.text)} 
                     className="flex-1 text-xs bg-indigo-500 text-white hover:bg-indigo-600 py-2 rounded flex items-center justify-center gap-1 transition shadow-lg shadow-indigo-500/20"
                  >
                      <Type className="w-3 h-3"/> Add Text
                  </button>
              </div>
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
             <div className="flex items-center bg-gray-100 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-slate-700 shadow-sm relative">
                <button onClick={() => { setMode(EditMode.MAGIC_WAND); setIsCleanupMode(false); showToast("Click on an object to extract"); }} className={`tool-icon-btn ${mode === EditMode.MAGIC_WAND ? 'active-indigo' : ''}`} title="Smart Extract"><Sparkle className="w-4 h-4"/></button>
                <div className="w-px h-4 bg-gray-300 dark:bg-slate-600 mx-1"></div>
                <button onClick={() => { setMode(EditMode.SELECT); setIsCleanupMode(false); }} className={`tool-icon-btn ${mode === EditMode.SELECT && !isCleanupMode && !isSelectingReference ? 'active' : ''}`} title="Select"><Scan className="w-4 h-4"/></button>
                <button onClick={() => { setMode(EditMode.ERASE); setIsCleanupMode(true); }} className={`tool-icon-btn ${isCleanupMode ? 'active-red' : ''}`} title="Cleanup"><Eraser className="w-4 h-4"/></button>
                <button onClick={() => handleAddTextMode()} className={`tool-icon-btn ${mode === EditMode.TEXT ? 'active-indigo' : ''}`} title="Text"><TypeIcon className="w-4 h-4"/></button>
                <div className="w-px h-4 bg-gray-300 dark:bg-slate-600 mx-1"></div>
                
                {/* Caption Tool */}
                <button 
                    onClick={() => { setMode(EditMode.CAPTION); showToast("Click anywhere to generate a caption"); }} 
                    className={`tool-icon-btn ${mode === EditMode.CAPTION ? 'active-indigo' : ''}`} 
                    title="Click-to-Caption"
                >
                    <MessageSquare className="w-4 h-4"/>
                </button>
             </div>
             
             {/* Caption Tone Selector - Floating near toolbar when active */}
             {mode === EditMode.CAPTION && (
                 <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-slate-700 shadow-xl flex items-center animate-in slide-in-from-top-2">
                     <button onClick={() => setCaptionTone('funny')} className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold transition ${captionTone === 'funny' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
                         <Smile className="w-3 h-3"/> Funny
                     </button>
                     <button onClick={() => setCaptionTone('angry')} className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold transition ${captionTone === 'angry' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
                         <Frown className="w-3 h-3"/> Angry
                     </button>
                 </div>
             )}
             
             {/* Reference Toggle (Redirects to Creative Tab if not already active) */}
             <button onClick={() => { setActiveTab(EditTab.CREATIVE); }} className={`p-2 rounded-lg transition ${activeTab === EditTab.CREATIVE ? 'bg-blue-500 text-white' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'}`} title="Style Reference">
                 <Layers className="w-5 h-5"/>
             </button>
             <input type="file" ref={referenceInputRef} onChange={handleReferenceUpload} className="hidden"/>

             <div className="flex items-center">
                <button onClick={() => { setActiveTab(EditTab.REVIEW); setMode(EditMode.INSPECT); }} className={`p-2 rounded-lg transition ${mode === EditMode.INSPECT ? 'bg-cyan-500 text-white' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'}`} title="Inspect"><ZoomIn className="w-5 h-5"/></button>
             </div>
         </div>

         <div className="flex items-center gap-4 shrink-0">
             <button onClick={() => setIsExportOpen(true)} className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition shadow-lg shadow-green-600/20 flex items-center gap-1"><FileDown className="w-4 h-4"/> Export</button>
             <div className="h-6 w-px bg-gray-200 dark:bg-slate-800"></div>
             <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="header-icon-btn">{theme === 'dark' ? <Sun className="w-5 h-5"/> : <Moon className="w-5 h-5"/>}</button>
             <button onClick={handleUndo} disabled={currentIndex <= 0} className="header-icon-btn"><RotateCcw className="w-5 h-5"/></button>
             <button onClick={handleRedo} disabled={currentIndex >= history.length - 1} className="header-icon-btn"><RotateCw className="w-5 h-5"/></button>
             <button onClick={() => setIsRightPanelOpen(!isRightPanelOpen)} className={`header-icon-btn ${isRightPanelOpen ? 'bg-gray-100 dark:bg-slate-800' : ''}`} title="Toggle Prompt Panel"><Sliders className="w-5 h-5"/></button>
         </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 flex overflow-hidden relative">
          {/* Left Panel (Tabs) */}
          <aside className="w-16 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 flex flex-col items-center py-4 z-20 shrink-0 gap-4">
               {(['CORE', 'PORTRAIT', 'CREATIVE', 'PRODUCT', 'REVIEW'] as EditTab[]).map(tab => (
                 <button 
                    key={tab}
                    onClick={() => { setActiveTab(tab); if(tab === EditTab.REVIEW) setMode(EditMode.INSPECT); else setMode(EditMode.VIEW); }} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${activeTab === tab ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'}`}
                    title={tab}
                 >
                    {tab === 'CORE' && <Wand2 className="w-5 h-5"/>}
                    {tab === 'PORTRAIT' && <User className="w-5 h-5"/>}
                    {tab === 'CREATIVE' && <Palette className="w-5 h-5"/>}
                    {tab === 'PRODUCT' && <ShoppingBag className="w-5 h-5"/>}
                    {tab === 'REVIEW' && <EyeIcon className="w-5 h-5"/>}
                 </button>
               ))}
          </aside>

          {/* Left Drawer (Context) */}
          <div className="w-64 bg-white dark:bg-slate-900/50 border-r border-gray-200 dark:border-slate-800 flex flex-col z-10 transition-colors shrink-0">
               <div className="p-4 border-b border-gray-200 dark:border-slate-800">
                   <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 tracking-wide">{activeTab} TOOLS</h2>
               </div>
               <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  {activeTab === EditTab.CORE && renderCoreTab()}
                  {/* Portrait only if human */}
                  {activeTab === EditTab.PORTRAIT && (globalAnalysis?.category === 'Human' ? renderPortraitTab() : <div className="text-xs text-gray-400 text-center p-4">No human subject detected for Portrait tools.</div>)}
                  {activeTab === EditTab.CREATIVE && renderCreativeTab()}
                  {activeTab === EditTab.PRODUCT && renderProductTab()}
                  {activeTab === EditTab.REVIEW && renderReviewTab()}
               </div>
          </div>

          <div className="flex-1 relative bg-gray-100 dark:bg-slate-950 transition-colors flex flex-col">
             {!displayImage && (
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
                 {displayImage && <button onClick={clearMainImage} className="absolute top-4 right-4 z-50 p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg hover:scale-110 transition"><X className="w-5 h-5"/></button>}
                 
                 {/* Top Floating Prompt when selecting reference */}
                 {isSelectingReference && (
                     <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-orange-500 text-white px-4 py-2 rounded-full shadow-lg z-50 animate-bounce font-bold text-sm">
                         Draw a box to capture reference style
                     </div>
                 )}
                 
                 {/* Top Hint for Magic Wand */}
                 {mode === EditMode.MAGIC_WAND && (
                     <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-indigo-500 text-white px-4 py-2 rounded-full shadow-lg z-50 animate-bounce font-bold text-sm flex items-center gap-2">
                         <MousePointer2 className="w-4 h-4"/> Click on object to Extract
                     </div>
                 )}
                 
                 {/* Top Hint for Caption Mode */}
                 {mode === EditMode.CAPTION && (
                     <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg z-50 font-bold text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
                         <MessageSquare className="w-4 h-4"/> Click on subject to caption ({captionTone})
                     </div>
                 )}
                 
                 {/* Top Hint for Reference Edit Mode */}
                 {mode === EditMode.REFERENCE_EDIT && (
                     <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg z-50 font-bold text-sm flex items-center gap-2">
                         <Sparkles className="w-4 h-4"/> Click object to extract OR 
                         <button onClick={handleUseFullReference} className="bg-white text-blue-600 px-2 py-0.5 rounded ml-2 text-xs">Use Full</button>
                         <button onClick={() => { setMode(EditMode.VIEW); setTempReferenceImage(null); }} className="bg-black/20 hover:bg-black/40 px-2 py-0.5 rounded ml-2 text-xs">Cancel</button>
                     </div>
                 )}

                <ImageEditor 
                    ref={editorRef}
                    imageDataUrl={displayImage}
                    mode={mode}
                    onSelectionChange={handleSelectionChange}
                    onCanvasClick={handleCanvasClick}
                    isProcessing={isProcessing}
                    showMask={showMask}
                    compareImageDataUrl={activeCompare ? compareImage : null}
                    textOverlay={textOverlay}
                    onTextChange={setTextOverlay}
                    enable3D={is3DMode}
                    inspectorOverlay={inspectorOverlay}
                    zoomLevel={zoomLevel}
                    
                    // Multi-Ref Props
                    referenceSubjects={referenceSubjects}
                    activeReferenceId={activeReferenceId}
                    onReferenceSelect={setActiveReferenceId}
                    onReferenceTransform={(id, updates) => setReferenceSubjects(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))}
                    
                    // Cleanup Props
                    onStrokeEnd={() => showToast("Cleanup restored")}
                />
             </div>

             {/* Bottom Floating Controls */}
             {displayImage && (
                 <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/90 dark:bg-slate-800/90 backdrop-blur px-4 py-2 rounded-full shadow-xl border border-gray-200 dark:border-slate-700 z-10">
                     <button onClick={() => setCompareToggle(!compareToggle)} className={`icon-toggle ${compareToggle ? 'active' : ''}`}><LayoutTemplate className="w-5 h-5"/></button>
                     <div className="w-px h-4 bg-gray-300 dark:bg-slate-600"></div>
                     <button onClick={() => { setIs3DMode(!is3DMode); setMode(EditMode.VIEW); }} className={`icon-toggle ${is3DMode ? 'active' : ''}`}><Box className="w-5 h-5"/></button>
                 </div>
             )}
          </div>

          {/* Right Prompting Panel */}
          {isRightPanelOpen && (
              <aside className="w-80 bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-800 flex flex-col z-20 shrink-0 transition-all duration-300">
                  <div className="p-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
                      <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          <MessageCircle className="w-4 h-4 text-blue-500"/> Prompt Builder
                      </h2>
                      {globalAnalysis && (
                          <span className="text-[10px] bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded border border-green-500/20">
                             {globalAnalysis.category}
                          </span>
                      )}
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                      {renderQuickSuggestions()}
                      {renderPromptBuilder()}
                      
                      <div className="mt-4">
                          <h3 className="panel-title flex items-center gap-2"><History className="w-3 h-3 text-gray-400"/> History</h3>
                          <div className="space-y-2">
                              {history.map((item, idx) => (
                                  <div key={item.timestamp} className={`text-[10px] p-2 rounded border cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800 transition ${currentIndex === idx ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10' : 'border-gray-200 dark:border-slate-800 text-gray-500'}`} onClick={() => setCurrentIndex(idx)}>
                                      <div className="font-bold mb-0.5 truncate">{item.prompt || "Manual Edit"}</div>
                                      <div className="text-[9px] text-gray-400">{new Date(item.timestamp).toLocaleTimeString()}</div>
                                  </div>
                              ))}
                              {history.length === 0 && <div className="text-[10px] text-gray-400 italic">No edit history yet.</div>}
                          </div>
                      </div>
                  </div>
              </aside>
          )}

          {/* Export Dialog Overlay */}
          {isExportOpen && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-96 overflow-hidden border border-gray-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
                      <div className="p-4 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center">
                          <h3 className="font-bold text-lg flex items-center gap-2"><FileDown className="w-5 h-5 text-green-500"/> Export Image</h3>
                          <button onClick={() => setIsExportOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X className="w-5 h-5"/></button>
                      </div>
                      <div className="p-6 space-y-6">
                          {/* File Name */}
                          <div>
                              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">File Name</label>
                              <input 
                                type="text" 
                                value={exportConfig.filename} 
                                onChange={e => setExportConfig({...exportConfig, filename: e.target.value})}
                                className="w-full bg-gray-100 dark:bg-slate-800 border-none rounded p-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                              />
                          </div>
                          
                          {/* Format & Scale Grid */}
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Format</label>
                                  <select 
                                     value={exportConfig.format} 
                                     onChange={e => setExportConfig({...exportConfig, format: e.target.value as ExportFormat})}
                                     className="w-full bg-gray-100 dark:bg-slate-800 border-none rounded p-2 text-sm outline-none"
                                  >
                                      <option value="png">PNG (Lossless)</option>
                                      <option value="jpeg">JPEG (Compressed)</option>
                                      <option value="webp">WebP (Efficient)</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Scale</label>
                                  <select 
                                     value={exportConfig.scale} 
                                     onChange={e => setExportConfig({...exportConfig, scale: parseInt(e.target.value)})}
                                     className="w-full bg-gray-100 dark:bg-slate-800 border-none rounded p-2 text-sm outline-none"
                                  >
                                      <option value="1">1x (Original)</option>
                                      <option value="2">2x</option>
                                      <option value="4">4x</option>
                                  </select>
                              </div>
                          </div>

                          {/* AI Upscale Toggle */}
                          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30 flex items-start gap-3">
                              <div className="mt-1"><Sparkles className="w-4 h-4 text-blue-500"/></div>
                              <div className="flex-1">
                                  <div className="flex justify-between items-center mb-1">
                                      <span className="text-sm font-bold text-blue-700 dark:text-blue-300">AI Super-Resolution</span>
                                      <input 
                                        type="checkbox" 
                                        checked={exportConfig.upscale} 
                                        onChange={e => setExportConfig({...exportConfig, upscale: e.target.checked})}
                                        className="toggle-checkbox"
                                      />
                                  </div>
                                  <p className="text-[10px] text-blue-600/70 dark:text-blue-400/70 leading-tight">
                                      Enhance details, reduce noise, and sharpen edges using Gemini Vision models during export. Recommended for 2x/4x scales.
                                  </p>
                              </div>
                          </div>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-slate-800/50 flex justify-end gap-3">
                          <button onClick={() => setIsExportOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
                          <button onClick={handleExport} className="px-6 py-2 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-lg shadow-green-600/20">Download</button>
                      </div>
                  </div>
              </div>
          )}

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