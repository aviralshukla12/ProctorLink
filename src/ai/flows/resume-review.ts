'use server';

/**
 * @fileOverview AI flows for resume review and chat using Groq SDK
 */

import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getPineconeIndex, PINECONE_DIMENSIONS } from '@/lib/pinecone';
import { getResumeReview } from '@/lib/resume';

// Lazy initialization functions
function getGroqApiKey(): string {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'gsk_your_actual_groq_key_here') {
    throw new Error('GROQ_API_KEY environment variable is not set correctly. Please add your actual Groq key to your .env file.');
  }
  return apiKey.trim();
}

function getGeminiApiKey(): string | null {
  return process.env.GOOGLE_GENAI_API_KEY 
    || process.env.GOOGLE_API_KEY 
    || process.env.GEMINI_API_KEY 
    || null;
}

/**
 * Pad or truncate embedding to match Pinecone dimensions
 */
function normalizeEmbedding(embedding: number[], targetDimensions: number): number[] {
  if (embedding.length === targetDimensions) {
    return embedding;
  }
  
  if (embedding.length < targetDimensions) {
    const padding = new Array(targetDimensions - embedding.length).fill(0);
    return [...embedding, ...padding];
  }
  
  return embedding.slice(0, targetDimensions);
}

// Lazy initialization for Groq client
let groqClient: Groq | null = null;
function getGroqClient(): Groq {
  if (!groqClient) {
    groqClient = new Groq({
      apiKey: getGroqApiKey(),
    });
  }
  return groqClient;
}

// Lazy initialization for embeddings
let genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI | null {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  
  if (!genAI) {
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * Generate embeddings for resume text using Google's embedding model
 */
export async function generateResumeEmbedding(text: string): Promise<number[]> {
  try {
    const ai = getGenAI();
    
    // If we have a Gemini API key, use it for embeddings
    if (ai) {
      try {
        const embeddingModel = ai.getGenerativeModel({ model: 'text-embedding-004' });
        const result = await embeddingModel.embedContent(text);
        
        let embedding: number[] = [];
        
        if (result.embedding && result.embedding.values) {
          embedding = Array.from(result.embedding.values);
        } else if (result.embedding && Array.isArray(result.embedding)) {
          embedding = Array.from(result.embedding);
        } else if ('values' in result && Array.isArray((result as any).values)) {
          embedding = Array.from((result as any).values);
        }
        
        if (embedding.length > 0) {
          return normalizeEmbedding(embedding, PINECONE_DIMENSIONS);
        }
      } catch (apiError: any) {
        console.error('Error with embedding API:', apiError);
        try {
          const embeddingModel = ai.getGenerativeModel({ model: 'models/text-embedding-004' });
          const result = await embeddingModel.embedContent(text);
          if (result.embedding && result.embedding.values) {
            const embedding = Array.from(result.embedding.values);
            return normalizeEmbedding(embedding, PINECONE_DIMENSIONS);
          }
        } catch (altError) {
          console.error('Alternative embedding API also failed:', altError);
        }
      }
    }
    
    // Fallback: Use a simple hash-based embedding
    const hashEmbedding = new Array(768).fill(0);
    for (let i = 0; i < text.length && i < 768; i++) {
      hashEmbedding[i] = (text.charCodeAt(i) % 100) / 100;
    }
    
    return normalizeEmbedding(hashEmbedding, PINECONE_DIMENSIONS);
  } catch (error) {
    console.error('Error generating embedding:', error);
    return normalizeEmbedding(
      new Array(768).fill(0).map(() => Math.random() * 0.01),
      PINECONE_DIMENSIONS
    );
  }
}

/**
 * Analyze resume and provide review
 */
export async function analyzeResume(resumeText: string): Promise<string> {
  const maxReviewLength = 8000;
  const textToReview = resumeText.length > maxReviewLength 
    ? resumeText.substring(0, maxReviewLength) + '\n\n[... Resume continues ...]'
    : resumeText;

  const systemPrompt = `You are an expert resume reviewer and career advisor. Analyze the provided resume and give comprehensive feedback covering:
1. Overall structure and formatting
2. Content quality and clarity
3. Keywords and ATS optimization
4. Achievements and impact statements
5. Areas for improvement
6. Specific actionable recommendations

Be constructive, specific, and encouraging. Format your response in clear sections with markdown. Keep the review concise but thorough.`;

  const client = getGroqClient();
  const chatCompletion = await client.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Please review this resume (1-3 pages):\n\n${textToReview}` },
    ],
    temperature: 0.7,
    max_tokens: 4096,
  });

  return chatCompletion.choices[0]?.message?.content || 'Unable to generate review.';
}

/**
 * Chat with resume context using RAG (Retrieval Augmented Generation)
 */
export async function chatWithResume(
  resumeId: string,
  userMessage: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  const resume = await getResumeReview(resumeId);
  if (!resume) {
    throw new Error('Resume not found');
  }

  let resumeContext = '';
  
  if (resume.pineconeIndexed) {
    try {
      const index = await getPineconeIndex();
      const queryEmbedding = await generateResumeEmbedding(userMessage);
      
      const queryResponse = await index.query({
        vector: queryEmbedding,
        topK: 3,
        includeMetadata: true,
        filter: {
          resumeId: { $eq: resumeId },
        },
      });
      
      const relevantChunks = queryResponse.matches
        .map(match => (match.metadata?.text as string) || '')
        .filter(Boolean);
      
      resumeContext = relevantChunks.join('\n\n') || resume.parsedText.substring(0, 2000);
    } catch (error) {
      console.error('Error querying Pinecone:', error);
      resumeContext = resume.parsedText.substring(0, 2000);
    }
  } else {
    resumeContext = resume.parsedText.substring(0, 2000);
  }

  const systemPrompt = `You are a helpful resume advisor. You have access to the user's resume and can answer questions about it, suggest improvements, and provide career advice.

Resume Context:
${resumeContext}

Answer questions based on the resume content. Be helpful, specific, and actionable. If asked about something not in the resume, say so but still provide helpful general advice.`;

  // Build message history for Groq
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    { role: 'user', content: userMessage },
  ];

  const client = getGroqClient();
  const chatCompletion = await client.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages,
    temperature: 0.7,
    max_tokens: 4096,
  });

  return chatCompletion.choices[0]?.message?.content || 'Unable to generate response.';
}

/**
 * Generate embeddings using Google's embedding model
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  return generateResumeEmbedding(text);
}
