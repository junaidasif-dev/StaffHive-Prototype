// ============================================================
// STAFFHIVE RESUME MATCH PROTOTYPE - APPLICATION LOGIC
// ============================================================
// All data flows through n8n webhooks. No direct DB connection.
// ============================================================

// ---- Configuration ----
// We now use Vercel rewrites to bypass CORS.
// The browser calls /api/* on Vercel, and Vercel securely forwards it to n8n backend.
const API = {
    // Write endpoints (POST)
    candidateUpload: `/api/upload/candidate-upload`,
    jobUpload:       `/api/upload/job-upload`,
    resumeMatch:     `/api/upload/resume-match`,

    // Read endpoints (GET)
    listCandidates:    `/api/read/list-candidates`,
    listJobs:          `/api/read/list-jobs`,
    getReport:         `/api/read/get-report`,
    candidateReports:  `/api/read/candidate-reports`,
};


// ---- State ----
let candidates = [];
let jobs = [];
let currentMatchCandidateId = null;
let currentMatchCandidateName = '';
let currentReport = null;
let loadingTimerInterval = null;


// ---- Initialize ----
document.addEventListener('DOMContentLoaded', () => {
    loadCandidates();
    loadJobs();
});


// ============================================================
// DATA LOADING
// ============================================================

async function loadCandidates() {
    try {
        const res = await fetch(API.listCandidates);
        if (!res.ok) throw new Error('Failed to load candidates');
        candidates = await res.json();
        renderCandidateTable();
    } catch (err) {
        console.warn('Could not load candidates from n8n:', err.message);
        // Show empty state gracefully
        candidates = [];
        renderCandidateTable();
    }
}

async function loadJobs() {
    try {
        const res = await fetch(API.listJobs);
        if (!res.ok) throw new Error('Failed to load jobs');
        jobs = await res.json();
        renderJobTable();
    } catch (err) {
        console.warn('Could not load jobs from n8n:', err.message);
        jobs = [];
        renderJobTable();
    }
}


// ============================================================
// RENDERING
// ============================================================

function renderCandidateTable() {
    const tbody = document.getElementById('candidateTableBody');
    const empty = document.getElementById('candidateEmptyState');
    const table = document.getElementById('candidateTable');

    if (candidates.length === 0) {
        table.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    table.style.display = '';
    empty.style.display = 'none';

    tbody.innerHTML = candidates.map(c => `
        <tr>
            <td style="font-weight: 600;">${escapeHtml(c.full_name)}</td>
            <td style="color: var(--text-secondary);">${escapeHtml(c.email || '—')}</td>
            <td style="color: var(--text-secondary);">
                📄 ${escapeHtml(c.resume_file_name || '—')}
            </td>
            <td>${renderParseStatusBadge(c.parse_status)}</td>
            <td>
                <button class="btn btn--primary btn--sm" 
                    ${c.parse_status !== 'ready' ? 'disabled' : ''}
                    onclick="openResumeMatch('${c.id}', '${escapeHtml(c.full_name)}', '${escapeHtml(c.resume_file_name || '')}')">
                    Resume Match
                </button>
            </td>
        </tr>
    `).join('');
}

function renderJobTable() {
    const tbody = document.getElementById('jobTableBody');
    const empty = document.getElementById('jobEmptyState');
    const table = document.getElementById('jobTable');

    if (jobs.length === 0) {
        table.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    table.style.display = '';
    empty.style.display = 'none';

    tbody.innerHTML = jobs.map(j => `
        <tr>
            <td style="font-weight: 600;">${escapeHtml(j.title)}</td>
            <td style="color: var(--text-secondary);">${escapeHtml(j.company || '—')}</td>
            <td>${renderJobTypeBadge(j.job_type)}</td>
            <td>${renderJobStatusBadge(j.status)}</td>
            <td style="color: var(--text-muted); font-size: 0.85rem;">${formatDate(j.created_at)}</td>
        </tr>
    `).join('');
}

function renderParseStatusBadge(status) {
    const map = {
        ready:   '<span class="badge badge--ready">✅ Ready</span>',
        pending: '<span class="badge badge--pending">⏳ Pending</span>',
        parsing: '<span class="badge badge--parsing"><span class="spinner" style="width:12px;height:12px;border-width:2px;"></span> Parsing</span>',
        failed:  '<span class="badge badge--failed">❌ Failed</span>',
    };
    return map[status] || `<span class="badge">${status}</span>`;
}

function renderJobTypeBadge(type) {
    if (type === 'open_order') return '<span class="badge badge--pending">Open Order</span>';
    if (type === 'active_job') return '<span class="badge badge--ready">Active Job</span>';
    return `<span class="badge">${type}</span>`;
}

function renderJobStatusBadge(status) {
    const map = {
        open:   '<span class="badge badge--open">Open</span>',
        filled: '<span class="badge badge--filled">Filled</span>',
        closed: '<span class="badge badge--closed">Closed</span>',
    };
    return map[status] || `<span class="badge">${status}</span>`;
}


// ============================================================
// TAB SWITCHING
// ============================================================

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('tab--active');

    // Show/hide content
    document.getElementById('candidatesTab').style.display = tabName === 'candidates' ? '' : 'none';
    document.getElementById('jobsTab').style.display = tabName === 'jobs' ? '' : 'none';
}


// ============================================================
// MODAL MANAGEMENT
// ============================================================

function openModal(id) {
    document.getElementById(id).classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    document.body.style.overflow = '';

    // Stop loading timer if closing loading modal
    if (id === 'loadingModal' && loadingTimerInterval) {
        clearInterval(loadingTimerInterval);
        loadingTimerInterval = null;
    }
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
        document.body.style.overflow = '';
    }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => {
            m.classList.remove('active');
        });
        document.body.style.overflow = '';
    }
});


// ============================================================
// ADD CANDIDATE
// ============================================================

async function handleAddCandidate(e) {
    e.preventDefault();
    const btn = document.getElementById('addCandidateBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Uploading...';

    const formData = new FormData();
    formData.append('full_name', document.getElementById('candidateName').value.trim());
    formData.append('email', document.getElementById('candidateEmail').value.trim());
    formData.append('phone', document.getElementById('candidatePhone').value.trim());
    formData.append('resume_file', document.getElementById('candidateResume').files[0]);

    try {
        const res = await fetch(API.candidateUpload, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Upload failed');
        }

        const data = await res.json();
        showToast('Candidate added & resume parsed successfully!', 'success');
        closeModal('addCandidateModal');
        document.getElementById('addCandidateForm').reset();
        await loadCandidates();

    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Upload & Parse Resume';
    }
}


// ============================================================
// ADD JOB
// ============================================================

async function handleAddJob(e) {
    e.preventDefault();
    const btn = document.getElementById('addJobBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating...';

    const payload = {
        title: document.getElementById('jobTitle').value.trim(),
        company: document.getElementById('jobCompany').value.trim(),
        job_type: document.getElementById('jobType').value,
        description_text: document.getElementById('jobDescription').value.trim(),
    };

    try {
        const res = await fetch(API.jobUpload, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error('Failed to create job');

        showToast('Job created successfully!', 'success');
        closeModal('addJobModal');
        document.getElementById('addJobForm').reset();
        await loadJobs();

    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Create Job';
    }
}


// ============================================================
// RESUME MATCH
// ============================================================

function openResumeMatch(candidateId, candidateName, resumeFileName) {
    currentMatchCandidateId = candidateId;
    currentMatchCandidateName = candidateName;

    document.getElementById('resumeMatchTitle').textContent = `Resume Match Analysis — ${candidateName}`;
    document.getElementById('matchResumeFileName').textContent = resumeFileName || 'Resume Document';

    // Reset job selector
    document.getElementById('matchJobType').value = 'open_order';
    loadJobsForMatch();

    openModal('resumeMatchModal');
}

function loadJobsForMatch() {
    const type = document.getElementById('matchJobType').value;
    const select = document.getElementById('matchJobSelect');

    const filtered = jobs.filter(j => j.job_type === type && j.status === 'open');
    select.innerHTML = '<option value="">— Select a Job —</option>' +
        filtered.map(j => `<option value="${j.id}">${escapeHtml(j.title)}${j.company ? ' — ' + escapeHtml(j.company) : ''}</option>`).join('');
}

async function handleGenerateMatch() {
    const jobId = document.getElementById('matchJobSelect').value;
    if (!jobId) {
        showToast('Please select a job to compare against.', 'error');
        return;
    }

    // Close resume match modal, show loading
    closeModal('resumeMatchModal');
    openModal('loadingModal');

    // Start elapsed time counter
    const startTime = performance.now();
    loadingTimerInterval = setInterval(() => {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        document.getElementById('loadingTimer').textContent = `Elapsed: ${elapsed}s`;
    }, 100);

    try {
        const res = await fetch(API.resumeMatch, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                candidate_id: currentMatchCandidateId,
                job_id: jobId,
            }),
        });

        if (!res.ok) throw new Error('Match generation failed');

        const data = await res.json();
        currentReport = data;

        // Stop timer
        clearInterval(loadingTimerInterval);
        loadingTimerInterval = null;
        closeModal('loadingModal');

        // Show report preview
        showReportPreview(data);

    } catch (err) {
        clearInterval(loadingTimerInterval);
        loadingTimerInterval = null;
        closeModal('loadingModal');
        showToast(`Error: ${err.message}`, 'error');
    }
}


// ============================================================
// REPORT DISPLAY
// ============================================================

function showReportPreview(report) {
    const scoreClass = getScoreClass(report.score_label);

    // Title
    document.getElementById('reportPreviewTitle').textContent = `Resume Match Analysis — ${currentMatchCandidateName}`;

    // Metrics
    document.getElementById('previewMetricTime').textContent = report.processing_time_ms
        ? `${(report.processing_time_ms / 1000).toFixed(1)}s`
        : '—';
    document.getElementById('previewMetricInputTokens').textContent = report.input_tokens?.toLocaleString() || '—';
    document.getElementById('previewMetricOutputTokens').textContent = report.output_tokens?.toLocaleString() || '—';
    document.getElementById('previewMetricModel').textContent = report.llm_model_used || '—';

    // Score ring
    const ring = document.getElementById('previewScoreRing');
    ring.className = `score-ring score-ring--${scoreClass}`;
    ring.style.setProperty('--score', report.match_score);
    document.getElementById('previewScore').textContent = `${report.match_score}%`;

    // File name and date
    const candidate = candidates.find(c => c.id === currentMatchCandidateId);
    document.getElementById('previewFileName').textContent = candidate?.resume_file_name || 'Resume';
    document.getElementById('previewDate').textContent = `Generated on ${formatDate(report.created_at || new Date().toISOString())}`;

    // Summary
    document.getElementById('previewSummary').textContent = report.summary_text || report.full_report_json?.summary || '—';

    openModal('reportPreviewModal');
}

function openFullReport() {
    if (!currentReport) return;
    closeModal('reportPreviewModal');

    const report = currentReport;
    const reportJson = report.full_report_json || {};
    const scoreClass = getScoreClass(report.score_label);

    // Header
    const candidate = candidates.find(c => c.id === currentMatchCandidateId);
    document.getElementById('fullReportSubtitle').textContent =
        `${candidate?.resume_file_name || 'Resume'} • Generated on ${formatDate(report.created_at || new Date().toISOString())}`;

    // Score badge
    const badge = document.getElementById('fullReportScoreBadge');
    badge.textContent = `${report.match_score}% - ${report.score_label}`;
    badge.className = `badge badge--${scoreClass}`;

    // Build report body HTML
    const body = document.getElementById('fullReportBody');
    body.innerHTML = `
        <!-- Overall Score -->
        <div class="report-section" style="text-align: center; padding: 20px 0;">
            <div class="report-section__title" style="justify-content: center;">📊 Overall Match Score</div>
            <div style="font-size: 3rem; font-weight: 800; text-decoration: underline; margin: 12px 0; color: var(--score-${scoreClass});">
                ${report.match_score}%
            </div>
        </div>

        <!-- Summary of Findings -->
        <div class="report-section">
            <div class="report-section__title">📋 Summary of Findings</div>
            ${reportJson.skills_found?.length ? `
                <div style="margin-bottom: 12px;">
                    <strong style="font-size: 0.85rem;">Critical Skills Found:</strong>
                    <ul class="report-section__list report-section__list--matched">
                        ${reportJson.skills_found.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            ${reportJson.skills_missing?.length ? `
                <div>
                    <strong style="font-size: 0.85rem;">Critical Skills Missing:</strong>
                    <ul class="report-section__list report-section__list--missing">
                        ${reportJson.skills_missing.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>

        <!-- Detailed Experience Analysis -->
        <div class="report-section">
            <div class="report-section__title">🔍 Detailed Experience Analysis</div>
            ${reportJson.experience_matched?.length ? `
                <div style="margin-bottom: 12px;">
                    <strong style="font-size: 0.85rem;">✓ Skills/Experience Matched:</strong>
                    <ul class="report-section__list report-section__list--matched">
                        ${reportJson.experience_matched.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            ${reportJson.experience_missing?.length ? `
                <div>
                    <strong style="font-size: 0.85rem;">✗ Skills/Experience Missing:</strong>
                    <ul class="report-section__list report-section__list--missing">
                        ${reportJson.experience_missing.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>

        <!-- Suitability Assessment -->
        ${reportJson.suitability_assessment ? `
        <div class="report-section">
            <div class="report-section__title">✓ Suitability Assessment</div>
            <p class="report-section__text">${escapeHtml(reportJson.suitability_assessment)}</p>
        </div>
        ` : ''}

        <!-- Critical Concerns -->
        ${reportJson.critical_concerns?.length ? `
        <div class="report-section">
            <div class="report-section__title">⚠️ Critical Concerns</div>
            <ul class="report-section__list">
                ${reportJson.critical_concerns.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
            </ul>
        </div>
        ` : ''}

        <!-- Final Recommendation -->
        ${reportJson.recommendation ? `
        <div class="report-section">
            <div class="report-section__title">💡 Final Recommendation</div>
            <p class="report-section__text">${escapeHtml(reportJson.recommendation)}</p>
        </div>
        ` : ''}
    `;

    openModal('fullReportModal');
}

async function copyReportToClipboard() {
    if (!currentReport) return;
    const reportJson = currentReport.full_report_json || {};

    const text = [
        `Resume Match Report`,
        `Score: ${currentReport.match_score}% - ${currentReport.score_label}`,
        ``,
        `Summary: ${reportJson.summary || ''}`,
        ``,
        `Skills Found:`,
        ...(reportJson.skills_found || []).map(s => `  • ${s}`),
        ``,
        `Skills Missing:`,
        ...(reportJson.skills_missing || []).map(s => `  • ${s}`),
        ``,
        `Experience Matched:`,
        ...(reportJson.experience_matched || []).map(s => `  • ${s}`),
        ``,
        `Experience Missing:`,
        ...(reportJson.experience_missing || []).map(s => `  • ${s}`),
        ``,
        `Suitability: ${reportJson.suitability_assessment || ''}`,
        ``,
        `Concerns:`,
        ...(reportJson.critical_concerns || []).map(s => `  • ${s}`),
        ``,
        `Recommendation: ${reportJson.recommendation || ''}`,
    ].join('\n');

    try {
        await navigator.clipboard.writeText(text);
        showToast('Report copied to clipboard!', 'success');
    } catch {
        showToast('Failed to copy to clipboard.', 'error');
    }
}


// ============================================================
// UTILITIES
// ============================================================

function getScoreClass(label) {
    const l = (label || '').toLowerCase();
    if (l === 'excellent') return 'excellent';
    if (l === 'good') return 'good';
    if (l === 'fair') return 'fair';
    return 'poor';
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
