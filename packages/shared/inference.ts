import { GenerativeModel, GoogleGenerativeAI } from "@google/generative-ai";
import { Ollama } from "ollama";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import serverConfig from "./config";
import { customFetch } from "./customFetch";
import logger from "./logger";

export interface InferenceResponse {
  response: string;
  totalTokens: number | undefined;
}

export interface EmbeddingResponse {
  embeddings: number[][];
}

export interface InferenceOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodSchema<any> | null;
  abortSignal?: AbortSignal;
}

const defaultInferenceOptions: InferenceOptions = {
  schema: null,
};

export interface InferenceClient {
  inferFromText(
    prompt: string,
    opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse>;
  inferFromImage(
    prompt: string,
    contentType: string,
    image: string,
    opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse>;
  generateEmbeddingFromText(inputs: string[]): Promise<EmbeddingResponse>;
}

const mapInferenceOutputSchema = <
  T,
  S extends typeof serverConfig.inference.outputSchema,
>(
  opts: Record<S, T>,
  type: S,
): T => {
  return opts[type];
};

export class InferenceClientFactory {
  static build(): InferenceClient | null {
    if (serverConfig.inference.geminiApiKey) {
      return new GeminiInferenceClient();
    }

    if (serverConfig.inference.openAIApiKey) {
      return new OpenAIInferenceClient();
    }

    if (serverConfig.inference.ollamaBaseUrl) {
      return new OllamaInferenceClient();
    }
    return null;
  }
}

class OpenAIInferenceClient implements InferenceClient {
  openAI: OpenAI;

  constructor() {
    this.openAI = new OpenAI({
      apiKey: serverConfig.inference.openAIApiKey,
      baseURL: serverConfig.inference.openAIBaseUrl,
      defaultHeaders: {
        "X-Title": "Karakeep",
        "HTTP-Referer": "https://karakeep.app",
      },
    });
  }

  async inferFromText(
    prompt: string,
    _opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse> {
    const optsWithDefaults: InferenceOptions = {
      ...defaultInferenceOptions,
      ..._opts,
    };
    const chatCompletion = await this.openAI.chat.completions.create(
      {
        messages: [{ role: "user", content: prompt }],
        model: serverConfig.inference.textModel,
        response_format: mapInferenceOutputSchema(
          {
            structured: optsWithDefaults.schema
              ? zodResponseFormat(optsWithDefaults.schema, "schema")
              : undefined,
            json: { type: "json_object" },
            plain: undefined,
          },
          serverConfig.inference.outputSchema,
        ),
      },
      {
        signal: optsWithDefaults.abortSignal,
      },
    );

    const response = chatCompletion.choices[0].message.content;
    if (!response) {
      throw new Error(`Got no message content from OpenAI`);
    }
    return { response, totalTokens: chatCompletion.usage?.total_tokens };
  }

  async inferFromImage(
    prompt: string,
    contentType: string,
    image: string,
    _opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse> {
    const optsWithDefaults: InferenceOptions = {
      ...defaultInferenceOptions,
      ..._opts,
    };
    const chatCompletion = await this.openAI.chat.completions.create(
      {
        model: serverConfig.inference.imageModel,
        response_format: mapInferenceOutputSchema(
          {
            structured: optsWithDefaults.schema
              ? zodResponseFormat(optsWithDefaults.schema, "schema")
              : undefined,
            json: { type: "json_object" },
            plain: undefined,
          },
          serverConfig.inference.outputSchema,
        ),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${contentType};base64,${image}`,
                  detail: "low",
                },
              },
            ],
          },
        ],
        max_tokens: 2000,
      },
      {
        signal: optsWithDefaults.abortSignal,
      },
    );

    const response = chatCompletion.choices[0].message.content;
    if (!response) {
      throw new Error(`Got no message content from OpenAI`);
    }
    return { response, totalTokens: chatCompletion.usage?.total_tokens };
  }

  async generateEmbeddingFromText(
    inputs: string[],
  ): Promise<EmbeddingResponse> {
    const model = serverConfig.embedding.textModel;
    const embedResponse = await this.openAI.embeddings.create({
      model: model,
      input: inputs,
    });
    const embedding2D: number[][] = embedResponse.data.map(
      (embedding: OpenAI.Embedding) => embedding.embedding,
    );
    return { embeddings: embedding2D };
  }
}

class OllamaInferenceClient implements InferenceClient {
  ollama: Ollama;

  constructor() {
    this.ollama = new Ollama({
      host: serverConfig.inference.ollamaBaseUrl,
      fetch: customFetch, // Use the custom fetch with configurable timeout
    });
  }

  async runModel(
    model: string,
    prompt: string,
    _opts: InferenceOptions,
    image?: string,
  ) {
    const optsWithDefaults: InferenceOptions = {
      ...defaultInferenceOptions,
      ..._opts,
    };

    let newAbortSignal = undefined;
    if (optsWithDefaults.abortSignal) {
      newAbortSignal = AbortSignal.any([optsWithDefaults.abortSignal]);
      newAbortSignal.onabort = () => {
        this.ollama.abort();
      };
    }
    const chatCompletion = await this.ollama.chat({
      model: model,
      format: mapInferenceOutputSchema(
        {
          structured: optsWithDefaults.schema
            ? zodToJsonSchema(optsWithDefaults.schema)
            : undefined,
          json: "json",
          plain: undefined,
        },
        serverConfig.inference.outputSchema,
      ),
      stream: true,
      keep_alive: serverConfig.inference.ollamaKeepAlive,
      options: {
        num_ctx: serverConfig.inference.contextLength,
      },
      messages: [
        { role: "user", content: prompt, images: image ? [image] : undefined },
      ],
    });

    let totalTokens = 0;
    let response = "";
    try {
      for await (const part of chatCompletion) {
        response += part.message.content;
        if (!isNaN(part.eval_count)) {
          totalTokens += part.eval_count;
        }
        if (!isNaN(part.prompt_eval_count)) {
          totalTokens += part.prompt_eval_count;
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw e;
      }
      // There seem to be some bug in ollama where you can get some successful response, but still throw an error.
      // Using stream + accumulating the response so far is a workaround.
      // https://github.com/ollama/ollama-js/issues/72
      totalTokens = NaN;
      logger.warn(
        `Got an exception from ollama, will still attempt to deserialize the response we got so far: ${e}`,
      );
    } finally {
      if (newAbortSignal) {
        newAbortSignal.onabort = null;
      }
    }

    return { response, totalTokens };
  }

  async inferFromText(
    prompt: string,
    _opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse> {
    const optsWithDefaults: InferenceOptions = {
      ...defaultInferenceOptions,
      ..._opts,
    };
    return await this.runModel(
      serverConfig.inference.textModel,
      prompt,
      optsWithDefaults,
      undefined,
    );
  }

  async inferFromImage(
    prompt: string,
    _contentType: string,
    image: string,
    _opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse> {
    const optsWithDefaults: InferenceOptions = {
      ...defaultInferenceOptions,
      ..._opts,
    };
    return await this.runModel(
      serverConfig.inference.imageModel,
      prompt,
      optsWithDefaults,
      image,
    );
  }

  async generateEmbeddingFromText(
    inputs: string[],
  ): Promise<EmbeddingResponse> {
    const embedding = await this.ollama.embed({
      model: serverConfig.embedding.textModel,
      input: inputs,
      // Truncate the input to fit into the model's max token limit,
      // in the future we want to add a way to split the input into multiple parts.
      truncate: true,
    });
    return { embeddings: embedding.embeddings };
  }
}

class GeminiInferenceClient implements InferenceClient {
  private genAI: GoogleGenerativeAI;
  private textModel: GenerativeModel;
  private visionModel: GenerativeModel;

  constructor() {
    this.genAI = new GoogleGenerativeAI(serverConfig.inference.geminiApiKey!);
    this.textModel = this.genAI.getGenerativeModel({
      model: serverConfig.inference.textModel,
    });
    this.visionModel = this.genAI.getGenerativeModel({
      model: serverConfig.inference.imageModel,
    });
  }

  async inferFromText(
    prompt: string,
    _opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse> {
    const optsWithDefaults: InferenceOptions = {
      ...defaultInferenceOptions,
      ..._opts,
    };

    // Handle different output schemas
    let formattedPrompt = prompt;
    if (
      serverConfig.inference.outputSchema === "json" ||
      optsWithDefaults.schema
    ) {
      formattedPrompt = `${prompt}\n\nIMPORTANT: You must respond with valid, complete JSON only. Do not wrap the JSON in markdown code blocks or backticks. Do not include any text before or after the JSON. Ensure the JSON is properly closed with all brackets and braces.`;
      if (optsWithDefaults.schema) {
        const jsonSchema = zodToJsonSchema(optsWithDefaults.schema);
        formattedPrompt += `\n\nRequired JSON schema: ${JSON.stringify(jsonSchema)}`;
      }
    }

    logger.debug(
      `[GeminiInferenceClient] Sending prompt: ${formattedPrompt.substring(0, 300)}...`,
    );

    const result = await this.textModel.generateContent(
      {
        contents: [{ role: "user", parts: [{ text: formattedPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      },
      {
        signal: optsWithDefaults.abortSignal,
      },
    );

    const response = result.response;
    const text = response.text();

    // Detailed logging for debugging JSON issues
    logger.debug(`[GeminiInferenceClient] Raw response length: ${text.length}`);
    logger.debug(
      `[GeminiInferenceClient] Response preview (first 200 chars): ${text.substring(0, 200)}`,
    );
    logger.debug(
      `[GeminiInferenceClient] Response preview (last 200 chars): ${text.substring(Math.max(0, text.length - 200))}`,
    );
    logger.debug(
      `[GeminiInferenceClient] Total tokens used: ${response.usageMetadata?.totalTokenCount}`,
    );
    logger.debug(
      `[GeminiInferenceClient] Finish reason: ${result.response.candidates?.[0]?.finishReason}`,
    );

    // Extract JSON from markdown code blocks if present
    let cleanedText = text;
    if (
      (serverConfig.inference.outputSchema === "json" ||
        optsWithDefaults.schema) &&
      text.includes("```json")
    ) {
      logger.debug(
        `[GeminiInferenceClient] Detected JSON wrapped in markdown, extracting...`,
      );
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        cleanedText = jsonMatch[1].trim();
        logger.debug(
          `[GeminiInferenceClient] Extracted JSON: ${cleanedText.substring(0, 100)}...`,
        );
      } else {
        logger.warn(
          `[GeminiInferenceClient] Failed to extract JSON from markdown blocks`,
        );
      }
    }

    // Check if response looks like truncated JSON
    if (cleanedText.includes('{"tags":') && !cleanedText.includes("]}")) {
      logger.warn(
        `[GeminiInferenceClient] Detected potentially truncated JSON response`,
      );
    }

    return {
      response: cleanedText,
      totalTokens: response.usageMetadata?.totalTokenCount,
    };
  }

  async inferFromImage(
    prompt: string,
    contentType: string,
    image: string,
    _opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse> {
    const optsWithDefaults: InferenceOptions = {
      ...defaultInferenceOptions,
      ..._opts,
    };

    let formattedPrompt = prompt;
    if (
      serverConfig.inference.outputSchema === "json" ||
      optsWithDefaults.schema
    ) {
      formattedPrompt = `${prompt}\n\nIMPORTANT: You must respond with valid, complete JSON only. Do not wrap the JSON in markdown code blocks or backticks. Do not include any text before or after the JSON. Ensure the JSON is properly closed with all brackets and braces.`;
      if (optsWithDefaults.schema) {
        const jsonSchema = zodToJsonSchema(optsWithDefaults.schema);
        formattedPrompt += `\n\nRequired JSON schema: ${JSON.stringify(jsonSchema)}`;
      }
    }

    const imagePart = {
      inlineData: {
        data: image,
        mimeType: contentType,
      },
    };

    const result = await this.visionModel.generateContent(
      {
        contents: [
          {
            role: "user",
            parts: [{ text: formattedPrompt }, imagePart],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      },
      {
        signal: optsWithDefaults.abortSignal,
      },
    );

    const response = result.response;
    const text = response.text();

    // Extract JSON from markdown code blocks if present (same as text inference)
    let cleanedText = text;
    if (
      (serverConfig.inference.outputSchema === "json" ||
        optsWithDefaults.schema) &&
      text.includes("```json")
    ) {
      logger.debug(
        `[GeminiInferenceClient] Detected JSON wrapped in markdown (image), extracting...`,
      );
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        cleanedText = jsonMatch[1].trim();
        logger.debug(
          `[GeminiInferenceClient] Extracted JSON (image): ${cleanedText.substring(0, 100)}...`,
        );
      }
    }

    return {
      response: cleanedText,
      totalTokens: response.usageMetadata?.totalTokenCount,
    };
  }

  async generateEmbeddingFromText(
    inputs: string[],
  ): Promise<EmbeddingResponse> {
    const embeddingModel = this.genAI.getGenerativeModel({
      model: serverConfig.embedding.textModel,
    });

    const embeddings = await Promise.all(
      inputs.map(async (input) => {
        const result = await embeddingModel.embedContent(input);
        return result.embedding.values;
      }),
    );

    return { embeddings };
  }
}
