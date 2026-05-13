import { genkit, z } from 'genkit';
import { openAI } from 'genkitx-openai';

export const ai = genkit({
  plugins: [
    openAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
      models: [
        {
          name: 'llama-3.3-70b-versatile',
          info: {
            label: 'Groq LLaMA 3.3 70B',
            supports: {
              multiturn: true,
              tools: true,
              systemRole: true,
              media: false,
            },
          },
          configSchema: z.object({}),
        },
      ],
    }),
  ],
  model: 'openai/llama-3.3-70b-versatile',
});
