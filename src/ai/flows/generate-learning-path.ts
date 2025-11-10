'use server';

/**
 * @fileOverview An AI agent for generating personalized learning paths using Gemini.
 *
 * - generateLearningPath - Generates a week-by-week learning roadmap
 * - GenerateLearningPathInput - Input type for learning path generation
 * - GenerateLearningPathOutput - Output type with structured roadmap
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateLearningPathInputSchema = z.object({
  goal: z.string().describe('The learning goal or career objective (e.g., "Become a React Developer")'),
  skillLevel: z
    .enum(['beginner', 'intermediate', 'advanced'])
    .describe('The current skill level of the user'),
  hoursPerWeek: z
    .number()
    .int()
    .min(1)
    .max(40)
    .describe('Number of hours the user can dedicate per week'),
  learningStyle: z
    .enum(['visual', 'hands-on', 'reading', 'mixed'])
    .default('mixed')
    .describe('Preferred learning style'),
});

export type GenerateLearningPathInput = z.infer<typeof GenerateLearningPathInputSchema>;

const WeekSchema = z.object({
  week: z.number().int().min(1).describe('Week number'),
  topics: z.array(z.string()).describe('Topics to cover in this week'),
  resources: z.array(z.string()).describe('Recommended learning resources (URLs, course names, etc.)'),
  milestones: z.array(z.string()).optional().describe('Key milestones or achievements for this week'),
});

const GenerateLearningPathOutputSchema = z.object({
  goal: z.string().describe('The learning goal'),
  duration: z.string().describe('Total duration (e.g., "8 weeks")'),
  weeks: z.array(WeekSchema).describe('Week-by-week breakdown of the learning path'),
  summary: z.string().optional().describe('Brief summary of the learning path'),
});

export type GenerateLearningPathOutput = z.infer<typeof GenerateLearningPathOutputSchema>;

export async function generateLearningPath(
  input: GenerateLearningPathInput
): Promise<GenerateLearningPathOutput> {
  return generateLearningPathFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateLearningPathPrompt',
  input: {schema: GenerateLearningPathInputSchema},
  output: {schema: GenerateLearningPathOutputSchema},
  prompt: `You are a professional AI mentor and learning path expert. Generate a personalized, week-by-week learning roadmap for the goal: {{{goal}}}.

User Context:
- Current Skill Level: {{{skillLevel}}}
- Time Available: {{{hoursPerWeek}}} hours per week
- Learning Style: {{{learningStyle}}}

Requirements:
1. Create a realistic, achievable week-by-week plan
2. Each week should include:
   - Clear topics to learn
   - Specific, actionable resources (course names, documentation links, practice platforms)
   - Key milestones or achievements
3. Ensure the plan is progressive - each week builds on the previous
4. Consider the user's skill level and available time
5. Include a mix of theory and practical exercises
6. Provide a total duration estimate

For learning style preferences:
- visual: Include video courses, diagrams, visual tutorials
- hands-on: Emphasize projects, coding exercises, practice platforms
- reading: Focus on documentation, articles, books
- mixed: Combine all approaches

Return a structured JSON with:
- goal: The learning goal
- duration: Total duration (e.g., "8 weeks", "12 weeks")
- weeks: Array of week objects, each with week number, topics, resources, and optional milestones
- summary: A brief 2-3 sentence summary of the learning path

Make the roadmap practical, motivating, and tailored to help the user achieve their goal.`,
});

const generateLearningPathFlow = ai.defineFlow(
  {
    name: 'generateLearningPathFlow',
    inputSchema: GenerateLearningPathInputSchema,
    outputSchema: GenerateLearningPathOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

