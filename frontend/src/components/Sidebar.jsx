import React from 'react';

const Sidebar = ({ history, activeId, onSelect }) => {
    return (
        <div className="history-sidebar">
            <h3>History</h3>
            <div className="history-list">
                {history.map((item) => (
                    <div
                        key={item.id}
                        className={`history-item ${item.id === activeId ? 'active' : ''}`}
                        onClick={() => onSelect(item.id)}
                    >
                        <div className="history-item-title" title={item.originalInput}>
                            {item.originalInput}
                        </div>
                        <div className="history-item-meta">
                            <span>Cycle {item.latestCycle}</span>
                            <span>{new Date(item.updatedAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Sidebar;
