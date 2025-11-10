'use server';

/**
 * @fileOverview AI flows for resume review and chat using LangChain and Gemini
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getPineconeIndex, PINECONE_DIMENSIONS } from '@/lib/pinecone';
import { getResumeReview } from '@/lib/resume';

// Lazy initialization functions
function getApiKey(): string {
  // Check multiple possible environment variable names
  const apiKey = process.env.GOOGLE_GENAI_API_KEY 
    || process.env.GOOGLE_API_KEY 
    || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GENAI_API_KEY, GOOGLE_API_KEY, or GEMINI_API_KEY environment variable is not set. Please add it to your .env.local file.');
  }
  return apiKey.trim(); // Remove any whitespace
}

/**
 * Pad or truncate embedding to match Pinecone dimensions
 */
function normalizeEmbedding(embedding: number[], targetDimensions: number): number[] {
  if (embedding.length === targetDimensions) {
    return embedding;
  }
  
  if (embedding.length < targetDimensions) {
    // Pad with zeros or repeat pattern
    const padding = new Array(targetDimensions - embedding.length).fill(0);
    return [...embedding, ...padding];
  }
  
  // Truncate if larger
  return embedding.slice(0, targetDimensions);
}

// Lazy initialization for chat model
let chatModel: ChatGoogleGenerativeAI | null = null;
function getChatModel(): ChatGoogleGenerativeAI {
  if (!chatModel) {
    // Use gemini-2.5-flash-lite for better performance and free tier availability
    chatModel = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash-lite',
      temperature: 0.7,
      apiKey: getApiKey(),
      maxRetries: 3,
    });
  }
  return chatModel;
}

// Lazy initialization for embeddings
let genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(getApiKey());
  }
  return genAI;
}

/**
 * Generate embeddings for resume text using Google's embedding model
 */
export async function generateResumeEmbedding(text: string): Promise<number[]> {
  try {
    const ai = getGenAI();
    
    // Use the embedding model - text-embedding-004
    // Google Generative AI SDK embedding API
    try {
      const embeddingModel = ai.getGenerativeModel({ model: 'text-embedding-004' });
      const result = await embeddingModel.embedContent(text);
      
      let embedding: number[] = [];
      
      // The embedding is in result.embedding.values
      if (result.embedding && result.embedding.values) {
        embedding = Array.from(result.embedding.values);
      } else if (result.embedding && Array.isArray(result.embedding)) {
        embedding = Array.from(result.embedding);
      } else if ('values' in result && Array.isArray((result as any).values)) {
        embedding = Array.from((result as any).values);
      }
      
      if (embedding.length > 0) {
        // Normalize to match Pinecone dimensions (3072)
        return normalizeEmbedding(embedding, PINECONE_DIMENSIONS);
      }
    } catch (apiError: any) {
      console.error('Error with embedding API:', apiError);
      // Try alternative API format
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
    
    // Fallback: Use a simple hash-based embedding (padded to 3072 dimensions)
    const hashEmbedding = new Array(768).fill(0);
    for (let i = 0; i < text.length && i < 768; i++) {
      hashEmbedding[i] = (text.charCodeAt(i) % 100) / 100;
    }
    
    return normalizeEmbedding(hashEmbedding, PINECONE_DIMENSIONS);
  } catch (error) {
    console.error('Error generating embedding:', error);
    // Return a simple embedding as fallback (3072 dimensions)
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
  // Limit text to 8000 characters for faster processing (1-3 page resumes)
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

  const model = getChatModel();
  const chain = RunnableSequence.from([
    model,
    new StringOutputParser(),
  ]);

  const response = await chain.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(`Please review this resume (1-3 pages):\n\n${textToReview}`),
  ]);

  return response;
}

/**
 * Chat with resume context using RAG (Retrieval Augmented Generation)
 */
export async function chatWithResume(
  resumeId: string,
  userMessage: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  // Get resume from Firestore
  const resume = await getResumeReview(resumeId);
  if (!resume) {
    throw new Error('Resume not found');
  }

  // Retrieve relevant context from Pinecone (if indexed)
  let resumeContext = '';
  
  if (resume.pineconeIndexed) {
    try {
      const index = await getPineconeIndex();
      
      // Generate query embedding for semantic search
      const queryEmbedding = await generateResumeEmbedding(userMessage);
      
      // Query Pinecone for relevant chunks
      const queryResponse = await index.query({
        vector: queryEmbedding,
        topK: 3,
        includeMetadata: true,
        filter: {
          resumeId: { $eq: resumeId },
        },
      });
      
      // Extract relevant text chunks
      const relevantChunks = queryResponse.matches
        .map(match => (match.metadata?.text as string) || '')
        .filter(Boolean);
      
      resumeContext = relevantChunks.join('\n\n') || resume.parsedText.substring(0, 2000);
    } catch (error) {
      console.error('Error querying Pinecone:', error);
      // Fallback to direct resume text
      resumeContext = resume.parsedText.substring(0, 2000);
    }
  } else {
    // Use resume text directly if not indexed
    resumeContext = resume.parsedText.substring(0, 2000);
  }

  const systemPrompt = `You are a helpful resume advisor. You have access to the user's resume and can answer questions about it, suggest improvements, and provide career advice.

Resume Context:
${resumeContext}

Answer questions based on the resume content. Be helpful, specific, and actionable. If asked about something not in the resume, say so but still provide helpful general advice.`;

  // Build message history
  const messages = [
    new SystemMessage(systemPrompt),
    ...chatHistory.map(msg => 
      msg.role === 'user' 
        ? new HumanMessage(msg.content)
        : new AIMessage(msg.content)
    ),
    new HumanMessage(userMessage),
  ];

  const chain = RunnableSequence.from([
    getChatModel(),
    new StringOutputParser(),
  ]);

  const response = await chain.invoke(messages);
  return response;
}

/**
 * Generate embeddings using Google's embedding model
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  return generateResumeEmbedding(text);
}
