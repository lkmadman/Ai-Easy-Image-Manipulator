import { SelectionBox, ExportFormat } from "../types";

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

export const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
  });
};

// Extracts the base64 data string (removes "data:image/png;base64," prefix)
export const cleanBase64 = (dataUrl: string): string => {
  if (dataUrl.includes(',')) {
    return dataUrl.split(',')[1];
  }
  return dataUrl;
};

export const resizeImage = async (base64Str: string, maxWidth = 1024, maxHeight = 1024): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
          reject(new Error("Could not get context"));
          return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (err) => reject(err);
  });
};

export const cropImage = async (base64Image: string, box: SelectionBox): Promise<string> => {
  const img = await loadImage(base64Image);
  const canvas = document.createElement('canvas');
  canvas.width = box.width;
  canvas.height = box.height;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error("Could not get context");
  
  ctx.drawImage(
    img, 
    box.x, box.y, box.width, box.height, 
    0, 0, box.width, box.height
  );
  
  return canvas.toDataURL('image/png');
};

export const applyAlphaMask = async (imageSrc: string, maskSrc: string): Promise<string> => {
  const [img, mask] = await Promise.all([loadImage(imageSrc), loadImage(maskSrc)]);
  
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Could not get context");
  
  // Draw original image
  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  // Draw mask to a temp canvas to extract pixel data safely
  // Note: We assume maskSrc might be resized by AI, so we draw it stretched to fit original if needed
  // This ensures the mask applies even if resolution shifted slightly during processing
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  const mCtx = maskCanvas.getContext('2d');
  if (!mCtx) throw new Error("Could not get mask context");
  
  mCtx.drawImage(mask, 0, 0, canvas.width, canvas.height);
  const maskData = mCtx.getImageData(0, 0, canvas.width, canvas.height);
  
  // Apply mask to alpha channel
  for (let i = 0; i < imgData.data.length; i += 4) {
    // Use the red channel of the mask as the alpha value
    // Assuming mask is white (255) for keep, black (0) for remove
    const alpha = maskData.data[i]; 
    imgData.data[i + 3] = alpha;
  }
  
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
};

export const downloadImage = async (dataUrl: string, filename: string, format: ExportFormat = 'png', quality: number = 0.9) => {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Fill background white for JPEGs (transparency becomes black otherwise)
  if (format === 'jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(img, 0, 0);
  
  const mimeType = `image/${format}`;
  const newDataUrl = canvas.toDataURL(mimeType, quality);
  
  const link = document.createElement('a');
  link.href = newDataUrl;
  link.download = `${filename}.${format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const invertMask = async (maskBase64: string): Promise<string> => {
  const img = await loadImage(maskBase64);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("No context");

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    // Invert Red, Green, Blue
    // Assuming Black/White mask, we just invert.
    data[i] = 255 - data[i];     // R
    data[i + 1] = 255 - data[i + 1]; // G
    data[i + 2] = 255 - data[i + 2]; // B
    // Alpha remains 255
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
};