'use strict';

// ===== Constants =====
const STORAGE_KEY = 'chrongo_v1';

const DAYS_VI  = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const MONTHS_VI = [
    'Tháng 1','Tháng 2','Tháng 3','Tháng 4',
    'Tháng 5','Tháng 6','Tháng 7','Tháng 8',
    'Tháng 9','Tháng 10','Tháng 11','Tháng 12'
];

// ===== State =====
let targets        = [];
let selectedColor  = '#4ECDC4';
let deleteTargetId = null;
let tickTimer      = null;

// ===== Persistence =====
function loadTargets() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveTargets() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(targets));
    } catch {
        // localStorage unavailable (private mode, etc.)
    }
}

// ===== Time helpers =====
function pad(n) { return String(Math.abs(n)).padStart(2, '0'); }

function formatSeconds(totalSec) {
    const neg = totalSec < 0;
    const abs = Math.abs(totalSec);
    const h   = Math.floor(abs / 3600);
    const m   = Math.floor((abs % 3600) / 60);
    const s   = abs % 60;
    return (neg ? '-' : '') + (h > 0 ? `${pad(h)}:` : '') + `${pad(m)}:${pad(s)}`;
}

// How many seconds remain (accounts for running state)
function getRemaining(t) {
    if (t.status === 'running' && t.startedAt) {
        const elapsed = Math.floor((Date.now() - t.startedAt) / 1000);
        return t.remainingAtStart - elapsed;
    }
    return t.remaining;
}

function isOverdue(t) { return getRemaining(t) < 0; }

// ===== Date / time display =====
function updateClock() {
    const now = new Date();
    document.getElementById('dateDisplay').textContent =
        `${DAYS_VI[now.getDay()]}, ${now.getDate()} ${MONTHS_VI[now.getMonth()]} ${now.getFullYear()}`;
    document.getElementById('timeDisplay').textContent =
        `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// ===== Summary bar =====
function updateSummary() {
    const running = targets.filter(t => t.status === 'running').length;
    const paused  = targets.filter(t => t.status === 'paused').length;
    const overdue = targets.filter(t => t.status === 'running' && isOverdue(t)).length;

    const bar = document.getElementById('summaryBar');
    if (targets.length === 0) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';

    document.getElementById('sumRunning').textContent = running;
    document.getElementById('sumPaused').textContent  = paused;
    document.getElementById('sumOverdue').textContent = overdue;
}

// ===== HTML escape =====
function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== Toast =====
let toastTimer = null;
function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ===== Render =====
function renderAll() {
    const grid   = document.getElementById('targetsGrid');
    const empty  = document.getElementById('emptyState');

    // Remove existing cards
    grid.querySelectorAll('.target-card').forEach(c => c.remove());

    if (targets.length === 0) {
        empty.style.display = '';
        updateSummary();
        return;
    }
    empty.style.display = 'none';

    targets.forEach(t => {
        const card = buildCard(t);
        grid.appendChild(card);
    });

    updateSummary();
}

function buildCard(t) {
    const rem      = getRemaining(t);
    const overdue  = rem < 0;
    const progress = t.total > 0 ? Math.max(0, Math.min(100, (rem / t.total) * 100)) : 0;

    let stateClass = 'idle';
    if (overdue)              stateClass = 'overdue';
    else if (t.status === 'running') stateClass = 'running';
    else if (t.status === 'paused')  stateClass = 'paused';

    const card = document.createElement('div');
    card.className = `target-card state-${stateClass}`;
    card.dataset.id = t.id;
    card.style.setProperty('--card-color', overdue ? 'var(--danger)' : t.color);

    const statusLabel = {
        idle:    'Chưa bắt đầu',
        running: overdue ? 'Quá hạn' : 'Đang chạy',
        paused:  'Tạm dừng',
    }[overdue ? 'running' : t.status] || 'Chưa bắt đầu';

    const badgeClass = overdue ? 'overdue' : (t.status === 'idle' ? 'idle' : t.status);

    const savedLabel = (t.status === 'paused' && !overdue)
        ? `<span class="saved-label">💾 Đã lưu</span>` : '';

    const actionIcon  = t.status === 'running'
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
        : `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    const actionLabel = t.status === 'running' ? 'Tạm dừng' : (t.status === 'paused' ? 'Tiếp tục' : 'Bắt đầu');

    card.innerHTML = `
        <div class="card-header">
            <div class="card-name">${esc(t.name)}</div>
            <button class="card-delete" data-id="${t.id}" title="Xóa mục tiêu">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
        <div class="timer-display ${overdue ? 'is-overdue' : ''}" data-timer="${t.id}">
            ${formatSeconds(rem)}
        </div>
        <div class="progress-wrap">
            <div class="progress-track">
                <div class="progress-fill ${overdue ? 'is-overdue' : ''}" data-progress="${t.id}"
                     style="width:${progress}%; background:${overdue ? 'var(--danger)' : t.color}"></div>
            </div>
        </div>
        <div class="card-status">
            <span class="status-badge ${badgeClass}">
                <span class="status-dot"></span>${statusLabel}
            </span>
            ${savedLabel}
        </div>
        <div class="card-actions">
            <button class="btn-action ${overdue ? 'overdue' : ''}" data-id="${t.id}"
                    style="${overdue ? '' : `background:${t.color}`}">
                ${actionIcon} ${actionLabel}
            </button>
            <button class="btn-reset" data-id="${t.id}" title="Đặt lại">↺</button>
        </div>
    `;

    // Events — stop propagation so card click doesn't double-fire
    card.querySelector('.card-delete').addEventListener('click', e => {
        e.stopPropagation();
        openConfirmDelete(t.id);
    });
    card.querySelector('.btn-action').addEventListener('click', e => {
        e.stopPropagation();
        toggleTimer(t.id);
    });
    card.querySelector('.btn-reset').addEventListener('click', e => {
        e.stopPropagation();
        resetTimer(t.id);
    });

    // Click anywhere on card = toggle
    card.addEventListener('click', () => toggleTimer(t.id));

    return card;
}

// ===== In-place tick (no full re-render, smoother) =====
function tick() {
    updateClock();

    let anyRunning = false;
    targets.forEach(t => {
        if (t.status !== 'running') return;
        anyRunning = true;

        const card = document.querySelector(`.target-card[data-id="${t.id}"]`);
        if (!card) return;

        const rem     = getRemaining(t);
        const overdue = rem < 0;
        const progress = t.total > 0 ? Math.max(0, Math.min(100, (rem / t.total) * 100)) : 0;

        // Timer text
        const timerEl = card.querySelector(`[data-timer="${t.id}"]`);
        if (timerEl) {
            timerEl.textContent = formatSeconds(rem);
            timerEl.className = `timer-display ${overdue ? 'is-overdue' : ''}`;
        }

        // Progress fill
        const progEl = card.querySelector(`[data-progress="${t.id}"]`);
        if (progEl) {
            if (overdue) {
                progEl.style.width = '100%';
                progEl.style.background = 'var(--danger)';
                progEl.className = 'progress-fill is-overdue';
            } else {
                progEl.style.width = `${progress}%`;
                progEl.style.background = t.color;
                progEl.className = 'progress-fill';
            }
        }

        // Card state class
        if (overdue && !card.classList.contains('state-overdue')) {
            card.classList.remove('state-running');
            card.classList.add('state-overdue');
            card.style.setProperty('--card-color', 'var(--danger)');

            // Update status badge
            const badge = card.querySelector('.status-badge');
            if (badge) {
                badge.className = 'status-badge overdue';
                badge.innerHTML = '<span class="status-dot"></span>Quá hạn';
            }

            // Update action button
            const btn = card.querySelector('.btn-action');
            if (btn) {
                btn.classList.add('overdue');
                btn.style.background = '';
            }
        }
    });

    if (anyRunning) updateSummary();
}

// ===== Timer controls =====
function toggleTimer(id) {
    const t = targets.find(x => x.id === id);
    if (!t) return;

    if (t.status === 'running') {
        // Pause: snapshot remaining
        t.remaining        = getRemaining(t);
        t.remainingAtStart = t.remaining;
        t.startedAt        = null;
        t.status           = 'paused';
        showToast(`⏸ Đã tạm dừng "${t.name}" — trạng thái được lưu`);
    } else {
        // Start / resume
        t.remainingAtStart = t.remaining;
        t.startedAt        = Date.now();
        t.status           = 'running';
    }

    saveTargets();
    renderAll();
}

function resetTimer(id) {
    const t = targets.find(x => x.id === id);
    if (!t) return;

    t.remaining        = t.total;
    t.remainingAtStart = t.total;
    t.startedAt        = null;
    t.status           = 'idle';

    saveTargets();
    renderAll();
    showToast(`↺ Đã đặt lại "${t.name}"`);
}

// ===== Delete flow =====
function openConfirmDelete(id) {
    deleteTargetId = id;
    document.getElementById('confirmOverlay').classList.add('open');
}

function closeConfirmDelete() {
    deleteTargetId = null;
    document.getElementById('confirmOverlay').classList.remove('open');
}

function confirmDelete() {
    if (!deleteTargetId) return;
    const t = targets.find(x => x.id === deleteTargetId);
    targets = targets.filter(x => x.id !== deleteTargetId);
    saveTargets();
    renderAll();
    closeConfirmDelete();
    if (t) showToast(`🗑 Đã xóa "${t.name}"`);
}

// ===== Add target =====
function addTarget({ name, hours, minutes, seconds, color }) {
    const total = hours * 3600 + minutes * 60 + seconds;
    targets.push({
        id:              Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name,
        total,
        remaining:       total,
        remainingAtStart: total,
        startedAt:       null,
        status:          'idle',
        color,
        createdAt:       Date.now(),
    });
    saveTargets();
    renderAll();
    showToast(`✅ Đã thêm "${name}"`);
}

// ===== Modal helpers =====
function openAddModal() {
    document.getElementById('modalOverlay').classList.add('open');
    setTimeout(() => document.getElementById('targetName').focus(), 50);
}
function closeAddModal() {
    document.getElementById('modalOverlay').classList.remove('open');
}

// ===== Event listeners =====
// Add button
document.getElementById('btnAdd').addEventListener('click', openAddModal);
document.getElementById('btnAddEmpty').addEventListener('click', openAddModal);

// Modal close
document.getElementById('btnModalClose').addEventListener('click', closeAddModal);
document.getElementById('btnCancel').addEventListener('click', closeAddModal);
document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAddModal();
});

// Confirm delete
document.getElementById('btnConfirmDelete').addEventListener('click', confirmDelete);
document.getElementById('btnConfirmCancel').addEventListener('click', closeConfirmDelete);
document.getElementById('confirmOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeConfirmDelete();
});

// Color picker
document.getElementById('colorPicker').addEventListener('click', e => {
    const btn = e.target.closest('.color-btn');
    if (!btn) return;
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedColor = btn.dataset.color;
});

// Quick time buttons
document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const mins = parseInt(btn.dataset.m, 10);
        document.getElementById('inputHours').value   = Math.floor(mins / 60);
        document.getElementById('inputMinutes').value = mins % 60;
        document.getElementById('inputSeconds').value = 0;
    });
});

// Add form submit
document.getElementById('addForm').addEventListener('submit', e => {
    e.preventDefault();

    const name    = document.getElementById('targetName').value.trim();
    const hours   = Math.max(0, parseInt(document.getElementById('inputHours').value,   10) || 0);
    const minutes = Math.max(0, parseInt(document.getElementById('inputMinutes').value, 10) || 0);
    const seconds = Math.max(0, parseInt(document.getElementById('inputSeconds').value, 10) || 0);

    if (!name) { document.getElementById('targetName').focus(); return; }
    if (hours === 0 && minutes === 0 && seconds === 0) {
        showToast('⚠️ Vui lòng nhập thời gian đếm ngược');
        return;
    }

    addTarget({ name, hours, minutes, seconds, color: selectedColor });

    // Reset form
    e.target.reset();
    document.getElementById('inputHours').value   = 0;
    document.getElementById('inputMinutes').value = 25;
    document.getElementById('inputSeconds').value = 0;
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.color-btn[data-color="#4ECDC4"]').classList.add('active');
    selectedColor = '#4ECDC4';

    closeAddModal();
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeAddModal();
        closeConfirmDelete();
    }
    // Ctrl/Cmd + N = new target
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        openAddModal();
    }
});

// Visibility change: re-render when tab comes back into focus (resume accuracy)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) renderAll();
});

// ===== Boot =====
targets = loadTargets();
updateClock();
renderAll();
tickTimer = setInterval(tick, 1000);
