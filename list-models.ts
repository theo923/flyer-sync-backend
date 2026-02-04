import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

async function listModels() {
  if (!genAI) {
    console.error("No API Key found");
    return;
  }

  try {
    console.log("Fetching available models...");
    const response = await genAI.models.list();
    
    // The structure might vary based on SDK version, handling array
    const models = response.models || response; 
    
    console.log("Available Models:");
    // @ts-ignore
    for (const model of models) {
      // @ts-ignore
      console.log(`- ${model.name} (${model.displayName})`);
    }
  } catch (error) {
    console.error("Error listing models:", error);
  }
}

listModels();
