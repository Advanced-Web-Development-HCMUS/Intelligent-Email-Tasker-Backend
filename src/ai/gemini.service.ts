import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Service for Gemini AI integration
 */
@Injectable()
export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY not set. Gemini features will be disabled.');
      return;
    }

    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      // Use gemini-1.5-pro or gemini-1.5-flash (gemini-pro is deprecated)
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    } catch (error) {
      console.error('Failed to initialize Gemini:', error);
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
    if (!this.model || !this.genAI) {
      throw new Error('Gemini API is not configured. Please set GEMINI_API_KEY.');
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
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

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
      console.error('Gemini API error:', error);
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
    if (!this.model || !this.genAI) {
      throw new Error('Gemini API is not configured. Please set GEMINI_API_KEY.');
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
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

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
      console.error('Gemini metadata extraction error:', error);
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
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.genAI) {
      throw new Error('Gemini API is not configured');
    }

    try {
      const embeddingModel = this.genAI.getGenerativeModel({
        model: 'text-embedding-004',
      });
  
      const result = await embeddingModel.embedContent(text);
      return result.embedding.values;
    } catch (error: any) {
      console.warn('Embedding generation failed, using fallback:', error.message);
      throw new Error('Failed to generate embedding');
    }
  }

  /**
   * Fallback embedding method
   */
  private fallbackEmbedding(text: string): number[] {
    // Simple hash-based embedding (not ideal, but works as fallback)
    const hash = (str: string): number => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return Math.abs(hash);
    };

    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(768).fill(0);
    words.forEach((word, index) => {
      const hashValue = hash(word);
      embedding[index % 768] += hashValue / 1000000;
    });

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map((val) => val / magnitude);
  }
}

