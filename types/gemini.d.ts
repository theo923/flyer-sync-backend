export interface ParsedReceiptItem {
    name: string;
    alternativeName?: string;
    price: number;
    quantity?: number;
    weight?: string;
    unitPrice?: number;
    category?: string;
    tags?: string[];
    imageUrl?: string;
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
export declare function parseReceiptImage(imageBase64: string): Promise<ParsedReceipt>;
