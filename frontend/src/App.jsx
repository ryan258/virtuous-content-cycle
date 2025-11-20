import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ContentTab from './components/ContentTab';
import PersonasTab from './components/PersonasTab';
import OrchestratorTab from './components/OrchestratorTab';
import { contentApi } from './api';

function App() {
  const [activeTab, setActiveTab] = useState('content');
  const [activeContentId, setActiveContentId] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await contentApi.list();
      // Sort by updated at desc
      const sorted = res.data.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      setHistory(sorted);
    } catch (err) {
      console.error("Failed to load history", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleContentCreated = () => {
    loadHistory();
    setActiveTab('content');
  };

  const handleSelectContent = (id) => {
    setActiveContentId(id);
    // If on personas tab, maybe stay there? Or switch to content?
    // Let's stay on current tab unless it's irrelevant.
    // Actually, if user clicks history, they likely want to see content.
    if (activeTab === 'personas') {
      setActiveTab('content');
    }
  };

  return (
    <div className="container">
      <header style={{ marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
        <h1>Virtuous Content Cycle</h1>
      </header>

      <div className="main-content">
        <Sidebar
          history={history}
          activeId={activeContentId}
          onSelect={handleSelectContent}
        />

        <div className="left-column">
          <div className="tabs">
            <button
              className={`tab-link ${activeTab === 'content' ? 'active' : ''}`}
              onClick={() => setActiveTab('content')}
            >
              Content
            </button>
            <button
              className={`tab-link ${activeTab === 'orchestrator' ? 'active' : ''}`}
              onClick={() => setActiveTab('orchestrator')}
            >
              Orchestrator
            </button>
            <button
              className={`tab-link ${activeTab === 'personas' ? 'active' : ''}`}
              onClick={() => setActiveTab('personas')}
            >
              Personas
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'content' && (
              <ContentTab
                activeContentId={activeContentId}
                onContentCreated={handleContentCreated}
              />
            )}
            {activeTab === 'orchestrator' && (
              <OrchestratorTab activeContentId={activeContentId} />
            )}
            {activeTab === 'personas' && (
              <PersonasTab />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
