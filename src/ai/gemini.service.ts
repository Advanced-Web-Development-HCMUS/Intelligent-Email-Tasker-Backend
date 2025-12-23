import { Injectable } from '@nestjs/common';
import Groq from 'groq-sdk';

/**
 * Service for Groq AI integration (using GeminiService name for compatibility)
 */
@Injectable()
export class GeminiService {
  private groq: Groq;
  private model: string = 'llama-3.3-70b-versatile'; // Groq model

  constructor() {
    const apiKey = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GROQ_API_KEY not set. Groq features will be disabled.');
      return;
    }

    try {
      this.groq = new Groq({ apiKey });
    } catch (error) {
      console.error('Failed to initialize Groq:', error);
    }
  }

  /**
   * Summarize email content
   */
  async summarizeEmail(
    subject: string,
    body: string,
    from: string,
  ): Promise<{
    summary: string;
    keyPoints: string[];
    sentiment: string;
    category: string;
    priority: string;
  }> {
    if (!this.groq) {
      throw new Error('Groq API is not configured. Please set GROQ_API_KEY.');
    }

    const prompt = `Analyze the following email and provide:
1. A concise summary (2-3 sentences)
2. Key points as a JSON array
3. Sentiment (positive, negative, or neutral)
4. Category (work, personal, spam, newsletter, etc.)
5. Priority (high, medium, or low)

Email Subject: ${subject}
From: ${from}
Body: ${body.substring(0, 5000)}

Respond in JSON format:
{
  "summary": "...",
  "keyPoints": ["...", "..."],
  "sentiment": "positive|negative|neutral",
  "category": "...",
  "priority": "high|medium|low"
}`;

    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: this.model,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      });

      const text = completion.choices[0]?.message?.content || '';

      // Parse JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || '',
          keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
          sentiment: parsed.sentiment || 'neutral',
          category: parsed.category || 'other',
          priority: parsed.priority || 'medium',
        };
      }

      // Fallback if JSON parsing fails
      return {
        summary: text.substring(0, 500),
        keyPoints: [],
        sentiment: 'neutral',
        category: 'other',
        priority: 'medium',
      };
    } catch (error: any) {
      console.error('Groq API error:', error);
      throw new Error(`Failed to summarize email: ${error.message}`);
    }
  }

  /**
   * Extract metadata from email
   */
  async extractMetadata(
    subject: string,
    body: string,
  ): Promise<{
    entities: string[];
    topics: string[];
    language: string;
    actionItems: string[];
    tags: string[];
  }> {
    if (!this.groq) {
      throw new Error('Groq API is not configured. Please set GROQ_API_KEY.');
    }

    const prompt = `Extract metadata from the following email:
- Named entities (people, organizations, locations)
- Topics discussed
- Detected language
- Action items (tasks mentioned)
- Relevant tags

Email Subject: ${subject}
Body: ${body.substring(0, 5000)}

Respond in JSON format:
{
  "entities": ["...", "..."],
  "topics": ["...", "..."],
  "language": "...",
  "actionItems": ["...", "..."],
  "tags": ["...", "..."]
}`;

    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: this.model,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      });

      const text = completion.choices[0]?.message?.content || '';

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          entities: Array.isArray(parsed.entities) ? parsed.entities : [],
          topics: Array.isArray(parsed.topics) ? parsed.topics : [],
          language: parsed.language || 'en',
          actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
          tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        };
      }

      return {
        entities: [],
        topics: [],
        language: 'en',
        actionItems: [],
        tags: [],
      };
    } catch (error: any) {
      console.error('Groq metadata extraction error:', error);
      return {
        entities: [],
        topics: [],
        language: 'en',
        actionItems: [],
        tags: [],
      };
    }
  }

  /**
   * Generate embedding for semantic search
   * Note: Groq doesn't have native embedding models, so we use a workaround
   * or fallback to text-based similarity. For production, consider using
   * a dedicated embedding service or keep using Gemini for embeddings.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.groq) {
      throw new Error('Groq API is not configured');
    }

    try {
      // Groq doesn't have embedding models, so we'll use a workaround:
      // Generate a text representation and convert to simple embedding
      // For better results, you might want to use a dedicated embedding service
      // or keep using Gemini embedding model for this specific use case
      
      // Simple workaround: use text hash-based embedding (not ideal but functional)
      // For production, consider using OpenAI embeddings or keep Gemini for embeddings
      const textHash = this.simpleTextToEmbedding(text);
      return textHash;
    } catch (error: any) {
      console.warn('Embedding generation failed:', error.message);
      throw new Error('Failed to generate embedding');
    }
  }

  /**
   * Simple text to embedding conversion (fallback method)
   * This is a basic implementation. For production, use a proper embedding service.
   */
  private simpleTextToEmbedding(text: string): number[] {
    // Create a simple embedding based on text characteristics
    // This is a placeholder - for real embeddings, use a dedicated service
    const words = text.toLowerCase().split(/\s+/);
    const embedding: number[] = new Array(3072).fill(0);
    
    // Simple hash-based embedding
    words.forEach((word, idx) => {
      const hash = this.hashString(word);
      const position = Math.abs(hash) % embedding.length;
      embedding[position] += 1 / (idx + 1);
    });
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      return embedding.map(val => val / magnitude);
    }
    
    return embedding;
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }
}

