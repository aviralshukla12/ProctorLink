'use server';

/**
 * @fileOverview AI agent for generating detailed chapter content using Groq directly.
 */

import Groq from 'groq-sdk';
import {z} from 'genkit'; // keeping for input types only

const GenerateChapterContentInputSchema = z.object({
  chapterTitle: z.string().describe('Chapter title'),
  chapterDescription: z.string().describe('Chapter description'),
  weekTopics: z.array(z.string()).describe('Topics covered in this week'),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced']).describe('User skill level'),
  learningStyle: z.enum(['visual', 'hands-on', 'reading', 'mixed']).describe('Learning style'),
});

export type GenerateChapterContentInput = z.infer<typeof GenerateChapterContentInputSchema>;

export type CodeExample = {
  language: string;
  code: string;
  explanation: string;
};

export type Definition = {
  term: string;
  definition: string;
  example?: string;
};

export type GenerateChapterContentOutput = {
  title: string;
  introduction: string;
  sections: Array<{
    heading: string;
    content: string;
    codeExamples?: CodeExample[];
    definitions?: Definition[];
  }>;
  keyTakeaways: string[];
  practiceExercises?: string[];
  summary: string;
};

// Lazy initialization for Groq client
let groqClient: Groq | null = null;
function getGroqClient(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'gsk_your_actual_groq_key_here') {
      throw new Error('GROQ_API_KEY environment variable is not set correctly.');
    }
    groqClient = new Groq({ apiKey: apiKey.trim() });
  }
  return groqClient;
}

export async function generateChapterContent(
  input: GenerateChapterContentInput
): Promise<GenerateChapterContentOutput> {
  const client = getGroqClient();
  
  const systemPrompt = `You are an expert educator creating comprehensive, detailed learning content.

Create detailed educational content for this chapter:

Title: ${input.chapterTitle}
Description: ${input.chapterDescription}
Week Topics: ${input.weekTopics.join(', ')}
Skill Level: ${input.skillLevel}
Learning Style: ${input.learningStyle}

Requirements:
1. Write a clear, engaging introduction
2. Break content into logical sections with clear headings
3. For each section: provide explanations, code examples with language/code/explanation fields, and key definitions with term/definition/example fields
4. Include 3-5 key takeaways as an array of strings
5. Optionally include practice exercises as an array of strings
6. End with a comprehensive summary string

For learning style:
- visual: Include diagrams descriptions, visual analogies, structured layouts
- hands-on: Emphasize code examples, projects, practical exercises
- reading: Focus on detailed explanations, theory, concepts
- mixed: Combine all approaches

CRITICAL: You MUST respond in pure JSON format.
The JSON must have this exact structure:
{
  "title": "string",
  "introduction": "string",
  "sections": [
    {
      "heading": "string",
      "content": "string (markdown allowed)",
      "codeExamples": [
        { "language": "string", "code": "string", "explanation": "string" }
      ],
      "definitions": [
        { "term": "string", "definition": "string", "example": "string" }
      ]
    }
  ],
  "keyTakeaways": ["string", "string"],
  "practiceExercises": ["string"],
  "summary": "string"
}`;

  const chatCompletion = await client.chat.completions.create({
    // Fast model for instant generation
    model: 'llama3-8b-8192',
    messages: [
      { role: 'system', content: systemPrompt },
    ],
    temperature: 0.7,
    max_tokens: 4096,
    // Guarantee JSON output to avoid parse errors and retries
    response_format: { type: 'json_object' },
  });

  const outputStr = chatCompletion.choices[0]?.message?.content;
  if (!outputStr) {
    throw new Error('No content returned from Groq');
  }

  return JSON.parse(outputStr) as GenerateChapterContentOutput;
}
