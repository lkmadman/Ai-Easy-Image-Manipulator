
import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { SelectionBox, EditMode, TextOverlay } from '../types';
import { loadImage } from '../utils/imageUtils';

interface ImageEditorProps {
  imageDataUrl: string | null;
  mode: EditMode;
  onSelectionChange: (box: SelectionBox | null) => void;
  isProcessing: boolean;
  enable3D?: boolean;
  showMask?: boolean;
  compareImageDataUrl?: string | null; 
  textOverlay?: TextOverlay | null; // Current text being edited
  onTextChange?: (text: TextOverlay) => void;
}

export interface ImageEditorHandle {
  getMaskDataUrl: () => string | null;
  getCanvasDataUrl: () => string | null; // For baking text
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
  onTextChange
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  const [compareImageObj, setCompareImageObj] = useState<HTMLImageElement | null>(null);
  
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // 3D Tilt State
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  // Slider State
  const [sliderPos, setSliderPos] = useState(0.5); // 0 to 1
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);

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
      
      // Ensure binary mask (white/black)
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = 'white';
      ctx.fillRect(0,0, tempCanvas.width, tempCanvas.height);
      
      return tempCanvas.toDataURL('image/png');
    },
    getCanvasDataUrl: () => {
        // Used to burn text into image
        if (!imageObj || !canvasRef.current) return null;
        // We need to render the image + text at full resolution, not screen resolution
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
    }
  }));

  // Initialize Mask Canvas
  useEffect(() => {
    if (imageObj && !maskCanvasRef.current) {
      const mc = document.createElement('canvas');
      mc.width = imageObj.width;
      mc.height = imageObj.height;
      maskCanvasRef.current = mc;
    } else if (imageObj && maskCanvasRef.current) {
        if (maskCanvasRef.current.width !== imageObj.width) {
            maskCanvasRef.current.width = imageObj.width;
            maskCanvasRef.current.height = imageObj.height;
        }
    }
  }, [imageObj]);

  // Load Main Image
  useEffect(() => {
    if (imageDataUrl) {
      loadImage(imageDataUrl).then((img) => {
        setImageObj(img);
        setSelectionBox(null);
        onSelectionChange(null);
        if (maskCanvasRef.current) {
            const ctx = maskCanvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, img.width, img.height);
        }
      });
    }
  }, [imageDataUrl, onSelectionChange]);

  // Load Compare Image
  useEffect(() => {
      if (compareImageDataUrl) {
          loadImage(compareImageDataUrl).then(setCompareImageObj);
      } else {
          setCompareImageObj(null);
      }
  }, [compareImageDataUrl]);

  // Main Draw Function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    
    if (!canvas || !container || !imageObj) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const maxWidth = container.clientWidth;
    const maxHeight = container.clientHeight;
    
    const scaleX = maxWidth / imageObj.width;
    const scaleY = maxHeight / imageObj.height;
    const newScale = Math.min(scaleX, scaleY, 0.9); 
    
    const newWidth = imageObj.width * newScale;
    const newHeight = imageObj.height * newScale;
    
    const ox = (maxWidth - newWidth) / 2;
    const oy = (maxHeight - newHeight) / 2;

    // Update state refs only if changed to avoid loop (though hooks handle deps)
    if (newScale !== scale) setScale(newScale);
    if (ox !== offset.x || oy !== offset.y) setOffset({ x: ox, y: oy });

    canvas.width = maxWidth;
    canvas.height = maxHeight;

    // Helper to draw text
    const drawText = () => {
        if (textOverlay) {
             const tx = ox + textOverlay.x * newScale;
             const ty = oy + textOverlay.y * newScale;
             ctx.font = `${textOverlay.fontWeight || 'normal'} ${textOverlay.fontSize * newScale}px ${textOverlay.fontFamily}`;
             ctx.fillStyle = textOverlay.color;
             
             if (textOverlay.shadowBlur && textOverlay.shadowBlur > 0) {
                 ctx.shadowColor = textOverlay.shadowColor || 'black';
                 ctx.shadowBlur = textOverlay.shadowBlur * newScale;
             } else {
                 ctx.shadowColor = 'transparent';
                 ctx.shadowBlur = 0;
             }
             
             ctx.fillText(textOverlay.text, tx, ty);
             
             // Reset shadow
             ctx.shadowColor = 'transparent';
             ctx.shadowBlur = 0;

             // Draw bounding box if in Text Mode
             if (mode === EditMode.TEXT) {
                 const metrics = ctx.measureText(textOverlay.text);
                 const h = textOverlay.fontSize * newScale;
                 ctx.strokeStyle = '#facc15';
                 ctx.setLineDash([4, 2]);
                 ctx.strokeRect(tx - 5, ty - h, metrics.width + 10, h + 10);
                 ctx.setLineDash([]);
             }
        }
    };

    // --- Render Logic ---

    if (compareImageObj && !enable3D) {
        // --- Slider Comparison Mode ---
        
        // Draw Original (Bottom Layer) - Full
        ctx.drawImage(compareImageObj, ox, oy, newWidth, newHeight);
        
        // Label Original
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(ox + 10, oy + 10, 80, 24);
        ctx.fillStyle = "white";
        ctx.font = "12px sans-serif";
        ctx.fillText("Before", ox + 20, oy + 26);

        // Draw Current (Top Layer) - Clipped
        ctx.save();
        const splitX = ox + newWidth * sliderPos;
        ctx.beginPath();
        ctx.rect(ox, oy, splitX - ox, newHeight);
        ctx.clip();
        
        ctx.drawImage(imageObj, ox, oy, newWidth, newHeight);
        
        // Draw Text Overlay (Only on current side)
        drawText();
        
        // Draw Mask (Only on current side)
        if (maskCanvasRef.current && showMask) {
            ctx.globalAlpha = 0.5;
            ctx.drawImage(maskCanvasRef.current, 0, 0, imageObj.width, imageObj.height, ox, oy, newWidth, newHeight);
            ctx.globalAlpha = 1.0;
        }

        // Label Current
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(ox + 10, oy + newHeight - 34, 80, 24);
        ctx.fillStyle = "white";
        ctx.font = "12px sans-serif";
        ctx.fillText("After", ox + 20, oy + newHeight - 18);

        ctx.restore();

        // Draw Slider Line
        ctx.beginPath();
        ctx.moveTo(splitX, oy);
        ctx.lineTo(splitX, oy + newHeight);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Slider Handle
        ctx.beginPath();
        ctx.arc(splitX, oy + newHeight / 2, 15, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.stroke();

        // Arrows in handle
        ctx.fillStyle = "#333";
        ctx.beginPath();
        ctx.moveTo(splitX - 4, oy + newHeight / 2);
        ctx.lineTo(splitX - 8, oy + newHeight / 2 - 4);
        ctx.lineTo(splitX - 8, oy + newHeight / 2 + 4);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(splitX + 4, oy + newHeight / 2);
        ctx.lineTo(splitX + 8, oy + newHeight / 2 - 4);
        ctx.lineTo(splitX + 8, oy + newHeight / 2 + 4);
        ctx.fill();

    } else {
        // --- Standard View Mode ---
        
        ctx.drawImage(imageObj, ox, oy, newWidth, newHeight);

        // Text Overlay
        drawText();

        // Mask
        if (maskCanvasRef.current) {
            ctx.save();
            if (showMask) {
                 // Red overlay for showMask
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
                ctx.drawImage(tempC, ox, oy, newWidth, newHeight);
            } else {
                ctx.globalAlpha = 0.3;
                ctx.drawImage(maskCanvasRef.current, 0, 0, imageObj.width, imageObj.height, ox, oy, newWidth, newHeight);
            }
            ctx.restore();
        }

        // Selection Box
        if (selectionBox) {
            const sx = ox + selectionBox.x * newScale;
            const sy = oy + selectionBox.y * newScale;
            const sw = selectionBox.width * newScale;
            const sh = selectionBox.height * newScale;

            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 2]);
            ctx.strokeRect(sx, sy, sw, sh);
            ctx.setLineDash([]);
        }
    }

  }, [imageObj, compareImageObj, selectionBox, scale, offset, showMask, sliderPos, textOverlay, mode, enable3D]);

  // Draw Loop
  useEffect(() => {
    const loop = () => draw();
    loop();
    window.addEventListener('resize', loop);
    return () => window.removeEventListener('resize', loop);
  }, [draw]);

  // 3D Tilt Logic
  const handleContainerMouseMove = (e: React.MouseEvent) => {
    if (!enable3D || !canvasRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -10; 
    const rotateY = ((x - centerX) / centerX) * 10;
    setTilt({ x: rotateX, y: rotateY });
  };
  const handleContainerMouseLeave = () => setTilt({ x: 0, y: 0 });

  // Mouse Handlers
  const getImageCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    return { 
        x: (clickX - offset.x) / scale, 
        y: (clickY - offset.y) / scale,
        rawX: clickX,
        rawY: clickY
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (enable3D) return;
    
    const pos = getImageCoords(e);

    // Slider Logic
    if (compareImageObj) {
         // Check if near slider handle
         const canvas = canvasRef.current;
         if (!canvas) return;
         const rect = canvas.getBoundingClientRect();
         const clickX = e.clientX - rect.left;
         const splitX = offset.x + (imageObj?.width || 0) * scale * sliderPos;
         
         if (Math.abs(clickX - splitX) < 40) {
             setIsDraggingSlider(true);
         }
         return;
    }

    if (!imageObj || isProcessing) return;

    if (mode === EditMode.TEXT && textOverlay) {
        // Simple drag text anywhere for now, can add hit testing later
        setIsDragging(true);
        // We actually want to update text position
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
        mCtx.arc(pos.x, pos.y, 10 / scale, 0, Math.PI * 2);
        mCtx.fill();
    }
    draw();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (enable3D) { handleContainerMouseMove(e); return; }

    const pos = getImageCoords(e);

    if (isDraggingSlider && imageObj) {
        const newWidth = imageObj.width * scale;
        const relativeX = pos.rawX - offset.x;
        const newPos = Math.max(0, Math.min(1, relativeX / newWidth));
        setSliderPos(newPos);
        draw();
        return;
    }

    if (isDragging && mode === EditMode.TEXT && textOverlay && onTextChange) {
        // Dragging text
        onTextChange({
            ...textOverlay,
            x: pos.x,
            y: pos.y
        });
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
        mCtx.lineWidth = 20 / scale;
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
      if (mode === EditMode.SELECT && selectionBox) {
        onSelectionChange(selectionBox);
      }
    }
  };

  return (
    <div 
      ref={containerRef} 
      className="flex-1 w-full h-full flex items-center justify-center overflow-hidden relative select-none bg-transparent"
      onMouseMove={enable3D ? handleContainerMouseMove : undefined}
      onMouseLeave={handleContainerMouseLeave}
    >
      {!imageDataUrl && (
        <div className="text-slate-500 dark:text-slate-400 text-center p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg animate-in fade-in zoom-in duration-500">
          <p className="mb-2 text-xl font-semibold">Your Canvas Awaits</p>
          <p className="text-sm">Upload an image to start designing brilliance</p>
        </div>
      )}
      
      <canvas
        ref={canvasRef}
        className={`shadow-2xl dark:shadow-black transition-transform duration-100 ease-out ${mode === EditMode.SELECT && !enable3D ? 'cursor-crosshair' : mode === EditMode.ERASE && !enable3D ? 'cursor-cell' : isDraggingSlider ? 'cursor-col-resize' : 'cursor-default'}`}
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

      {/* Slider Hint */}
      {compareImageDataUrl && !isDraggingSlider && (
          <div className="absolute top-4 bg-slate-800/80 text-white px-3 py-1 rounded-full text-sm backdrop-blur pointer-events-none border border-slate-600">
            Drag slider to compare
          </div>
      )}
    </div>
  );
});

ImageEditor.displayName = 'ImageEditor';
