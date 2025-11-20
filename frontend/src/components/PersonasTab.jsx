import React, { useState, useEffect } from 'react';
import { personaApi } from '../api';

const PersonasTab = () => {
    const [personas, setPersonas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Form State
    const [name, setName] = useState('');
    const [type, setType] = useState('target_market');
    const [personaDesc, setPersonaDesc] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('');

    useEffect(() => {
        loadPersonas();
    }, []);

    const loadPersonas = async () => {
        setLoading(true);
        try {
            const res = await personaApi.list();
            setPersonas(res.data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        setLoading(true);
        try {
            await personaApi.create({
                name,
                type,
                persona: personaDesc,
                systemPrompt
            });
            // Reset form
            setName('');
            setPersonaDesc('');
            setSystemPrompt('');
            loadPersonas();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure?')) return;
        setLoading(true);
        try {
            await personaApi.delete(id);
            loadPersonas();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="personas-tab">
            <div className="persona-launchpad">
                <div className="persona-form">
                    <h3>Create New Persona</h3>
                    <div className="input-group">
                        <label>Name</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="input-group">
                        <label>Type</label>
                        <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '10px' }}>
                            <option value="target_market">Target Market</option>
                            <option value="random">Random / Outlier</option>
                        </select>
                    </div>
                    <div className="input-group">
                        <label>Description</label>
                        <textarea
                            value={personaDesc}
                            onChange={(e) => setPersonaDesc(e.target.value)}
                            placeholder="Brief description..."
                        />
                    </div>
                    <div className="input-group">
                        <label>System Prompt</label>
                        <textarea
                            value={systemPrompt}
                            onChange={(e) => setSystemPrompt(e.target.value)}
                            placeholder="You are..."
                        />
                    </div>
                    <button onClick={handleCreate} disabled={loading || !name}>
                        Create Persona
                    </button>
                </div>

                <div className="persona-list">
                    <h3>Existing Personas</h3>
                    {personas.map(p => (
                        <div key={p.id} className="persona-card">
                            <div className="card-header">
                                <div className="persona-name">{p.name}</div>
                                <div className="persona-type">{p.type}</div>
                            </div>
                            <p>{p.persona}</p>
                            <button className="small-btn danger" onClick={() => handleDelete(p.id)}>Delete</button>
                        </div>
                    ))}
                </div>
            </div>
            {error && <div className="status-message error">{error}</div>}
        </div>
    );
};

export default PersonasTab;
