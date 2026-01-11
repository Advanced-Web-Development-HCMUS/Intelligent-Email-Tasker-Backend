# AI Module Setup Guide

## Overview

Sau khi fetch email thành công, hệ thống sẽ:
1. Publish event vào Kafka
2. AI module subscribe event và xử lý
3. Dùng Gemini API để summarize emails
4. Lưu vào `email_summary` và `email_metadata` tables
5. Lưu embeddings vào QdrantDB để semantic search

## Prerequisites

1. **Kafka** - Message broker
2. **QdrantDB** - Vector database
3. **Gemini API Key** - Google AI API

## Setup Steps

### 1. Start Services with Docker Compose

```bash
cd backend
docker-compose up -d
```

This will start:
- PostgreSQL (port 5433)
- Zookeeper (port 2181)
- Kafka (port 9092)
- Qdrant (ports 6333, 6334)

### 2. Environment Variables

Add to `backend/.env`:

```env
# Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC_EMAIL_FETCHED=email-fetched

# Gemini API
GEMINI_API_KEY=your-gemini-api-key
GROQ_API_KEY=your-groq-api-key

# Qdrant Configuration (using gRPC)
QDRANT_HOST=localhost
QDRANT_PORT=6334
```

### 3. Get Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Add it to `.env` as `GEMINI_API_KEY`

### 4. Install Dependencies

```bash
cd backend
npm install
```

## How It Works

### Flow

1. **User fetches emails** via `POST /gmail/fetch`
2. **Gmail service** stores emails in `email_raw` table
3. **Kafka event** is published with email IDs
4. **AI Consumer** receives event from Kafka
5. **AI Processor** processes each email:
   - Calls Gemini API to summarize
   - Extracts metadata (entities, topics, etc.)
   - Generates embedding vector
   - Saves to `email_summary` and `email_metadata` tables
   - Stores embedding in QdrantDB

### Database Tables

**email_summary:**
- `id`, `emailRawId`, `summary`, `keyPoints`, `sentiment`, `category`, `priority`, `qdrantId`

**email_metadata:**
- `id`, `emailRawId`, `entities`, `topics`, `language`, `wordCount`, `readingTime`, `tags`, `actionItems`, `hasAttachment`, `attachmentTypes`

## API Endpoints

### Semantic Search
```
POST /ai/search
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "query": "meeting about project",
  "limit": 10
}
```

### Manual Processing
```
POST /ai/process
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "emailIds": [1, 2, 3]
}
```

## Testing

1. **Fetch emails:**
```bash
POST /gmail/fetch
```

2. **Check Kafka logs:**
```bash
docker-compose logs kafka
```

3. **Check AI processing:**
```bash
# Check backend logs for AI processing messages
```

4. **Query summaries:**
```sql
SELECT es.*, er.subject, er.from 
FROM email_summary es
JOIN email_raw er ON es.emailRawId = er.id
LIMIT 10;
```

5. **Test semantic search:**
```bash
POST /ai/search
{
  "query": "project update",
  "limit": 5
}
```

## Troubleshooting

### Kafka not connecting
- Check if Kafka is running: `docker-compose ps`
- Verify `KAFKA_BROKERS` in `.env`

### Gemini API errors
- Verify `GEMINI_API_KEY` is set
- Check API quota/limits
- Review backend logs for specific errors

### Qdrant errors
- Check if Qdrant is running: `docker-compose ps qdrant`
- Verify `QDRANT_HOST` and `QDRANT_PORT` in `.env`
- Check Qdrant health: `curl http://localhost:6333/health`
- Verify gRPC port 6334 is accessible

### Emails not processing
- Check Kafka consumer logs
- Verify AI module is loaded in `app.module.ts`
- Check if `AIConsumer` is initialized

## Notes

- Embedding generation currently uses a fallback method
- For production, consider using a dedicated embedding service (OpenAI, Cohere, etc.)
- Gemini embedding models may require different API calls - update `generateEmbedding()` when available

