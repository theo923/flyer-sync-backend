require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function listModels() {
  try {
    const response = await genAI.models.list();
    //console.log(response); // Uncomment to see full structure if needed
    
    // In newer SDKs, response might be the array or have a property
    const models = Array.isArray(response) ? response : (response.models || []);
    
    console.log("Available Gemini Models:");
    models.forEach(model => {
      if (model.name.includes("gemini")) {
        console.log(`- ${model.name}`);
      }
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

listModels();
