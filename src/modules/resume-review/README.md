# Resume Review System

## Overview

AI-powered resume review system with:
- **Gemini AI** for resume analysis and chat
- **Pinecone** for vector storage and semantic search
- **LangChain** for RAG (Retrieval Augmented Generation)
- **PDF parsing** for resume extraction

## Features

1. **Resume Upload & Analysis**
   - Upload PDF, TXT, or DOCX resumes
   - AI-powered comprehensive review
   - Automatic parsing and text extraction

2. **Vector Embeddings & Indexing**
   - Generate embeddings using Gemini
   - Store in Pinecone for semantic search
   - Chunk-based indexing for efficient retrieval

3. **Resume Chat (RAG)**
   - Chat with your resume using natural language
   - Context-aware responses using Pinecone semantic search
   - Conversation history stored in Firestore

## Setup

### Environment Variables

Add to `.env.local`:

```bash
# Google Gemini API Key (for embeddings and chat)
GOOGLE_GENAI_API_KEY=your_gemini_api_key

# Pinecone API Key
PINECONE_API_KEY=your_pinecone_api_key
```

### Pinecone Index Setup

1. Create a Pinecone account at https://www.pinecone.io/
2. Create a new index:
   - **Index Name**: `resume-reviews`
   - **Dimensions**: `768` (or adjust based on embedding model)
   - **Metric**: `cosine`
   - **Pod Type**: `s1.x1` (or your preferred tier)

### Firestore Collections

The system uses two collections:
- `resumeReviews` - Stores resume data and metadata
- `resumeChatMessages` - Stores chat conversation history

## API Routes

- `POST /api/resume/upload` - Upload and analyze resume
- `GET /api/resume?userId=xxx` - Get user's resumes
- `GET /api/resume?resumeId=xxx` - Get single resume
- `POST /api/resume/chat` - Send chat message
- `GET /api/resume/chat?resumeId=xxx` - Get chat history

## Usage Flow

1. User uploads resume → PDF/TXT parsed
2. Resume analyzed → AI generates comprehensive review
3. Resume chunked → Embeddings generated for each chunk
4. Chunks indexed → Stored in Pinecone with metadata
5. User chats → Query Pinecone for relevant context → RAG response

## Technical Stack

- **AI**: Google Gemini 2.0 Flash (via LangChain)
- **Embeddings**: Google text-embedding-004
- **Vector DB**: Pinecone
- **Framework**: LangChain for RAG orchestration
- **Storage**: Firebase Firestore
- **Parsing**: pdf-parse for PDF files

