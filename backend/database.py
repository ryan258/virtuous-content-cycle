import sqlite3
import os
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from .models import IterationState, Persona

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'vcc.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Enable FKs and WAL
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA journal_mode = WAL')
    return conn

def initialize_schema():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # ContentItems
    cursor.execute('''
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
      personaIds TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
    ''')

    # Cycles
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS Cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contentId TEXT NOT NULL,
      cycleNumber INTEGER NOT NULL,
      currentVersion TEXT NOT NULL,
      status TEXT NOT NULL,
      averageRating REAL,
      convergenceScore REAL,
      ratingDistLow INTEGER,
      ratingDistMid INTEGER,
      ratingDistHigh INTEGER,
      topLikes TEXT,
      topDislikes TEXT,
      feedbackThemes TEXT,
      editorRevisedContent TEXT,
      editorChangesSummary TEXT,
      editorReasoning TEXT,
      editorModelUsed TEXT,
      editorTimestamp TEXT,
      moderatorSummary TEXT,
      moderatorKeyPoints TEXT,
      moderatorModelUsed TEXT,
      moderatorTimestamp TEXT,
      moderatorPatterns TEXT,
      userApproved INTEGER,
      userEdits TEXT,
      userNotes TEXT,
      userTimestamp TEXT,
      aiMode TEXT,
      focusModel TEXT,
      editorModel TEXT,
      lastError TEXT,
      statusHistory TEXT DEFAULT '[]',
      promptTokens INTEGER DEFAULT 0,
      completionTokens INTEGER DEFAULT 0,
      totalCost REAL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (contentId) REFERENCES ContentItems(id) ON DELETE CASCADE,
      UNIQUE(contentId, cycleNumber)
    )
    ''')

    # Personas
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS Personas (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      persona TEXT NOT NULL,
      systemPrompt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
    ''')

    # Feedback
    cursor.execute('''
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
      promptTokens INTEGER DEFAULT 0,
      completionTokens INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (cycleId) REFERENCES Cycles(id) ON DELETE CASCADE,
      FOREIGN KEY (participantId) REFERENCES Personas(id)
    )
    ''')

    # Indexes
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_cycles_contentId ON Cycles(contentId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_feedback_cycleId ON Feedback(cycleId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_personas_type ON Personas(type)')

    conn.commit()
    conn.close()

# --- ContentItems ---

def create_content_item(data: Dict[str, Any]):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    
    cursor.execute('''
    INSERT INTO ContentItems (
      id, originalInput, contentType, targetAudience,
      maxCycles, convergenceThreshold, costEstimate, targetMarketCount, randomCount, personaIds,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data['id'],
        data['originalInput'],
        data['metadata']['contentType'],
        data['metadata']['targetAudience'],
        data['metadata']['maxCycles'],
        data['metadata']['convergenceThreshold'],
        data['metadata'].get('costEstimate', 0),
        data['metadata'].get('focusGroupConfig', {}).get('targetMarketCount', 3),
        data['metadata'].get('focusGroupConfig', {}).get('randomCount', 2),
        json.dumps(data['metadata'].get('focusGroupConfig', {}).get('personaIds')) if data['metadata'].get('focusGroupConfig', {}).get('personaIds') else None,
        now,
        now
    ))
    conn.commit()
    conn.close()
    return get_content_item(data['id'])

def get_content_item(id: str):
    conn = get_db_connection()
    item = conn.execute('SELECT * FROM ContentItems WHERE id = ?', (id,)).fetchone()
    conn.close()
    return dict(item) if item else None

def get_all_content_items():
    conn = get_db_connection()
    items = conn.execute('SELECT * FROM ContentItems ORDER BY createdAt DESC').fetchall()
    conn.close()
    return [dict(item) for item in items]

# --- Cycles ---

def create_cycle(data: Dict[str, Any]):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    initial_history = json.dumps([{'status': data['status'], 'timestamp': now}])
    
    cursor.execute('''
    INSERT INTO Cycles (
      contentId, cycleNumber, currentVersion, status, statusHistory,
      aiMode, focusModel, editorModel, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data['contentId'],
        data['cycleNumber'],
        data['currentVersion'],
        data['status'],
        initial_history,
        data.get('aiMode', 'live'),
        data.get('focusModel'),
        data.get('editorModel'),
        now,
        now
    ))
    cycle_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return get_cycle(cycle_id)

def get_cycle(id: int):
    conn = get_db_connection()
    item = conn.execute('SELECT * FROM Cycles WHERE id = ?', (id,)).fetchone()
    conn.close()
    return dict(item) if item else None

def get_cycle_by_content_and_number(content_id: str, cycle_number: int):
    conn = get_db_connection()
    item = conn.execute('SELECT * FROM Cycles WHERE contentId = ? AND cycleNumber = ?', (content_id, cycle_number)).fetchone()
    conn.close()
    return dict(item) if item else None

def get_latest_cycle_number(content_id: str):
    conn = get_db_connection()
    result = conn.execute('SELECT MAX(cycleNumber) as maxCycle FROM Cycles WHERE contentId = ?', (content_id,)).fetchone()
    conn.close()
    return result['maxCycle'] or 0

def update_cycle_status(cycle_id: int, status: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    
    cycle = get_cycle(cycle_id)
    history = json.loads(cycle['statusHistory'] or '[]')
    history.append({'status': status, 'timestamp': now})
    
    cursor.execute('''
    UPDATE Cycles SET status = ?, statusHistory = ?, updatedAt = ? WHERE id = ?
    ''', (status, json.dumps(history), now, cycle_id))
    conn.commit()
    conn.close()
    return get_cycle(cycle_id)

# --- Personas ---

def get_all_personas():
    conn = get_db_connection()
    items = conn.execute('SELECT * FROM Personas ORDER BY type, name').fetchall()
    conn.close()
    return [dict(item) for item in items]

def create_persona(data: Dict[str, Any]):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    
    cursor.execute('''
    INSERT INTO Personas (id, name, type, persona, systemPrompt, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (
        data['id'],
        data['name'],
        data['type'],
        data['persona'],
        data['systemPrompt'],
        now,
        now
    ))
    conn.commit()
    conn.close()
    return get_persona(data['id'])

def get_persona(id: str):
    conn = get_db_connection()
    item = conn.execute('SELECT * FROM Personas WHERE id = ?', (id,)).fetchone()
    conn.close()
    return dict(item) if item else None

# --- Helper: Get Iteration State ---

def get_iteration_state(content_id: str, cycle_number: int):
    content = get_content_item(content_id)
    if not content:
        return None
        
    cycle = get_cycle_by_content_and_number(content_id, cycle_number)
    if not cycle:
        return None
        
    conn = get_db_connection()
    feedbacks = conn.execute('SELECT * FROM Feedback WHERE cycleId = ? ORDER BY timestamp ASC', (cycle['id'],)).fetchall()
    total_cost_row = conn.execute('SELECT SUM(totalCost) as totalCost FROM Cycles WHERE contentId = ?', (content_id,)).fetchone()
    conn.close()
    
    total_cost = total_cost_row['totalCost'] or 0
    
    # Construct nested objects
    focus_group_ratings = []
    for f in feedbacks:
        focus_group_ratings.append({
            'participantId': f['participantId'],
            'participantType': f['participantType'],
            'rating': f['rating'],
            'likes': json.loads(f['likes']),
            'dislikes': json.loads(f['dislikes']),
            'suggestions': f['suggestions'],
            'fullResponse': f['fullResponse'],
            'timestamp': f['timestamp']
        })
        
    aggregated_feedback = None
    if cycle['averageRating'] is not None:
        aggregated_feedback = {
            'averageRating': cycle['averageRating'],
            'convergenceScore': cycle['convergenceScore'],
            'ratingDistribution': {
                '1-3': cycle['ratingDistLow'],
                '4-6': cycle['ratingDistMid'],
                '7-10': cycle['ratingDistHigh']
            },
            'topLikes': json.loads(cycle['topLikes'] or '[]'),
            'topDislikes': json.loads(cycle['topDislikes'] or '[]'),
            'feedbackThemes': json.loads(cycle['feedbackThemes'] or '[]')
        }
        
    editor_pass = None
    if cycle['editorRevisedContent']:
        editor_pass = {
            'revisedContent': cycle['editorRevisedContent'],
            'changesSummary': cycle['editorChangesSummary'],
            'editorReasoning': cycle['editorReasoning'],
            'modelUsed': cycle['editorModelUsed'],
            'timestamp': cycle['editorTimestamp'],
            'moderator': None
        }
        if cycle['moderatorSummary']:
            editor_pass['moderator'] = {
                'summary': cycle['moderatorSummary'],
                'keyPoints': json.loads(cycle['moderatorKeyPoints'] or '[]'),
                'modelUsed': cycle['moderatorModelUsed'],
                'timestamp': cycle['moderatorTimestamp'],
                'patterns': cycle['moderatorPatterns']
            }
            
    user_edit = None
    if cycle['userApproved'] is not None:
        user_edit = {
            'approved': bool(cycle['userApproved']),
            'userEdits': cycle['userEdits'],
            'notes': cycle['userNotes'],
            'timestamp': cycle['userTimestamp']
        }
        
    return {
        'id': content_id,
        'cycle': cycle_number,
        'originalInput': content['originalInput'],
        'currentVersion': cycle['currentVersion'],
        'focusGroupRatings': focus_group_ratings,
        'aggregatedFeedback': aggregated_feedback,
        'editorPass': editor_pass,
        'userEdit': user_edit,
        'status': cycle['status'],
        'statusHistory': json.loads(cycle['statusHistory'] or '[]'),
        'metadata': {
            'contentType': content['contentType'],
            'targetAudience': content['targetAudience'],
            'costEstimate': content['costEstimate'],
            'maxCycles': content['maxCycles'],
            'convergenceThreshold': content['convergenceThreshold'],
            'totalCost': total_cost,
            'focusGroupConfig': {
                'targetMarketCount': content['targetMarketCount'],
                'randomCount': content['randomCount'],
                'personaIds': json.loads(content['personaIds']) if content['personaIds'] else None
            }
        },
        'aiMeta': {
            'mode': cycle['aiMode'],
            'focusModel': cycle['focusModel'],
            'editorModel': cycle['editorModel'],
            'lastError': cycle['lastError']
        }
    }
