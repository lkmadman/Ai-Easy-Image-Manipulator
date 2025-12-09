import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { SelectionBox, EditMode, TextOverlay, InspectorOverlay, ReferenceOverlayState, QuickLabel } from '../types';
import { loadImage } from '../utils/imageUtils';

interface ImageEditorProps {
  imageDataUrl: string | null;
  mode: EditMode;
  onSelectionChange: (box: SelectionBox | null) => void;
  isProcessing: boolean;
  enable3D?: boolean;
  showMask?: boolean;
  compareImageDataUrl?: string | null; 
  textOverlay?: TextOverlay | null;
  onTextChange?: (text: TextOverlay) => void;
  inspectorOverlay?: InspectorOverlay;
  zoomLevel?: number | 'fit'; 
  
  // New props
  referenceOverlay?: ReferenceOverlayState | null;
  onReferenceChange?: (ref: ReferenceOverlayState) => void;
  quickLabels?: QuickLabel[];
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
  isProcessing,
  enable3D = false,
  showMask = false,
  compareImageDataUrl = null,
  textOverlay,
  onTextChange,
  inspectorOverlay = 'none',
  zoomLevel = 'fit',
  referenceOverlay,
  onReferenceChange,
  quickLabels = []
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const exposureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  const [compareImageObj, setCompareImageObj] = useState<HTMLImageElement | null>(null);
  const [referenceImgObj, setReferenceImgObj] = useState<HTMLImageElement | null>(null);
  
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  
  const [baseMetrics, setBaseMetrics] = useState({ scale: 1, ox: 0, oy: 0 });
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });

  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [sliderPos, setSliderPos] = useState(0.5); 
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);

  // Load Reference Image Object
  useEffect(() => {
    if (referenceOverlay?.url) {
      loadImage(referenceOverlay.url).then(setReferenceImgObj).catch(() => setReferenceImgObj(null));
    } else {
      setReferenceImgObj(null);
    }
  }, [referenceOverlay?.url]);

  useImperativeHandle(ref, () => ({
    getMaskDataUrl: () => {
      if (!maskCanvasRef.current || !imageObj) return null;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageObj.width;
      tempCanvas.height = imageObj.height;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(maskCanvasRef.current, 0, 0);
      
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = 'white';
      ctx.fillRect(0,0, tempCanvas.width, tempCanvas.height);
      
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
        
        if (textOverlay) {
             ctx.font = `${textOverlay.fontWeight || 'normal'} ${textOverlay.fontSize}px ${textOverlay.fontFamily}`;
             ctx.fillStyle = textOverlay.color;
             if (textOverlay.shadowBlur && textOverlay.shadowBlur > 0) {
                 ctx.shadowColor = textOverlay.shadowColor || 'black';
                 ctx.shadowBlur = textOverlay.shadowBlur;
             }
             ctx.fillText(textOverlay.text, textOverlay.x, textOverlay.y);
        }
        return tempCanvas.toDataURL('image/png');
    },
    resetZoom: () => setTransform({ scale: 1, x: 0, y: 0 }),
    forceRedraw: () => draw()
  }));

  // Handle Zoom Prop
  useEffect(() => {
    if ((mode === EditMode.INSPECT || mode === EditMode.REFERENCE) && typeof zoomLevel === 'number' && imageObj) {
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
              
              if (luma > 245) { // Highlight Clipping
                  data[i] = 255; data[i+1] = 0; data[i+2] = 0; data[i+3] = 255;
              } else if (luma < 10) { // Shadow Crushing
                  data[i] = 0; data[i+1] = 0; data[i+2] = 255; data[i+3] = 255;
              } else {
                  data[i+3] = 0; // Transparent
              }
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
        setSelectionBox(null);
        onSelectionChange(null);
        exposureCanvasRef.current = null; 
        if (maskCanvasRef.current) {
            const ctx = maskCanvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, img.width, img.height);
        }
      });
    } else {
        setImageObj(null);
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
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
    
    // Stabilization: only update baseMetrics if strictly necessary to avoid jitter
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

    // Draw Helpers
    const drawText = () => {
        if (textOverlay) {
             const tx = ox + textOverlay.x * currentScale;
             const ty = oy + textOverlay.y * currentScale;
             ctx.font = `${textOverlay.fontWeight || 'normal'} ${textOverlay.fontSize * currentScale}px ${textOverlay.fontFamily}`;
             ctx.fillStyle = textOverlay.color;
             if (textOverlay.shadowBlur && textOverlay.shadowBlur > 0) {
                 ctx.shadowColor = textOverlay.shadowColor || 'black';
                 ctx.shadowBlur = textOverlay.shadowBlur * currentScale;
             } else {
                 ctx.shadowColor = 'transparent';
                 ctx.shadowBlur = 0;
             }
             ctx.fillText(textOverlay.text, tx, ty);
             ctx.shadowColor = 'transparent';
             ctx.shadowBlur = 0;
             
             if (mode === EditMode.TEXT) {
                 const metrics = ctx.measureText(textOverlay.text);
                 const h = textOverlay.fontSize * currentScale;
                 ctx.strokeStyle = '#facc15';
                 ctx.setLineDash([4, 2]);
                 ctx.strokeRect(tx - 5, ty - h, metrics.width + 10, h + 10);
                 ctx.setLineDash([]);
             }
        }
    };

    const drawQuickLabels = () => {
        if (quickLabels.length > 0) {
            ctx.font = `bold ${12 * Math.max(1, Math.min(2, currentScale))}px sans-serif`;
            quickLabels.forEach(lbl => {
                const lx = ox + lbl.x * currentScale;
                const ly = oy + lbl.y * currentScale;
                
                const padding = 4;
                const metrics = ctx.measureText(lbl.text);
                const h = 12 * Math.max(1, Math.min(2, currentScale));
                
                ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
                ctx.fillRect(lx, ly - h, metrics.width + padding * 2, h + padding);
                
                ctx.fillStyle = "white";
                ctx.fillText(lbl.text, lx + padding, ly);
                
                // Pin
                ctx.beginPath();
                ctx.arc(lx, ly, 3, 0, Math.PI * 2);
                ctx.fillStyle = "#facc15";
                ctx.fill();
            });
        }
    };

    const drawReference = () => {
        if (referenceImgObj && referenceOverlay) {
            ctx.globalAlpha = referenceOverlay.opacity;
            // refX/Y are relative to image coordinates (0-imageWidth)
            const rx = ox + referenceOverlay.x * currentScale;
            const ry = oy + referenceOverlay.y * currentScale;
            const rw = referenceImgObj.width * referenceOverlay.scale * currentScale;
            const rh = referenceImgObj.height * referenceOverlay.scale * currentScale;
            
            ctx.drawImage(referenceImgObj, rx, ry, rw, rh);
            
            // Selection box for reference
            if (mode === EditMode.REFERENCE) {
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(rx, ry, rw, rh);
                ctx.setLineDash([]);
                // Resize handle hint
                ctx.fillStyle = '#3b82f6';
                ctx.fillRect(rx + rw - 5, ry + rh - 5, 10, 10);
            }
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
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.beginPath();
            ctx.moveTo(ox + drawW/2, oy); ctx.lineTo(ox + drawW/2, oy + drawH);
            ctx.moveTo(ox, oy + drawH/2); ctx.lineTo(ox + drawW, oy + drawH/2);
            ctx.stroke();
        }
        if (inspectorOverlay === 'exposure' && exposureCanvasRef.current) {
            ctx.globalAlpha = 0.6;
            ctx.drawImage(exposureCanvasRef.current, 0, 0, imageObj.width, imageObj.height, ox, oy, drawW, drawH);
            ctx.globalAlpha = 1.0;
        }
    };

    // Drawing Logic
    if (compareImageObj && !enable3D) {
        // Slider Compare
        ctx.drawImage(compareImageObj, ox, oy, drawW, drawH);
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(ox + 10, oy + 10, 80, 24);
        ctx.fillStyle = "white";
        ctx.font = "12px sans-serif";
        ctx.fillText("Before", ox + 20, oy + 26);

        ctx.save();
        const splitX = ox + drawW * sliderPos;
        ctx.beginPath();
        ctx.rect(ox, oy, splitX - ox, drawH);
        ctx.clip();
        
        ctx.drawImage(imageObj, ox, oy, drawW, drawH);
        drawText();
        drawOverlays();
        drawReference();
        drawQuickLabels();
        
        if (maskCanvasRef.current && showMask) {
            ctx.globalAlpha = 0.5;
            ctx.drawImage(maskCanvasRef.current, 0, 0, imageObj.width, imageObj.height, ox, oy, drawW, drawH);
            ctx.globalAlpha = 1.0;
        }
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(ox + 10, oy + drawH - 34, 80, 24);
        ctx.fillStyle = "white";
        ctx.font = "12px sans-serif";
        ctx.fillText("After", ox + 20, oy + drawH - 18);
        ctx.restore();

        // Slider Handle
        ctx.beginPath();
        ctx.moveTo(splitX, oy);
        ctx.lineTo(splitX, oy + drawH);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(splitX, oy + drawH / 2, 15, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.stroke();
        ctx.fillStyle = "#333";
        ctx.beginPath();
        ctx.moveTo(splitX - 4, oy + drawH / 2);
        ctx.lineTo(splitX - 8, oy + drawH / 2 - 4);
        ctx.lineTo(splitX - 8, oy + drawH / 2 + 4);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(splitX + 4, oy + drawH / 2);
        ctx.lineTo(splitX + 8, oy + drawH / 2 - 4);
        ctx.lineTo(splitX + 8, oy + drawH / 2 + 4);
        ctx.fill();
    } else {
        // Standard View
        ctx.drawImage(imageObj, ox, oy, drawW, drawH);
        drawText();
        drawReference();
        drawOverlays();
        drawQuickLabels();

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
            } else {
                ctx.globalAlpha = 0.3;
                ctx.drawImage(maskCanvasRef.current, 0, 0, imageObj.width, imageObj.height, ox, oy, drawW, drawH);
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
        }
    }
  }, [imageObj, compareImageObj, selectionBox, transform, baseMetrics, showMask, sliderPos, textOverlay, mode, enable3D, inspectorOverlay, referenceOverlay, referenceImgObj, quickLabels]);

  // Stable Resize Observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
        window.requestAnimationFrame(draw);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [draw]);

  const getImageCoords = (e: React.MouseEvent) => {
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

  const handleContainerMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || !enable3D) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Tilt effect calculation
    const rotateX = ((y / rect.height) - 0.5) * -20; 
    const rotateY = ((x / rect.width) - 0.5) * 20;

    setTilt({ x: rotateX, y: rotateY });
  };

  const handleContainerMouseLeave = () => {
    if (enable3D) {
       setTilt({ x: 0, y: 0 });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
      // Allow wheel zoom in INSPECT and REFERENCE mode
      if ((mode === EditMode.INSPECT || mode === EditMode.REFERENCE) && canvasRef.current && imageObj) {
          e.preventDefault();
          const rect = canvasRef.current.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          const maxWidth = containerRef.current?.clientWidth || 0;
          const maxHeight = containerRef.current?.clientHeight || 0;
          const centerX = maxWidth / 2;
          const centerY = maxHeight / 2;
          const currentPanX = transform.x;
          const currentPanY = transform.y;
          const relX = mouseX - centerX - currentPanX;
          const relY = mouseY - centerY - currentPanY;

          const delta = e.deltaY > 0 ? 0.9 : 1.1;
          const newScale = Math.max(0.1, Math.min(10, transform.scale * delta));
          const scaleChange = newScale / transform.scale;
          const newPanX = currentPanX + relX * (1 - scaleChange);
          const newPanY = currentPanY + relY * (1 - scaleChange);

          setTransform({ scale: newScale, x: newPanX, y: newPanY });
      }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (enable3D) return;
    const pos = getImageCoords(e);

    // Reference Mode Dragging
    if (mode === EditMode.REFERENCE && referenceOverlay && onReferenceChange) {
        setIsDragging(true);
        setStartPos({ x: pos.x, y: pos.y }); // Store image coords
        onReferenceChange({ ...referenceOverlay, isDragging: true });
        return;
    }

    if (mode === EditMode.INSPECT) {
        setIsDragging(true);
        setStartPos({ x: e.clientX, y: e.clientY });
        return;
    }

    if (compareImageObj) {
         const canvas = canvasRef.current;
         if (!canvas || !imageObj) return;
         const rect = canvas.getBoundingClientRect();
         const clickX = e.clientX - rect.left;
         const maxWidth = containerRef.current?.clientWidth || 0;
         const currentScale = baseMetrics.scale * transform.scale;
         const cx = maxWidth / 2 + transform.x;
         const drawW = imageObj.width * currentScale;
         const ox = cx - drawW / 2;
         const splitX = ox + drawW * sliderPos;
         
         if (Math.abs(clickX - splitX) < 40) {
             setIsDraggingSlider(true);
         }
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

    const mCtx = maskCanvasRef.current?.getContext('2d');
    if (!mCtx) return;

    if (mode === EditMode.SELECT) {
        mCtx.clearRect(0, 0, imageObj.width, imageObj.height);
        setSelectionBox(null); 
    } else if (mode === EditMode.ERASE) {
        mCtx.globalCompositeOperation = 'destination-out';
        mCtx.beginPath();
        const r = 10 / (baseMetrics.scale * transform.scale);
        mCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        mCtx.fill();
    }
    draw();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (enable3D) { handleContainerMouseMove(e); return; }

    const pos = getImageCoords(e);

    // Reference Dragging
    if (mode === EditMode.REFERENCE && isDragging && referenceOverlay && onReferenceChange) {
        const dx = pos.x - startPos.x;
        const dy = pos.y - startPos.y;
        onReferenceChange({
            ...referenceOverlay,
            x: referenceOverlay.x + dx,
            y: referenceOverlay.y + dy
        });
        setStartPos({ x: pos.x, y: pos.y }); // Update for delta
        return;
    }

    if (mode === EditMode.INSPECT && isDragging) {
        const dx = e.clientX - startPos.x;
        const dy = e.clientY - startPos.y;
        setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        setStartPos({ x: e.clientX, y: e.clientY });
        return;
    }

    if (isDraggingSlider && imageObj) {
        const maxWidth = containerRef.current?.clientWidth || 0;
        const currentScale = baseMetrics.scale * transform.scale;
        const cx = maxWidth / 2 + transform.x;
        const drawW = imageObj.width * currentScale;
        const ox = cx - drawW / 2;
        const relativeX = pos.rawX - ox;
        const newPos = Math.max(0, Math.min(1, relativeX / drawW));
        setSliderPos(newPos);
        draw();
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
        
        mCtx.globalCompositeOperation = 'source-over';
        mCtx.clearRect(0, 0, imageObj.width, imageObj.height);
        mCtx.fillStyle = '#facc15';
        mCtx.fillRect(cx, cy, cw, ch);

    } else if (mode === EditMode.ERASE) {
        mCtx.globalCompositeOperation = 'destination-out';
        const r = 20 / (baseMetrics.scale * transform.scale);
        mCtx.lineWidth = r;
        mCtx.lineCap = 'round';
        mCtx.lineJoin = 'round';
        mCtx.beginPath();
        mCtx.moveTo(startPos.x, startPos.y);
        mCtx.lineTo(pos.x, pos.y);
        mCtx.stroke();
        setStartPos(pos);
    }
    draw();
  };

  const handleMouseUp = () => {
    setIsDraggingSlider(false);
    if (isDragging) {
      setIsDragging(false);
      if (mode === EditMode.REFERENCE && referenceOverlay && onReferenceChange) {
           onReferenceChange({ ...referenceOverlay, isDragging: false });
      }
      if (mode === EditMode.SELECT && selectionBox) {
        onSelectionChange(selectionBox);
      }
    }
  };

  return (
    <div 
      ref={containerRef} 
      className={`flex-1 w-full h-full flex items-center justify-center overflow-hidden relative select-none bg-transparent ${mode === EditMode.INSPECT || mode === EditMode.REFERENCE ? 'cursor-move' : ''}`}
      onMouseMove={enable3D ? handleContainerMouseMove : undefined}
      onMouseLeave={handleContainerMouseLeave}
      onWheel={handleWheel}
    >
      {!imageDataUrl && (
        <div className="text-slate-500 dark:text-slate-400 text-center p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg animate-in fade-in zoom-in duration-500">
          <p className="mb-2 text-xl font-semibold">Your Canvas Awaits</p>
          <p className="text-sm">Upload an image to start designing brilliance</p>
        </div>
      )}
      
      <canvas
        ref={canvasRef}
        className={`shadow-2xl dark:shadow-black transition-transform duration-100 ease-out ${mode === EditMode.SELECT && !enable3D ? 'cursor-crosshair' : mode === EditMode.ERASE && !enable3D ? 'cursor-cell' : isDraggingSlider ? 'cursor-col-resize' : ''}`}
        style={{
            transform: enable3D ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` : 'none',
            transformStyle: 'preserve-3d'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      
      {/* 3D Hint */}
      {enable3D && imageDataUrl && (
          <div className="absolute top-4 bg-blue-500/80 text-white px-3 py-1 rounded-full text-sm backdrop-blur pointer-events-none border border-blue-400 font-medium animate-bounce">
            Move mouse to rotate 3D view
         </div>
      )}
    </div>
  );
});

ImageEditor.displayName = 'ImageEditor';