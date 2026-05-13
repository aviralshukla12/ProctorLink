import { ai } from './src/ai/genkit';

async function main() {
  const models = await ai.registry.listModels();
  console.log('Registered models:', models.map(m => m));
}
main();
