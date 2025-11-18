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

function openTab(evt, tabName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tab-link");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";
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

    detailedFeedbackContent.innerHTML = ratings.map(rating => {
        const ratingClass = rating.rating >= 7 ? '' : rating.rating >= 4 ? 'medium' : 'low';
        return `
            <div class="persona-card">
                <h3>
                    <span>${rating.participantId}</span>
                    <span class="rating-badge ${ratingClass}">${rating.rating}/10</span>
                </h3>
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

createBtn.addEventListener('click', async () => {
    const originalInput = originalInputEl.value;
    const contentType = contentTypeEl.value;
    const targetAudience = targetAudienceEl.value;

    if (!originalInput || !contentType || !targetAudience) {
        showStatus(statusMessage, 'Please fill in all fields to create content.', 'error');
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

        showStatus(statusMessage, 'Content created successfully!', 'success');
        setTimeout(() => hideStatus(statusMessage), 3000);

        updateUI(data);
    } catch (error) {
        showStatus(statusMessage, `Error: ${error.message}`, 'error');
        console.error('Error creating content:', error);
    } finally {
        setButtonLoading(createBtn, false);
    }
});

runFocusGroupBtn.addEventListener('click', async () => {
    setButtonLoading(runFocusGroupBtn, true);
    showStatus(actionStatus, 'Running focus group (this may take 30-60 seconds)...');

    try {
        const response = await fetch(`${API_URL}/${currentContentId}/run-focus-group`, { method: 'POST' });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to run focus group');
        }
        const data = await response.json();

        showStatus(actionStatus, 'Focus group completed! View feedback below.', 'success');
        setTimeout(() => hideStatus(actionStatus), 5000);

        // Show immediate feedback summary
        if (data.aggregatedFeedback && data.focusGroupRatings) {
            displayFocusGroupSummary(data);
        }

        updateUI(data);

        // Auto-switch to Feedback Timeline tab to show results
        const feedbackTab = document.querySelector('.tab-link[onclick*="feedback"]');
        if (feedbackTab) {
            feedbackTab.click();
        }
    } catch (error) {
        showStatus(actionStatus, `Error: ${error.message}`, 'error');
        console.error('Error running focus group:', error);
    } finally {
        setButtonLoading(runFocusGroupBtn, false);
    }
});

runEditorBtn.addEventListener('click', async () => {
    setButtonLoading(runEditorBtn, true);
    showStatus(actionStatus, 'Running AI editor (this may take 15-30 seconds)...');

    try {
        const response = await fetch(`${API_URL}/${currentContentId}/run-editor`, { method: 'POST' });
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

exportJsonBtn.addEventListener('click', () => exportContent('json'));
exportCsvBtn.addEventListener('click', () => exportContent('csv'));

async function exportContent(format) {
    try {
        const response = await fetch(`${API_URL}/${currentContentId}/export?format=${format}`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to export content');
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `content-${currentContentId}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (error) {
        alert(`Error: ${error.message}`);
        console.error('Error exporting content:', error);
    }
}


function updateUI(data) {
    runFocusGroupBtn.disabled = data.status !== 'created' && data.status !== 'awaiting_focus_group';
    runEditorBtn.disabled = data.status !== 'focus_group_complete';
    userReviewSection.style.display = data.status === 'editor_complete' ? 'block' : 'none';

    // Hide focus group summary when moving to next steps
    if (data.status !== 'focus_group_complete') {
        focusGroupSummary.style.display = 'none';
        detailedFeedbackPanel.style.display = 'none';
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
        if (typeof Diff !== 'undefined') {
            const diff = Diff.createPatch('content', data.originalInput, data.currentVersion);
            diffViewer.textContent = diff;
        } else {
            diffViewer.textContent = 'Diff library not loaded. Showing plain text comparison:\n\nOriginal:\n' + data.originalInput + '\n\nRevised:\n' + data.currentVersion;
        }
    }
    
    renderCharts(data);
    renderFeedbackTimeline(data);
    renderContentEvolution(data);
    renderDetails(data);
}

function renderCharts(data) {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library not loaded');
        return;
    }

    const ratingChartCtx = document.getElementById('rating-chart');
    if (!ratingChartCtx) return;

    // Destroy existing chart if it exists
    if (ratingChart) {
        ratingChart.destroy();
    }

    // Create new chart
    ratingChart = new Chart(ratingChartCtx.getContext('2d'), {
        type: 'line',
        data: {
            labels: data.statusHistory.map(h => h.timestamp),
            datasets: [{
                label: 'Average Rating',
                data: data.statusHistory.map(() => data.aggregatedFeedback ? data.aggregatedFeedback.averageRating : 0),
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
            }]
        },
    });

    const costTracker = document.getElementById('cost-tracker');
    const estimatedCost = data.metadata?.costEstimate || 0;
    if (estimatedCost > 0) {
        costTracker.textContent = `Estimated Cost: $${estimatedCost}`;
        costTracker.style.display = 'block';
    } else {
        costTracker.textContent = 'Cost tracking disabled (using free models)';
        costTracker.style.display = 'block';
    }
}

async function renderFeedbackTimeline(data) {
    const feedbackTimeline = document.getElementById('feedback-timeline');
    const history = await (await fetch(`${API_URL}/${data.id}/history`)).json();

    feedbackTimeline.innerHTML = history.map(cycle => {
        if (!cycle.focusGroupRatings || cycle.focusGroupRatings.length === 0) {
            return `
                <div class="cycle-feedback">
                    <h4>Cycle ${cycle.cycle}</h4>
                    <p><em>No focus group feedback yet</em></p>
                </div>
            `;
        }

        const aggregated = cycle.aggregatedFeedback ? `
            <div class="aggregated-summary">
                <h5>Summary</h5>
                <p><strong>Average Rating:</strong> ${cycle.aggregatedFeedback.averageRating.toFixed(2)}/10</p>
                <p><strong>Top Likes:</strong> ${cycle.aggregatedFeedback.topLikes.join(', ')}</p>
                <p><strong>Top Dislikes:</strong> ${cycle.aggregatedFeedback.topDislikes.join(', ')}</p>
            </div>
        ` : '';

        const individualFeedback = cycle.focusGroupRatings.map(rating => `
            <div class="persona-feedback">
                <h6>${rating.participantId} (${rating.participantType})</h6>
                <p><strong>Rating:</strong> ${rating.rating}/10</p>
                <p><strong>Likes:</strong> ${rating.likes.join(', ') || 'None'}</p>
                <p><strong>Dislikes:</strong> ${rating.dislikes.join(', ') || 'None'}</p>
                <p><strong>Suggestions:</strong> ${rating.suggestions}</p>
            </div>
        `).join('');

        return `
            <div class="cycle-feedback">
                <h4>Cycle ${cycle.cycle}</h4>
                ${aggregated}
                <h5>Individual Feedback</h5>
                ${individualFeedback}
            </div>
        `;
    }).join('');
}

async function renderContentEvolution(data) {
    const contentEvolution = document.getElementById('content-evolution');
    const history = await (await fetch(`${API_URL}/${data.id}/history`)).json();

    contentEvolution.innerHTML = history.map(cycle => `
        <div class="cycle-content">
            <h4>Cycle ${cycle.cycle}</h4>
            <pre>${cycle.currentVersion}</pre>
        </div>
    `).join('');
}

async function renderDetails(data) {
    const detailsContent = document.getElementById('details-content');
    const history = await (await fetch(`${API_URL}/${data.id}/history`)).json();
    detailsContent.innerHTML = `<pre>${JSON.stringify(history, null, 2)}</pre>`;
}
