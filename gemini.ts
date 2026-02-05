import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
import * as util from "util";

dotenv.config();

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

if (!genAI) {
  console.warn("⚠️ GEMINI_API_KEY not set - AI receipt parsing disabled");
}

export interface ParsedReceiptItem {
  name: string;
  alternativeName?: string;
  price: number;
  quantity?: number;
  weight?: string; // e.g. "200g", "1kg"
  unitPrice?: number; // Calculated $ per unit
  category?: string; // e.g. "Dairy", "Produce", "Beverages"
  originalPrice?: number; // Pre-discount price if visible
  tags?: string[]; // "SALE", "ORGANIC", etc.
  imageUrl?: string; // From Google Search
}

export interface ParsedReceipt {
  store: string | null;
  storeLocation?: string | null;
  date: string | null;
  time?: string | null;
  total: number | null;
  items: ParsedReceiptItem[];
  currency?: string;
}

/**
 * Parse a receipt image using the new @google/genai SDK
 * Uses Gemini 1.5 Flash with Google Search grounding for enhanced details
 * @param imageBase64 Base64 encoded image
 * @returns Parsed receipt data
 */
export async function parseReceiptImage(
  imageBase64: string
): Promise<ParsedReceipt> {
  if (!genAI) {
    throw new Error("Gemini API key not configured");
  }

  const model = "gemini-2.0-flash"; 

  const prompt = `You are an expert shopping assistant and data extraction specialist. 
I will provide a grocery receipt image. Your goal is to extract structured data and enrich it with useful details.

1. **Store Info**: Identify the store name and its location/address if visible.
2. **Date & Time**: Extract purchase date (YYYY-MM-DD) and time (HH:MM).
3. **Line Items**: Extract every purchased item. For each item:
   - **Name**: The name as printed.
   - **Alternative Name**: A generic, readable name (e.g., "HZ KETCHUP" -> "Heinz Ketchup").
   - **Price**: Final price paid.
   - **Weight/Quantity**: Extract weight (g, kg, ml, oz, lb) if printed.
   - **Tags**: Detect if item is on "SALE", "CLEARANCE", or "TAXABLE".
   - **Category**: Infer the product category (e.g., "Produce", "Dairy", "Meat", "Bakery", "Beverages", "Pantry", "Household").
4. **Calculations**:
   - If weight is available, calculate the price per standard unit (e.g. $ per 100g or $ per 100ml).
5. **Search**: 
   - Use your Google Search capabilities to find a representative product image URL for the top 3 most expensive items.

Return strictly valid JSON structure:
{
  "store": "Target",
  "storeLocation": "123 Main St, City",
  "date": "2024-05-20",
  "time": "14:30",
  "total": 45.50,
  "currency": "USD",
  "items": [{
    "name": "HZ KETCHUP 32OZ",
    "alternativeName": "Heinz Tomato Ketchup",
    "price": 5.99,
    "quantity": 1,
    "weight": "907g",
    "unitPrice": 0.66, // $/100g
    "category": "Pantry",
    "originalPrice": 6.99,
    "tags": ["SALE"],
    "imageUrl": "https://..."
  }]
}
Only return the JSON object. Do not wrap in markdown code blocks.`;

  // Thinking configuration - only for supported models
  const isThinkingModel = model.includes("thinking");
  
  // Configure Google Search tool
  const tools: any[] = [{ googleSearch: {} }];

  const config: any = {
    tools,
    ...(isThinkingModel ? {
      thinkingConfig: {
        thinkingLevel: "HIGH" as any,
      },
    } : {})
  };

  // Detect MIME type from base64 signature
  let mimeType = "image/jpeg";
  if (imageBase64.startsWith("iVBORw0KGgo")) {
    mimeType = "image/png";
  } else if (imageBase64.startsWith("R0lGOD")) {
    mimeType = "image/gif";
  } else if (imageBase64.startsWith("UklGR")) {
    mimeType = "image/webp";
  } else if (imageBase64.startsWith("AAAAIGZ0eXBqd2lj")) {
    mimeType = "image/jxl"; // Just in case
  } else if (imageBase64.startsWith("AAAAIGZ0eXBoZWlj")) {
    mimeType = "image/heic";
  }

  const contents = [
    {
      role: "user",
      parts: [
        { text: prompt },
        {
          inlineData: {
            data: imageBase64,
            mimeType: mimeType,
          },
        },
      ],
    },
  ];

  console.log(`📡 Sending request to Gemini (Model: ${model}, Type: ${mimeType}, Thinking: ${isThinkingModel})`);

  // Helper for retries with exponential backoff
  const callWithRetry = async (retries = 3, delay = 2000): Promise<any> => {
    try {
      if (!genAI) throw new Error("GenAI not initialized");
      
      const result = await genAI.models.generateContent({
        model,
        contents,
        ...config,
      });
      return result;
    } catch (error: any) {
      if (retries > 0 && (error?.status === 429 || error?.code === 429)) {
        console.warn(`⚠️ Rate limited (429). Retrying in ${delay}ms... (${retries} attempts left)`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return callWithRetry(retries - 1, delay * 2);
      }
      throw error;
    }
  };

  try {
    const result = await callWithRetry();
    //console.log("🔍 Gemini Response Object Keys:", Object.keys(result || {}));
    
    // Exhaustive text extraction from Gemini response
    let content = "";
    try {
      // Check for SDK helper method first
      if (typeof (result as any).text === 'function') {
        content = (result as any).text();
      } else if (typeof (result as any).text === 'string') {
        content = (result as any).text;
      } 
      
      // Check result.response (wrapper object structure)
      if (!content && result.response) {
         if (typeof result.response.text === 'function') {
           content = result.response.text();
         } else if (result.response.candidates?.[0]?.content?.parts) {
           content = result.response.candidates[0].content.parts
             .map((part: any) => part.text || "")
             .join("");
         }
      }

      // Check raw result candidates (if result IS the response)
      if (!content && result.candidates?.[0]?.content?.parts) {
        content = result.candidates[0].content.parts
          .map((part: any) => part.text || "")
          .join("");
      }
      
      // If still empty, try traversing candidates more broadly
      if (!content && result.candidates) {
        for (const cand of result.candidates) {
          if (cand.content?.parts) {
            for (const part of cand.content.parts) {
              if (part.text) content += part.text;
            }
          }
        }
      }
    } catch (err) {
      console.warn("⚠️ Error in exhaustive text extraction:", err);
    }
    
    if (!content) {
      console.error("❌ Failed to extract text. Full Response Detail:");
      console.error(util.inspect(result, { depth: null, colors: true }));
      throw new Error("Gemini response was empty or in an unrecognized format");
    }
    
    // Robustly extract JSON - find the first '{' and last '}'
    // This is necessary because 'thinking' models often include thought blocks or prose
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}");
    
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      console.error("❌ No valid JSON found in Gemini response. Full content:", content);
      throw new Error("Gemini response did not contain valid JSON data");
    }
    
    const jsonContent = content.substring(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonContent) as ParsedReceipt;

    // Validate and clean up items
    parsed.items = (parsed.items || []).map((item) => {
      // Clean up name by removing (SALE) recursively just in case
      let cleanName = String(item.name || "Unknown Item").trim();
      cleanName = cleanName.replace(/\(SALE\)/gi, "").trim();

      return {
        name: cleanName,
        alternativeName: item.alternativeName ? String(item.alternativeName).trim() : undefined,
        price: Number(item.price) || 0,
        quantity: Number(item.quantity) || 1,
        weight: item.weight,
        unitPrice: item.unitPrice,
        category: item.category,
        originalPrice: Number(item.originalPrice) || undefined,
        tags: item.tags || [],
        imageUrl: item.imageUrl,
      };
    });

    console.log(`✅ Gemini parsed receipt: ${parsed.store}, ${parsed.items.length} items (Model: ${model})`);
    return parsed;
  } catch (error) {
    console.error("❌ Gemini parsing failed:", error);
    throw new Error(
      `Failed to parse receipt with Gemini: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
