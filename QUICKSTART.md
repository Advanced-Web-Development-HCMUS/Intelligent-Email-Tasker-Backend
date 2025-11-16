# Quick Start Guide

## Prerequisites
- Node.js v18+ installed
- npm or yarn installed

## Step 1: Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration (optional for local dev)
npm run start:dev
```

Backend will run on `http://localhost:3001`
Swagger docs: `http://localhost:3001/api`

## Step 2: Frontend Setup

Open a new terminal:

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your configuration
npm start
```

Frontend will run on `http://localhost:3000`

## Step 3: Test Login

1. Open `http://localhost:3000` in your browser
2. Use credentials:
   - Email: `user@example.com`
   - Password: `password123`
3. Or click "Sign in with Google" (requires Google OAuth setup)

## Testing Swagger API

1. Open `http://localhost:3001/api` in your browser
2. Click "Authorize" button
3. Enter a JWT token (get one by logging in via frontend)
4. Test all endpoints

## Troubleshooting

### Backend won't start
- Check if port 3001 is available
- Ensure all dependencies are installed: `npm install`
- Check `.env` file exists

### Frontend won't start
- Check if port 3000 is available
- Ensure all dependencies are installed: `npm install`
- Check `.env` file has `REACT_APP_API_URL=http://localhost:3001`

### Login fails
- Ensure backend is running
- Check browser console for errors
- Verify CORS is enabled in backend

### Google Sign-In doesn't work
- Add your Google Client ID to `.env` files
- Configure Google OAuth in Google Cloud Console
- Add `http://localhost:3000` to authorized origins

