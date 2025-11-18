const Database = require('better-sqlite3');
const path = require('path');

// Initialize database
const dbPath = path.join(__dirname, 'vcc.db');
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for better performance
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

/**
 * Initialize database schema
 */
const initializeSchema = () => {
  // ContentItems table - stores the base content and metadata
  db.exec(`
    CREATE TABLE IF NOT EXISTS ContentItems (
      id TEXT PRIMARY KEY,
      originalInput TEXT NOT NULL,
      contentType TEXT NOT NULL,
      targetAudience TEXT NOT NULL,
      maxCycles INTEGER NOT NULL,
      convergenceThreshold REAL NOT NULL,
      costEstimate REAL DEFAULT 0,
      targetMarketCount INTEGER DEFAULT 3,
      randomCount INTEGER DEFAULT 2,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  // Migrations: Add columns if they don't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE ContentItems ADD COLUMN costEstimate REAL DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE ContentItems ADD COLUMN targetMarketCount INTEGER DEFAULT 3`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE ContentItems ADD COLUMN randomCount INTEGER DEFAULT 2`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Cycles table - stores each iteration/cycle of content refinement
  db.exec(`
    CREATE TABLE IF NOT EXISTS Cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contentId TEXT NOT NULL,
      cycleNumber INTEGER NOT NULL,
      currentVersion TEXT NOT NULL,
      status TEXT NOT NULL,

      -- Aggregated feedback fields
      averageRating REAL,
      convergenceScore REAL,
      ratingDistLow INTEGER,
      ratingDistMid INTEGER,
      ratingDistHigh INTEGER,
      topLikes TEXT,
      topDislikes TEXT,
      feedbackThemes TEXT,

      -- Editor pass fields
      editorRevisedContent TEXT,
      editorChangesSummary TEXT,
      editorReasoning TEXT,
      editorModelUsed TEXT,
      editorTimestamp TEXT,

      -- User review fields
      userApproved INTEGER,
      userEdits TEXT,
      userNotes TEXT,
      userTimestamp TEXT,

      -- AI meta fields
      aiMode TEXT,
      focusModel TEXT,
      editorModel TEXT,
      lastError TEXT,

      -- Status history
      statusHistory TEXT DEFAULT '[]',

      -- Cost tracking
      promptTokens INTEGER DEFAULT 0,
      completionTokens INTEGER DEFAULT 0,
      totalCost REAL DEFAULT 0,

      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,

      FOREIGN KEY (contentId) REFERENCES ContentItems(id) ON DELETE CASCADE,
      UNIQUE(contentId, cycleNumber)
    )
  `);

  // Personas table - stores AI personas for focus groups
  db.exec(`
    CREATE TABLE IF NOT EXISTS Personas (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      persona TEXT NOT NULL,
      systemPrompt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  // Feedback table - stores individual persona feedback for each cycle
  db.exec(`
    CREATE TABLE IF NOT EXISTS Feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycleId INTEGER NOT NULL,
      participantId TEXT NOT NULL,
      participantType TEXT NOT NULL,
      rating REAL NOT NULL,
      likes TEXT NOT NULL,
      dislikes TEXT NOT NULL,
      suggestions TEXT NOT NULL,
      fullResponse TEXT NOT NULL,

      -- Cost tracking for this feedback
      promptTokens INTEGER DEFAULT 0,
      completionTokens INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,

      timestamp TEXT NOT NULL,

      FOREIGN KEY (cycleId) REFERENCES Cycles(id) ON DELETE CASCADE,
      FOREIGN KEY (participantId) REFERENCES Personas(id)
    )
  `);

  // Create indexes for better query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cycles_contentId ON Cycles(contentId);
    CREATE INDEX IF NOT EXISTS idx_feedback_cycleId ON Feedback(cycleId);
    CREATE INDEX IF NOT EXISTS idx_personas_type ON Personas(type);
  `);

  // Migrations: Add statusHistory column if it doesn't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE Cycles ADD COLUMN statusHistory TEXT DEFAULT '[]'`);
  } catch (e) {
    // Column already exists, ignore
  }
};

// Initialize schema on module load
initializeSchema();

/**
 * ContentItems CRUD Operations
 */
const createContentItem = (data) => {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO ContentItems (
      id, originalInput, contentType, targetAudience,
      maxCycles, convergenceThreshold, costEstimate, targetMarketCount, randomCount,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    data.id,
    data.originalInput,
    data.contentType,
    data.targetAudience,
    data.maxCycles,
    data.convergenceThreshold,
    data.costEstimate ?? 0,
    data.targetMarketCount ?? 3,
    data.randomCount ?? 2,
    now,
    now
  );

  return getContentItem(data.id);
};

const getContentItem = (id) => {
  const stmt = db.prepare('SELECT * FROM ContentItems WHERE id = ?');
  return stmt.get(id);
};

const getAllContentItems = () => {
  const stmt = db.prepare('SELECT * FROM ContentItems ORDER BY createdAt DESC');
  return stmt.all();
};

/**
 * Cycles CRUD Operations
 */
const createCycle = (data) => {
  const now = new Date().toISOString();
  const initialStatusHistory = JSON.stringify([
    { status: data.status, timestamp: now }
  ]);

  const stmt = db.prepare(`
    INSERT INTO Cycles (
      contentId, cycleNumber, currentVersion, status, statusHistory,
      aiMode, focusModel, editorModel, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    data.contentId,
    data.cycleNumber,
    data.currentVersion,
    data.status,
    initialStatusHistory,
    data.aiMode || 'live',
    data.focusModel || null,
    data.editorModel || null,
    now,
    now
  );

  return getCycle(result.lastInsertRowid);
};

const getCycle = (id) => {
  const stmt = db.prepare('SELECT * FROM Cycles WHERE id = ?');
  return stmt.get(id);
};

const getCycleByContentAndNumber = (contentId, cycleNumber) => {
  const stmt = db.prepare('SELECT * FROM Cycles WHERE contentId = ? AND cycleNumber = ?');
  return stmt.get(contentId, cycleNumber);
};

const getAllCyclesForContent = (contentId) => {
  const stmt = db.prepare('SELECT * FROM Cycles WHERE contentId = ? ORDER BY cycleNumber ASC');
  return stmt.all(contentId);
};

const getLatestCycleNumber = (contentId) => {
  const stmt = db.prepare('SELECT MAX(cycleNumber) as maxCycle FROM Cycles WHERE contentId = ?');
  const result = stmt.get(contentId);
  return result?.maxCycle || 0;
};

const updateCycleStatus = (cycleId, status) => {
  const now = new Date().toISOString();

  // Get current cycle to access existing statusHistory
  const cycle = getCycle(cycleId);
  const currentHistory = JSON.parse(cycle.statusHistory || '[]');

  // Append new status to history
  currentHistory.push({ status, timestamp: now });
  const updatedHistory = JSON.stringify(currentHistory);

  const stmt = db.prepare('UPDATE Cycles SET status = ?, statusHistory = ?, updatedAt = ? WHERE id = ?');
  stmt.run(status, updatedHistory, now, cycleId);
  return getCycle(cycleId);
};

const updateCycleWithAggregatedFeedback = (cycleId, aggregatedFeedback) => {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE Cycles SET
      averageRating = ?,
      convergenceScore = ?,
      ratingDistLow = ?,
      ratingDistMid = ?,
      ratingDistHigh = ?,
      topLikes = ?,
      topDislikes = ?,
      feedbackThemes = ?,
      updatedAt = ?
    WHERE id = ?
  `);

  stmt.run(
    aggregatedFeedback.averageRating,
    aggregatedFeedback.convergenceScore,
    aggregatedFeedback.ratingDistribution['1-3'],
    aggregatedFeedback.ratingDistribution['4-6'],
    aggregatedFeedback.ratingDistribution['7-10'],
    JSON.stringify(aggregatedFeedback.topLikes),
    JSON.stringify(aggregatedFeedback.topDislikes),
    JSON.stringify(aggregatedFeedback.feedbackThemes),
    now,
    cycleId
  );

  return getCycle(cycleId);
};

const updateCycleWithEditorPass = (cycleId, editorPass) => {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE Cycles SET
      editorRevisedContent = ?,
      editorChangesSummary = ?,
      editorReasoning = ?,
      editorModelUsed = ?,
      editorTimestamp = ?,
      updatedAt = ?
    WHERE id = ?
  `);

  stmt.run(
    editorPass.revisedContent,
    editorPass.changesSummary,
    editorPass.editorReasoning,
    editorPass.modelUsed,
    editorPass.timestamp,
    now,
    cycleId
  );

  return getCycle(cycleId);
};

const updateCycleWithUserReview = (cycleId, userReview) => {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE Cycles SET
      userApproved = ?,
      userEdits = ?,
      userNotes = ?,
      userTimestamp = ?,
      updatedAt = ?
    WHERE id = ?
  `);

  stmt.run(
    userReview.approved ? 1 : 0,
    userReview.userEdits || null,
    userReview.notes,
    userReview.timestamp,
    now,
    cycleId
  );

  return getCycle(cycleId);
};

const updateCycleCosts = (cycleId, promptTokens, completionTokens, cost) => {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE Cycles SET
      promptTokens = promptTokens + ?,
      completionTokens = completionTokens + ?,
      totalCost = totalCost + ?,
      updatedAt = ?
    WHERE id = ?
  `);

  stmt.run(promptTokens, completionTokens, cost, now, cycleId);
  return getCycle(cycleId);
};

/**
 * Personas CRUD Operations
 */
const createPersona = (data) => {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO Personas (id, name, type, persona, systemPrompt, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    data.id,
    data.name,
    data.type,
    data.persona,
    data.systemPrompt,
    now,
    now
  );

  return getPersona(data.id);
};

const getPersona = (id) => {
  const stmt = db.prepare('SELECT * FROM Personas WHERE id = ?');
  return stmt.get(id);
};

const getAllPersonas = () => {
  const stmt = db.prepare('SELECT * FROM Personas ORDER BY type, name');
  return stmt.all();
};

const getPersonasByType = (type) => {
  const stmt = db.prepare('SELECT * FROM Personas WHERE type = ? ORDER BY name');
  return stmt.all(type);
};

const getPersonasByIds = (ids) => {
  const placeholders = ids.map(() => '?').join(',');
  const stmt = db.prepare(`SELECT * FROM Personas WHERE id IN (${placeholders})`);
  return stmt.all(...ids);
};

const updatePersona = (id, data) => {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE Personas SET
      name = ?,
      type = ?,
      persona = ?,
      systemPrompt = ?,
      updatedAt = ?
    WHERE id = ?
  `);

  stmt.run(data.name, data.type, data.persona, data.systemPrompt, now, id);
  return getPersona(id);
};

const deletePersona = (id) => {
  const stmt = db.prepare('DELETE FROM Personas WHERE id = ?');
  stmt.run(id);
  return { success: true, deletedId: id };
};

/**
 * Feedback CRUD Operations
 */
const createFeedback = (data) => {
  const stmt = db.prepare(`
    INSERT INTO Feedback (
      cycleId, participantId, participantType, rating,
      likes, dislikes, suggestions, fullResponse,
      promptTokens, completionTokens, cost, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    data.cycleId,
    data.participantId,
    data.participantType,
    data.rating,
    JSON.stringify(data.likes),
    JSON.stringify(data.dislikes),
    data.suggestions,
    data.fullResponse,
    data.promptTokens || 0,
    data.completionTokens || 0,
    data.cost || 0,
    data.timestamp
  );

  return getFeedback(result.lastInsertRowid);
};

const getFeedback = (id) => {
  const stmt = db.prepare('SELECT * FROM Feedback WHERE id = ?');
  const feedback = stmt.get(id);
  if (feedback) {
    feedback.likes = JSON.parse(feedback.likes);
    feedback.dislikes = JSON.parse(feedback.dislikes);
  }
  return feedback;
};

const getAllFeedbackForCycle = (cycleId) => {
  const stmt = db.prepare('SELECT * FROM Feedback WHERE cycleId = ? ORDER BY timestamp ASC');
  const feedbacks = stmt.all(cycleId);
  return feedbacks.map(f => ({
    ...f,
    likes: JSON.parse(f.likes),
    dislikes: JSON.parse(f.dislikes)
  }));
};

/**
 * Helper function to get complete iteration state (mimics old fileService behavior)
 */
const getIterationState = (contentId, cycleNumber) => {
  const contentItem = getContentItem(contentId);
  if (!contentItem) {
    throw new Error(`Content item ${contentId} not found`);
  }

  const cycle = getCycleByContentAndNumber(contentId, cycleNumber);
  if (!cycle) {
    throw new Error(`Cycle ${cycleNumber} not found for content ${contentId}`);
  }

  const feedbacks = getAllFeedbackForCycle(cycle.id);

  // Reconstruct the old format for backward compatibility
  return {
    id: contentId,
    cycle: cycleNumber,
    originalInput: contentItem.originalInput,
    currentVersion: cycle.currentVersion,
    focusGroupRatings: feedbacks.map(f => ({
      participantId: f.participantId,
      participantType: f.participantType,
      rating: f.rating,
      likes: f.likes,
      dislikes: f.dislikes,
      suggestions: f.suggestions,
      fullResponse: f.fullResponse,
      timestamp: f.timestamp
    })),
    aggregatedFeedback: cycle.averageRating !== null ? {
      averageRating: cycle.averageRating,
      convergenceScore: cycle.convergenceScore,
      ratingDistribution: {
        '1-3': cycle.ratingDistLow,
        '4-6': cycle.ratingDistMid,
        '7-10': cycle.ratingDistHigh
      },
      topLikes: JSON.parse(cycle.topLikes || '[]'),
      topDislikes: JSON.parse(cycle.topDislikes || '[]'),
      feedbackThemes: JSON.parse(cycle.feedbackThemes || '[]')
    } : undefined,
    editorPass: cycle.editorRevisedContent ? {
      revisedContent: cycle.editorRevisedContent,
      changesSummary: cycle.editorChangesSummary,
      editorReasoning: cycle.editorReasoning,
      modelUsed: cycle.editorModelUsed,
      timestamp: cycle.editorTimestamp
    } : undefined,
    userEdit: cycle.userApproved !== null ? {
      approved: cycle.userApproved === 1,
      userEdits: cycle.userEdits,
      notes: cycle.userNotes,
      timestamp: cycle.userTimestamp
    } : undefined,
    status: cycle.status,
    statusHistory: JSON.parse(cycle.statusHistory || '[]'),
    metadata: {
      contentType: contentItem.contentType,
      targetAudience: contentItem.targetAudience,
      maxCycles: contentItem.maxCycles,
      convergenceThreshold: contentItem.convergenceThreshold,
      costEstimate: contentItem.costEstimate ?? 0,
      focusGroupConfig: {
        targetMarketCount: contentItem.targetMarketCount ?? 3,
        randomCount: contentItem.randomCount ?? 2
      }
    },
    aiMeta: {
      mode: cycle.aiMode,
      focusModel: cycle.focusModel,
      editorModel: cycle.editorModel,
      lastError: cycle.lastError
    }
  };
};

/**
 * Seed personas from focusGroupPersonas.json (one-time migration)
 */
const seedPersonas = (personas) => {
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO Personas (id, name, type, persona, systemPrompt, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  const insertMany = db.transaction((personas) => {
    for (const p of personas) {
      insertStmt.run(p.id, p.id, p.type, p.persona, p.systemPrompt, now, now);
    }
  });

  insertMany(personas);
};

/**
 * Close database connection (for graceful shutdown)
 */
const closeDatabase = () => {
  db.close();
};

module.exports = {
  // ContentItems
  createContentItem,
  getContentItem,
  getAllContentItems,

  // Cycles
  createCycle,
  getCycle,
  getCycleByContentAndNumber,
  getAllCyclesForContent,
  getLatestCycleNumber,
  updateCycleStatus,
  updateCycleWithAggregatedFeedback,
  updateCycleWithEditorPass,
  updateCycleWithUserReview,
  updateCycleCosts,

  // Personas
  createPersona,
  getPersona,
  getAllPersonas,
  getPersonasByType,
  getPersonasByIds,
  updatePersona,
  deletePersona,
  seedPersonas,

  // Feedback
  createFeedback,
  getFeedback,
  getAllFeedbackForCycle,

  // Helper functions
  getIterationState,

  // Utility
  closeDatabase,
  db // Export db instance for advanced queries if needed
};
