import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { SelectionBox, EditMode } from '../types';
import { loadImage } from '../utils/imageUtils';

interface ImageEditorProps {
  imageDataUrl: string | null;
  mode: EditMode;
  onSelectionChange: (box: SelectionBox | null) => void;
  isProcessing: boolean;
}

export interface ImageEditorHandle {
  getMaskDataUrl: () => string | null;
}

export const ImageEditor = forwardRef<ImageEditorHandle, ImageEditorProps>(({ 
  imageDataUrl, 
  mode, 
  onSelectionChange,
  isProcessing 
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // We use an offscreen canvas to store the actual mask data (black/white or transparent/color)
  // Dimensions match the image original size
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  // We track the bounds of the active drawing area for the crop logic
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  
  // Track visual scale to map mouse events to image coordinates
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // Center image

  // Expose method to get the mask
  useImperativeHandle(ref, () => ({
    getMaskDataUrl: () => {
      if (!maskCanvasRef.current || !imageObj) return null;
      // We need to return a black and white mask where white is selected
      // The current maskCanvasRef has transparency for unselected and color for selected.
      // Let's create a temp canvas to composite the final binary mask.
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageObj.width;
      tempCanvas.height = imageObj.height;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return null;

      // Fill black (unselected)
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      // Draw the mask (which is currently just alpha/color)
      // We want the non-transparent pixels from maskCanvasRef to be white.
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(maskCanvasRef.current, 0, 0);
      
      // Now, we need to ensure the color pixels become white.
      // Since our mask drawing uses fillRect with color, we can just use composite operation 'source-in' with white?
      // Simpler: Iterate pixels or use 'source-in' with a white fill.
      
      // Actually, easier way: 
      // 1. Clear temp
      // 2. Draw maskCanvas
      // 3. Composite "source-in" with White color.
      // 4. Composite "destination-over" with Black color.
      
      ctx.clearRect(0,0, tempCanvas.width, tempCanvas.height);
      ctx.drawImage(maskCanvasRef.current, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = 'white';
      ctx.fillRect(0,0, tempCanvas.width, tempCanvas.height);
      
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = 'black';
      ctx.fillRect(0,0, tempCanvas.width, tempCanvas.height);

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
        // Resize if image changes dimensions (rare here but good practice)
        if (maskCanvasRef.current.width !== imageObj.width) {
            maskCanvasRef.current.width = imageObj.width;
            maskCanvasRef.current.height = imageObj.height;
        }
    }
  }, [imageObj]);

  // Load image
  useEffect(() => {
    if (imageDataUrl) {
      loadImage(imageDataUrl).then((img) => {
        setImageObj(img);
        setSelectionBox(null);
        onSelectionChange(null);
        // Clear mask
        if (maskCanvasRef.current) {
            const ctx = maskCanvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, img.width, img.height);
        }
      });
    }
  }, [imageDataUrl, onSelectionChange]);

  // Main Draw Function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !imageObj) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate layout
    const maxWidth = container.clientWidth;
    const maxHeight = container.clientHeight;
    
    const scaleX = maxWidth / imageObj.width;
    const scaleY = maxHeight / imageObj.height;
    const newScale = Math.min(scaleX, scaleY, 1);
    
    const newWidth = imageObj.width * newScale;
    const newHeight = imageObj.height * newScale;
    
    // Center logic
    const ox = (maxWidth - newWidth) / 2;
    const oy = (maxHeight - newHeight) / 2;

    setScale(newScale);
    setOffset({ x: ox, y: oy });

    // Set canvas to container size to allow full screen usage
    canvas.width = maxWidth;
    canvas.height = maxHeight;

    // 1. Draw Image
    ctx.drawImage(imageObj, ox, oy, newWidth, newHeight);

    // 2. Draw Mask Overlay
    if (maskCanvasRef.current) {
        ctx.save();
        ctx.globalAlpha = 0.5; // Semi-transparent mask
        // We draw the mask scaled and offset
        ctx.drawImage(maskCanvasRef.current, 0, 0, imageObj.width, imageObj.height, ox, oy, newWidth, newHeight);
        ctx.restore();
    }
    
    // 3. Draw UI Handles for Box (Optional, mostly visual guide if box exists)
    if (selectionBox) {
        // Project box to screen coords
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

  }, [imageObj, selectionBox, scale, offset]); // Add refs if needed, but they are mutable

  // Trigger draw on updates
  useEffect(() => {
    let frameId: number;
    const loop = () => {
        draw();
        // frameId = requestAnimationFrame(loop); // Animate if needed, otherwise just draw on change
    };
    loop();
    window.addEventListener('resize', loop);
    return () => window.removeEventListener('resize', loop);
  }, [draw]);

  // Mouse Handlers
  const getImageCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // Convert to image space
    const imgX = (clickX - offset.x) / scale;
    const imgY = (clickY - offset.y) / scale;
    
    return { x: imgX, y: imgY };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageObj || isProcessing) return;
    
    if (mode === EditMode.VIEW) return;

    const pos = getImageCoords(e);
    setIsDragging(true);
    setStartPos(pos);

    const mCtx = maskCanvasRef.current?.getContext('2d');
    if (!mCtx) return;

    if (mode === EditMode.SELECT) {
        // Start a new box selection -> clears previous mask?
        // Usually, a new selection replaces the old one.
        // We don't clear yet, we clear on drag or mouse up to be smoother?
        // Let's clear immediately for responsiveness.
        mCtx.clearRect(0, 0, imageObj.width, imageObj.height);
        setSelectionBox(null); 
    } else if (mode === EditMode.ERASE) {
        // Start erasing
        mCtx.globalCompositeOperation = 'destination-out';
        mCtx.beginPath();
        mCtx.arc(pos.x, pos.y, 10 / scale, 0, Math.PI * 2); // Brush size relative to image
        mCtx.fill();
    }
    draw();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !imageObj) return;
    const currentPos = getImageCoords(e);
    const mCtx = maskCanvasRef.current?.getContext('2d');
    if (!mCtx) return;

    if (mode === EditMode.SELECT) {
        // Update box logic
        const x = Math.min(startPos.x, currentPos.x);
        const y = Math.min(startPos.y, currentPos.y);
        const w = Math.abs(currentPos.x - startPos.x);
        const h = Math.abs(currentPos.y - startPos.y);
        
        // Clamp to image
        const cx = Math.max(0, x);
        const cy = Math.max(0, y);
        const cw = Math.min(imageObj.width - cx, w);
        const ch = Math.min(imageObj.height - cy, h);

        setSelectionBox({ x: cx, y: cy, width: cw, height: ch });
        
        // Update mask in real-time
        mCtx.globalCompositeOperation = 'source-over';
        mCtx.clearRect(0, 0, imageObj.width, imageObj.height);
        mCtx.fillStyle = '#facc15'; // The "Mask Color"
        mCtx.fillRect(cx, cy, cw, ch);

    } else if (mode === EditMode.ERASE) {
        // Erase Logic (Brush)
        mCtx.globalCompositeOperation = 'destination-out';
        mCtx.lineWidth = 20 / scale; // Brush size
        mCtx.lineCap = 'round';
        mCtx.lineJoin = 'round';
        mCtx.beginPath();
        mCtx.moveTo(startPos.x, startPos.y); // Cheap linear interpolation for smoother strokes needed ideally
        // For simplicity, just draw to current pos
        mCtx.lineTo(currentPos.x, currentPos.y);
        mCtx.stroke();
        
        // Update start pos for next segment
        setStartPos(currentPos);
    }
    draw();
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      // Notify parent of the bounding box change (for suggestions mainly)
      // For Eraser, the box doesn't change, but the mask does.
      if (mode === EditMode.SELECT && selectionBox) {
        onSelectionChange(selectionBox);
      } else if (mode === EditMode.ERASE && selectionBox) {
        // We trigger an update just so the parent knows interaction happened? 
        // Not strictly necessary for identifying objects unless we want to re-identify based on mask.
        // Let's keep identification based on the initial bounding box for stability.
      }
    }
  };

  return (
    <div 
      ref={containerRef} 
      className="flex-1 w-full h-full flex items-center justify-center overflow-hidden relative select-none"
      style={{
        backgroundColor: '#1e293b', // slate-800
        backgroundImage: 'linear-gradient(45deg, #0f172a 25%, transparent 25%), linear-gradient(-45deg, #0f172a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #0f172a 75%), linear-gradient(-45deg, transparent 75%, #0f172a 75%)',
        backgroundSize: '20px 20px',
        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
      }}
    >
      {!imageDataUrl && (
        <div className="text-slate-500 text-center p-8 border-2 border-dashed border-slate-700 rounded-lg">
          <p className="mb-2 text-xl font-semibold">No Image Loaded</p>
          <p className="text-sm">Upload an image to start editing</p>
        </div>
      )}
      
      <canvas
        ref={canvasRef}
        className={`shadow-2xl shadow-black ${mode === EditMode.SELECT ? 'cursor-crosshair' : mode === EditMode.ERASE ? 'cursor-cell' : 'cursor-default'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      
      {/* Help Overlay */}
      {mode === EditMode.SELECT && !selectionBox && imageDataUrl && !isProcessing && (
         <div className="absolute top-4 bg-slate-800/80 text-white px-3 py-1 rounded-full text-sm backdrop-blur pointer-events-none border border-slate-600">
            Click and drag to select an area to edit
         </div>
      )}
      {mode === EditMode.ERASE && selectionBox && (
         <div className="absolute top-4 bg-slate-800/80 text-white px-3 py-1 rounded-full text-sm backdrop-blur pointer-events-none border border-slate-600">
            Paint to un-select areas
         </div>
      )}
    </div>
  );
});

ImageEditor.displayName = 'ImageEditor';