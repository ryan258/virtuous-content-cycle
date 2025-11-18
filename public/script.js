const API_URL = 'http://localhost:3000/api/content';

let currentContentId = null;
let currentCycle = null;
let ratingChart = null;

const createBtn = document.getElementById('create-btn');
const runFocusGroupBtn = document.getElementById('run-focus-group-btn');
const runEditorBtn = document.getElementById('run-editor-btn');
const approveBtn = document.getElementById('approve-btn');
const approveStopBtn = document.getElementById('approve-stop-btn');
const discardBtn = document.getElementById('discard-btn');
const exportJsonBtn = document.getElementById('export-json-btn');
const exportCsvBtn = document.getElementById('export-csv-btn');

const originalInputEl = document.getElementById('original-input');
const contentTypeEl = document.getElementById('content-type');
const targetAudienceEl = document.getElementById('target-audience');
const targetMarketCountEl = document.getElementById('target-market-count');
const randomCountEl = document.getElementById('random-count');
const totalParticipantsEl = document.getElementById('total-participants');
const contentIdDisplay = document.getElementById('content-id-display');
const aiModeDisplay = document.getElementById('ai-mode-display');
const userReviewSection = document.getElementById('user-review-section');
const diffViewer = document.getElementById('diff-viewer');
const userEditsEl = document.getElementById('user-edits');
const userNotesEl = document.getElementById('user-notes');
const statusMessage = document.getElementById('status-message');
const actionStatus = document.getElementById('action-status');
const focusGroupSummary = document.getElementById('focus-group-summary');
const detailedFeedbackPanel = document.getElementById('detailed-feedback');
const detailedFeedbackContent = document.getElementById('detailed-feedback-content');
const cycleInfo = document.getElementById('cycle-info');
const contentPreview = document.getElementById('content-preview');
const selectAllFeedbackBtn = document.getElementById('select-all-feedback');
const deselectAllFeedbackBtn = document.getElementById('deselect-all-feedback');

// Status message helpers
function showStatus(element, message, type = 'loading') {
    element.className = `status-message ${type}`;
    element.innerHTML = type === 'loading' ? `<span class="spinner"></span>${message}` : message;
}

function hideStatus(element) {
    element.className = 'status-message';
    element.innerHTML = '';
}

function setButtonLoading(button, loading) {
    if (loading) {
        button.classList.add('loading');
        button.disabled = true;
    } else {
        button.classList.remove('loading');
    }
}

function updateCycleInfo(data) {
    const statusDisplay = {
        'created': 'Created - Ready for Focus Group',
        'awaiting_focus_group': 'Awaiting Focus Group',
        'focus_group_complete': 'Focus Group Complete - Ready for Editor',
        'editor_complete': 'Editor Complete - Ready for Review',
        'user_review_complete': 'Review Complete'
    };

    cycleInfo.innerHTML = `
        <h3>Cycle ${data.cycle} <span class="status-badge ${data.status}">${statusDisplay[data.status] || data.status}</span></h3>
        <p><strong>Content Type:</strong> ${data.metadata.contentType}</p>
        <p><strong>Target Audience:</strong> ${data.metadata.targetAudience}</p>
        <p><strong>Max Cycles:</strong> ${data.metadata.maxCycles}</p>
    `;
}

function updateContentPreview(data) {
    const version = data.editorPass ? 'Latest (After Editor)' : 'Original';
    const content = data.currentVersion;

    contentPreview.innerHTML = `
        <h3>Content Version: ${version}</h3>
        <pre>${content}</pre>
    `;
}

function displayFocusGroupSummary(data) {
    const agg = data.aggregatedFeedback;
    const count = data.focusGroupRatings.length;

    // Summary in actions panel
    focusGroupSummary.innerHTML = `
        <h4>📊 Focus Group Results (${count} participants)</h4>
        <div class="rating-display">Average Rating: ${agg.averageRating.toFixed(1)}/10</div>
        <div class="feedback-list">
            <strong>👍 Top Likes:</strong> ${agg.topLikes.join(', ') || 'None'}
        </div>
        <div class="feedback-list">
            <strong>👎 Top Dislikes:</strong> ${agg.topDislikes.join(', ') || 'None'}
        </div>
        <div class="feedback-list">
            <strong>💡 Key Themes:</strong> ${agg.feedbackThemes.slice(0, 3).map(t => t.theme).join(', ') || 'None'}
        </div>
    `;
    focusGroupSummary.style.display = 'block';

    // Detailed feedback in right panel
    displayDetailedFeedback(data);
}

function displayDetailedFeedback(data) {
    const ratings = data.focusGroupRatings;

    detailedFeedbackContent.innerHTML = ratings.map((rating, index) => {
        const ratingClass = rating.rating >= 7 ? '' : rating.rating >= 4 ? 'medium' : 'low';
        return `
            <div class="persona-card" data-participant-id="${rating.participantId}">
                <div class="card-header">
                    <input type="checkbox" class="feedback-checkbox" data-participant-id="${rating.participantId}" checked>
                    <h3>
                        <span>${rating.participantId}</span>
                        <span class="rating-badge ${ratingClass}">${rating.rating}/10</span>
                    </h3>
                </div>
                <p><em>${rating.participantType === 'target_market' ? '🎯 Target Market' : '🌐 Random Participant'}</em></p>
                <div class="feedback-section">
                    <strong>👍 Likes:</strong>
                    <p>${rating.likes.join(', ') || 'None mentioned'}</p>
                </div>
                <div class="feedback-section">
                    <strong>👎 Dislikes:</strong>
                    <p>${rating.dislikes.join(', ') || 'None mentioned'}</p>
                </div>
                <div class="feedback-section">
                    <strong>💡 Suggestions:</strong>
                    <p>${rating.suggestions}</p>
                </div>
            </div>
        `;
    }).join('');

    detailedFeedbackPanel.style.display = 'block';
}

// Select/Deselect all feedback checkboxes
selectAllFeedbackBtn.addEventListener('click', () => {
    document.querySelectorAll('.feedback-checkbox').forEach(cb => cb.checked = true);
});

deselectAllFeedbackBtn.addEventListener('click', () => {
    document.querySelectorAll('.feedback-checkbox').forEach(cb => cb.checked = false);
});

// Update total participant count when inputs change
targetMarketCountEl.addEventListener('input', updateParticipantTotal);
randomCountEl.addEventListener('input', updateParticipantTotal);

function updateParticipantTotal() {
    const targetMarket = parseInt(targetMarketCountEl.value) || 0;
    const random = parseInt(randomCountEl.value) || 0;
    totalParticipantsEl.textContent = targetMarket + random;
}

createBtn.addEventListener('click', async () => {
    const originalInput = originalInputEl.value;
    const contentType = contentTypeEl.value;
    const targetAudience = targetAudienceEl.value;
    const targetMarketCount = parseInt(targetMarketCountEl.value) || 3;
    const randomCount = parseInt(randomCountEl.value) || 2;

    if (!originalInput || !contentType || !targetAudience) {
        showStatus(statusMessage, 'Please fill in all fields to create content.', 'error');
        setTimeout(() => hideStatus(statusMessage), 3000);
        return;
    }

    if (targetMarketCount + randomCount === 0) {
        showStatus(statusMessage, 'Focus group must have at least 1 participant.', 'error');
        setTimeout(() => hideStatus(statusMessage), 3000);
        return;
    }

    setButtonLoading(createBtn, true);
    showStatus(statusMessage, 'Creating content...');

    try {
        const response = await fetch(`${API_URL}/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                originalInput,
                metadata: {
                    contentType,
                    targetAudience,
                    maxCycles: 5,
                    convergenceThreshold: 0.8,
                    focusGroupConfig: {
                        targetMarketCount,
                        randomCount,
                    }
                }
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to create content');
        }

        const data = await response.json();
        currentContentId = data.id;
        currentCycle = data.cycle;
        contentIdDisplay.textContent = `Content ID: ${currentContentId}`;

        showStatus(statusMessage, 'Content created! Starting focus group...', 'success');

        updateUI(data);

        // Automatically run focus group
        runFocusGroupAutomatically();
    } catch (error) {
        const errorMsg = error.message || 'Failed to fetch - is the server running?';
        showStatus(statusMessage, `Error: ${errorMsg}`, 'error');
        console.error('Error creating content:', error);
        alert(`Failed to create content:\n${errorMsg}\n\nMake sure the server is running with: npm run dev`);
    } finally {
        setButtonLoading(createBtn, false);
    }
});

async function runFocusGroupAutomatically() {
    setButtonLoading(runFocusGroupBtn, true);
    showStatus(actionStatus, 'Running focus group (this may take 30-60 seconds)...');

    try {
        const response = await fetch(`${API_URL}/${currentContentId}/run-focus-group`, { method: 'POST' });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to run focus group');
        }
        const data = await response.json();

        showStatus(actionStatus, 'Focus group completed! Review feedback and run editor.', 'success');
        hideStatus(statusMessage);

        // Show immediate feedback summary
        if (data.aggregatedFeedback && data.focusGroupRatings) {
            displayFocusGroupSummary(data);
        }

        updateUI(data);
    } catch (error) {
        const errorMsg = error.message || 'Failed to fetch';
        showStatus(actionStatus, `Error: ${errorMsg}`, 'error');
        console.error('Error running focus group:', error);
        console.error('Full error details:', { error, contentId: currentContentId });
        hideStatus(statusMessage);
    } finally {
        setButtonLoading(runFocusGroupBtn, false);
    }
}

runFocusGroupBtn.addEventListener('click', async () => {
    runFocusGroupAutomatically();
});

runEditorBtn.addEventListener('click', async () => {
    // Get selected feedback
    const selectedCheckboxes = document.querySelectorAll('.feedback-checkbox:checked');
    const selectedParticipantIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.participantId);

    if (selectedParticipantIds.length === 0) {
        showStatus(actionStatus, 'Please select at least one feedback to incorporate.', 'error');
        setTimeout(() => hideStatus(actionStatus), 3000);
        return;
    }

    setButtonLoading(runEditorBtn, true);
    showStatus(actionStatus, `Running AI editor with ${selectedParticipantIds.length} selected feedback items...`);

    try {
        const response = await fetch(`${API_URL}/${currentContentId}/run-editor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                selectedParticipantIds
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to run editor');
        }
        const data = await response.json();

        showStatus(actionStatus, 'Editor completed! Review changes below.', 'success');
        setTimeout(() => hideStatus(actionStatus), 5000);

        updateUI(data);
    } catch (error) {
        showStatus(actionStatus, `Error: ${error.message}`, 'error');
        console.error('Error running editor:', error);
    } finally {
        setButtonLoading(runEditorBtn, false);
    }
});

approveBtn.addEventListener('click', () => handleUserReview(true, true));
approveStopBtn.addEventListener('click', () => handleUserReview(true, false));
discardBtn.addEventListener('click', () => handleUserReview(false, false));

async function handleUserReview(approved, continueToNextCycle) {
    const userEdits = userEditsEl.value;
    const notes = userNotesEl.value;

    // Disable all review buttons
    approveBtn.disabled = true;
    approveStopBtn.disabled = true;
    discardBtn.disabled = true;

    const action = continueToNextCycle ? 'and starting next cycle' : 'final';
    showStatus(actionStatus, `Submitting review (${action})...`);

    try {
        const response = await fetch(`${API_URL}/${currentContentId}/user-review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                approved,
                userEdits: userEdits || null,
                continueToNextCycle,
                notes,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to submit user review');
        }

        const data = await response.json();
        currentCycle = data.cycle;

        const message = continueToNextCycle
            ? `Review submitted! Moving to Cycle ${data.cycle}`
            : 'Review submitted! Cycle complete.';
        showStatus(actionStatus, message, 'success');
        setTimeout(() => hideStatus(actionStatus), 5000);

        updateUI(data);
    } catch (error) {
        showStatus(actionStatus, `Error: ${error.message}`, 'error');
        console.error('Error submitting user review:', error);
    } finally {
        // Re-enable buttons
        approveBtn.disabled = false;
        approveStopBtn.disabled = false;
        discardBtn.disabled = false;
    }
}

exportJsonBtn.addEventListener('click', async () => {
    try {
        const response = await fetch(`${API_URL}/${currentContentId}/export?format=json`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to export content');
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `content-${currentContentId}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (error) {
        alert(`Error: ${error.message}`);
        console.error('Error exporting content:', error);
    }
});


function updateUI(data) {
    // Only show re-run focus group button if we're in awaiting_focus_group state
    runFocusGroupBtn.style.display = data.status === 'awaiting_focus_group' ? 'block' : 'none';
    runFocusGroupBtn.disabled = data.status !== 'awaiting_focus_group';

    runEditorBtn.disabled = data.status !== 'focus_group_complete';
    userReviewSection.style.display = data.status === 'editor_complete' ? 'block' : 'none';

    // Hide focus group summary when moving to next steps
    if (data.status !== 'focus_group_complete') {
        focusGroupSummary.style.display = 'none';
        detailedFeedbackPanel.style.display = 'none';
    }

    // Update cycle info and content preview
    updateCycleInfo(data);
    updateContentPreview(data);

    // Enable export if we have content
    exportJsonBtn.disabled = !currentContentId;

    if (data.aiMeta?.mode) {
        const mode = data.aiMeta.mode;
        const readable = mode === 'mock' ? 'Mock (no API)' : mode === 'live-fallback' ? 'Live (API error → mock fallback)' : 'Live';
        const focusModel = data.aiMeta.focusModel ? ` | Focus: ${data.aiMeta.focusModel}` : '';
        const editorModel = data.aiMeta.editorModel ? ` | Editor: ${data.aiMeta.editorModel}` : '';
        aiModeDisplay.textContent = `AI mode: ${readable}${focusModel}${editorModel}`;
        aiModeDisplay.title = data.aiMeta.lastError || '';
    } else {
        aiModeDisplay.textContent = '';
        aiModeDisplay.title = '';
    }

    if (data.status === 'editor_complete') {
        if (typeof Diff !== 'undefined') {
            const diff = Diff.createPatch('content', data.originalInput, data.currentVersion);
            diffViewer.textContent = diff;
        } else {
            diffViewer.textContent = 'Diff library not loaded. Showing plain text comparison:\n\nOriginal:\n' + data.originalInput + '\n\nRevised:\n' + data.currentVersion;
        }
    }
}

// Removed old dashboard rendering functions - no longer needed
