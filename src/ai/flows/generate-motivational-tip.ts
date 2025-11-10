'use server';

/**
 * @fileOverview AI agent for generating motivational tips based on user progress.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateMotivationalTipInputSchema = z.object({
  goal: z.string().describe('The learning goal'),
  progress: z.number().min(0).max(100).describe('Current progress percentage'),
  completedWeeks: z.number().int().min(0).describe('Number of weeks completed'),
  totalWeeks: z.number().int().min(1).describe('Total weeks in the learning path'),
});

export type GenerateMotivationalTipInput = z.infer<typeof GenerateMotivationalTipInputSchema>;

const GenerateMotivationalTipOutputSchema = z.object({
  message: z.string().describe('Motivational message'),
  emoji: z.string().optional().describe('Relevant emoji for the message'),
});

export type GenerateMotivationalTipOutput = z.infer<typeof GenerateMotivationalTipOutputSchema>;

export async function generateMotivationalTip(
  input: GenerateMotivationalTipInput
): Promise<GenerateMotivationalTipOutput> {
  return generateMotivationalTipFlow(input);
}

const motivationalPrompt = ai.definePrompt({
  name: 'generateMotivationalTipPrompt',
  input: {schema: GenerateMotivationalTipInputSchema},
  output: {schema: GenerateMotivationalTipOutputSchema},
  prompt: `You are an encouraging AI mentor. Generate a short, motivational message for a user learning: {{{goal}}}.

Progress Context:
- Current Progress: {{{progress}}}%
- Completed: {{{completedWeeks}}} out of {{{totalWeeks}}} weeks

Create a brief, inspiring message (1-2 sentences) that:
1. Acknowledges their progress
2. Encourages them to continue
3. Is specific to their learning journey
4. Includes a relevant emoji

Make it personal, positive, and motivating.`,
});

const generateMotivationalTipFlow = ai.defineFlow(
  {
    name: 'generateMotivationalTipFlow',
    inputSchema: GenerateMotivationalTipInputSchema,
    outputSchema: GenerateMotivationalTipOutputSchema,
  },
  async input => {
    const {output} = await motivationalPrompt(input);
    return output!;
  }
);

