#!/usr/bin/env node

// Temporary test script to debug Gemini JSON responses
// Run with: node temp-gemini-test.js

import { GoogleGenerativeAI } from '@google/generative-ai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY not found in environment');
  process.exit(1);
}

// Test schema matching the app
const testSchema = z.object({
  tags: z.array(z.string()),
});

async function testGeminiJSON() {
  console.log('🚀 Testing Gemini JSON responses...\n');
  
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  // Test prompt similar to what the app uses
  const basePrompt = `Analyze this content and generate relevant tags for categorization:

Content: "JavaScript tutorials for beginners - learn variables, functions, and loops"

Generate 3-5 relevant tags for this content.`;

  const jsonSchema = zodToJsonSchema(testSchema);
  const formattedPrompt = `${basePrompt}

IMPORTANT: You must respond with valid, complete JSON only. Do not wrap the JSON in markdown code blocks or backticks. Do not include any text before or after the JSON. Ensure the JSON is properly closed with all brackets and braces.

Required JSON schema: ${JSON.stringify(jsonSchema)}`;

  console.log('📝 Prompt being sent:');
  console.log('=' .repeat(80));
  console.log(formattedPrompt);
  console.log('=' .repeat(80));
  console.log();

  try {
    // Test with different configurations
    const configs = [
      { name: 'Current Config', temp: 0.3, tokens: 4096 },
      { name: 'Conservative', temp: 0.1, tokens: 1024 },
      { name: 'High Tokens', temp: 0.3, tokens: 8192 },
    ];

    for (const config of configs) {
      console.log(`🧪 Testing with ${config.name} (temp: ${config.temp}, tokens: ${config.tokens})`);
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: formattedPrompt }] }],
        generationConfig: {
          temperature: config.temp,
          maxOutputTokens: config.tokens,
        },
      });

      const response = result.response;
      const text = response.text();
      
      console.log(`📊 Response Stats:`);
      console.log(`  - Length: ${text.length} characters`);
      console.log(`  - Tokens used: ${response.usageMetadata?.totalTokenCount || 'unknown'}`);
      console.log(`  - Finish reason: ${result.response.candidates?.[0]?.finishReason || 'unknown'}`);
      
      console.log(`📄 Raw Response:`);
      console.log('-'.repeat(40));
      console.log(text);
      console.log('-'.repeat(40));
      
      // Test JSON parsing
      try {
        const parsed = JSON.parse(text);
        const validated = testSchema.parse(parsed);
        console.log(`✅ JSON parsing successful!`);
        console.log(`   Tags found: ${validated.tags.join(', ')}`);
      } catch (error) {
        console.log(`❌ JSON parsing failed: ${error.message}`);
        console.log(`   Response preview: "${text.substring(0, 50)}..."`);
      }
      
      console.log('\n' + '='.repeat(80) + '\n');
    }

  } catch (error) {
    console.error('💥 Test failed:', error);
  }
}

// Run the test
testGeminiJSON().catch(console.error);