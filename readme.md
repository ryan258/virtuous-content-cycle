# Virtuous Content Cycle (VCC)

The Virtuous Content Cycle is an AI-powered application designed to refine content through an iterative feedback loop. It simulates a focus group of diverse AI personas to critique content, followed by an AI editor that incorporates this feedback to improve the material.

## Architecture

This project uses a modern decoupled architecture:
- **Backend**: Python (FastAPI)
- **Frontend**: React (Vite)
- **Database**: SQLite
- **AI**: OpenAI API (compatible with OpenRouter)

## Features

- **Content Creation**: Draft initial content with metadata (target audience, type).
- **AI Focus Groups**: Run simulated focus groups with customizable personas (Target Market, Random, Outliers).
- **AI Editor**: Automatically revise content based on aggregated focus group feedback.
- **Orchestrator**: Run fully automated refinement loops until a target quality score is reached.
- **History & Versioning**: Track every cycle of iteration and revert to previous versions.
- **Persona Management**: Create and manage custom AI personas.

## Getting Started

### Prerequisites
- Python 3.8+
- Node.js 16+
- OpenRouter API Key (or OpenAI Key)

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file in the root (or `backend/`) with your API key:
   ```
   OPENROUTER_API_KEY=your_key_here
   ```
5. Start the server:
   ```bash
   uvicorn main:app --reload
   ```
   The API will be available at `http://localhost:8000`.

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
   The UI will be available at `http://localhost:5173`.

## Usage

1. **Create Content**: Go to the "Content" tab and paste your draft.
2. **Run Focus Group**: Configure the number of personas and click "Run Focus Group".
3. **Review & Edit**: Analyze the feedback and let the AI Editor revise the content.
4. **Orchestrate**: Use the "Orchestrator" tab to automate the loop until a target rating (e.g., 8.5/10) is achieved.
