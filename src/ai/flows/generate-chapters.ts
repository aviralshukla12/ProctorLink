'use server';

/**
 * @fileOverview AI agent for generating chapters for a learning week
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateChaptersInputSchema = z.object({
  weekNumber: z.number().int().min(1).describe('Week number'),
  topics: z.array(z.string()).describe('Topics to cover in this week'),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced']).describe('User skill level'),
  learningStyle: z.enum(['visual', 'hands-on', 'reading', 'mixed']).describe('Learning style'),
});

export type GenerateChaptersInput = z.infer<typeof GenerateChaptersInputSchema>;

const ChapterSchema = z.object({
  title: z.string().describe('Chapter title'),
  description: z.string().describe('Brief description of what this chapter covers'),
  order: z.number().int().min(1).describe('Chapter order number'),
});

const GenerateChaptersOutputSchema = z.object({
  chapters: z.array(ChapterSchema).describe('Array of chapters for this week'),
});

export type GenerateChaptersOutput = z.infer<typeof GenerateChaptersOutputSchema>;

export async function generateChapters(
  input: GenerateChaptersInput
): Promise<GenerateChaptersOutput> {
  return generateChaptersFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateChaptersPrompt',
  input: {schema: GenerateChaptersInputSchema},
  output: {schema: GenerateChaptersOutputSchema},
  prompt: `You are an expert learning content creator. Generate a structured set of chapters for Week {{{weekNumber}}} covering these topics: {{{topics}}}.

User Context:
- Skill Level: {{{skillLevel}}}
- Learning Style: {{{learningStyle}}}

Requirements:
1. Break down the week's topics into logical, progressive chapters
2. Each chapter should be focused on a specific concept or skill
3. Chapters should build upon each other progressively
4. Consider the user's skill level - adjust complexity accordingly
5. For learning style preferences:
   - visual: Include chapters with diagrams, visual examples
   - hands-on: Emphasize practical, project-based chapters
   - reading: Focus on theoretical and conceptual chapters
   - mixed: Combine all approaches

Return 3-6 chapters, each with:
- title: Clear, descriptive chapter title
- description: 1-2 sentence description of what the chapter covers
- order: Sequential order number (1, 2, 3, etc.)

Make the chapters practical, engaging, and tailored to help the user master the topics.`,
});

const generateChaptersFlow = ai.defineFlow(
  {
    name: 'generateChaptersFlow',
    inputSchema: GenerateChaptersInputSchema,
    outputSchema: GenerateChaptersOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

