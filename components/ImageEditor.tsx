
import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { SelectionBox, EditMode, TextOverlay, InspectorOverlay, ReferenceSubject, Point } from '../types';
import { loadImage } from '../utils/imageUtils';

interface ImageEditorProps {
  imageDataUrl: string | null;
  mode: EditMode;
  onSelectionChange: (box: SelectionBox | null) => void;
  onCanvasClick?: (point: Point) => void;
  isProcessing: boolean;
  enable3D?: boolean;
  showMask?: boolean;
  compareImageDataUrl?: string | null; 
  textOverlay?: TextOverlay | null;
  onTextChange?: (text: TextOverlay) => void;
  inspectorOverlay?: InspectorOverlay;
  zoomLevel?: number | 'fit'; 
  
  // Updated prop for multiple subjects
  referenceSubjects?: ReferenceSubject[];
  activeReferenceId?: string | null;
  onReferenceTransform?: (id: string, updates: Partial<ReferenceSubject>) => void;
  onReferenceSelect?: (id: string | null) => void;
  
  // New prop for cleanup
  onStrokeEnd?: () => void;
}

export interface ImageEditorHandle {
  getMaskDataUrl: () => string | null;
  getCanvasDataUrl: () => string | null;
  resetZoom: () => void;
  forceRedraw: () => void;
}

export const ImageEditor = forwardRef<ImageEditorHandle, ImageEditorProps>(({ 
  imageDataUrl, 
  mode, 
  onSelectionChange,
  onCanvasClick,
  isProcessing,
  enable3D = false,
  showMask = false,
  compareImageDataUrl = null,
  textOverlay,
  onTextChange,
  inspectorOverlay = 'none',
  zoomLevel = 'fit',
  referenceSubjects = [],
  activeReferenceId,
  onReferenceTransform,
  onReferenceSelect,
  onStrokeEnd
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Use a ref to hold the offscreen canvas for the mask
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const exposureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  const [compareImageObj, setCompareImageObj] = useState<HTMLImageElement | null>(null);
  
  // Cache for reference images: { [id]: HTMLImageElement }
  const [refImages, setRefImages] = useState<Record<string, HTMLImageElement>>({});
  
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [clickStartTime, setClickStartTime] = useState(0);
  const [hasDrawn, setHasDrawn] = useState(false);
  
  const [baseMetrics, setBaseMetrics] = useState({ scale: 1, ox: 0, oy: 0 });
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });

  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [sliderPos, setSliderPos] = useState(0.5); 
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);

  // Load Reference Image Objects
  useEffect(() => {
    const loadRefs = async () => {
        const newRefs: Record<string, HTMLImageElement> = {};
        for (const subj of referenceSubjects) {
            if (!refImages[subj.id] && subj.visible) {
                try {
                    const img = await loadImage(subj.url);
                    newRefs[subj.id] = img;
                } catch (e) { console.error("Failed to load ref image", subj.id); }
            } else if (refImages[subj.id]) {
                newRefs[subj.id] = refImages[subj.id];
            }
        }
        setRefImages(newRefs);
    };
    loadRefs();
  }, [referenceSubjects]);

  useImperativeHandle(ref, () => ({
    getMaskDataUrl: () => {
      if (!maskCanvasRef.current || !imageObj) return null;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageObj.width;
      tempCanvas.height = imageObj.height;
      const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      // 1. Draw the mask (transparent bg, white strokes)
      ctx.drawImage(maskCanvasRef.current, 0, 0);
      
      // 2. Ensure mask is pure white where drawn
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      
      // 3. Fill background with black behind the mask
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      
      return tempCanvas.toDataURL('image/png');
    },
    getCanvasDataUrl: () => {
        if (!imageObj || !canvasRef.current) return null;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imageObj.width;
        tempCanvas.height = imageObj.height;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return null;

        ctx.drawImage(imageObj, 0, 0);
        return tempCanvas.toDataURL('image/png');
    },
    resetZoom: () => setTransform({ scale: 1, x: 0, y: 0 }),
    forceRedraw: () => draw()
  }));

  // Handle Zoom Prop
  useEffect(() => {
    if ((mode === EditMode.INSPECT) && typeof zoomLevel === 'number' && imageObj) {
         if (baseMetrics.scale > 0) {
             setTransform({ scale: zoomLevel / baseMetrics.scale, x: 0, y: 0 });
         }
    } else if (zoomLevel === 'fit') {
        setTransform({ scale: 1, x: 0, y: 0 });
    }
  }, [zoomLevel, mode, imageObj, baseMetrics.scale]); 

  // Exposure Map
  useEffect(() => {
      if (imageObj && inspectorOverlay === 'exposure' && !exposureCanvasRef.current) {
          const c = document.createElement('canvas');
          c.width = imageObj.width;
          c.height = imageObj.height;
          const ctx = c.getContext('2d');
          if (!ctx) return;
          
          ctx.drawImage(imageObj, 0, 0);
          const imageData = ctx.getImageData(0, 0, c.width, c.height);
          const data = imageData.data;
          
          for (let i = 0; i < data.length; i += 4) {
              const r = data[i];
              const g = data[i+1];
              const b = data[i+2];
              const luma = 0.299 * r + 0.587 * g + 0.114 * b;
              
              if (luma > 245) { data[i] = 255; data[i+1] = 0; data[i+2] = 0; data[i+3] = 255; } 
              else if (luma < 10) { data[i] = 0; data[i+1] = 0; data[i+2] = 255; data[i+3] = 255; } 
              else { data[i+3] = 0; }
          }
          ctx.putImageData(imageData, 0, 0);
          exposureCanvasRef.current = c;
      }
      if (inspectorOverlay !== 'exposure') exposureCanvasRef.current = null; 
  }, [imageObj, inspectorOverlay]);

  // Load Main Image
  useEffect(() => {
    if (imageDataUrl) {
      loadImage(imageDataUrl).then((img) => {
        setImageObj(img);
        const mc = document.createElement('canvas');
        mc.width = img.width;
        mc.height = img.height;
        maskCanvasRef.current = mc;
        setSelectionBox(null);
        onSelectionChange(null);
        exposureCanvasRef.current = null; 
      });
    } else {
        setImageObj(null);
        maskCanvasRef.current = null;
    }
  }, [imageDataUrl, onSelectionChange]);

  useEffect(() => {
      if (compareImageDataUrl) {
          loadImage(compareImageDataUrl).then(setCompareImageObj);
      } else {
          setCompareImageObj(null);
      }
  }, [compareImageDataUrl]);

  // Main Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!imageObj) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const maxWidth = container.clientWidth;
    const maxHeight = container.clientHeight;
    
    // Base fit scale
    const scaleX = maxWidth / imageObj.width;
    const scaleY = maxHeight / imageObj.height;
    const baseScale = Math.min(scaleX, scaleY, 0.9);
    
    // Stabilization
    if (Math.abs(baseScale - baseMetrics.scale) > 0.001 || baseMetrics.scale === 1) {
        setBaseMetrics({ scale: baseScale, ox: (maxWidth - imageObj.width * baseScale) / 2, oy: (maxHeight - imageObj.height * baseScale) / 2 });
    }

    const currentScale = baseScale * transform.scale;
    const cx = maxWidth / 2 + transform.x;
    const cy = maxHeight / 2 + transform.y;
    const drawW = imageObj.width * currentScale;
    const drawH = imageObj.height * currentScale;
    const ox = cx - drawW / 2;
    const oy = cy - drawH / 2;

    canvas.width = maxWidth;
    canvas.height = maxHeight;
    
    ctx.imageSmoothingEnabled = currentScale < 4; 

    // Helper: Draw single reference subject
    const drawReferenceSubject = (subj: ReferenceSubject) => {
        const img = refImages[subj.id];
        if (img && subj.visible) {
            ctx.save();
            ctx.globalAlpha = subj.opacity;
            
            const rx = ox + subj.x * currentScale;
            const ry = oy + subj.y * currentScale;
            const rw = img.width * subj.scale * currentScale;
            const rh = img.height * subj.scale * currentScale;
            
            // Transform (Center origin)
            const rcx = rx + rw / 2;
            const rcy = ry + rh / 2;
            
            ctx.translate(rcx, rcy);
            ctx.rotate((subj.rotation || 0) * Math.PI / 180);
            ctx.drawImage(img, -rw / 2, -rh / 2, rw, rh);
            
            // Selection box if active
            if (activeReferenceId === subj.id && mode !== EditMode.REFERENCE_EDIT) {
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(-rw / 2, -rh / 2, rw, rh);
                ctx.setLineDash([]);
                
                // Drag handle
                ctx.fillStyle = '#3b82f6';
                ctx.fillRect(rw / 2 - 6, rh / 2 - 6, 12, 12);
            }
            
            ctx.restore();
            ctx.globalAlpha = 1.0;
        }
    };

    const drawOverlays = () => {
        if (inspectorOverlay === 'grid') {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            const w3 = drawW / 3;
            const h3 = drawH / 3;
            ctx.moveTo(ox + w3, oy); ctx.lineTo(ox + w3, oy + drawH);
            ctx.moveTo(ox + w3 * 2, oy); ctx.lineTo(ox + w3 * 2, oy + drawH);
            ctx.moveTo(ox, oy + h3); ctx.lineTo(ox + drawW, oy + h3);
            ctx.moveTo(ox, oy + h3 * 2); ctx.lineTo(ox + drawW, oy + h3 * 2);
            ctx.stroke();
        }
        if (inspectorOverlay === 'exposure' && exposureCanvasRef.current) {
            ctx.globalAlpha = 0.6;
            ctx.drawImage(exposureCanvasRef.current, 0, 0, imageObj.width, imageObj.height, ox, oy, drawW, drawH);
            ctx.globalAlpha = 1.0;
        }
    };

    const drawMaskAndSelection = () => {
         if (maskCanvasRef.current) {
            ctx.save();
            if (showMask) {
                const tempC = document.createElement('canvas');
                tempC.width = imageObj.width;
                tempC.height = imageObj.height;
                const tCtx = tempC.getContext('2d');
                if (tCtx) {
                    tCtx.drawImage(maskCanvasRef.current, 0,0);
                    tCtx.globalCompositeOperation = 'source-in';
                    tCtx.fillStyle = 'rgba(239, 68, 68, 0.5)';
                    tCtx.fillRect(0,0, tempC.width, tempC.height);
                }
                ctx.drawImage(tempC, ox, oy, drawW, drawH);
            } else if (mode === EditMode.ERASE || mode === EditMode.SELECT) {
                // Show mask overlay
                ctx.save();
                ctx.globalAlpha = 0.5;
                ctx.drawImage(maskCanvasRef.current, 0, 0, imageObj.width, imageObj.height, ox, oy, drawW, drawH);
                ctx.restore();
            }
            ctx.restore();
        }

        if (selectionBox) {
            const sx = ox + selectionBox.x * currentScale;
            const sy = oy + selectionBox.y * currentScale;
            const sw = selectionBox.width * currentScale;
            const sh = selectionBox.height * currentScale;
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 2]);
            ctx.strokeRect(sx, sy, sw, sh);
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(250, 204, 21, 0.1)';
            ctx.fillRect(sx, sy, sw, sh);
        }
    };

    // Draw Loop
    ctx.drawImage(imageObj, ox, oy, drawW, drawH);
    
    if (compareImageObj && !enable3D && mode !== EditMode.REFERENCE_EDIT) {
        // Slider Compare
        ctx.save();
        const splitX = ox + drawW * sliderPos;
        ctx.beginPath(); ctx.rect(splitX, oy, drawW - (splitX - ox), drawH); ctx.clip();
        ctx.drawImage(compareImageObj, ox, oy, drawW, drawH);
        ctx.restore();
        
        ctx.beginPath(); ctx.moveTo(splitX, oy); ctx.lineTo(splitX, oy + drawH);
        ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke();
    }

    // Draw Reference Subjects (Sorted by Z)
    if (mode !== EditMode.REFERENCE_EDIT) {
        const sortedRefs = [...referenceSubjects].sort((a,b) => a.zOrder - b.zOrder);
        sortedRefs.forEach(drawReferenceSubject);
    }

    drawOverlays();
    drawMaskAndSelection();
    
    // Text Overlay
    if (textOverlay) {
         const tx = ox + textOverlay.x * currentScale;
         const ty = oy + textOverlay.y * currentScale;
         ctx.font = `${textOverlay.fontWeight || 'normal'} ${textOverlay.fontSize * currentScale}px ${textOverlay.fontFamily}`;
         ctx.fillStyle = textOverlay.color;
         if (textOverlay.shadowBlur) {
             ctx.shadowColor = textOverlay.shadowColor || 'black';
             ctx.shadowBlur = textOverlay.shadowBlur * currentScale;
         }
         ctx.fillText(textOverlay.text, tx, ty);
    }

  }, [imageObj, compareImageObj, selectionBox, transform, baseMetrics, showMask, sliderPos, textOverlay, mode, enable3D, inspectorOverlay, referenceSubjects, refImages, activeReferenceId]);

  // Resize Observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => window.requestAnimationFrame(draw));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [draw]);

  const getImageCoords = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !imageObj) return { x: 0, y: 0, rawX: 0, rawY: 0 };
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    const currentScale = baseMetrics.scale * transform.scale;
    const maxWidth = containerRef.current?.clientWidth || 0;
    const maxHeight = containerRef.current?.clientHeight || 0;
    
    const cx = maxWidth / 2 + transform.x;
    const cy = maxHeight / 2 + transform.y;
    const drawW = imageObj.width * currentScale;
    const drawH = imageObj.height * currentScale;
    const ox = cx - drawW / 2;
    const oy = cy - drawH / 2;

    return { 
        x: (clickX - ox) / currentScale, 
        y: (clickY - oy) / currentScale,
        rawX: clickX,
        rawY: clickY
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Capture pointer to track drawing outside element
    e.currentTarget.setPointerCapture(e.pointerId);
    
    setClickStartTime(Date.now());
    if (enable3D) return;
    const pos = getImageCoords(e);

    // Reference Subject Selection & Dragging
    if (mode !== EditMode.REFERENCE_EDIT && mode !== EditMode.MAGIC_WAND && mode !== EditMode.CAPTION && mode !== EditMode.ERASE) {
        // Reverse iterate to find top-most selected subject
        const sortedRefs = [...referenceSubjects].sort((a,b) => b.zOrder - a.zOrder);
        let clickedSubj = null;

        for (const subj of sortedRefs) {
            const img = refImages[subj.id];
            if (!img || !subj.visible) continue;
            
            const w = img.width * subj.scale;
            const h = img.height * subj.scale;
            if (pos.x >= subj.x && pos.x <= subj.x + w && pos.y >= subj.y && pos.y <= subj.y + h) {
                clickedSubj = subj;
                break;
            }
        }

        if (clickedSubj) {
            if (onReferenceSelect) onReferenceSelect(clickedSubj.id);
            if (onReferenceTransform) {
                setIsDragging(true);
                setStartPos({ x: pos.x, y: pos.y });
                onReferenceTransform(clickedSubj.id, { isDragging: true });
                return; 
            }
        } else if (onReferenceSelect) {
            onReferenceSelect(null);
        }
    }

    if (mode === EditMode.INSPECT) {
        setIsDragging(true);
        setStartPos({ x: e.clientX, y: e.clientY });
        return;
    }

    if (mode === EditMode.MAGIC_WAND || mode === EditMode.REFERENCE_EDIT || mode === EditMode.CAPTION) {
         setStartPos({ x: pos.x, y: pos.y });
         return;
    }

    if (!imageObj || isProcessing) return;

    if (mode === EditMode.TEXT && textOverlay) {
        setIsDragging(true);
        return;
    }

    if (mode === EditMode.VIEW) return;

    setIsDragging(true);
    setStartPos({ x: pos.x, y: pos.y });
    setHasDrawn(false);

    // Mask interactions
    const mCtx = maskCanvasRef.current?.getContext('2d');
    if (mode === EditMode.SELECT && mCtx) {
        mCtx.clearRect(0, 0, imageObj.width, imageObj.height);
        setSelectionBox(null); 
    } else if (mode === EditMode.ERASE && mCtx) {
        // Start brush stroke
        mCtx.globalCompositeOperation = 'source-over';
        mCtx.fillStyle = 'white';
        mCtx.strokeStyle = 'white';
        // Refined brush kernel: soft edge with shadow
        mCtx.shadowColor = 'white';
        mCtx.shadowBlur = 4;
        mCtx.lineCap = 'round';
        mCtx.lineJoin = 'round';
        
        const r = 30 / (baseMetrics.scale * transform.scale);
        mCtx.lineWidth = r;
        
        mCtx.beginPath();
        mCtx.arc(pos.x, pos.y, r/2, 0, Math.PI * 2);
        mCtx.fill();
        mCtx.beginPath();
        mCtx.moveTo(pos.x, pos.y);
        
        setHasDrawn(true);
        draw();
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // 3D Tilt
    if (enable3D && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setTilt({ x: ((y / rect.height) - 0.5) * -20, y: ((x / rect.width) - 0.5) * 20 });
        return;
    }

    const pos = getImageCoords(e);

    // Reference Dragging
    if (isDragging && activeReferenceId && onReferenceTransform) {
        const activeSubj = referenceSubjects.find(r => r.id === activeReferenceId);
        if (activeSubj) {
            const dx = pos.x - startPos.x;
            const dy = pos.y - startPos.y;
            onReferenceTransform(activeReferenceId, { x: activeSubj.x + dx, y: activeSubj.y + dy });
            setStartPos({ x: pos.x, y: pos.y });
            return;
        }
    }

    if (mode === EditMode.INSPECT && isDragging) {
        const dx = e.clientX - startPos.x;
        const dy = e.clientY - startPos.y;
        setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        setStartPos({ x: e.clientX, y: e.clientY });
        return;
    }

    if (isDragging && mode === EditMode.TEXT && textOverlay && onTextChange) {
        onTextChange({ ...textOverlay, x: pos.x, y: pos.y });
        return;
    }

    if (!isDragging || !imageObj) return;

    const mCtx = maskCanvasRef.current?.getContext('2d');
    if (!mCtx) return;

    if (mode === EditMode.SELECT) {
        const x = Math.min(startPos.x, pos.x);
        const y = Math.min(startPos.y, pos.y);
        const w = Math.abs(pos.x - startPos.x);
        const h = Math.abs(pos.y - startPos.y);
        const cx = Math.max(0, x);
        const cy = Math.max(0, y);
        const cw = Math.min(imageObj.width - cx, w);
        const ch = Math.min(imageObj.height - cy, h);
        setSelectionBox({ x: cx, y: cy, width: cw, height: ch });
        mCtx.clearRect(0, 0, imageObj.width, imageObj.height);
        mCtx.fillStyle = 'white';
        mCtx.fillRect(cx, cy, cw, ch);
    } else if (mode === EditMode.ERASE) {
        const r = 30 / (baseMetrics.scale * transform.scale);
        mCtx.lineWidth = r;
        mCtx.lineTo(pos.x, pos.y);
        mCtx.stroke();
        setHasDrawn(true);
    }
    draw();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDraggingSlider(false);
    const clickDuration = Date.now() - clickStartTime;
    
    // Magic Wand / Reference Edit / Caption Click
    if ((mode === EditMode.MAGIC_WAND || mode === EditMode.REFERENCE_EDIT || mode === EditMode.CAPTION) && clickDuration < 300 && onCanvasClick) {
        const pos = getImageCoords(e);
        if (imageObj && pos.x >= 0 && pos.x <= imageObj.width && pos.y >= 0 && pos.y <= imageObj.height) {
            onCanvasClick({ x: pos.x, y: pos.y });
        }
    }

    if (isDragging) {
      setIsDragging(false);
      if (activeReferenceId && onReferenceTransform) {
           onReferenceTransform(activeReferenceId, { isDragging: false });
      }
      if (mode === EditMode.SELECT && selectionBox) {
        onSelectionChange(selectionBox);
      }
      if (mode === EditMode.ERASE && hasDrawn && onStrokeEnd) {
        onStrokeEnd();
      }
    }
  };

  return (
    <div 
      ref={containerRef} 
      className={`flex-1 w-full h-full flex items-center justify-center overflow-hidden relative select-none bg-transparent ${mode === EditMode.INSPECT ? 'cursor-move' : ''}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setTilt({x:0, y:0})}
      onPointerUp={handlePointerUp}
    >
      {!imageDataUrl && (
        <div className="text-slate-500 dark:text-slate-400 text-center p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg animate-in fade-in zoom-in duration-500">
          <p className="mb-2 text-xl font-semibold">Your Canvas Awaits</p>
          <p className="text-sm">Upload an image to start designing brilliance</p>
        </div>
      )}
      
      <canvas
        ref={canvasRef}
        className={`shadow-2xl dark:shadow-black transition-transform duration-100 ease-out ${mode === EditMode.SELECT || mode === EditMode.ERASE ? 'cursor-crosshair' : (mode === EditMode.MAGIC_WAND || mode === EditMode.REFERENCE_EDIT || mode === EditMode.CAPTION) ? 'cursor-help' : ''}`}
        style={{
            transform: enable3D ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` : 'none',
            transformStyle: 'preserve-3d',
            touchAction: 'none' 
        }}
        onPointerDown={handlePointerDown}
      />
    </div>
  );
});

ImageEditor.displayName = 'ImageEditor';
