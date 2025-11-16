# Database Setup Guide

## Quick Start

### 1. Start PostgreSQL with Docker Compose

```bash
docker-compose up -d
```

This will start PostgreSQL in a Docker container. Check if it's running:

```bash
docker-compose ps
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

This will install TypeORM and PostgreSQL driver (`pg`).

### 3. Configure Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=email_auth_db

# JWT Configuration
JWT_SECRET=your-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production

# Server Configuration
PORT=3001
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

### 4. Start Backend

```bash
npm run start:dev
```

The backend will:
- Connect to PostgreSQL automatically
- Create database tables automatically (in development mode)
- Create a default user: `user@example.com` / `password123`

## Database Management

### Connect to Database

```bash
docker-compose exec postgres psql -U postgres -d email_auth_db
```

### View Tables

```sql
\dt
```

### View Users

```sql
SELECT id, email, name, "googleId", "createdAt" FROM users;
```

### View Refresh Tokens

```sql
SELECT id, token, "userId", "createdAt" FROM refresh_tokens;
```

### Stop Database

```bash
docker-compose down
```

### Stop and Remove All Data

```bash
docker-compose down -v
```

## Troubleshooting

### Port Already in Use

If port 5432 is already in use, change it in `docker-compose.yml`:

```yaml
ports:
  - "5433:5432"  # Use 5433 instead
```

And update `.env`:
```env
DB_PORT=5433
```

### Database Connection Failed

1. Check if PostgreSQL is running:
```bash
docker-compose ps
```

2. Check logs:
```bash
docker-compose logs postgres
```

3. Verify credentials in `.env` match `docker-compose.yml`

### Tables Not Created

- Ensure `NODE_ENV=development` in `.env` (enables auto-sync)
- Check backend logs for errors
- Verify database connection settings

## Production Setup

For production, use migrations instead of auto-sync:

1. Set `NODE_ENV=production` in `.env`
2. Set `synchronize: false` in `app.module.ts` (already done)
3. Use TypeORM migrations:
```bash
npm run typeorm migration:generate -- -n InitialMigration
npm run typeorm migration:run
```

