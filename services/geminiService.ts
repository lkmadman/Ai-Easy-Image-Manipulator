import { GoogleGenAI } from "@google/genai";
import { cleanBase64, invertMask, resizeImage } from "../utils/imageUtils";
import { GlobalAnalysisResult } from "../types";

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Max dimension for standard editing to avoid timeouts
const MAX_DIMENSION = 1024;
// Max dimension for analysis (can be smaller)
const ANALYSIS_DIMENSION = 800;

/**
 * Sends an image and a prompt to Gemini for editing.
 * Accepts an optional mask image and a style reference image.
 */
export const editImageWithGemini = async (
  imageBase64: string,
  prompt: string,
  maskImageBase64?: string,
  shouldInvertMask: boolean = false,
  styleReferenceBase64?: string
): Promise<string> => {
  try {
    // Resize main image
    const resizedImage = await resizeImage(imageBase64, MAX_DIMENSION, MAX_DIMENSION);
    const cleanData = cleanBase64(resizedImage);
    const parts: any[] = [
        {
          inlineData: {
            mimeType: 'image/png',
            data: cleanData,
          },
        }
    ];

    let fullPrompt = `Act as a professional photo editor. Task: Edit the provided image based on this instruction: "${prompt}".`;

    // Handle Mask
    if (maskImageBase64) {
      let finalMask = maskImageBase64;
      if (shouldInvertMask) {
        finalMask = await invertMask(maskImageBase64);
      }
      
      // Resize mask to ensure it matches the resized main image context effectively,
      // or at least doesn't blow up the payload. 
      const resizedMask = await resizeImage(finalMask, MAX_DIMENSION, MAX_DIMENSION);
      const cleanMask = cleanBase64(resizedMask);
      
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: cleanMask,
        },
      });
      fullPrompt += " A mask image is provided (second image). Edit ONLY the pixels in the first image that correspond to the white areas in the mask. The rest of the image must remain exactly unchanged.";
    } else {
       fullPrompt += " Edit the image globally or find the object described.";
    }

    // Handle Style Reference
    if (styleReferenceBase64) {
        const resizedStyle = await resizeImage(styleReferenceBase64, MAX_DIMENSION, MAX_DIMENSION);
        const cleanStyle = cleanBase64(resizedStyle);
        parts.push({
            inlineData: {
                mimeType: 'image/png',
                data: cleanStyle
            }
        });
        fullPrompt += " A reference style image is provided (the last image). Analyze its colors, lighting, textures, and mood. Apply this visual style to the edited area of the primary image.";
    }
    
    // CRITICAL: Explicitly forbid text/JSON output
    fullPrompt += " OUTPUT: Generate the modified image directly. Do NOT return JSON, text descriptions, or metadata. Return ONLY the image.";

    parts.push({ text: fullPrompt });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: parts,
      },
    });

    const candidate = response.candidates?.[0];

    if (!candidate) {
        throw new Error("No candidates returned from the model.");
    }

    // Explicit handling for various block reasons
    const finishReason = candidate.finishReason;
    
    if (finishReason === 'SAFETY' || finishReason === 'BLOCKLIST' || finishReason === 'PROHIBITED_CONTENT') {
        throw new Error("The request was blocked by safety filters.");
    }

    if (finishReason === 'RECITATION' || finishReason === 'IMAGE_RECITATION') {
        throw new Error("The request was blocked due to copyright or recitation restrictions. Try a different image or a more transformative edit.");
    }

    if (!candidate.content?.parts) {
        throw new Error(`The model returned no content (Finish Reason: ${finishReason}).`);
    }

    for (const part of candidate.content.parts) {
      if (part.inlineData && part.inlineData.data) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    // Fallback: Check for text explanation if no image
    const textPart = candidate.content.parts.find(p => p.text)?.text;
    if (textPart) {
        // If the model returned JSON or text despite instructions, throw specific error
        if (textPart.trim().startsWith('{') || textPart.trim().startsWith('[')) {
             console.warn("Model returned JSON:", textPart);
             throw new Error("Model failed to generate image (returned JSON). Please try a different prompt or simpler area.");
        }
        throw new Error(`Model returned text instead of image: ${textPart.substring(0, 100)}...`);
    }

    throw new Error("No image data found in the response.");

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    let msg = error.message || "Failed to process image.";
    if (msg.includes("500") || msg.includes("xhr error") || msg.includes("Rpc failed")) {
        msg = "Server error or timeout. The image might be too large or complex. Try using a smaller image.";
    }
    throw new Error(msg);
  }
};

/**
 * Generates a black and white segmentation mask for a specific object.
 */
export const generateSegmentationMask = async (
  imageBase64: string,
  objectDescription: string
): Promise<string> => {
  try {
    const resizedImage = await resizeImage(imageBase64, MAX_DIMENSION, MAX_DIMENSION);
    const cleanData = cleanBase64(resizedImage);
    const prompt = `Generate a precise black and white segmentation mask for the ${objectDescription || 'main object'}. The object should be pure white (#FFFFFF) and the background pure black (#000000). Ensure clean edges. Return ONLY the mask image.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/png', data: cleanData } },
          { text: prompt }
        ],
      },
    });

    const candidate = response.candidates?.[0];

    if (!candidate) throw new Error("No response from model.");
    
    // Safety checks for mask generation too
    const finishReason = candidate.finishReason;
    if (finishReason === 'SAFETY') throw new Error("Blocked by safety filters.");
    if (finishReason === 'RECITATION' || finishReason === 'IMAGE_RECITATION') throw new Error("Blocked by recitation filters.");

    if (!candidate.content?.parts) throw new Error(`No content generated (Reason: ${finishReason}).`);

    for (const part of candidate.content.parts) {
      if (part.inlineData && part.inlineData.data) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    
    // Fallback: Check for text explanation
    const textPart = candidate.content.parts.find(p => p.text)?.text;
    if (textPart) {
         console.warn("Mask generation text response:", textPart);
         throw new Error(`Model returned text: ${textPart.substring(0, 50)}...`);
    }

    throw new Error("No mask generated by the model.");
  } catch (error: any) {
    console.error("Mask Generation Error:", error);
    let msg = error.message || "Failed to generate mask.";
    if (msg.includes("500") || msg.includes("xhr error")) {
        msg = "Server error (image too large?). Try again.";
    }
    throw new Error(msg);
  }
};

/**
 * Analyzes the selection to identify object, material and color.
 */
export const analyzeSelection = async (cropBase64: string): Promise<{ label: string, material: string, color: string }> => {
  try {
    const resizedCrop = await resizeImage(cropBase64, ANALYSIS_DIMENSION, ANALYSIS_DIMENSION);
    const cleanData = cleanBase64(resizedCrop);
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/png', data: cleanData } },
          { text: "Analyze this image crop. Return a JSON object with 3 keys: 'object' (the name, e.g. jacket, hair), 'material' (e.g. denim, silk, skin), and 'color' (e.g. blue, blonde). Return ONLY the raw JSON string." }
        ]
      }
    });

    const text = response.text?.trim() || "";
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
        const data = JSON.parse(jsonStr);
        return {
            label: data.object || "Object",
            material: data.material || "",
            color: data.color || ""
        };
    } catch (e) {
        console.warn("Failed to parse JSON", text);
        return { label: text, material: "", color: "" };
    }

  } catch (error) {
    console.warn("Analysis failed", error);
    return { label: "", material: "", color: "" };
  }
};

/**
 * Analyzes the global image to detect category, tags, and suggestions.
 */
export const analyzeGlobalImage = async (imageBase64: string): Promise<GlobalAnalysisResult | null> => {
    try {
      const resizedImage = await resizeImage(imageBase64, ANALYSIS_DIMENSION, ANALYSIS_DIMENSION);
      const cleanData = cleanBase64(resizedImage);
      const prompt = `
        Analyze this image.
        1. Classify it into EXACTLY one category: 'Human', 'Vehicle', 'Product', 'Animal', 'Landscape', 'Other'.
        2. Identify the 'scene' (e.g. Studio, Street, Beach, Showroom).
        3. Provide a 'confidence' score (0-100) for the classification.
        4. List up to 5 visible tags.
        5. Identify up to 3 visual anomalies or quality issues (e.g. 'Extra fingers', 'Blurry background', 'Red eyes', 'Distorted text', 'Unwanted shadow'). List them in 'anomalies'.
        6. Provide 4 creative editing suggestions specific to this content.
        
        Return strictly valid JSON:
        {
          "category": "Human",
          "scene": "Studio",
          "confidence": 95,
          "tags": ["shirt", "glasses"],
          "anomalies": ["red eyes", "harsh shadow"],
          "suggestions": [{"label": "Red Shirt", "prompt": "Change the shirt to red"}]
        }
      `;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/png', data: cleanData } },
            { text: prompt }
          ],
        },
      });
  
      const text = response.text?.trim() || "";
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
          const result = JSON.parse(jsonStr) as GlobalAnalysisResult;
          const validCategories = ['Human', 'Vehicle', 'Product', 'Animal', 'Landscape', 'Other'];
          if (!validCategories.includes(result.category)) result.category = 'Other';
          if (!result.anomalies) result.anomalies = [];
          return result;
      } catch (e) {
          console.error("Failed to parse Global Analysis JSON", e);
          return null;
      }
    } catch (error) {
      console.error("Global Analysis failed", error);
      return null;
    }
  };