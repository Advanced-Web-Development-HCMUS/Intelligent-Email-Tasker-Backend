# Email Authentication & Dashboard

A full-stack React application with NestJS backend implementing secure authentication (email/password + Google Sign-In) and a 3-column email dashboard mockup.

## Features

- ✅ Email/Password authentication
- ✅ Google OAuth Sign-In
- ✅ JWT access tokens (in-memory) and refresh tokens (localStorage)
- ✅ Automatic token refresh with concurrency handling
- ✅ Protected routes
- ✅ 3-column responsive email dashboard
- ✅ Mock email API with realistic data
- ✅ Swagger API documentation
- ✅ Form validation and error handling
- ✅ **PostgreSQL database with Docker Compose**

## Project Structure

```
G03/
├── backend/          # NestJS backend API
│   ├── src/
│   │   ├── auth/     # Authentication module
│   │   ├── email/    # Email module with mock data
│   │   └── common/   # Shared utilities
│   └── package.json
├── frontend/         # React frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── contexts/     # Auth context
│   │   ├── pages/        # Page components
│   │   └── services/     # API client
│   └── package.json
├── docker-compose.yml    # PostgreSQL database setup
└── README.md
```

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Docker and Docker Compose (for PostgreSQL)
- Google OAuth Client ID (for Google Sign-In)

## Setup Instructions

### Step 1: Start PostgreSQL Database

Start the PostgreSQL database using Docker Compose:

```bash
docker-compose up -d
```

This will start PostgreSQL on port 5432 with:
- Username: `postgres`
- Password: `postgres`
- Database: `email_auth_db`

You can customize these in `docker-compose.yml` or use environment variables.

### Step 2: Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the backend directory:
```bash
cp .env.example .env
```

4. Update `.env` with your configuration:
```env
JWT_SECRET=your-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production
PORT=3001
FRONTEND_URL=http://localhost:3000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=email_auth_db
```

5. Start the backend server:
```bash
npm run start:dev
```

The backend will:
- Connect to PostgreSQL automatically
- Create tables automatically (in development mode)
- Create a default user (`user@example.com` / `password123`)

Backend will be available at `http://localhost:3001`
Swagger documentation will be available at `http://localhost:3001/api`

### Step 3: Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the frontend directory:
```bash
cp .env.example .env
```

4. Update `.env` with your configuration:
```env
REACT_APP_API_URL=http://localhost:3001
REACT_APP_GOOGLE_CLIENT_ID=your-google-client-id
```

5. Start the frontend development server:
```bash
npm start
```

The frontend will be available at `http://localhost:3000`

## Database

### PostgreSQL Connection

The backend uses TypeORM to connect to PostgreSQL. The database connection is configured in `backend/src/app.module.ts`.

**Development Mode:**
- `synchronize: true` - Automatically creates/updates database schema
- Tables are created automatically on first run

**Production Mode:**
- `synchronize: false` - Use migrations instead
- Set `NODE_ENV=production` in `.env`

### Database Schema

**Users Table:**
- `id` (Primary Key)
- `email` (Unique)
- `password` (Hashed, nullable for Google OAuth users)
- `name`
- `googleId` (Unique, nullable)
- `createdAt`
- `updatedAt`

**Refresh Tokens Table:**
- `id` (Primary Key)
- `token` (Unique)
- `userId` (Foreign Key to Users)
- `createdAt`

### Default User

On first startup, the backend automatically creates a default user:
- **Email**: `user@example.com`
- **Password**: `password123`

### Database Management

**View database:**
```bash
docker-compose exec postgres psql -U postgres -d email_auth_db
```

**Stop database:**
```bash
docker-compose down
```

**Stop and remove volumes (deletes all data):**
```bash
docker-compose down -v
```

## Default Credentials

For testing email/password login:
- **Email**: `user@example.com`
- **Password**: `password123`

## Token Storage Strategy

### Access Token (In-Memory)
- **Storage**: JavaScript variable in the API client
- **Rationale**: 
  - Access tokens are short-lived (15 minutes)
  - Storing in-memory reduces XSS attack surface
  - Tokens are automatically cleared when the browser tab is closed
  - More secure than localStorage for sensitive tokens

### Refresh Token (localStorage)
- **Storage**: Browser localStorage
- **Rationale**:
  - Refresh tokens are long-lived (7 days)
  - Needed for persistent sessions across browser restarts
  - localStorage provides persistence while maintaining reasonable security
  - Alternative (HttpOnly cookies) would require additional backend configuration
  - In production, consider HttpOnly cookies for enhanced security

### Security Considerations
- Both tokens are cleared on logout
- Refresh tokens are stored in PostgreSQL database
- Refresh token is validated server-side
- Automatic token refresh handles expired access tokens
- Failed refresh triggers logout and redirect to login

## API Endpoints

### Authentication
- `POST /auth/login` - Email/password login
- `POST /auth/google` - Google OAuth login
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout (requires authentication)
- `POST /auth/me` - Get current user (requires authentication)

### Email
- `GET /email/mailboxes` - Get all mailboxes (requires authentication)
- `GET /email/mailboxes/:id/emails` - Get emails for a mailbox (requires authentication)
- `GET /email/emails/:id` - Get email details (requires authentication)

All endpoints are documented in Swagger at `http://localhost:3001/api`

## Deployment

### Backend Deployment

The backend can be deployed to:
- Heroku
- Railway
- AWS Elastic Beanstalk
- DigitalOcean App Platform
- Any Node.js hosting service

**Steps:**
1. Set environment variables on your hosting platform
2. Set up a PostgreSQL database (managed service or Docker)
3. Update `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` in environment variables
4. Set `NODE_ENV=production` and `synchronize=false` (use migrations)
5. Build the application: `npm run build`
6. Start the application: `npm run start:prod`

### Frontend Deployment

The frontend can be deployed to:
- **Netlify** (Recommended)
- **Vercel**
- **Firebase Hosting**
- **GitHub Pages**

#### Netlify Deployment

1. Build the frontend:
```bash
cd frontend
npm run build
```

2. Deploy to Netlify:
   - Option A: Connect your Git repository to Netlify
   - Option B: Drag and drop the `build` folder to Netlify

3. Set environment variables in Netlify dashboard:
   - `REACT_APP_API_URL` - Your backend API URL
   - `REACT_APP_GOOGLE_CLIENT_ID` - Your Google OAuth Client ID

4. Update your backend CORS settings to allow your Netlify domain

#### Vercel Deployment

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
cd frontend
vercel
```

3. Set environment variables in Vercel dashboard

### Public Deployment URL

After deployment, update this section with your public URL:
- **Frontend**: [Your Netlify/Vercel URL]
- **Backend**: [Your Backend URL]
- **Swagger**: [Your Backend URL]/api

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized JavaScript origins:
   - `http://localhost:3000` (development)
   - Your production domain (deployment)
6. Add authorized redirect URIs:
   - `http://localhost:3000` (development)
   - Your production domain (deployment)
7. Copy the Client ID and add it to your `.env` files

## Testing the Application

### 1. Start Database
```bash
docker-compose up -d
```

### 2. Start Backend
```bash
cd backend
npm install
npm run start:dev
```

### 3. Start Frontend
```bash
cd frontend
npm install
npm start
```

### 4. Test Login
1. Navigate to `http://localhost:3000`
2. Enter `user@example.com` and `password123`
3. Click "Sign In"
4. You should be redirected to `/inbox`

### 5. Test Swagger API
1. Open `http://localhost:3001/api`
2. Click "Authorize" button
3. Enter a JWT token (get one by logging in via frontend)
4. Test all endpoints

## Technology Stack

### Backend
- **NestJS** - Progressive Node.js framework
- **TypeScript** - Type-safe JavaScript
- **TypeORM** - ORM for PostgreSQL
- **PostgreSQL** - Relational database
- **JWT** - JSON Web Tokens for authentication
- **Passport** - Authentication middleware
- **Swagger** - API documentation
- **class-validator** - DTO validation
- **bcrypt** - Password hashing

### Frontend
- **React** - UI library
- **TypeScript** - Type-safe JavaScript
- **React Router** - Client-side routing
- **Axios** - HTTP client
- **@react-oauth/google** - Google OAuth integration

### Infrastructure
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **PostgreSQL** - Database

## Code Quality

- TypeScript for type safety
- ESLint for code linting
- Prettier for code formatting
- JSDoc comments for documentation
- Clean code principles
- Error handling and validation

## Security Features

- Password hashing with bcrypt
- JWT token-based authentication
- CORS configuration
- Input validation with class-validator
- SQL injection protection (ORM usage)
- XSS protection (React's built-in escaping)
- Secure token storage strategy
- Refresh tokens stored in database

## Troubleshooting

### Database Connection Issues

**Error: "Connection refused"**
- Ensure Docker is running
- Check if PostgreSQL container is up: `docker-compose ps`
- Verify database credentials in `.env`

**Error: "Database does not exist"**
- The database is created automatically on first connection
- Check `DB_NAME` in `.env` matches docker-compose.yml

**Error: "Password authentication failed"**
- Verify `DB_PASSWORD` in `.env` matches `POSTGRES_PASSWORD` in docker-compose.yml

### Backend Issues

**Error: "Cannot connect to database"**
- Ensure PostgreSQL is running: `docker-compose up -d`
- Check database connection settings in `.env`
- Verify port 5432 is not blocked

**Tables not created**
- Check `NODE_ENV` is set to `development` for auto-sync
- In production, use migrations instead

### Frontend Issues

**API calls failing**
- Verify `REACT_APP_API_URL` in frontend `.env`
- Check backend is running on correct port
- Verify CORS is enabled in backend

## License

MIT

## Author

G03 - Web Development Advanced Course
