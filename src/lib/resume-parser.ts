/**
 * @fileOverview Resume parsing utilities
 */

// Use dynamic import for mammoth
let mammothModule: any = null;

async function getMammoth() {
  if (!mammothModule) {
    mammothModule = await import('mammoth');
  }
  return mammothModule.default || mammothModule;
}

export interface ParsedResume {
  text: string;
  metadata: {
    fileName: string;
    pageCount: number;
    fileSize: number;
  };
}

/**
 * Parse PDF resume file
 */
export async function parsePDFResume(fileBuffer: Buffer, fileName: string): Promise<ParsedResume> {
  try {
    // pdf-parse is externalized via next.config.ts serverExternalPackages
    // so Node.js loads it natively, bypassing Turbopack bundling issues
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(fileBuffer);
    
    return {
      text: data.text || '',
      metadata: {
        fileName,
        pageCount: data.numpages || 1,
        fileSize: fileBuffer.length,
      },
    };
  } catch (error: any) {
    console.error('PDF parse error details:', error?.message || error);
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse DOCX resume file
 */
export async function parseDOCXResume(fileBuffer: Buffer, fileName: string): Promise<ParsedResume> {
  try {
    const mammoth = await getMammoth();
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    
    // Estimate page count (rough estimate: ~500 words per page)
    const wordCount = result.value.split(/\s+/).length;
    const estimatedPages = Math.max(1, Math.ceil(wordCount / 500));
    
    return {
      text: result.value,
      metadata: {
        fileName,
        pageCount: estimatedPages,
        fileSize: fileBuffer.length,
      },
    };
  } catch (error) {
    throw new Error(`Failed to parse DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse text resume file
 */
export async function parseTextResume(fileBuffer: Buffer, fileName: string): Promise<ParsedResume> {
  return {
    text: fileBuffer.toString('utf-8'),
    metadata: {
      fileName,
      pageCount: 1,
      fileSize: fileBuffer.length,
    },
  };
}

/**
 * Chunk resume text for embedding
 */
export function chunkResumeText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  if (!text || text.length === 0) {
    return [];
  }
  
  // Ensure valid parameters
  chunkSize = Math.max(100, Math.min(chunkSize, 5000)); // Between 100 and 5000
  overlap = Math.max(0, Math.min(overlap, chunkSize - 1)); // Must be less than chunkSize
  
  const chunks: string[] = [];
  let start = 0;
  const maxChunks = 100; // Safety limit to prevent array overflow
  let iterations = 0;
  
  while (start < text.length && chunks.length < maxChunks && iterations < 1000) {
    iterations++;
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    // Move start forward
    const nextStart = end - overlap;
    
    // Safety check: ensure we're making progress
    if (nextStart <= start) {
      start = end; // Move forward by at least chunkSize
    } else {
      start = nextStart;
    }
    
    // Final safety check
    if (start >= text.length) {
      break;
    }
  }
  
  return chunks;
}
