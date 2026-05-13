'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateExamQuestionsInputSchema = z.object({
  topic: z.string().describe('The topic for which to generate exam questions.'),
  difficulty: z
    .enum(['easy', 'medium', 'hard'])
    .describe('The difficulty level of the exam questions.'),
  numberOfQuestions: z
    .number()
    .int()
    .positive()
    .default(5)
    .describe('The number of questions to generate.'),
});
export type GenerateExamQuestionsInput = z.infer<typeof GenerateExamQuestionsInputSchema>;

const GenerateExamQuestionsOutputSchema = z.object({
  questions: z.array(
    z.object({
      questionText: z.string(),
      options: z.array(z.string()).length(4),
      correctAnswer: z.string(),
    })
  ),
});
export type GenerateExamQuestionsOutput = z.infer<typeof GenerateExamQuestionsOutputSchema>;

export async function generateExamQuestions(
  input: GenerateExamQuestionsInput
): Promise<GenerateExamQuestionsOutput> {
  return generateExamQuestionsFlow(input);
}

const generateExamQuestionsFlow = ai.defineFlow(
  {
    name: 'generateExamQuestionsFlow',
    inputSchema: GenerateExamQuestionsInputSchema,
    outputSchema: GenerateExamQuestionsOutputSchema,
  },
  async (input) => {
    const { output } = await ai.generate({
      prompt: `You are an expert in creating exam questions.
Generate ${input.numberOfQuestions} exam questions on the topic of "${input.topic}" with a difficulty level of "${input.difficulty}".
For each question, provide:
1. The question text.
2. An array of exactly 4 multiple-choice options.
3. The correct answer, which must exactly match one of the provided options.`,
      output: { schema: GenerateExamQuestionsOutputSchema },
    });
    return output!;
  }
);
