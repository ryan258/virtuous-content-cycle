import React, { useState } from 'react';
import { contentApi } from '../api';

const OrchestratorTab = ({ activeContentId }) => {
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState([]);
    const [error, setError] = useState(null);

    // Config
    const [targetRating, setTargetRating] = useState(8.5);
    const [maxCycles, setMaxCycles] = useState(10);
    const [editorInstructions, setEditorInstructions] = useState('');

    const runOrchestrator = async () => {
        if (!activeContentId) {
            setError("Please select content first.");
            return;
        }

        setLoading(true);
        setLogs(prev => [...prev, "Starting orchestrator..."]);

        try {
            const res = await contentApi.runOrchestrator({
                contentId: activeContentId,
                targetRating: Number(targetRating),
                maxCycles: Number(maxCycles),
                editorInstructions
            });

            if (res.data.logs) {
                setLogs(prev => [...prev, ...res.data.logs]);
            }

            if (res.data.achieved) {
                setLogs(prev => [...prev, `SUCCESS: Target rating achieved! Final: ${res.data.finalRating}`]);
            } else {
                setLogs(prev => [...prev, `STOPPED: ${res.data.reason}. Final: ${res.data.finalRating}`]);
            }

        } catch (err) {
            setError(err.message);
            setLogs(prev => [...prev, `ERROR: ${err.message}`]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="orchestrator-tab">
            <div className="config-panel" style={{ background: '#f9f9f9', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                <h3>Auto-Refinement Config</h3>
                <div className="input-group">
                    <label>Target Rating (1-10)</label>
                    <input type="number" value={targetRating} onChange={(e) => setTargetRating(e.target.value)} step="0.1" />
                </div>
                <div className="input-group">
                    <label>Max Cycles</label>
                    <input type="number" value={maxCycles} onChange={(e) => setMaxCycles(e.target.value)} />
                </div>
                <div className="input-group">
                    <label>Global Editor Instructions</label>
                    <textarea
                        value={editorInstructions}
                        onChange={(e) => setEditorInstructions(e.target.value)}
                        placeholder="e.g. Keep it professional, avoid jargon..."
                    />
                </div>
                <button onClick={runOrchestrator} disabled={loading || !activeContentId}>
                    {loading ? 'Running...' : 'Start Orchestrator'}
                </button>
            </div>

            <div className="logs-panel" style={{ background: '#1e1e1e', color: '#00ff00', padding: '15px', borderRadius: '8px', fontFamily: 'monospace', minHeight: '200px', maxHeight: '400px', overflowY: 'auto' }}>
                {logs.length === 0 && <div style={{ color: '#666' }}>Waiting for logs...</div>}
                {logs.map((log, i) => (
                    <div key={i}>{`> ${log}`}</div>
                ))}
            </div>

            {error && <div className="status-message error">{error}</div>}
        </div>
    );
};

export default OrchestratorTab;
