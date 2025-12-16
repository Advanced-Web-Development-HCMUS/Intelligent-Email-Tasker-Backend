import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailRaw } from '../gmail/entities/email-raw.entity';
import { EmailSummary } from './entities/email-summary.entity';
import { EmailMetadata } from './entities/email-metadata.entity';
import { GeminiService } from './gemini.service';
import { QdrantService } from './qdrant.service';

/**
 * Service to process emails with AI
 */
@Injectable()
export class AIProcessorService {
  constructor(
    @InjectRepository(EmailRaw)
    private readonly emailRawRepository: Repository<EmailRaw>,
    @InjectRepository(EmailSummary)
    private readonly emailSummaryRepository: Repository<EmailSummary>,
    @InjectRepository(EmailMetadata)
    private readonly emailMetadataRepository: Repository<EmailMetadata>,
    private readonly geminiService: GeminiService,
    private readonly qdrantService: QdrantService,
  ) {}

  /**
   * Process emails: summarize, extract metadata, and store in Qdrant
   */
  async processEmails(emailIds: number[]): Promise<void> {
    console.log(`Processing ${emailIds.length} emails with AI...`);

    for (const emailId of emailIds) {
      try {
        await this.processEmail(emailId);
      } catch (error: any) {
        console.error(`Error processing email ${emailId}:`, error.message);
        // Continue with next email
      }
    }

    console.log(`Finished processing ${emailIds.length} emails`);
  }

  /**
   * Process a single email
   */
  private async processEmail(emailId: number): Promise<void> {
    // Get email from database
    const email = await this.emailRawRepository.findOne({
      where: { id: emailId },
    });

    if (!email) {
      console.warn(`Email ${emailId} not found`);
      return;
    }

    // Check if already processed
    const existingSummary = await this.emailSummaryRepository.findOne({
      where: { emailRawId: emailId },
    });

    if (existingSummary) {
      console.log(`Email ${emailId} already processed, skipping`);
      return;
    }

    // Prepare email content
    const emailContent = email.bodyText || email.bodyHtml || email.snippet || '';
    const fullText = `${email.subject}\n\n${emailContent}`;

    // 1. Summarize with Gemini
    const summaryData = await this.geminiService.summarizeEmail(
      email.subject,
      emailContent,
      email.from || '',
    );

    // 2. Extract metadata
    const metadata = await this.geminiService.extractMetadata(
      email.subject,
      emailContent,
    );

    // 3. Calculate word count and reading time
    const wordCount = fullText.split(/\s+/).length;
    const readingTime = Math.ceil(wordCount / 200); // Average reading speed: 200 words/min

    // 4. Check for attachments
    let hasAttachment = false;
    let attachmentTypes: string[] = [];
    try {
      const rawData = email.rawData ? JSON.parse(email.rawData) : null;
      if (rawData?.payload?.parts) {
        const parts = rawData.payload.parts;
        attachmentTypes = parts
          .filter((p: any) => p.filename)
          .map((p: any) => p.mimeType || 'unknown');
        hasAttachment = attachmentTypes.length > 0;
      }
    } catch (e) {
      // Ignore parsing errors
    }

    // 5. Save summary
    const emailSummary = this.emailSummaryRepository.create({
      emailRawId: emailId,
      summary: summaryData.summary,
      keyPoints: JSON.stringify(summaryData.keyPoints),
      sentiment: summaryData.sentiment,
      category: summaryData.category,
      priority: summaryData.priority,
    });

    const savedSummary = await this.emailSummaryRepository.save(emailSummary);

    // 6. Save metadata
    const emailMetadata = this.emailMetadataRepository.create({
      emailRawId: emailId,
      entities: JSON.stringify(metadata.entities),
      topics: JSON.stringify(metadata.topics),
      language: metadata.language,
      wordCount,
      readingTime,
      tags: JSON.stringify(metadata.tags),
      actionItems: JSON.stringify(metadata.actionItems),
      hasAttachment,
      attachmentTypes: attachmentTypes.length > 0 ? JSON.stringify(attachmentTypes) : null,
    });

    await this.emailMetadataRepository.save(emailMetadata);

    // 7. Generate embedding and store in Qdrant
    // Include subject, sender (name + email), and summary for comprehensive search
    try {
      const senderInfo = `${email.fromName || ''} ${email.from || ''}`.trim();
      const embeddingText = `${email.subject || ''} ${senderInfo} ${summaryData.summary || ''}`.trim();
      
      const embedding = await this.geminiService.generateEmbedding(embeddingText);

      if (!embedding || embedding.length === 0) {
        throw new Error('Failed to generate embedding');
      }

      const qdrantId = await this.qdrantService.storeEmailEmbedding(
        emailId,
        embedding,
        {
          emailRawId: emailId,
          subject: email.subject || '',
          summary: summaryData.summary || '',
          from: email.from || '',
          fromName: email.fromName || '',
          userId: email.userId,
        },
      );

      // Update summary with Qdrant ID
      savedSummary.qdrantId = qdrantId;
      await this.emailSummaryRepository.save(savedSummary);

      console.log(`Successfully processed email ${emailId} and stored in Qdrant`);
    } catch (error: any) {
      console.error(`Failed to store embedding for email ${emailId}:`, error.message);
      console.error('Error stack:', error.stack);
      // Continue even if Qdrant fails - email summary and metadata are already saved
    }
  }

  /**
   * Get email by ID (helper for search enrichment)
   */
  async getEmailById(emailId: number): Promise<EmailRaw | null> {
    return await this.emailRawRepository.findOne({
      where: { id: emailId },
    });
  }

  /**
   * Get email summary by email ID (helper for search enrichment)
   */
  async getEmailSummary(emailId: number): Promise<EmailSummary | null> {
    return await this.emailSummaryRepository.findOne({
      where: { emailRawId: emailId },
    });
  }
}

