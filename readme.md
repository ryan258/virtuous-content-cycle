# Virtuous Content Cycle

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

The Virtuous Content Cycle (VCC 2.0) is a powerful autonomous content refinement platform that uses AI-powered focus groups, moderator synthesis, and editorial revisions to iteratively improve your content. Build your "Dream Team" of AI personas, provide steering instructions to the editor, and let the autonomous orchestrator manage the entire refinement loop until your target quality is achieved.

## Features

### Core Refinement Loop
-   **Iterative Content Improvement:** Refine content over multiple cycles with full history tracking.
-   **AI-Powered Focus Groups:** Simulate diverse focus group feedback with configurable personas.
-   **Selective Feedback Incorporation:** Choose which feedback to incorporate via checkboxes.
-   **AI Moderator (Debate Step):** Synthesizes focus group feedback into actionable insights before editing.
-   **AI-Powered Editor:** Automatically revises content based on synthesized feedback and custom instructions.
-   **Editor Steering:** Provide custom instructions to guide the editor's revisions (e.g., "Focus on tone, ignore length").
-   **User Review and Control:** Review changes, approve them, or provide your own edits.

### Persona Management ("Dream Team Launchpad")
-   **Custom Personas:** Create, edit, and delete your own AI personas with custom system prompts.
-   **Persona Types:** Target market (your intended audience) and random (diverse perspectives).
-   **Dynamic Selection:** Choose which personas participate in each focus group via checkboxes.
-   **Database-Backed:** All personas stored in SQLite for persistence and reusability.

### Autonomous Orchestrator ("Chief of Staff")
-   **Automated Refinement:** Run multiple cycles autonomously until target rating or max cycles reached.
-   **Target-Based:** Set a target rating (e.g., 8.5/10) and let the orchestrator run until achieved.
-   **Smart Termination:** Stops immediately when target is met to avoid wasteful API calls.
-   **Real-Time Logs:** See cycle-by-cycle progress as the orchestrator works.

### Metrics & Transparency
-   **Convergence Score:** Measures agreement among focus group participants (0-1 scale).
-   **Cost Tracking:** Track token usage and costs across all cycles (requires manual rate configuration).
-   **Full History:** All versions, feedback, moderator summaries, and metrics saved per cycle.
-   **Exportable Results:** Export entire content history as JSON.

### Developer Experience
-   **Web UI:** Three-tab interface (Content, Personas, Orchestrator) for complete workflow management.
-   **Mock Mode:** Test the full workflow without API costs using mock AI responses.
-   **Database-Backed:** SQLite persistence with automatic migrations.
-   **Type-Safe:** Zod schemas for API validation.

## Tech Stack

-   **Backend:** Node.js, Express, Helmet
-   **Database:** SQLite (better-sqlite3)
-   **AI:** OpenRouter API (Sherlock Think Alpha - FREE during alpha)
-   **Data Validation:** Zod
-   **Concurrency Limiting:** p-limit
-   **Testing:** Jest, Supertest

## Project Structure

This project follows a simple, flat structure to keep it easy to understand and maintain.

```
/
├───public/                    # Static files for web UI (3 tabs: Content, Personas, Orchestrator)
├───tests/                     # Jest test files
├───aiService.js               # AI model interactions (focus groups, editor, moderator)
├───databaseService.js         # SQLite database layer with migrations
├───orchestratorService.js     # Autonomous multi-cycle refinement loop
├───migrate.js                 # Database initialization and persona seeding
├───models.js                  # Zod schemas for API validation
├───errors.js                  # Custom error classes
├───server.js                  # Express server and all route logic
├───focusGroupPersonas.json    # Default personas (seeded into database on first run)
├───vcc.db                     # SQLite database (gitignored, auto-created)
├───package.json
└───README.md
```

## Getting Started

Follow these instructions to get the project up and running on your local machine.

### Prerequisites

-   [Node.js](https://nodejs.org/) (20 recommended, v25+ not yet supported due to better-sqlite3 native module compatibility). Use nvm use (or equivalent) before running tests.
-   `npm`
-   **Note**: If you encounter native module errors with `better-sqlite3`, use Node v20:
    ```bash
    # Using nvm (recommended)
    nvm use 20
    # Or install Node 20 from https://nodejs.org/
    ```

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/virtuous-content-cycle.git
    cd virtuous-content-cycle
    ```

2.  Install the dependencies:
    ```bash
    npm install
    ```

3.  Set up your environment variables:
    ```bash
    cp .env.example .env
    ```
    Then edit `.env` and add your OpenRouter API key (or leave empty for mock mode):
    ```
    OPENROUTER_API_KEY="your_openrouter_api_key"
    ```
    You can get a FREE API key from [OpenRouter](https://openrouter.ai/keys).

4.  Initialize the database:
    ```bash
    node migrate.js
    ```
    This will create `vcc.db` and seed it with 5 default personas.

### Running the Application

To start the server in development mode (with hot-reloading):

```bash
npm run dev
```

To start the server in production mode:

```bash
npm start
```

The server will start on `http://localhost:3000`.

### Using the Web UI

Once the server is running, open your browser and navigate to:
```
http://localhost:3000
```

The web interface provides three tabs:

**Content Tab:**
- Create new content with persona selection (checkbox list)
- Automatic focus group execution after creation
- View convergence score and running cost
- Add custom editor instructions
- Review moderator's synthesized summary
- Interactive feedback review with selective incorporation
- Visual diff viewer for editor changes
- Content history export

**Personas Tab:**
- Create, edit, and delete custom AI personas
- Set persona type (target market or random)
- Configure custom system prompts
- View all personas in a card layout
- Cannot delete personas in use by content items

**Orchestrator Tab:**
- Run autonomous multi-cycle refinement
- Set target rating (1-10) and max cycles (1-10)
- Select personas for orchestration
- Provide editor instructions
- View real-time cycle-by-cycle logs
- Automatically stops when target achieved or max cycles reached

### Mock Mode (No API Key Required)

To run the application without making real API calls (useful for development and testing):

```bash
USE_MOCK_AI=true npm run dev
```

This will use simulated AI responses instead of calling OpenRouter.

## API Documentation

The API provides several endpoints to manage the content lifecycle. For a detailed step-by-step guide on how to use the API, please see [happy-path.md](happy-path.md).

### Content Endpoints

-   `POST /api/content/create`: Create a new piece of content with optional `personaIds` array.
-   `GET /api/content/:id`: Get the latest state of a piece of content.
-   `POST /api/content/:id/run-focus-group`: Run a focus group on the content (with optional `personaIds` override).
-   `POST /api/content/:id/run-editor`: Run the AI editor with optional `editorInstructions` and `selectedParticipantIds`.
-   `POST /api/content/:id/user-review`: Approve, reject, or edit the editor's changes.
-   `GET /api/content/:id/history`: Get the full history of a piece of content across all cycles.
-   `POST /api/content/:id/export`: Export the content history as JSON.

### Persona Endpoints

-   `GET /api/personas`: List all personas.
-   `POST /api/personas`: Create a new persona (requires `name`, `type`, `persona`, `systemPrompt`).
-   `PUT /api/personas/:id`: Update an existing persona.
-   `DELETE /api/personas/:id`: Delete a persona (fails if in use by content).

### Orchestrator Endpoint

-   `POST /api/orchestrate/run`: Run autonomous refinement (requires `contentId`, `targetRating`, `maxCycles`, optional `personaIds` and `editorInstructions`).

### Utility

-   `GET /health`: Health check endpoint.

## Configuration

The application is configured through environment variables.

-   `PORT`: The port the server will run on. (Default: `3000`)
-   `USE_MOCK_AI`: Set to `true` to use mock AI responses instead of real API calls. (Default: `false` if `OPENROUTER_API_KEY` is set)
-   `OPENROUTER_API_KEY`: **(Required for live mode)** Your API key for OpenRouter. Get one at [OpenRouter](https://openrouter.ai/).
-   `OPENROUTER_BASE_URL`: The base URL for the OpenRouter API. (Default: `https://openrouter.ai/api/v1`)
-   `OPENROUTER_FOCUS_MODEL`: The AI model to use for focus group participants. (Default: `openrouter/sherlock-think-alpha` - FREE during alpha, 1.8M context, reasoning model)
-   `OPENROUTER_EDITOR_MODEL`: The AI model to use for the editor. (Default: `openrouter/sherlock-think-alpha` - FREE during alpha, 1.8M context, reasoning model)
-   `APP_BASE_URL`: The base URL of your application, used in the `Referer` header. (Default: `http://localhost:3000`)
-   `APP_NAME`: The name of your application, used in the `X-Title` header. (Default: `Virtuous Content Cycle`)

**Note**: Sherlock Think Alpha and Sherlock Dash Alpha are FREE frontier models during alpha testing. Alternative paid models include `anthropic/claude-3.5-sonnet` (excellent quality) and `google/gemini-1.5-flash` (fast & cheap).

### Development Configuration

The `nodemon.json` file configures the development server to ignore the `results/` directory, preventing server restarts when content files are saved during the refinement process.

## Contributing

Contributions are welcome! If you have a feature request, bug report, or want to contribute to the code, please feel free to open an issue or a pull request.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
