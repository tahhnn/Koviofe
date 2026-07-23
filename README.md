# QuizBattle - Real-time Interactive Quiz Platform

A modern, interactive quiz platform inspired by Kahoot, built with Next.js, React, WebSockets, and PostgreSQL. Features real-time leaderboards, custom question creation, QR code joining, and separate host/player interfaces.

## Features

### Quiz Creation
- Create and manage unlimited custom quizzes
- Add multiple-choice questions with configurable time limits
- Mark correct answers and track answer distribution
- Full CRUD operations for quizzes, questions, and options

### Real-time Gaming
- WebSocket-powered live gameplay updates
- Real-time leaderboard updates as players answer
- Instant answer reveal with statistics
- Smooth transitions between questions

### Player Interface
- Join games via 6-digit session code or QR code
- Mobile-friendly responsive design
- Colorful answer buttons with instant feedback
- Live timer countdown for each question

### Host Control Screen
- Full game management from desktop/projector
- Real-time player join notifications
- Answer distribution visualization
- Live leaderboard display
- Question-by-question control

### Authentication
- Secure email/password authentication via Better Auth
- Anonymous player joining (no account required)
- Session-based authentication for creators

### QR Code Support
- Generate QR codes for easy game joining
- QR code display page for projector/presentation
- Downloadable QR codes
- Fallback 6-digit session codes

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS, shadcn/ui
- **Backend**: Next.js Server Actions, Node.js
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **Real-time**: WebSocket
- **Authentication**: Better Auth with Password Strategy
- **QR Codes**: qrcode library
- **Hosting**: Vercel

## Project Structure

```
app/
  ├── page.tsx                 # Landing page
  ├── dashboard/               # User dashboard with quiz list
  ├── sign-in/                # Authentication
  ├── sign-up/
  ├── join/                    # Player join screen
  ├── quizzes/[quizId]/        # Quiz editor
  ├── play/[sessionId]/        # Player game screen
  ├── host/[sessionId]/        # Host control screen
  │   └── qr/                  # QR code display page
  ├── results/[sessionId]/     # Game results/leaderboard
  ├── api/
  │   ├── auth/[...all]/       # Auth handler
  │   └── ws/                  # WebSocket endpoint
  └── actions/                 # Server actions
      ├── quizzes.ts
      └── game.ts

lib/
  ├── auth.ts                  # Better Auth config
  ├── auth-client.ts           # Client auth
  ├── db/
  │   ├── index.ts             # Drizzle setup
  │   └── schema.ts            # Database schema
  ├── ws-server.ts             # WebSocket server
  ├── qr-code.ts               # QR generation
  └── utils.ts

hooks/
  └── use-websocket.ts         # WebSocket hook

components/
  ├── auth-form.tsx            # Auth form component
  └── qr-code.tsx              # QR code component
```

## Database Schema

### Core Tables
- `user` - User accounts
- `session` - Auth sessions
- `account` - OAuth integrations
- `verification` - Email verification

### Quiz Tables
- `quizzes` - Quiz metadata
- `questions` - Quiz questions
- `answer_options` - Answer choices

### Game Tables
- `game_sessions` - Active game instances
- `game_participants` - Players in a game
- `player_answers` - Submitted answers
- `game_leaderboard` - Real-time scores

## Setup

1. **Environment Variables**
   - `DATABASE_URL`: PostgreSQL connection string from Neon
   - `BETTER_AUTH_SECRET`: Generate with `openssl rand -base64 32`

2. **Database Migration**
   - Schema is auto-created via Neon integration

3. **Install Dependencies**
   ```bash
   pnpm install
   ```

4. **Run Development Server**
   ```bash
   pnpm dev
   ```

5. **Open in Browser**
   - Navigate to `http://localhost:3000`

## Usage

### For Quiz Creators
1. Sign up/sign in
2. Create a new quiz from dashboard
3. Add questions and answer options
4. Mark correct answers
5. Click "Start Game" to host a session
6. Share the 6-digit code or QR code with players

### For Players
1. Visit the join page or scan QR code
2. Enter session code and username
3. Click "Join Game"
4. Wait for host to start
5. Answer questions as they appear
6. View final results and leaderboard

## Scoring System

- Correct answers: 1000 - (timeSpent / timeLimit) * 900 points
- Incorrect answers: 0 points
- Leaderboard sorted by total points, then correct answers

## Real-time Features

### WebSocket Events
- `join_room`: Player joins game
- `game_started`: Host starts game
- `next_question`: Move to next question
- `answer_submitted`: Player submits answer
- `reveal_answer`: Show correct answer
- `end_game`: Finish game session

### Live Updates
- Leaderboard updates after each answer
- Answer distribution charts
- Player join notifications
- Real-time sync across all connected clients

## Future Enhancements

- Question categories and topics
- Timed multiplayer rounds
- Team-based gameplay
- Quiz templates library
- Analytics and reporting
- Custom branding for hosts
- Power-ups and special abilities
- Community quiz sharing

## License

MIT
