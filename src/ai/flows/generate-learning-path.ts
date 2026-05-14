'use server';

/**
 * @fileOverview An AI agent for generating personalized learning paths using Groq directly.
 */

import Groq from 'groq-sdk';
import {z} from 'genkit'; // keeping for input types only

const GenerateLearningPathInputSchema = z.object({
  goal: z.string().describe('The learning goal or career objective'),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  hoursPerWeek: z.number().int().min(1).max(40),
  learningStyle: z.enum(['visual', 'hands-on', 'reading', 'mixed']).default('mixed'),
});

export type GenerateLearningPathInput = z.infer<typeof GenerateLearningPathInputSchema>;

export type GenerateLearningPathOutput = {
  goal: string;
  duration: string;
  weeks: Array<{
    week: number;
    topics: string[];
    resources: string[];
    milestones?: string[];
  }>;
  summary?: string;
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

export async function generateLearningPath(
  input: GenerateLearningPathInput
): Promise<GenerateLearningPathOutput> {
  const client = getGroqClient();
  
  const systemPrompt = `You are a professional AI mentor and learning path expert. Generate a personalized, week-by-week learning roadmap.

Goal: ${input.goal}
Current Skill Level: ${input.skillLevel}
Time Available: ${input.hoursPerWeek} hours per week
Learning Style: ${input.learningStyle}

Requirements:
1. Create a realistic, achievable week-by-week plan
2. Each week should include: topics (array of strings), resources (array of strings), and milestones (array of strings)
3. Ensure the plan is progressive - each week builds on the previous
4. Consider the user's skill level and available time

For learning style preferences:
- visual: Include video courses, diagrams, visual tutorials
- hands-on: Emphasize projects, coding exercises, practice platforms
- reading: Focus on documentation, articles, books
- mixed: Combine all approaches

CRITICAL: You MUST respond in pure JSON format.
The JSON must have this exact structure:
{
  "goal": "string",
  "duration": "string like 8 weeks",
  "weeks": [
    {
      "week": 1,
      "topics": ["topic1", "topic2"],
      "resources": ["resource1", "resource2"],
      "milestones": ["milestone1"]
    }
  ],
  "summary": "Brief 2-3 sentence summary"
}`;

  const chatCompletion = await client.chat.completions.create({
    // Using a fast model for instant responses
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
    ],
    temperature: 0.7,
    max_tokens: 2048,
    // Guarantee JSON output to avoid parse errors and retries
    response_format: { type: 'json_object' },
  });

  const outputStr = chatCompletion.choices[0]?.message?.content;
  if (!outputStr) {
    throw new Error('No content returned from Groq');
  }

  return JSON.parse(outputStr) as GenerateLearningPathOutput;
}
