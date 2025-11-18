# Virtuous Content Cycle

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

The Virtuous Content Cycle is a powerful API designed to iteratively improve content through a cyclical process of AI-powered focus groups and editorial revisions. This tool allows you to take an initial piece of content, gather simulated user feedback, automatically revise it based on that feedback, and then review the changes, creating a "virtuous cycle" of content improvement.

## Features

-   **Iterative Content Improvement:** Refine content over multiple cycles.
-   **AI-Powered Focus Groups:** Simulate a focus group to get diverse feedback on your content with configurable participant counts (target market vs. random participants).
-   **Selective Feedback Incorporation:** Choose which focus group feedback to incorporate into the editor revision via checkboxes.
-   **AI-Powered Editor:** Automatically revise your content based on selected focus group feedback.
-   **User Review and Control:** Review all changes, approve them, or provide your own edits.
-   **Full History Tracking:** All versions and feedback are saved for each cycle.
-   **Exportable Results:** Export the entire history of a piece of content as JSON.
-   **Web UI:** Interactive dashboard for creating content, running focus groups, and managing the refinement cycle.
-   **Mock Mode:** Test the full workflow without API costs using mock AI responses.

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
├───public/             # Static files for web UI
├───tests/              # Jest test files
├───aiService.js        # Handles all interactions with AI models
├───databaseService.js  # SQLite database layer (replaces fileService)
├───migrate.js          # Database initialization and seeding
├───models.js           # Zod schemas for data validation
├───errors.js           # Custom error classes
├───server.js           # The main Express server and all route logic
├───focusGroupPersonas.json # Persona configuration (seeded into database)
├───vcc.db              # SQLite database (gitignored, created via migrate.js)
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

The web interface provides:
- Content creation with configurable focus group sizes
- Automatic focus group execution after content creation
- Real-time loading states and status updates
- Interactive feedback review with selective incorporation
- Visual diff viewer for editor changes
- Content history export

### Mock Mode (No API Key Required)

To run the application without making real API calls (useful for development and testing):

```bash
USE_MOCK_AI=true npm run dev
```

This will use simulated AI responses instead of calling OpenRouter.

## API Documentation

The API provides several endpoints to manage the content lifecycle. For a detailed step-by-step guide on how to use the API, please see [happy-path.md](happy-path.md).

### Endpoints

-   `POST /api/content/create`: Create a new piece of content.
-   `GET /api/content/:id`: Get the latest state of a piece of content.
-   `POST /api/content/:id/run-focus-group`: Run a focus group on the content.
-   `POST /api/content/:id/run-editor`: Run an AI editor on the content.
-   `POST /api/content/:id/user-review`: Approve, reject, or edit the editor's changes.
-   `GET /api/content/:id/history`: Get the full history of a piece of content across all cycles.
-   `POST /api/content/:id/export`: Export the content history.
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
