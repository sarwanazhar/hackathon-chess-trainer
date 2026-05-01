# ♟️ Chess Senpai

> **AI-powered chess coaching platform** — built for the CWA Prompt-a-thon 2026 Hackathon

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black?style=for-the-badge&logo=vercel)](https://hackathon-chess-trainer.vercel.app)
[![Backend](https://img.shields.io/badge/Backend-Go-00ADD8?style=for-the-badge&logo=go)](./backend)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js-black?style=for-the-badge&logo=next.js)](./frontend)

---

## 🏆 Hackathon

This project was built for the **CWA Prompt-a-thon 2026**, organized by [Code With Ahsan](https://www.youtube.com/@CodeWithAhsan). It was developed by a two-person team under time pressure, with **Sarwan Azhar** as team lead.

---



## 🧠 What is Chess Senpai?

Chess Senpai is an AI-powered chess training platform that acts as your personal coach. Instead of just showing you the best move, it *explains* your mistakes — identifying your tactical weaknesses and guiding you through a personalized improvement path.

Think of it as having a grandmaster coach available 24/7, powered by Stockfish's engine precision and an LLM's natural language insight.

---

## ✨ Features

- **Real-time AI Coaching** — Get move-by-move feedback powered by a large language model, grounded in live Stockfish engine analysis
- **Interactive Chess Board** — Fully playable board using Chessground with smooth piece animations
- **Puzzle Training** — Tactical puzzles with AI-guided hints and explanations
- **Live Chat with AI Coach** — Ask your coach anything about the current position in natural language
- **Personalized Curriculum** — Training paths adapted to your playstyle and weaknesses
- **WebSocket Architecture** — Real-time communication between the board and backend for instant coaching responses

---

## 🛠️ Tech Stack

### Frontend
- **Next.js** (TypeScript) — React framework for the UI
- **Chessground** — Interactive chessboard rendering
- **chess.js** — Chess logic and move validation
- **WebSockets** — Real-time communication with the backend

### Backend
- **Go** — High-performance backend server
- **WebSockets** — Bidirectional real-time connection with the frontend
- **Stockfish** — Chess engine integration for position analysis and evaluation
- **Gemini LLM** — AI coaching commentary grounded in Stockfish's live analysis

### Deployment
- **Vercel** — Frontend deployment
- **Go server** — Backend hosting

---

## 🏗️ Project Structure

```
hackathon-chess-trainer/
├── frontend/          # Next.js + TypeScript application
│   ├── app/           # Next.js app router pages
│   ├── components/    # React components (board, chat, curriculum)
│   └── ...
├── backend/           # Go server
│   ├── main.go        # Entry point, WebSocket handler
│   ├── stockfish/     # Stockfish engine integration
│   ├── gemini/        # LLM coaching logic
│   └── ...
└── .cline/kanban/     # Project task board
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18+
- **Go** 1.21+
- **Stockfish** installed and available in PATH
- A **Gemini API key** from Google AI Studio

### 1. Clone the repository

```bash
git clone https://github.com/sarwanazhar/hackathon-chess-trainer.git
cd hackathon-chess-trainer
```

### 2. Set up the Backend

```bash
cd backend
cp .env.example .env   # Add your Gemini API key
go mod tidy
go run main.go
```

The backend will start on `http://localhost:8080`.

### 3. Set up the Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # Set NEXT_PUBLIC_WS_URL=ws://localhost:8080
npm run dev
```

The app will be available at `http://localhost:3000`.

---

## 🤖 How the AI Coaching Works

1. You make a move on the board
2. The frontend sends the updated position (FEN) to the Go backend via WebSocket
3. The backend feeds the position into **Stockfish** to get the best move, evaluation score, and candidate lines
4. That engine data is passed directly into a **Gemini LLM** prompt — grounding the AI's response in concrete chess analysis
5. The LLM generates a natural language coaching message explaining what happened, what you should have played, and why
6. The response streams back to the frontend in real time

This architecture prevents the LLM from hallucinating chess moves — it can only comment on what Stockfish actually calculated.

---

## 👥 Team

| Role | Name |
|------|------|
| Team Lead & Full-Stack | [Sarwan Azhar](https://github.com/sarwanazhar) |
| Developer | *Arafat hussain* |

---

## 🏅 Certificate of Achievement

CWA Prompt-a-thon 2026 Certificate<img width="2000" height="1414" alt="Sarwan_Azhar" src="https://github.com/user-attachments/assets/6ed63828-e2cc-4b6a-9e87-6dd550774604" />


## 📜 Acknowledgements

- [Stockfish](https://stockfishchess.org/) — Open-source chess engine
- [Chessground](https://github.com/lichess-org/chessground) — Chess UI by Lichess
- [chess.js](https://github.com/jhlywa/chess.js) — Chess move logic
- [Google Gemini](https://ai.google.dev/) — LLM for coaching commentary
- [Code With Ahsan](https://www.youtube.com/@CodeWithAhsan) — Hackathon organizer

---

<p align="center">Built with ♟️ and ☕ at CWA Prompt-a-thon 2026</p>
