const API_URL = '/api/content';

let currentContentId = null;
let currentCycle = null;
let ratingChart = null;
let availablePersonas = [];
let editingPersonaId = null;

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
const personaChecklist = document.getElementById('persona-checklist');
const selectedPersonaCountEl = document.getElementById('selected-persona-count');
const refreshPersonasBtn = document.getElementById('refresh-personas-btn');
const contentIdDisplay = document.getElementById('content-id-display');
const aiModeDisplay = document.getElementById('ai-mode-display');
const userReviewSection = document.getElementById('user-review-section');
const diffViewer = document.getElementById('diff-viewer');
const userEditsEl = document.getElementById('user-edits');
const userNotesEl = document.getElementById('user-notes');
const statusMessage = document.getElementById('status-message');
const actionStatus = document.getElementById('action-status');
const focusGroupSummary = document.getElementById('focus-group-summary');
const moderatorSummary = document.getElementById('moderator-summary');
const detailedFeedbackPanel = document.getElementById('detailed-feedback');
const detailedFeedbackContent = document.getElementById('detailed-feedback-content');
const cycleInfo = document.getElementById('cycle-info');
const contentPreview = document.getElementById('content-preview');
const selectAllFeedbackBtn = document.getElementById('select-all-feedback');
const deselectAllFeedbackBtn = document.getElementById('deselect-all-feedback');
const contentTabBtn = document.getElementById('content-tab-btn');
const personasTabBtn = document.getElementById('personas-tab-btn');
const contentTab = document.getElementById('content-tab');
const personasTab = document.getElementById('personas-tab');
const editorInstructionsEl = document.getElementById('editor-instructions');

// Persona launchpad elements
const personaFormStatus = document.getElementById('persona-form-status');
const personaListStatus = document.getElementById('persona-list-status');
const personaList = document.getElementById('persona-list');
const personaIdEl = document.getElementById('persona-id');
const personaNameEl = document.getElementById('persona-name');
const personaTypeEl = document.getElementById('persona-type');
const personaShortEl = document.getElementById('persona-short');
const personaSystemEl = document.getElementById('persona-system');
const savePersonaBtn = document.getElementById('save-persona-btn');
const resetPersonaBtn = document.getElementById('reset-persona-btn');

// Helper function to safely escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Status message helpers
function showStatus(element, message, type = 'loading') {
    element.className = `status-message ${type}`;
    if (type === 'loading') {
        const spinner = document.createElement('span');
        spinner.className = 'spinner';
        element.innerHTML = '';
        element.appendChild(spinner);
        element.appendChild(document.createTextNode(message));
    } else {
        element.textContent = message;
    }
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

function setActiveTab(tab) {
    if (tab === 'personas') {
        personasTab.style.display = 'block';
        contentTab.style.display = 'none';
        personasTabBtn.classList.add('active');
        contentTabBtn.classList.remove('active');
    } else {
        personasTab.style.display = 'none';
        contentTab.style.display = 'block';
        contentTabBtn.classList.add('active');
        personasTabBtn.classList.remove('active');
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

    // Use escapeHtml for user-provided data
    cycleInfo.innerHTML = `
        <h3>Cycle ${data.cycle} <span class="status-badge ${data.status}">${statusDisplay[data.status] || escapeHtml(data.status)}</span></h3>
        <p><strong>Content Type:</strong> ${escapeHtml(data.metadata.contentType)}</p>
        <p><strong>Target Audience:</strong> ${escapeHtml(data.metadata.targetAudience)}</p>
        <p><strong>Max Cycles:</strong> ${data.metadata.maxCycles}</p>
    `;
}

function updateContentPreview(data) {
    const version = data.editorPass ? 'Latest (After Editor)' : 'Original';
    const content = data.currentVersion;

    // Safely build the preview without innerHTML
    contentPreview.innerHTML = '';
    const h3 = document.createElement('h3');
    h3.textContent = `Content Version: ${version}`;
    const pre = document.createElement('pre');
    pre.textContent = content;
    contentPreview.appendChild(h3);
    contentPreview.appendChild(pre);
}

function displayFocusGroupSummary(data) {
    const agg = data.aggregatedFeedback;
    const count = data.focusGroupRatings.length;

    // Safely escape all AI-generated content
    const topLikesText = agg.topLikes.map(escapeHtml).join(', ') || 'None';
    const topDislikesText = agg.topDislikes.map(escapeHtml).join(', ') || 'None';
    const keyThemesText = agg.feedbackThemes.slice(0, 3).map(t => escapeHtml(t.theme)).join(', ') || 'None';
    const convergenceText = typeof agg.convergenceScore === 'number' ? agg.convergenceScore.toFixed(2) : 'N/A';

    // Summary in actions panel
    focusGroupSummary.innerHTML = `
        <h4>📊 Focus Group Results (${count} participants)</h4>
        <div class="rating-display">Average Rating: ${agg.averageRating.toFixed(1)}/10</div>
        <div class="feedback-list">
            <strong>🔄 Convergence:</strong> ${convergenceText}
        </div>
        <div class="feedback-list">
            <strong>👍 Top Likes:</strong> ${topLikesText}
        </div>
        <div class="feedback-list">
            <strong>👎 Top Dislikes:</strong> ${topDislikesText}
        </div>
        <div class="feedback-list">
            <strong>💡 Key Themes:</strong> ${keyThemesText}
        </div>
    `;
    focusGroupSummary.style.display = 'block';

    // Detailed feedback in right panel
    displayDetailedFeedback(data);
}

function displayDetailedFeedback(data) {
    const ratings = data.focusGroupRatings;

    // Safely escape all AI-generated content
    detailedFeedbackContent.innerHTML = ratings.map((rating, index) => {
        const ratingClass = rating.rating >= 7 ? '' : rating.rating >= 4 ? 'medium' : 'low';
        const likesText = rating.likes.map(escapeHtml).join(', ') || 'None mentioned';
        const dislikesText = rating.dislikes.map(escapeHtml).join(', ') || 'None mentioned';
        return `
            <div class="persona-card" data-participant-id="${escapeHtml(rating.participantId)}">
                <div class="card-header">
                    <input type="checkbox" class="feedback-checkbox" data-participant-id="${escapeHtml(rating.participantId)}" checked>
                    <h3>
                        <span>${escapeHtml(rating.participantId)}</span>
                        <span class="rating-badge ${ratingClass}">${rating.rating}/10</span>
                    </h3>
                </div>
                <p><em>${rating.participantType === 'target_market' ? '🎯 Target Market' : '🌐 Random Participant'}</em></p>
                <div class="feedback-section">
                    <strong>👍 Likes:</strong>
                    <p>${likesText}</p>
                </div>
                <div class="feedback-section">
                    <strong>👎 Dislikes:</strong>
                    <p>${dislikesText}</p>
                </div>
                <div class="feedback-section">
                    <strong>💡 Suggestions:</strong>
                    <p>${escapeHtml(rating.suggestions)}</p>
                </div>
            </div>
        `;
    }).join('');

    detailedFeedbackPanel.style.display = 'block';
}

function renderPersonaChecklist() {
    if (!availablePersonas || availablePersonas.length === 0) {
        personaChecklist.innerHTML = '<p class="muted">No personas yet. Add some in the Personas tab.</p>';
        selectedPersonaCountEl.textContent = '0 selected';
        return;
    }

    personaChecklist.innerHTML = availablePersonas.map(p => {
        return `
            <label class="persona-option">
                <input type="checkbox" class="persona-checkbox" data-persona-id="${escapeHtml(p.id)}" checked>
                <span class="persona-name">${escapeHtml(p.name || p.persona || p.id)}</span>
                <span class="persona-type muted">${p.type === 'target_market' ? '🎯 Target' : '🌐 Random'}</span>
            </label>
        `;
    }).join('');

    personaChecklist.querySelectorAll('.persona-checkbox').forEach(cb => {
        cb.addEventListener('change', updateSelectedPersonaCount);
    });

    updateSelectedPersonaCount();
}

function updateSelectedPersonaCount() {
    const selected = getSelectedPersonaIds().length;
    selectedPersonaCountEl.textContent = `${selected} selected`;
}

function getSelectedPersonaIds() {
    const checkboxes = personaChecklist.querySelectorAll('.persona-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.dataset.personaId).filter(Boolean);
}

async function loadPersonas() {
    showStatus(personaListStatus, 'Loading personas...');
    try {
        const response = await fetch('/api/personas');
        if (!response.ok) throw new Error('Failed to load personas');
        availablePersonas = await response.json();
        renderPersonaChecklist();
        renderPersonaList();
        hideStatus(personaListStatus);
    } catch (error) {
        console.error('Error loading personas:', error);
        showStatus(personaListStatus, `Error: ${error.message}`, 'error');
    }
}

function renderPersonaList() {
    if (!availablePersonas || availablePersonas.length === 0) {
        personaList.innerHTML = '<p class="muted">No personas found.</p>';
        return;
    }

    personaList.innerHTML = availablePersonas.map(p => {
        return `
            <div class="persona-card" data-id="${escapeHtml(p.id)}">
                <div class="card-header">
                    <h4>${escapeHtml(p.name || p.persona)}</h4>
                    <span class="persona-type muted">${p.type === 'target_market' ? '🎯 Target' : '🌐 Random'}</span>
                </div>
                <p class="muted">${escapeHtml(p.persona)}</p>
                <div class="card-actions">
                    <button class="small-btn edit-persona" data-id="${escapeHtml(p.id)}">Edit</button>
                    <button class="small-btn danger delete-persona" data-id="${escapeHtml(p.id)}">Delete</button>
                </div>
            </div>
        `;
    }).join('');

    personaList.querySelectorAll('.edit-persona').forEach(btn => {
        btn.addEventListener('click', () => startEditPersona(btn.dataset.id));
    });
    personaList.querySelectorAll('.delete-persona').forEach(btn => {
        btn.addEventListener('click', () => handleDeletePersona(btn.dataset.id));
    });
}

function resetPersonaForm() {
    editingPersonaId = null;
    personaIdEl.value = '';
    personaNameEl.value = '';
    personaTypeEl.value = '';
    personaShortEl.value = '';
    personaSystemEl.value = '';
    hideStatus(personaFormStatus);
}

function startEditPersona(id) {
    const persona = availablePersonas.find(p => p.id === id);
    if (!persona) return;
    editingPersonaId = id;
    personaIdEl.value = persona.id;
    personaNameEl.value = persona.name || persona.persona || persona.id;
    personaTypeEl.value = persona.type;
    personaShortEl.value = persona.persona || '';
    personaSystemEl.value = persona.systemPrompt || '';
    showStatus(personaFormStatus, `Editing ${personaNameEl.value}`, 'success');
}

async function savePersona() {
    const name = personaNameEl.value.trim();
    const type = personaTypeEl.value;
    const personaShort = personaShortEl.value.trim();
    const systemPrompt = personaSystemEl.value.trim();

    if (!name || !type || !personaShort || !systemPrompt) {
        showStatus(personaFormStatus, 'All fields are required.', 'error');
        return;
    }

    const payload = {
        id: personaIdEl.value || undefined,
        name,
        type,
        persona: personaShort,
        systemPrompt,
    };

    const method = editingPersonaId ? 'PUT' : 'POST';
    const url = editingPersonaId ? `/api/personas/${encodeURIComponent(editingPersonaId)}` : '/api/personas';

    setButtonLoading(savePersonaBtn, true);
    showStatus(personaFormStatus, editingPersonaId ? 'Updating persona...' : 'Creating persona...');

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to save persona');
        }
        showStatus(personaFormStatus, 'Saved!', 'success');
        resetPersonaForm();
        await loadPersonas();
    } catch (error) {
        console.error('Error saving persona:', error);
        showStatus(personaFormStatus, `Error: ${error.message}`, 'error');
    } finally {
        setButtonLoading(savePersonaBtn, false);
    }
}

async function handleDeletePersona(id) {
    if (!id) return;
    if (!confirm('Are you sure you want to delete this persona?')) return;
    setButtonLoading(savePersonaBtn, true);
    showStatus(personaFormStatus, 'Deleting persona...');
    try {
        const response = await fetch(`/api/personas/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to delete persona');
        }
        if (editingPersonaId === id) resetPersonaForm();
        await loadPersonas();
        showStatus(personaFormStatus, 'Deleted.', 'success');
    } catch (error) {
        console.error('Error deleting persona:', error);
        showStatus(personaFormStatus, `Error: ${error.message}`, 'error');
    } finally {
        setButtonLoading(savePersonaBtn, false);
    }
}

// Select/Deselect all feedback checkboxes
selectAllFeedbackBtn.addEventListener('click', () => {
    document.querySelectorAll('.feedback-checkbox').forEach(cb => cb.checked = true);
});

deselectAllFeedbackBtn.addEventListener('click', () => {
    document.querySelectorAll('.feedback-checkbox').forEach(cb => cb.checked = false);
});

contentTabBtn.addEventListener('click', () => setActiveTab('content'));
personasTabBtn.addEventListener('click', () => setActiveTab('personas'));
refreshPersonasBtn.addEventListener('click', loadPersonas);
savePersonaBtn.addEventListener('click', (e) => {
    e.preventDefault();
    savePersona();
});
resetPersonaBtn.addEventListener('click', (e) => {
    e.preventDefault();
    resetPersonaForm();
});

createBtn.addEventListener('click', async () => {
    const originalInput = originalInputEl.value;
    const contentType = contentTypeEl.value;
    const targetAudience = targetAudienceEl.value;
    const selectedPersonaIds = getSelectedPersonaIds();

    if (!originalInput || !contentType || !targetAudience) {
        showStatus(statusMessage, 'Please fill in all fields to create content.', 'error');
        setTimeout(() => hideStatus(statusMessage), 3000);
        return;
    }

    if (selectedPersonaIds.length === 0) {
        showStatus(statusMessage, 'Select at least one persona.', 'error');
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
                        targetMarketCount: selectedPersonaIds.length,
                        randomCount: 0,
                    },
                    personaIds: selectedPersonaIds
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
    const selectedPersonaIds = getSelectedPersonaIds();
    if (selectedPersonaIds.length === 0) {
        showStatus(actionStatus, 'Select at least one persona before running the focus group.', 'error');
        setTimeout(() => hideStatus(actionStatus), 3000);
        return;
    }

    setButtonLoading(runFocusGroupBtn, true);
    showStatus(actionStatus, 'Running focus group (this may take 30-60 seconds)...');

    try {
        const response = await fetch(`${API_URL}/${currentContentId}/run-focus-group`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personaIds: selectedPersonaIds })
        });
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
                selectedParticipantIds,
                editorInstructions: editorInstructionsEl.value
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
        moderatorSummary.style.display = 'none';
        detailedFeedbackPanel.style.display = 'none';
    }

    // Update cycle info and content preview
    updateCycleInfo(data);
    updateContentPreview(data);

    // Enable export if we have content
    exportJsonBtn.disabled = !currentContentId;

    if (data.metadata?.totalCost !== undefined && typeof data.metadata.totalCost === 'number') {
        // Display running cost in cycle info footer if available
        const costEl = document.createElement('p');
        costEl.className = 'muted';
        costEl.textContent = `Total cost so far: $${(data.metadata.totalCost || 0).toFixed(4)}`;
        cycleInfo.appendChild(costEl);
    }

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
        renderModeratorSummary(data);
        if (typeof Diff !== 'undefined') {
            const diff = Diff.createPatch('content', data.originalInput, data.currentVersion);
            diffViewer.textContent = diff;
        } else {
            diffViewer.textContent = 'Diff library not loaded. Showing plain text comparison:\n\nOriginal:\n' + data.originalInput + '\n\nRevised:\n' + data.currentVersion;
        }
    }
}

function renderModeratorSummary(data) {
    const moderator = data.editorPass?.moderator;
    if (!moderator) {
        moderatorSummary.style.display = 'none';
        return;
    }
    const keyPointsHtml = (moderator.keyPoints || [])
        .map(pt => `<li>${escapeHtml(pt)}</li>`)
        .join('');
    moderatorSummary.innerHTML = `
        <h4>🧠 Moderator's Summary</h4>
        <p>${escapeHtml(moderator.summary || '')}</p>
        <div class="feedback-list"><strong>Key Points:</strong><ul>${keyPointsHtml || '<li>None provided</li>'}</ul></div>
    `;
    moderatorSummary.style.display = 'block';
}

// Initialize
window.addEventListener('DOMContentLoaded', async () => {
    setActiveTab('content');
    await loadPersonas();
});

// Removed old dashboard rendering functions - no longer needed
