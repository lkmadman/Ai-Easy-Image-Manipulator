import { SelectionBox } from "../types";

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
  return dataUrl.split(',')[1];
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