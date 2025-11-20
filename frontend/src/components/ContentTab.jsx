import React, { useState, useEffect } from 'react';
import { contentApi } from '../api';
import confetti from 'canvas-confetti';

const ContentTab = ({ activeContentId, onContentCreated }) => {
    const [content, setContent] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Create Form State
    const [input, setInput] = useState('');
    const [contentType, setContentType] = useState('LinkedIn Post');
    const [targetAudience, setTargetAudience] = useState('Tech Professionals');
    const [maxCycles, setMaxCycles] = useState(10);

    // Focus Group Config
    const [targetMarketCount, setTargetMarketCount] = useState(3);
    const [randomCount, setRandomCount] = useState(2);

    // Editor Config
    const [editorInstructions, setEditorInstructions] = useState('');

    // User Review
    const [userEdits, setUserEdits] = useState('');
    const [reviewNotes, setReviewNotes] = useState('');

    useEffect(() => {
        if (activeContentId) {
            loadContent(activeContentId);
        } else {
            setContent(null);
        }
    }, [activeContentId]);

    const loadContent = async (id) => {
        setLoading(true);
        try {
            const res = await contentApi.get(id);
            setContent(res.data);
            setUserEdits(res.data.editorPass?.revisedContent || '');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        setLoading(true);
        try {
            const res = await contentApi.create({
                originalInput: input,
                metadata: {
                    contentType,
                    targetAudience,
                    maxCycles: Number(maxCycles),
                    convergenceThreshold: 0.9,
                    focusGroupConfig: {
                        targetMarketCount: Number(targetMarketCount),
                        randomCount: Number(randomCount)
                    }
                }
            });
            setContent(res.data);
            onContentCreated(); // Refresh sidebar
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const runFocusGroup = async () => {
        setLoading(true);
        try {
            const res = await contentApi.runFocusGroup(content.id, {
                personaIds: [] // Use default logic for now
            });
            setContent(res.data);

            if (res.data.aggregatedFeedback?.averageRating >= 8.5) {
                confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const runEditor = async () => {
        setLoading(true);
        try {
            const res = await contentApi.runEditor(content.id, {
                editorInstructions
            });
            setContent(res.data);
            setUserEdits(res.data.editorPass?.revisedContent || '');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleUserReview = async (approved, continueToNext) => {
        setLoading(true);
        try {
            const res = await contentApi.userReview(content.id, {
                approved,
                userEdits: approved ? userEdits : null,
                notes: reviewNotes,
                continueToNextCycle: continueToNext
            });
            setContent(res.data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!activeContentId && !content) {
        return (
            <div className="create-content">
                <h2>Create New Content</h2>
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Paste your draft here..."
                    rows={6}
                />
                <div className="input-group">
                    <label>Content Type</label>
                    <input type="text" value={contentType} onChange={(e) => setContentType(e.target.value)} />
                </div>
                <div className="input-group">
                    <label>Target Audience</label>
                    <input type="text" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} />
                </div>
                <div className="input-group">
                    <label>Max Cycles</label>
                    <input type="number" value={maxCycles} onChange={(e) => setMaxCycles(e.target.value)} />
                </div>
                <button onClick={handleCreate} disabled={loading || !input}>
                    {loading ? 'Creating...' : 'Start Cycle'}
                </button>
                {error && <div className="status-message error">{error}</div>}
            </div>
        );
    }

    if (!content) return <div>Loading...</div>;

    const { cycle, status, currentVersion, aggregatedFeedback, editorPass } = content;

    return (
        <div className="content-dashboard">
            <div className="cycle-info">
                <h3>
                    Cycle {cycle}
                    <span className={`status-badge ${status}`}>{status.replace(/_/g, ' ')}</span>
                </h3>
                {aggregatedFeedback && (
                    <div className="stats-row" style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
                        <div className="stat-card" style={{ flex: 1 }}>
                            <div className="stat-label">Quality</div>
                            <div className="stat-value" style={{ color: aggregatedFeedback.averageRating > 8 ? '#4ade80' : '#facc15' }}>
                                {aggregatedFeedback.averageRating.toFixed(1)}
                            </div>
                        </div>
                        <div className="stat-card" style={{ flex: 1 }}>
                            <div className="stat-label">Consensus</div>
                            <div className="stat-value">
                                {(aggregatedFeedback.convergenceScore * 100).toFixed(0)}%
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="content-preview">
                <h3>Current Version</h3>
                <pre>{currentVersion}</pre>
            </div>

            {/* Actions based on status */}
            <div className="actions">
                {(status === 'created' || status === 'awaiting_focus_group' || status === 'draft') && (
                    <div>
                        <h4>Next Step: Focus Group</h4>
                        <div className="focus-group-config">
                            <div className="input-group">
                                <label>Target Market Personas</label>
                                <input type="number" value={targetMarketCount} onChange={(e) => setTargetMarketCount(e.target.value)} />
                            </div>
                            <div className="input-group">
                                <label>Random Personas</label>
                                <input type="number" value={randomCount} onChange={(e) => setRandomCount(e.target.value)} />
                            </div>
                        </div>
                        <button onClick={runFocusGroup} disabled={loading}>
                            {loading ? 'Running Focus Group...' : 'Run Focus Group'}
                        </button>
                    </div>
                )}

                {status === 'focus_group_complete' && (
                    <div>
                        <h4>Next Step: Editor</h4>
                        <div className="feedback-summary">
                            <h4>Feedback Summary</h4>
                            <p><strong>Rating:</strong> {aggregatedFeedback?.averageRating.toFixed(1)}/10</p>
                            <p><strong>Themes:</strong> {aggregatedFeedback?.feedbackThemes.map(t => t.theme).join(', ')}</p>
                        </div>
                        <textarea
                            value={editorInstructions}
                            onChange={(e) => setEditorInstructions(e.target.value)}
                            placeholder="Additional instructions for the editor..."
                        />
                        <button onClick={runEditor} disabled={loading}>
                            {loading ? 'Running Editor...' : 'Run Editor'}
                        </button>
                    </div>
                )}

                {status === 'editor_complete' && (
                    <div>
                        <h4>Next Step: Review</h4>
                        <div className="diff-view">
                            <h5>Editor's Revision</h5>
                            <pre>{editorPass?.revisedContent}</pre>
                            <p><strong>Reasoning:</strong> {editorPass?.editorReasoning}</p>
                        </div>
                        <div className="user-review-form">
                            <textarea
                                value={userEdits}
                                onChange={(e) => setUserEdits(e.target.value)}
                                placeholder="Make manual edits here if needed..."
                                rows={6}
                            />
                            <textarea
                                value={reviewNotes}
                                onChange={(e) => setReviewNotes(e.target.value)}
                                placeholder="Notes for next cycle..."
                            />
                            <div className="btn-group" style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => handleUserReview(true, true)} disabled={loading}>
                                    Approve & Next Cycle
                                </button>
                                <button onClick={() => handleUserReview(true, false)} disabled={loading} className="secondary">
                                    Approve & Stop
                                </button>
                                <button onClick={() => handleUserReview(false, false)} disabled={loading} className="danger">
                                    Reject
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {error && <div className="status-message error">{error}</div>}
        </div>
    );
};

export default ContentTab;
