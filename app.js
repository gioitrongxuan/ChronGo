'use strict';

// ===== Storage Keys =====
const TARGETS_KEY  = 'chrongo_v1';
const SESSIONS_KEY = 'chrongo_sessions_v1';

// ===== Vietnamese locale =====
const DAYS_VI   = ['Chủ Nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'];
const MONTHS_VI = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                   'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
const DAYS_SHORT = ['CN','T2','T3','T4','T5','T6','T7'];
const MONTHS_SHORT = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];

// ===== App state =====
let targets       = [];
let sessions      = [];
let selectedColor = '#4ECDC4';
let deleteTargetId = null;
let currentView   = 'timers';
let currentPeriod = 'week';

// ===== Persistence =====
function loadTargets()  { try { return JSON.parse(localStorage.getItem(TARGETS_KEY))  || []; } catch { return []; } }
function loadSessions() { try { return JSON.parse(localStorage.getItem(SESSIONS_KEY)) || []; } catch { return []; } }
function saveTargets()  { try { localStorage.setItem(TARGETS_KEY,  JSON.stringify(targets));  } catch {} }
function saveSessions() { try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)); } catch {} }

// ===== Helpers =====
function pad(n) { return String(Math.abs(Math.floor(n))).padStart(2, '0'); }

function formatSeconds(totalSec) {
    const neg = totalSec < 0;
    const abs = Math.abs(Math.floor(totalSec));
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = abs % 60;
    return (neg ? '-' : '') + (h > 0 ? `${pad(h)}:` : '') + `${pad(m)}:${pad(s)}`;
}

function formatDuration(sec) {
    sec = Math.abs(Math.floor(sec));
    if (sec < 60)     return `${sec}s`;
    if (sec < 3600)   return `${Math.floor(sec/60)}p ${sec%60 ? (sec%60)+'s' : ''}`.trim();
    const h = Math.floor(sec/3600);
    const m = Math.floor((sec%3600)/60);
    return m ? `${h}h ${m}p` : `${h}h`;
}

function localDateStr(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function getRemaining(t) {
    if (t.status === 'running' && t.startedAt) {
        const elapsed = (Date.now() - t.startedAt) / 1000;
        return t.remainingAtStart - elapsed;
    }
    return t.remaining;
}

function isOverdue(t) { return getRemaining(t) < 0; }

function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== Session recording =====
function recordSession(target, actualSec) {
    if (actualSec < 3) return;
    const now = Date.now();
    sessions.push({
        id:          now.toString(36) + Math.random().toString(36).slice(2,5),
        targetId:    target.id,
        targetName:  target.name,
        targetColor: target.color,
        plannedSec:  target.total,
        actualSec:   Math.round(actualSec),
        startedAt:   now - Math.round(actualSec) * 1000,
        endedAt:     now,
        date:        localDateStr(now),
    });
    saveSessions();
}

// ===== Clock display =====
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

    // Total remaining across all non-idle timers
    const totalRem = targets
        .filter(t => t.status !== 'idle')
        .reduce((acc, t) => acc + Math.max(0, getRemaining(t)), 0);

    document.getElementById('sumTotalRemaining').textContent =
        targets.some(t => t.status !== 'idle') ? formatDuration(totalRem) : '—';
}

// ===== Render timers =====
function renderAll() {
    const grid  = document.getElementById('targetsGrid');
    const empty = document.getElementById('emptyState');

    grid.querySelectorAll('.target-card').forEach(c => c.remove());

    if (targets.length === 0) {
        empty.style.display = '';
        updateSummary();
        return;
    }
    empty.style.display = 'none';
    targets.forEach(t => grid.appendChild(buildCard(t)));
    updateSummary();
}

function buildCard(t) {
    const rem      = getRemaining(t);
    const overdue  = rem < 0;
    const progress = t.total > 0 ? Math.max(0, Math.min(100, (rem / t.total) * 100)) : 0;

    const stateClass = overdue ? 'overdue' : t.status;
    const card = document.createElement('div');
    card.className = `target-card state-${stateClass}`;
    card.dataset.id = t.id;
    card.style.setProperty('--card-color', overdue ? 'var(--danger)' : t.color);

    const statusText = {
        idle:    'Chưa bắt đầu',
        running: overdue ? 'Quá hạn' : 'Đang chạy',
        paused:  'Tạm dừng',
    }[overdue ? 'running' : t.status] || 'Chưa bắt đầu';

    const badgeClass = overdue ? 'overdue' : (t.status === 'idle' ? 'idle' : t.status);
    const savedLabel = t.status === 'paused' && !overdue
        ? `<span class="saved-label">💾 Đã lưu</span>` : '';

    const actionSvg = t.status === 'running'
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    const actionLabel = t.status === 'running' ? 'Tạm dừng' : (t.status === 'paused' ? 'Tiếp tục' : 'Bắt đầu');

    card.innerHTML = `
        <div class="card-header">
            <div class="card-name">${esc(t.name)}</div>
            <button class="card-delete" data-id="${t.id}" title="Xóa">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
        <div class="timer-display ${overdue ? 'is-overdue' : ''}" data-timer="${t.id}">
            ${formatSeconds(rem)}
        </div>
        <div class="progress-track">
            <div class="progress-fill ${overdue ? 'is-overdue' : ''}" data-progress="${t.id}"
                 style="width:${progress}%; background:${overdue ? 'var(--danger)' : t.color}"></div>
        </div>
        <div class="card-status">
            <span class="status-badge ${badgeClass}">
                <span class="status-dot"></span>${statusText}
            </span>
            ${savedLabel}
        </div>
        <div class="card-actions">
            <button class="btn-action ${overdue ? 'overdue' : ''}" data-id="${t.id}"
                    style="${overdue ? '' : `background:${t.color}`}">
                ${actionSvg} ${actionLabel}
            </button>
            <button class="btn-reset" data-id="${t.id}" title="Đặt lại">↺</button>
        </div>`;

    card.querySelector('.card-delete').addEventListener('click', e => { e.stopPropagation(); openConfirmDelete(t.id); });
    card.querySelector('.btn-action').addEventListener('click', e => { e.stopPropagation(); toggleTimer(t.id); });
    card.querySelector('.btn-reset').addEventListener('click', e => { e.stopPropagation(); resetTimer(t.id); });
    card.addEventListener('click', () => toggleTimer(t.id));
    return card;
}

// ===== Tick (in-place update for running timers) =====
function tick() {
    updateClock();

    let hasRunning = false;
    targets.forEach(t => {
        if (t.status !== 'running') return;
        hasRunning = true;

        const card = document.querySelector(`.target-card[data-id="${t.id}"]`);
        if (!card) return;

        const rem     = getRemaining(t);
        const overdue = rem < 0;
        const progress = t.total > 0 ? Math.max(0, Math.min(100, (rem / t.total) * 100)) : 0;

        const timerEl = card.querySelector(`[data-timer="${t.id}"]`);
        if (timerEl) {
            timerEl.textContent = formatSeconds(rem);
            timerEl.className = `timer-display${overdue ? ' is-overdue' : ''}`;
        }

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

        if (overdue && !card.classList.contains('state-overdue')) {
            card.classList.remove('state-running');
            card.classList.add('state-overdue');
            card.style.setProperty('--card-color', 'var(--danger)');
            const badge = card.querySelector('.status-badge');
            if (badge) { badge.className = 'status-badge overdue'; badge.innerHTML = '<span class="status-dot"></span>Quá hạn'; }
            const btn = card.querySelector('.btn-action');
            if (btn) { btn.classList.add('overdue'); btn.style.background = ''; }
        }
    });

    if (hasRunning) updateSummary();
}

// ===== Timer controls =====
function toggleTimer(id) {
    const t = targets.find(x => x.id === id);
    if (!t) return;

    if (t.status === 'running') {
        const rem = getRemaining(t);
        const elapsed = t.remainingAtStart - rem;
        recordSession(t, elapsed);
        t.remaining        = rem;
        t.remainingAtStart = rem;
        t.startedAt        = null;
        t.status           = 'paused';
        showToast(`⏸ Đã tạm dừng "${t.name}" — trạng thái được lưu`);
    } else {
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

    // Record session if timer ran at all
    if (t.status === 'running') {
        const elapsed = t.remainingAtStart - getRemaining(t);
        recordSession(t, elapsed);
    } else if (t.status === 'paused' && t.remaining < t.total) {
        recordSession(t, t.total - t.remaining);
    }

    t.remaining        = t.total;
    t.remainingAtStart = t.total;
    t.startedAt        = null;
    t.status           = 'idle';

    saveTargets();
    renderAll();
    showToast(`↺ Đã đặt lại "${t.name}"`);
}

function addTarget({ name, hours, minutes, seconds, color }) {
    const total = hours * 3600 + minutes * 60 + seconds;
    targets.push({
        id:              Date.now().toString(36) + Math.random().toString(36).slice(2,5),
        name, total,
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

// ===== Delete =====
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

    // Record session if running before deleting
    if (t && t.status === 'running') {
        recordSession(t, t.remainingAtStart - getRemaining(t));
    }

    targets = targets.filter(x => x.id !== deleteTargetId);
    saveTargets();
    renderAll();
    closeConfirmDelete();
    if (t) showToast(`🗑 Đã xóa "${t.name}"`);
}

// ===== Stats logic =====

function getDateRange(period) {
    const now  = new Date();
    const year = now.getFullYear();
    const month= now.getMonth();
    const date = now.getDate();
    const dow  = now.getDay(); // 0=Sun

    let start, end;

    if (period === 'day') {
        start = new Date(year, month, date, 0, 0, 0);
        end   = new Date(year, month, date, 23, 59, 59, 999);
    } else if (period === 'week') {
        // Mon→Sun week
        const diffToMon = (dow === 0) ? 6 : (dow - 1);
        start = new Date(year, month, date - diffToMon, 0, 0, 0);
        end   = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
    } else if (period === 'month') {
        start = new Date(year, month, 1);
        end   = new Date(year, month + 1, 0, 23, 59, 59, 999);
    } else {
        // year
        start = new Date(year, 0, 1);
        end   = new Date(year, 11, 31, 23, 59, 59, 999);
    }

    return { start, end };
}

function filterSessions(period) {
    const { start, end } = getDateRange(period);
    return sessions.filter(s => s.endedAt >= start.getTime() && s.endedAt <= end.getTime());
}

function computeStats(filtered) {
    const totalSec    = filtered.reduce((acc, s) => acc + s.actualSec, 0);
    const count       = filtered.length;
    const planTotal   = filtered.reduce((acc, s) => acc + s.plannedSec, 0);
    const doneTotal   = filtered.reduce((acc, s) => acc + Math.min(s.actualSec, s.plannedSec), 0);
    const efficiency  = planTotal > 0 ? Math.round((doneTotal / planTotal) * 100) : 0;
    return { totalSec, count, efficiency };
}

// Group sessions by date string → total seconds
function groupByDate(filtered) {
    const map = {};
    filtered.forEach(s => {
        map[s.date] = (map[s.date] || 0) + s.actualSec;
    });
    return map;
}

// Build chart labels + data for current period
function buildChartData(period) {
    const { start, end } = getDateRange(period);
    const dateMap        = groupByDate(filterSessions(period));
    const today          = localDateStr(Date.now());
    const items          = [];

    if (period === 'day') {
        // 24 hourly buckets
        const hourMap = {};
        filterSessions(period).forEach(s => {
            const h = new Date(s.endedAt).getHours();
            hourMap[h] = (hourMap[h] || 0) + s.actualSec;
        });
        for (let h = 0; h < 24; h++) {
            items.push({
                label: h % 3 === 0 ? `${h}h` : '',
                value: Math.round((hourMap[h] || 0) / 60),
                isToday: false,
            });
        }
    } else if (period === 'week') {
        // Mon → Sun (7 days)
        for (let i = 0; i < 7; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            const ds = localDateStr(d.getTime());
            items.push({
                label: DAYS_SHORT[(d.getDay())],
                value: Math.round((dateMap[ds] || 0) / 60),
                isToday: ds === today,
            });
        }
    } else if (period === 'month') {
        // Each day in month
        const cur = new Date(start);
        while (cur <= end) {
            const ds = localDateStr(cur.getTime());
            items.push({
                label: cur.getDate() % 5 === 1 ? String(cur.getDate()) : '',
                value: Math.round((dateMap[ds] || 0) / 60),
                isToday: ds === today,
            });
            cur.setDate(cur.getDate() + 1);
        }
    } else {
        // Months Jan→Dec
        for (let mo = 0; mo < 12; mo++) {
            let total = 0;
            for (const [ds, sec] of Object.entries(dateMap)) {
                if (new Date(ds).getMonth() === mo && new Date(ds).getFullYear() === start.getFullYear()) {
                    total += sec;
                }
            }
            items.push({
                label: MONTHS_SHORT[mo],
                value: Math.round(total / 60),
                isToday: new Date().getMonth() === mo && new Date().getFullYear() === start.getFullYear(),
            });
        }
    }

    return items;
}

// Best day in period
function bestDay(filtered) {
    const map = groupByDate(filtered);
    if (!Object.keys(map).length) return null;
    const [ds, sec] = Object.entries(map).reduce((a, b) => b[1] > a[1] ? b : a);
    const d = new Date(ds);
    return { label: `${d.getDate()}/${d.getMonth()+1}`, sec };
}

// By-target breakdown
function breakdownByTarget(filtered) {
    const map = {};
    filtered.forEach(s => {
        if (!map[s.targetId]) map[s.targetId] = { name: s.targetName, color: s.targetColor, sec: 0 };
        map[s.targetId].sec += s.actualSec;
    });
    return Object.values(map).sort((a,b) => b.sec - a.sec);
}

// ===== Stats rendering =====
function renderStats() {
    const filtered    = filterSessions(currentPeriod);
    const { totalSec, count, efficiency } = computeStats(filtered);

    // Summary cards
    document.getElementById('statTotalTime').textContent   = totalSec > 0 ? formatDuration(totalSec) : '—';
    document.getElementById('statSessions').textContent    = count > 0 ? count : '—';
    document.getElementById('statEfficiency').textContent  = count > 0 ? `${efficiency}%` : '—';

    const bd = bestDay(filtered);
    document.getElementById('statBestDay').textContent = bd ? `${bd.label} (${formatDuration(bd.sec)})` : '—';

    // Chart title
    const titles = { day:'Theo giờ trong ngày', week:'Theo ngày trong tuần', month:'Theo ngày trong tháng', year:'Theo tháng trong năm' };
    document.getElementById('chartTitle').textContent = titles[currentPeriod];

    // Bar chart
    renderBarChart(buildChartData(currentPeriod));

    // Target breakdown
    renderBreakdown(breakdownByTarget(filtered), totalSec);

    // Sessions list
    renderSessionsList(filtered.slice().reverse().slice(0, 50));
}

function renderBarChart(items) {
    const chart = document.getElementById('barChart');
    chart.innerHTML = '';

    const maxVal = Math.max(1, ...items.map(i => i.value));

    items.forEach(item => {
        const col = document.createElement('div');
        col.className = 'bar-col';

        const fill = document.createElement('div');
        const heightPct = (item.value / maxVal) * 100;
        fill.className = `bar-fill${item.isToday ? ' today' : ''}${item.value === 0 ? ' empty' : ''}`;
        fill.style.height = `${Math.max(3, heightPct)}%`;
        fill.dataset.tip = item.value > 0 ? `${item.value}p` : '0';

        const label = document.createElement('div');
        label.className = `bar-label${item.isToday ? ' today' : ''}`;
        label.textContent = item.label;

        col.appendChild(fill);
        col.appendChild(label);
        chart.appendChild(col);
    });
}

function renderBreakdown(items, totalSec) {
    const list = document.getElementById('breakdownList');
    list.innerHTML = '';

    if (!items.length) {
        list.innerHTML = '<p style="color:var(--text-dim);font-size:.9rem">Không có dữ liệu</p>';
        return;
    }

    items.forEach(item => {
        const pct = totalSec > 0 ? Math.round((item.sec / totalSec) * 100) : 0;
        const row = document.createElement('div');
        row.className = 'breakdown-item';
        row.innerHTML = `
            <div class="breakdown-dot" style="background:${item.color}"></div>
            <div class="breakdown-name">${esc(item.name)}</div>
            <div class="breakdown-bar-wrap">
                <div class="breakdown-bar-fill" style="width:${pct}%;background:${item.color}"></div>
            </div>
            <div class="breakdown-time">${formatDuration(item.sec)}</div>
            <div class="breakdown-pct">${pct}%</div>`;
        list.appendChild(row);
    });
}

function renderSessionsList(filtered) {
    const list  = document.getElementById('sessionsList');
    const empty = document.getElementById('emptySessions');
    list.innerHTML = '';

    if (!filtered.length) {
        list.style.display = 'none';
        empty.style.display = '';
        return;
    }
    list.style.display = '';
    empty.style.display = 'none';

    filtered.forEach(s => {
        const startTime = new Date(s.startedAt);
        const endTime   = new Date(s.endedAt);
        const fmt = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        const dateLabel = localDateStr(s.endedAt) !== localDateStr(Date.now())
            ? ` · ${new Date(s.endedAt).getDate()}/${new Date(s.endedAt).getMonth()+1}`
            : '';

        const pct = s.plannedSec > 0 ? (s.actualSec / s.plannedSec) : 1;
        let badge, badgeClass;
        if (pct >= 0.98) {
            badge = '✓ Hoàn thành'; badgeClass = 'ok';
        } else if (s.actualSec > s.plannedSec) {
            badge = `+${formatDuration(s.actualSec - s.plannedSec)}`; badgeClass = 'overtime';
        } else {
            badge = `${Math.round(pct*100)}%`; badgeClass = 'early';
        }

        const item = document.createElement('div');
        item.className = 'session-item';
        item.innerHTML = `
            <div class="session-dot" style="background:${s.targetColor}"></div>
            <div class="session-info">
                <div class="session-name">${esc(s.targetName)}</div>
                <div class="session-meta">${fmt(startTime)} → ${fmt(endTime)}${dateLabel}</div>
            </div>
            <div class="session-time">${formatDuration(s.actualSec)}</div>
            <div class="session-badge ${badgeClass}">${badge}</div>`;
        list.appendChild(item);
    });
}

// ===== View switching =====
function switchView(view) {
    currentView = view;
    document.getElementById('viewTimers').style.display = view === 'timers' ? '' : 'none';
    document.getElementById('viewStats').style.display  = view === 'stats'  ? '' : 'none';

    // Update FAB stats item label
    const statsLabel = document.getElementById('fabStatsLabel');
    const statsIcon  = document.getElementById('fabStatsIcon');
    if (view === 'stats') {
        statsLabel.textContent = 'Đồng hồ';
        statsIcon.innerHTML = '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>';
    } else {
        statsLabel.textContent = 'Thống kê';
        statsIcon.innerHTML = '<rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/>';
    }

    if (view === 'stats') renderStats();
}

// ===== FAB =====
let fabOpen = false;

function openFab() {
    fabOpen = true;
    document.getElementById('fab').classList.add('open');
    document.getElementById('fabMenu').setAttribute('aria-hidden', 'false');
}

function closeFab() {
    fabOpen = false;
    document.getElementById('fab').classList.remove('open');
    document.getElementById('fabMenu').setAttribute('aria-hidden', 'true');
}

function switchPeriod(period) {
    currentPeriod = period;
    document.querySelectorAll('.period-tab').forEach(b => b.classList.toggle('active', b.dataset.period === period));
    renderStats();
}

// ===== Toast =====
let toastTimer = null;
function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ===== Modal helpers =====
function openAddModal() {
    document.getElementById('modalOverlay').classList.add('open');
    setTimeout(() => document.getElementById('targetName').focus(), 50);
}
function closeAddModal() { document.getElementById('modalOverlay').classList.remove('open'); }

// ===== Event wiring =====

// FAB main toggle
document.getElementById('fabMain').addEventListener('click', () => {
    fabOpen ? closeFab() : openFab();
});

// FAB backdrop closes menu
document.getElementById('fabBackdrop').addEventListener('click', closeFab);

// FAB: Add timer
document.getElementById('fabItemAdd').addEventListener('click', () => {
    closeFab();
    if (currentView !== 'timers') switchView('timers');
    setTimeout(openAddModal, currentView !== 'timers' ? 100 : 0);
});

// FAB: Toggle stats
document.getElementById('fabItemStats').addEventListener('click', () => {
    closeFab();
    switchView(currentView === 'stats' ? 'timers' : 'stats');
});

// Empty state add button
document.getElementById('btnAddEmpty').addEventListener('click', openAddModal);

// Period tabs

// Modal
document.getElementById('btnModalClose').addEventListener('click', closeAddModal);
document.getElementById('btnCancel').addEventListener('click', closeAddModal);
document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeAddModal(); });

// Confirm delete
document.getElementById('btnConfirmDelete').addEventListener('click', confirmDelete);
document.getElementById('btnConfirmCancel').addEventListener('click', closeConfirmDelete);
document.getElementById('confirmOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeConfirmDelete(); });

// Clear stats
document.getElementById('btnClearStats').addEventListener('click', () => {
    document.getElementById('confirmClearOverlay').classList.add('open');
});
document.getElementById('btnClearCancel').addEventListener('click', () => {
    document.getElementById('confirmClearOverlay').classList.remove('open');
});
document.getElementById('btnClearConfirm').addEventListener('click', () => {
    sessions = [];
    saveSessions();
    document.getElementById('confirmClearOverlay').classList.remove('open');
    renderStats();
    showToast('🗑 Đã xóa toàn bộ lịch sử');
});
document.getElementById('confirmClearOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('confirmClearOverlay').classList.remove('open');
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

// Add form
document.getElementById('addForm').addEventListener('submit', e => {
    e.preventDefault();
    const name    = document.getElementById('targetName').value.trim();
    const hours   = Math.max(0, parseInt(document.getElementById('inputHours').value,   10) || 0);
    const minutes = Math.max(0, parseInt(document.getElementById('inputMinutes').value, 10) || 0);
    const seconds = Math.max(0, parseInt(document.getElementById('inputSeconds').value, 10) || 0);

    if (!name)                                  { document.getElementById('targetName').focus(); return; }
    if (hours === 0 && minutes === 0 && seconds === 0) { showToast('⚠️ Vui lòng nhập thời gian'); return; }

    addTarget({ name, hours, minutes, seconds, color: selectedColor });

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
        document.getElementById('confirmClearOverlay').classList.remove('open');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); openAddModal(); }
});

// Re-render stats when coming back to the tab (counts running sessions accurately)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        renderAll();
        if (currentView === 'stats') renderStats();
    }
});

// ===== Boot =====
targets  = loadTargets();
sessions = loadSessions();
updateClock();
renderAll();
setInterval(tick, 1000);
