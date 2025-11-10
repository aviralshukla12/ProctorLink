# Learning Path Generator Module

## Overview

The Learning Path Generator is a personalized learning roadmap feature that uses Google Gemini AI to create week-by-week learning plans tailored to user goals, skill levels, and available time.

## Features

- **Goal-Based Path Generation**: Users input their learning goal (e.g., "Become a React Developer")
- **Personalization**: Considers skill level, hours per week, and learning style preferences
- **Week-by-Week Roadmap**: Structured breakdown with topics, resources, and milestones
- **Progress Tracking**: Toggle completion status for each week
- **Motivational Tips**: AI-generated encouragement based on progress

## Architecture

### AI Flows (`src/ai/flows/`)

1. **generate-learning-path.ts**
   - Main flow for generating personalized learning roadmaps
   - Uses Gemini 2.0 Flash model via Genkit
   - Returns structured JSON with weeks, topics, resources, and milestones

2. **generate-motivational-tip.ts**
   - Generates personalized motivational messages
   - Considers user progress and learning goal

### API Routes (`src/app/api/learning-path/`)

1. **POST `/api/learning-path/generate`**
   - Generates a new learning path
   - Body: `{ userId, goal, skillLevel, hoursPerWeek, learningStyle }`
   - Returns: `{ success, pathId, roadmap }`

2. **GET `/api/learning-path/[userId]`**
   - Fetches all learning paths for a user
   - Returns: `{ success, learningPaths }`

3. **PATCH `/api/learning-path/progress`**
   - Updates week completion status
   - Body: `{ pathId, weekNumber, isCompleted }`
   - Returns: `{ success, learningPath }`

4. **POST `/api/learning-path/motivation`**
   - Generates motivational tip
   - Body: `{ pathId }`
   - Returns: `{ success, tip }`

### Frontend (`src/app/student/skills/path/page.tsx`)

- Goal input form with skill level, hours per week, and learning style selection
- Generated roadmap display with week-by-week cards
- Progress tracker with completion toggles
- Motivational tips section

### Data Model (`src/lib/learning-path.ts`)

Firestore Collection: `learningPaths`

```typescript
{
  id: string;
  userId: string;
  goal: string;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  hoursPerWeek: number;
  learningStyle: 'visual' | 'hands-on' | 'reading' | 'mixed';
  roadmap: {
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
  progress: number; // 0-100
  completedWeeks: number[];
  lastUpdated: Timestamp;
  createdAt: Timestamp;
}
```

## Usage

### Generating a Learning Path

1. Navigate to `/student/skills/path`
2. Enter your learning goal
3. Select skill level, hours per week, and learning style
4. Click "Generate Learning Path"
5. Review the week-by-week roadmap

### Tracking Progress

- Toggle the switch next to each week to mark it as complete
- Progress percentage updates automatically
- View completed weeks count

### Getting Motivation

- Click "Get Motivational Tip" to receive AI-generated encouragement
- Tips are personalized based on your current progress

## Environment Setup

The module uses Google Gemini API via Genkit. Ensure you have:

```bash
GOOGLE_GENAI_API_KEY=your_api_key_here
```

Genkit will automatically use this environment variable when configured with `googleAI()` plugin.

## Firestore Security Rules

Add these rules to your Firestore security rules:

```javascript
match /learningPaths/{pathId} {
  allow read: if request.auth != null && request.auth.uid == resource.data.userId;
  allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
  allow update: if request.auth != null && request.auth.uid == resource.data.userId;
  allow delete: if request.auth != null && request.auth.uid == resource.data.userId;
}
```

## Future Enhancements

- LangChain integration for progress-context retrieval
- Pinecone vector search for matching similar users' paths
- Email reminders via cron jobs
- Community recommendations based on similar goals
- Dynamic plan regeneration based on updated skill level

