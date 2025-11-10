import { config } from 'dotenv';
config();

import '@/ai/flows/generate-exam-questions.ts';
import '@/ai/flows/generate-exam-description.ts';
import '@/ai/flows/generate-learning-path.ts';
import '@/ai/flows/generate-motivational-tip.ts';
import '@/ai/flows/generate-chapters.ts';
import '@/ai/flows/generate-chapter-content.ts';
