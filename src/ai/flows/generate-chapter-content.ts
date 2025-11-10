'use server';

/**
 * @fileOverview AI agent for generating detailed chapter content
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateChapterContentInputSchema = z.object({
  chapterTitle: z.string().describe('Chapter title'),
  chapterDescription: z.string().describe('Chapter description'),
  weekTopics: z.array(z.string()).describe('Topics covered in this week'),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced']).describe('User skill level'),
  learningStyle: z.enum(['visual', 'hands-on', 'reading', 'mixed']).describe('Learning style'),
});

export type GenerateChapterContentInput = z.infer<typeof GenerateChapterContentInputSchema>;

const CodeExampleSchema = z.object({
  language: z.string().describe('Programming language or format'),
  code: z.string().describe('Code example'),
  explanation: z.string().describe('Explanation of the code'),
});

const DefinitionSchema = z.object({
  term: z.string().describe('Term or concept'),
  definition: z.string().describe('Detailed definition'),
  example: z.string().optional().describe('Example usage or explanation'),
});

const GenerateChapterContentOutputSchema = z.object({
  title: z.string().describe('Chapter title'),
  introduction: z.string().describe('Introduction paragraph'),
  sections: z.array(z.object({
    heading: z.string().describe('Section heading'),
    content: z.string().describe('Section content (can include markdown)'),
    codeExamples: z.array(CodeExampleSchema).optional().describe('Code examples for this section'),
    definitions: z.array(DefinitionSchema).optional().describe('Key definitions for this section'),
  })).describe('Main content sections'),
  keyTakeaways: z.array(z.string()).describe('Key takeaways from this chapter'),
  practiceExercises: z.array(z.string()).optional().describe('Practice exercises or questions'),
  summary: z.string().describe('Chapter summary'),
});

export type GenerateChapterContentOutput = z.infer<typeof GenerateChapterContentOutputSchema>;

export async function generateChapterContent(
  input: GenerateChapterContentInput
): Promise<GenerateChapterContentOutput> {
  return generateChapterContentFlow(input);
}

const contentPrompt = ai.definePrompt({
  name: 'generateChapterContentPrompt',
  input: {schema: GenerateChapterContentInputSchema},
  output: {schema: GenerateChapterContentOutputSchema},
  prompt: `You are an expert educator creating comprehensive, detailed learning content.

Create detailed educational content for this chapter:

Title: {{{chapterTitle}}}
Description: {{{chapterDescription}}}
Week Topics: {{{weekTopics}}}
Skill Level: {{{skillLevel}}}
Learning Style: {{{learningStyle}}}

Requirements:
1. Write a clear, engaging introduction that sets context
2. Break content into logical sections with clear headings
3. For each section:
   - Provide detailed explanations
   - Include code examples where relevant (with language, code, and explanation)
   - Include key definitions (term, definition, optional example)
   - Use markdown formatting for better readability
4. Include practical code examples that are:
   - Well-commented
   - Appropriate for the skill level
   - Real-world applicable
5. Provide clear definitions for important terms and concepts
6. Include 3-5 key takeaways
7. Optionally include practice exercises
8. End with a comprehensive summary

For learning style:
- visual: Include diagrams descriptions, visual analogies, structured layouts
- hands-on: Emphasize code examples, projects, practical exercises
- reading: Focus on detailed explanations, theory, concepts
- mixed: Combine all approaches

Make the content comprehensive, well-structured, and beautiful to read. Use markdown for formatting (headers, lists, code blocks, etc.).`,
});

const generateChapterContentFlow = ai.defineFlow(
  {
    name: 'generateChapterContentFlow',
    inputSchema: GenerateChapterContentInputSchema,
    outputSchema: GenerateChapterContentOutputSchema,
  },
  async input => {
    const {output} = await contentPrompt(input);
    return output!;
  }
);

