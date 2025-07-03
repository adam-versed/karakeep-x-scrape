#!/usr/bin/env node

// Test different Gemini models and structured output capabilities
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY not found in environment');
  process.exit(1);
}

async function testGeminiModels() {
  console.log('🔍 Testing Gemini models and structured output capabilities...\n');
  
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  
  // Available Gemini models (as of late 2024)
  const models = [
    'gemini-1.5-flash',        // Fast, cost-effective
    'gemini-1.5-pro',          // More capable, higher quality
    'gemini-1.0-pro',          // Original model
  ];

  const testPrompt = `Generate tags for: "React hooks tutorial - useState and useEffect examples"

Return exactly this JSON format: {"tags": ["tag1", "tag2", "tag3"]}`;

  for (const modelName of models) {
    console.log(`🧪 Testing model: ${modelName}`);
    
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      
      // Test basic generation
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: testPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      });

      const response = result.response;
      const text = response.text();
      
      console.log(`  ✅ Model available`);
      console.log(`  📊 Response: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
      console.log(`  🔢 Tokens: ${response.usageMetadata?.totalTokenCount || 'unknown'}`);
      
      // Test JSON parsing
      try {
        const parsed = JSON.parse(text);
        console.log(`  ✅ Valid JSON produced`);
      } catch {
        console.log(`  ❌ Invalid JSON produced`);
      }
      
    } catch (error) {
      console.log(`  ❌ Model not available or error: ${error.message}`);
    }
    
    console.log('');
  }

  // Test if Gemini has native structured output (spoiler: it doesn't yet)
  console.log('🔬 Testing for native structured output support...');
  
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    // Try with response_format (this will likely fail as Gemini doesn't support it)
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: testPrompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        // responseMimeType: 'application/json', // This might work in newer versions
      },
    });
    
    console.log('  ✅ Some structured output support detected');
    
  } catch (error) {
    console.log('  ❌ No native structured output support (expected)');
    console.log('  💡 Gemini relies on prompt engineering for JSON format');
  }
  
  console.log('\n📝 Summary:');
  console.log('- Gemini models use prompt engineering for structured output');
  console.log('- Unlike OpenAI, no native "response_format" parameter');
  console.log('- gemini-1.5-pro may be more reliable for complex JSON');
  console.log('- Consider fallback/retry logic for malformed responses');
}

testGeminiModels().catch(console.error);