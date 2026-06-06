'use strict';

// ===== Storage Keys =====
const TARGETS_KEY  = 'chrongo_v1';
const SESSIONS_KEY = 'chrongo_sessions_v1';
const USER_KEY     = 'chrongo_user';
const SOUND_KEY    = 'chrongo_sound';

// Replace with your Google Cloud OAuth 2.0 client ID
// (APIs & Services → Credentials → OAuth 2.0 Client IDs)
const GOOGLE_CLIENT_ID  = '467685882670-6rr0fnqdpch5gk78b188fqa8j6m0j47d.apps.googleusercontent.com';

// Get from Supabase: Project Settings → API
const SUPABASE_URL      = 'https://epqohkagzvboncaciynl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwcW9oa2FnenZib25jYWNpeW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NzEzNTksImV4cCI6MjA5NjI0NzM1OX0.KlFNBV0O1xJcFMbCbDtCJe0fDNqMY8i3Q9y63oKW3k8';


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
let periodOffset  = 0;
let currentUser    = null;
let supabaseClient = null;
let currentSound   = localStorage.getItem(SOUND_KEY) || 'beep';

// ===== Persistence =====
function targetsKey()  { return currentUser ? `${TARGETS_KEY}_${currentUser.id}`  : TARGETS_KEY; }
function sessionsKey() { return currentUser ? `${SESSIONS_KEY}_${currentUser.id}` : SESSIONS_KEY; }

function loadTargets()  { try { return JSON.parse(localStorage.getItem(targetsKey()))  || []; } catch { return []; } }
function loadSessions() { try { return JSON.parse(localStorage.getItem(sessionsKey())) || []; } catch { return []; } }
function saveTargets()  { try { localStorage.setItem(targetsKey(),  JSON.stringify(targets));  } catch {} syncTargetsUp(); }
function saveSessions() { try { localStorage.setItem(sessionsKey(), JSON.stringify(sessions)); } catch {} }

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
    syncSessionUp(sessions.at(-1));
}

// ===== Clock display =====
function updateClock() {
    const now = new Date();
    document.getElementById('dateDisplay').textContent =
        `${DAYS_VI[now.getDay()]}, ${now.getDate()} ${MONTHS_VI[now.getMonth()]} ${now.getFullYear()}`;
    document.getElementById('timeDisplay').textContent =
        `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// ===== Day overview =====
function updateDayOverview() {
    const now     = new Date();
    const TOTAL   = 86400;
    const elapsed = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const todayRemaining = TOTAL - elapsed;

    const committed = Math.round(targets
        .filter(t => t.status !== 'completed')
        .reduce((acc, t) => acc + Math.max(0, getRemaining(t)), 0));

    const free     = Math.max(0, todayRemaining - committed);
    const overflow = committed > todayRemaining;

    const elapsedPct   = (elapsed   / TOTAL) * 100;
    const committedPct = Math.min((committed / TOTAL) * 100, 100 - elapsedPct);

    document.getElementById('dovElapsed').style.width   = `${elapsedPct.toFixed(2)}%`;
    document.getElementById('dovCommitted').style.width = `${committedPct.toFixed(2)}%`;

    document.getElementById('dovStatElapsed').textContent   = formatDuration(elapsed);
    document.getElementById('dovStatCommitted').textContent = committed > 0 ? formatDuration(committed) : '—';

    const freeEl = document.getElementById('dovStatFree');
    freeEl.textContent = overflow ? '0s' : formatDuration(free);
    freeEl.className   = `dov-stat-value free${overflow ? ' overflow' : ''}`;
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
    updateDayOverview();
}

function buildCard(t) {
    const rem       = getRemaining(t);
    const completed = t.status === 'completed';
    const overdue   = !completed && rem < 0;
    const progress  = completed ? 100 : (t.total > 0 ? Math.max(0, Math.min(100, (rem / t.total) * 100)) : 0);

    const stateClass = completed ? 'completed' : (overdue ? 'overdue' : t.status);
    const card = document.createElement('div');
    card.className = `target-card state-${stateClass}`;
    card.dataset.id = t.id;
    card.style.setProperty('--card-color', completed ? 'var(--success)' : (overdue ? 'var(--danger)' : t.color));

    const statusText = completed ? 'Hoàn thành' : {
        idle:    'Chưa bắt đầu',
        running: overdue ? 'Quá hạn' : 'Đang chạy',
        paused:  'Tạm dừng',
    }[overdue ? 'running' : t.status] || 'Chưa bắt đầu';

    const badgeClass = completed ? 'completed' : (overdue ? 'overdue' : (t.status === 'idle' ? 'idle' : t.status));
    const savedLabel = t.status === 'paused' && !overdue
        ? `<span class="saved-label">💾 Đã lưu</span>` : '';

    let actionSvg, actionLabel;
    if (completed) {
        actionSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        actionLabel = 'Bắt đầu lại';
    } else if (t.status === 'running') {
        actionSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
        actionLabel = overdue ? 'Hoàn thành' : 'Tạm dừng';
    } else {
        actionSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        actionLabel = t.status === 'paused' ? 'Tiếp tục' : 'Bắt đầu';
    }

    const actionBtnClass = `btn-action${overdue ? ' overdue' : ''}`;
    const actionBtnStyle = overdue ? '' : `background:${completed ? 'var(--success)' : t.color}`;
    const showCompleteBtn = t.status === 'running' && !overdue;

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
            ${completed ? '00:00' : formatSeconds(rem)}
        </div>
        <div class="progress-track">
            <div class="progress-fill ${overdue ? 'is-overdue' : ''}" data-progress="${t.id}"
                 style="width:${progress}%; background:${completed ? 'var(--success)' : (overdue ? 'var(--danger)' : t.color)}"></div>
        </div>
        <div class="card-status">
            <span class="status-badge ${badgeClass}">
                <span class="status-dot"></span>${statusText}
            </span>
            ${savedLabel}
        </div>
        <div class="card-actions">
            <button class="${actionBtnClass}" data-id="${t.id}" style="${actionBtnStyle}">
                ${actionSvg} ${actionLabel}
            </button>
            ${showCompleteBtn ? `<button class="btn-complete" data-id="${t.id}" title="Hoàn thành sớm">✓</button>` : ''}
            <button class="btn-reset" data-id="${t.id}" title="Đặt lại">↺</button>
        </div>`;

    card.querySelector('.card-delete').addEventListener('click', e => { e.stopPropagation(); openConfirmDelete(t.id); });
    card.querySelector('.btn-action').addEventListener('click', e => {
        e.stopPropagation();
        completed ? restartTimer(t.id) : toggleTimer(t.id);
    });
    const btnComplete = card.querySelector('.btn-complete');
    if (btnComplete) btnComplete.addEventListener('click', e => { e.stopPropagation(); completeTimer(t.id); });
    card.querySelector('.btn-reset').addEventListener('click', e => { e.stopPropagation(); resetTimer(t.id); });
    card.addEventListener('click', () => { completed ? restartTimer(t.id) : toggleTimer(t.id); });
    return card;
}

// ===== Tick (in-place update for running timers) =====
function tick() {
    updateClock();
    updateDayOverview();

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
            playSound(currentSound);
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
        if (rem <= 0) {
            t.remaining        = 0;
            t.remainingAtStart = 0;
            t.startedAt        = null;
            t.status           = 'completed';
            showToast(`🎉 Hoàn thành "${t.name}"!`);
        } else {
            t.remaining        = rem;
            t.remainingAtStart = rem;
            t.startedAt        = null;
            t.status           = 'paused';
            showToast(`⏸ Đã tạm dừng "${t.name}" — trạng thái được lưu`);
        }
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

function completeTimer(id) {
    const t = targets.find(x => x.id === id);
    if (!t || t.status !== 'running') return;
    const rem     = getRemaining(t);
    const elapsed = t.remainingAtStart - rem;
    recordSession(t, elapsed);
    t.remaining        = 0;
    t.remainingAtStart = 0;
    t.startedAt        = null;
    t.status           = 'completed';
    saveTargets();
    renderAll();
    showToast(`🎉 Hoàn thành "${t.name}"!`);
    playSound(currentSound);
}

// ===== Sound =====
function playSound(type) {
    if (type === 'none') return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (type === 'beep') {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            osc.start(); osc.stop(ctx.currentTime + 0.35);
        } else if (type === 'ding') {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = 1318;
            gain.gain.setValueAtTime(0.35, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
            osc.start(); osc.stop(ctx.currentTime + 1.2);
        } else if (type === 'chime') {
            [523, 659, 784, 1047].forEach((freq, i) => {
                const osc = ctx.createOscillator(), gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.frequency.value = freq;
                const t = ctx.currentTime + i * 0.18;
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
                osc.start(t); osc.stop(t + 1.0);
            });
        } else if (type === 'alarm') {
            for (let i = 0; i < 3; i++) {
                const osc = ctx.createOscillator(), gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.frequency.value = i % 2 === 0 ? 880 : 660;
                const t = ctx.currentTime + i * 0.28;
                gain.gain.setValueAtTime(0.3, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
                osc.start(t); osc.stop(t + 0.22);
            }
        }
    } catch (e) {}
}

function openSoundModal() {
    closeFab();
    document.querySelectorAll('#soundOptions .sound-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sound === currentSound);
    });
    document.getElementById('soundOverlay').classList.add('open');
}

function closeSoundModal() {
    document.getElementById('soundOverlay').classList.remove('open');
}

function restartTimer(id) {
    const t = targets.find(x => x.id === id);
    if (!t) return;
    t.remaining        = t.total;
    t.remainingAtStart = t.total;
    t.startedAt        = Date.now();
    t.status           = 'running';
    saveTargets();
    renderAll();
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

    const idToDelete = deleteTargetId;
    targets = targets.filter(x => x.id !== idToDelete);
    saveTargets();
    deleteTargetFromCloud(idToDelete);
    renderAll();
    closeConfirmDelete();
    if (t) showToast(`🗑 Đã xóa "${t.name}"`);
}

// ===== Stats logic =====

function getDateRange(period, offset = periodOffset) {
    const now  = new Date();
    const year = now.getFullYear();
    const month= now.getMonth();
    const date = now.getDate();
    const dow  = now.getDay(); // 0=Sun

    let start, end;

    if (period === 'day') {
        const d = new Date(year, month, date + offset);
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
        end   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    } else if (period === 'week') {
        // Mon→Sun week
        const diffToMon = (dow === 0) ? 6 : (dow - 1);
        const mon = new Date(year, month, date - diffToMon + offset * 7);
        start = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate(), 0, 0, 0);
        end   = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
    } else if (period === 'month') {
        start = new Date(year, month + offset, 1);
        end   = new Date(year, month + offset + 1, 0, 23, 59, 59, 999);
    } else {
        // year
        start = new Date(year + offset, 0, 1);
        end   = new Date(year + offset, 11, 31, 23, 59, 59, 999);
    }

    return { start, end };
}

function getPeriodLabel(period, offset = periodOffset) {
    if (offset === 0) {
        return { day: 'Hôm nay', week: 'Tuần này', month: 'Tháng này', year: 'Năm nay' }[period];
    }
    if (period === 'day' && offset === -1) return 'Hôm qua';
    const { start, end } = getDateRange(period, offset);
    if (period === 'day') {
        return `${start.getDate()}/${start.getMonth()+1}/${start.getFullYear()}`;
    } else if (period === 'week') {
        const sy = start.getFullYear(), ey = end.getFullYear();
        const ss = `${start.getDate()}/${start.getMonth()+1}`;
        const es = `${end.getDate()}/${end.getMonth()+1}`;
        return sy === ey ? `${ss} – ${es}/${ey}` : `${ss}/${sy} – ${es}/${ey}`;
    } else if (period === 'month') {
        return `${MONTHS_VI[start.getMonth()]} ${start.getFullYear()}`;
    } else {
        return `Năm ${start.getFullYear()}`;
    }
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

    // Chart title & period navigation label
    const titles = { day:'Theo giờ trong ngày', week:'Theo ngày trong tuần', month:'Theo ngày trong tháng', year:'Theo tháng trong năm' };
    document.getElementById('chartTitle').textContent = titles[currentPeriod];
    document.getElementById('periodLabel').textContent = getPeriodLabel(currentPeriod);
    document.getElementById('btnPeriodNext').disabled = periodOffset >= 0;

    // Bar chart
    renderBarChart(buildChartData(currentPeriod));

    // Target breakdown
    renderBreakdown(breakdownByTarget(filtered), totalSec);

    // Gantt chart
    renderGanttChart(filtered);

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

// ===== Gantt Chart =====
function renderGanttChart(filtered) {
    const el = document.getElementById('ganttChart');
    if (!el) return;

    if (!filtered.length) {
        el.setAttribute('viewBox', '0 0 400 44');
        el.setAttribute('width', '100%');
        el.innerHTML = '<text x="200" y="28" text-anchor="middle" font-size="11" fill="#505070">Không có dữ liệu</text>';
        return;
    }

    // Unique targets, ordered by first session
    const seenTargets = new Map();
    filtered.slice().sort((a, b) => a.startedAt - b.startedAt).forEach(s => {
        if (!seenTargets.has(s.targetId))
            seenTargets.set(s.targetId, { id: s.targetId, name: s.targetName, color: s.targetColor });
    });
    const rows = [...seenTargets.values()];

    const { start: rangeStart, end: rangeEnd } = getDateRange(currentPeriod);
    const rangeMs = rangeEnd.getTime() - rangeStart.getTime();

    const VW = 600, LABEL_W = 112, AXIS_H = 22, ROW_H = 22, ROW_GAP = 5, ROW_STEP = ROW_H + ROW_GAP;
    const chartW = VW - LABEL_W - 4;
    const innerH = rows.length * ROW_STEP - ROW_GAP;
    const VH     = innerH + AXIS_H + 6;
    const toX    = ms => LABEL_W + Math.min(chartW, Math.max(0, (ms / rangeMs) * chartW));

    // X-axis grid + labels
    let grid = '', xLabels = '';
    const gridLine = x =>
        `<line x1="${x}" y1="0" x2="${x}" y2="${innerH}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`;
    const xLabel = (x, text) =>
        `<text x="${x}" y="${VH - 3}" text-anchor="middle" font-size="9" fill="#505070">${text}</text>`;

    if (currentPeriod === 'day') {
        for (let h = 0; h <= 24; h += 4) {
            const x = toX(h * 3600000);
            grid += gridLine(x);
            xLabels += xLabel(x, `${h}h`);
        }
    } else if (currentPeriod === 'week') {
        const WD = ['T2','T3','T4','T5','T6','T7','CN'];
        for (let d = 0; d <= 7; d++) {
            const x = toX(d * 86400000);
            grid += gridLine(x);
            if (d < 7) xLabels += xLabel(toX((d + 0.5) * 86400000), WD[d]);
        }
    } else if (currentPeriod === 'month') {
        const daysInMonth = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 0).getDate();
        [1, 5, 10, 15, 20, 25, daysInMonth].forEach(d => {
            const x = toX((d - 1) * 86400000);
            grid += gridLine(x);
            xLabels += xLabel(x, String(d));
        });
    } else {
        for (let m = 0; m < 12; m++) {
            const ms = new Date(rangeStart.getFullYear(), m, 1).getTime() - rangeStart.getTime();
            grid += gridLine(toX(ms));
            xLabels += xLabel(toX(new Date(rangeStart.getFullYear(), m, 15).getTime() - rangeStart.getTime()), MONTHS_SHORT[m]);
        }
    }

    // Row backgrounds + labels
    let rowBgs = '', labels = '';
    rows.forEach((t, i) => {
        const y = i * ROW_STEP, cy = y + ROW_H / 2;
        rowBgs += `<rect x="${LABEL_W}" y="${y}" width="${chartW}" height="${ROW_H}" fill="${i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0)'}"/>`;
        const name = t.name.length > 13 ? t.name.slice(0, 12) + '…' : t.name;
        labels += `<circle cx="${LABEL_W - 10}" cy="${cy}" r="4" fill="${t.color}"/>`;
        labels += `<text x="${LABEL_W - 18}" y="${cy + 4}" text-anchor="end" font-size="10.5" fill="#a0a0c0">${esc(name)}</text>`;
    });

    // Session bars
    let bars = '';
    filtered.forEach(s => {
        const ri = rows.findIndex(t => t.id === s.targetId);
        if (ri < 0) return;
        const clampedStart = Math.max(rangeStart.getTime(), s.startedAt);
        const startMs = clampedStart - rangeStart.getTime();
        const durMs   = Math.min(s.actualSec * 1000, rangeEnd.getTime() - clampedStart);
        const x = toX(startMs);
        const w = Math.max(3, (durMs / rangeMs) * chartW);
        const y = ri * ROW_STEP + 2;
        const timeStr = new Date(s.startedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        bars += `<rect x="${x.toFixed(1)}" y="${y}" width="${Math.min(w, LABEL_W + chartW - x).toFixed(1)}" height="${ROW_H - 4}" fill="${s.targetColor}" rx="2" opacity="0.82"><title>${esc(s.targetName)} · ${timeStr} · ${formatDuration(s.actualSec)}</title></rect>`;
    });

    // "Now" line on today's day view
    let nowLine = '';
    if (currentPeriod === 'day' && periodOffset === 0) {
        const now = new Date();
        const nowMs = now.getHours() * 3600000 + now.getMinutes() * 60000;
        const nx = toX(nowMs);
        nowLine = `<line x1="${nx}" y1="0" x2="${nx}" y2="${innerH}" stroke="#4ECDC4" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/>`;
    }

    el.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
    el.setAttribute('width', '100%');
    el.innerHTML = rowBgs + grid + nowLine + labels + bars + xLabels;
}

// ===== AI Analysis (DeepSeek) =====
async function analyzeWithAI() {
    if (!sessions.length) { showToast('⚠️ Chưa có dữ liệu phiên làm việc'); return; }

    const btn = document.getElementById('btnAnalyzeAI');
    btn.disabled = true;
    document.getElementById('aiEmpty').style.display   = 'none';
    document.getElementById('aiLoading').style.display = '';
    document.getElementById('aiResult').style.display  = 'none';

    // Summarize by hour to save tokens
    const hourly = Array.from({ length: 24 }, (_, h) => {
        const hs = sessions.filter(s => new Date(s.startedAt).getHours() === h);
        if (!hs.length) return null;
        const eff = hs.reduce((a, s) => a + Math.min(s.actualSec, s.plannedSec) / s.plannedSec, 0) / hs.length;
        return { hour: h, sessions: hs.length, efficiency: Math.round(eff * 100) };
    }).filter(Boolean);

    const targetCounts = {};
    sessions.forEach(s => { targetCounts[s.targetName] = (targetCounts[s.targetName] || 0) + 1; });
    const targetStr = Object.entries(targetCounts).map(([n, c]) => `${n}(${c})`).join(', ');

    try {
        if (!supabaseClient) throw new Error('Vui lòng đăng nhập để dùng tính năng AI');
        const { data: result, error: fnError } = await supabaseClient.functions.invoke('analyze-sessions', {
            body: { hourly, targetStr },
        });
        if (fnError) throw new Error(fnError.message);

        document.getElementById('aiLoading').style.display = 'none';
        document.getElementById('aiResult').style.display  = '';
        document.getElementById('aiSummary').textContent   = result.summary || '';
        renderAILineChart(result.hourly || [], result.peaks || []);
        renderAIPeaks(result.peaks || []);
    } catch (err) {
        document.getElementById('aiLoading').style.display = 'none';
        document.getElementById('aiEmpty').style.display   = '';
        showToast(`⚠️ Phân tích thất bại: ${err.message}`);
    }
    btn.disabled = false;
}

function renderAILineChart(hourly, peaks) {
    const el = document.getElementById('aiLineChart');
    if (!el) return;
    const VW = 600, VH = 180;
    const P  = { t: 14, r: 16, b: 28, l: 36 };
    const cw = VW - P.l - P.r, ch = VH - P.t - P.b;

    // Normalize to 24 buckets
    const data = Array.from({ length: 24 }, (_, h) => {
        const f = hourly.find(p => p.hour === h);
        return f ? Math.min(100, Math.max(0, f.efficiency)) : 0;
    });

    const x  = h => P.l + (h  / 23)   * cw;
    const y  = v => P.t + ch - (v / 100) * ch;
    const pts = data.map((v, h) => [x(h), y(v)]);

    let line = `M${pts[0]}`;
    for (let i = 1; i < pts.length; i++) {
        const dx = (pts[i][0] - pts[i-1][0]) * 0.4;
        line += ` C${pts[i-1][0]+dx},${pts[i-1][1]} ${pts[i][0]-dx},${pts[i][1]} ${pts[i][0]},${pts[i][1]}`;
    }
    const area = `${line} L${pts[23][0]},${P.t+ch} L${pts[0][0]},${P.t+ch}Z`;

    const grid = [0, 25, 50, 75, 100].map(v =>
        `<line x1="${P.l}" y1="${y(v)}" x2="${P.l+cw}" y2="${y(v)}" stroke="#2a2a3e" stroke-width="0.8"/>
         <text x="${P.l-5}" y="${y(v)+4}" text-anchor="end" font-size="9" fill="#4a4a6a">${v}</text>`
    ).join('');

    const xAxis = [0,3,6,9,12,15,18,21].map(h =>
        `<text x="${x(h)}" y="${VH-5}" text-anchor="middle" font-size="9" fill="#4a4a6a">${h}h</text>`
    ).join('');

    const peakZones = peaks.map(p => {
        const x1 = x(Math.max(0, p.start)), x2 = x(Math.min(23, p.end));
        return `<rect x="${x1}" y="${P.t}" width="${x2-x1}" height="${ch}" fill="rgba(78,205,196,0.1)" rx="3"/>
                <text x="${(x1+x2)/2}" y="${P.t+11}" text-anchor="middle" font-size="9" fill="#4ECDC4" font-weight="bold">★</text>`;
    }).join('');

    const peakDots = peaks.map(p => {
        const h = Math.min(23, Math.round((p.start + p.end) / 2));
        return `<circle cx="${pts[h][0]}" cy="${pts[h][1]}" r="4.5" fill="#4ECDC4" stroke="#111118" stroke-width="2"/>`;
    }).join('');

    el.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
    el.innerHTML = `
        <defs>
            <linearGradient id="aig" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#4ECDC4" stop-opacity="0.28"/>
                <stop offset="100%" stop-color="#4ECDC4" stop-opacity="0.02"/>
            </linearGradient>
        </defs>
        ${grid}${peakZones}
        <path d="${area}" fill="url(#aig)"/>
        <path d="${line}" fill="none" stroke="#4ECDC4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${peakDots}${xAxis}`;
}

function renderAIPeaks(peaks) {
    const el = document.getElementById('aiPeaks');
    if (!el) return;
    el.innerHTML = peaks.map(p =>
        `<span class="ai-peak-badge">⭐ ${esc(p.label || `${p.start}h–${p.end}h`)} · ${p.efficiency}%</span>`
    ).join('');
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
    document.getElementById('fabBackdrop').classList.add('open');
    document.getElementById('fabMenu').setAttribute('aria-hidden', 'false');
}

function closeFab() {
    fabOpen = false;
    document.getElementById('fab').classList.remove('open');
    document.getElementById('fabBackdrop').classList.remove('open');
    document.getElementById('fabMenu').setAttribute('aria-hidden', 'true');
}

function switchPeriod(period) {
    currentPeriod = period;
    periodOffset  = 0;
    document.querySelectorAll('.period-tab').forEach(b => b.classList.toggle('active', b.dataset.period === period));
    renderStats();
}

function navigatePeriod(delta) {
    periodOffset = Math.min(0, periodOffset + delta);
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

// ===== Auth (Google Identity Services) =====
function decodeJwt(token) {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
}

function initGoogleAuth() {
    if (!window.google?.accounts?.id) return;
    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
    });
}

async function handleCredentialResponse(response) {
    if (supabaseClient) {
        const { data, error } = await supabaseClient.auth.signInWithIdToken({
            provider: 'google',
            token: response.credential,
        });
        if (error || !data.user) { showToast('⚠️ Đăng nhập thất bại'); return; }
        const u = data.user;
        currentUser = {
            id:      u.id,
            name:    u.user_metadata.full_name || u.user_metadata.name || u.email,
            email:   u.email,
            picture: u.user_metadata.avatar_url || u.user_metadata.picture || '',
        };
    } else {
        const p = decodeJwt(response.credential);
        currentUser = { id: p.sub, name: p.name, email: p.email, picture: p.picture };
    }
    localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
    targets  = loadTargets();
    sessions = loadSessions();
    closeLoginModal();
    updateAuthUI();
    renderAll();
    if (currentView === 'stats') renderStats();
    showToast(`👋 Xin chào, ${currentUser.name}!`);
    if (supabaseClient) loadFromCloud().then(() => { renderAll(); if (currentView === 'stats') renderStats(); });
}

async function signOut() {
    if (supabaseClient) await supabaseClient.auth.signOut();
    if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
    currentUser = null;
    localStorage.removeItem(USER_KEY);
    targets  = loadTargets();
    sessions = loadSessions();
    closeProfileModal();
    updateAuthUI();
    renderAll();
    if (currentView === 'stats') renderStats();
    showToast('👋 Đã đăng xuất');
}

function updateAuthUI() {
    const headerUser    = document.getElementById('headerUser');
    const fabLoginLabel = document.getElementById('fabLoginLabel');
    const fabLoginMini  = document.getElementById('fabLoginMini');
    if (currentUser) {
        document.getElementById('headerAvatar').src = currentUser.picture || '';
        document.getElementById('headerUsername').textContent = currentUser.name;
        headerUser.style.display = '';
        fabLoginLabel.textContent = currentUser.name.split(' ').at(-1);
        fabLoginMini.innerHTML = `<img src="${esc(currentUser.picture)}" class="fab-user-avatar" alt="">`;
    } else {
        headerUser.style.display = 'none';
        fabLoginLabel.textContent = 'Đăng nhập';
        fabLoginMini.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    }
}

function openLoginModal() {
    document.getElementById('loginOverlay').classList.add('open');
    setTimeout(() => {
        const container = document.getElementById('googleSignInBtn');
        if (!container || !window.google?.accounts?.id) return;
        container.innerHTML = '';
        google.accounts.id.renderButton(container, {
            theme: 'filled_black',
            size: 'large',
            text: 'signin_with',
            width: 280,
            locale: 'vi',
        });
    }, 80);
}

function closeLoginModal() {
    document.getElementById('loginOverlay').classList.remove('open');
}

function openProfileModal() {
    if (!currentUser) return;
    document.getElementById('profileAvatar').src = currentUser.picture || '';
    document.getElementById('profileName').textContent  = currentUser.name;
    document.getElementById('profileEmail').textContent = currentUser.email;
    document.getElementById('profileOverlay').classList.add('open');
}

function closeProfileModal() {
    document.getElementById('profileOverlay').classList.remove('open');
}

// ===== Cloud sync (Supabase) =====
function targetToRow(t) {
    return { id: t.id, name: t.name, total: t.total, remaining: t.remaining,
             remaining_at_start: t.remainingAtStart, started_at: t.startedAt,
             status: t.status, color: t.color, created_at: t.createdAt };
}
function rowToTarget(r) {
    return { id: r.id, name: r.name, total: r.total, remaining: r.remaining,
             remainingAtStart: r.remaining_at_start, startedAt: r.started_at,
             status: r.status, color: r.color, createdAt: r.created_at };
}
function sessionToRow(s) {
    return { id: s.id, target_id: s.targetId, target_name: s.targetName,
             target_color: s.targetColor, planned_sec: s.plannedSec,
             actual_sec: s.actualSec, started_at: s.startedAt,
             ended_at: s.endedAt, date: s.date };
}
function rowToSession(r) {
    return { id: r.id, targetId: r.target_id, targetName: r.target_name,
             targetColor: r.target_color, plannedSec: r.planned_sec,
             actualSec: r.actual_sec, startedAt: r.started_at,
             endedAt: r.ended_at, date: r.date };
}

async function syncTargetsUp() {
    if (!supabaseClient || !currentUser || !targets.length) return;
    const { error } = await supabaseClient.from('targets').upsert(targets.map(targetToRow));
    if (error) console.warn('sync targets:', error.message);
}
async function deleteTargetFromCloud(id) {
    if (!supabaseClient || !currentUser) return;
    const { error } = await supabaseClient.from('targets').delete().eq('id', id);
    if (error) console.warn('delete target:', error.message);
}
async function syncSessionUp(session) {
    if (!supabaseClient || !currentUser) return;
    const { error } = await supabaseClient.from('sessions').upsert(sessionToRow(session));
    if (error) console.warn('sync session:', error.message);
}
async function clearAllSessionsFromCloud() {
    if (!supabaseClient || !currentUser) return;
    const { error } = await supabaseClient.from('sessions').delete().gt('ended_at', 0);
    if (error) console.warn('clear sessions:', error.message);
}
async function loadFromCloud() {
    if (!supabaseClient || !currentUser) return;
    const [{ data: tRows, error: tErr }, { data: sRows, error: sErr }] = await Promise.all([
        supabaseClient.from('targets').select('*').order('created_at', { ascending: true }),
        supabaseClient.from('sessions').select('*').order('ended_at',  { ascending: true }),
    ]);
    if (!tErr && tRows) {
        targets = tRows.map(rowToTarget);
        try { localStorage.setItem(targetsKey(), JSON.stringify(targets)); } catch {}
    }
    if (!sErr && sRows) {
        sessions = sRows.map(rowToSession);
        try { localStorage.setItem(sessionsKey(), JSON.stringify(sessions)); } catch {}
    }
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

// AI Analyze button
document.getElementById('btnAnalyzeAI').addEventListener('click', analyzeWithAI);

// FAB: Sound settings
document.getElementById('fabItemSound').addEventListener('click', openSoundModal);

// Sound modal
document.getElementById('soundOptions').addEventListener('click', e => {
    const btn = e.target.closest('.sound-btn');
    if (!btn) return;
    currentSound = btn.dataset.sound;
    localStorage.setItem(SOUND_KEY, currentSound);
    document.querySelectorAll('#soundOptions .sound-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.sound === currentSound);
    });
    playSound(currentSound);
});
document.getElementById('btnSoundClose').addEventListener('click', closeSoundModal);
document.getElementById('soundOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeSoundModal(); });

// FAB: Login / Profile
document.getElementById('fabItemLogin').addEventListener('click', () => {
    closeFab();
    currentUser ? openProfileModal() : openLoginModal();
});

// Login modal
document.getElementById('btnLoginClose').addEventListener('click', closeLoginModal);
document.getElementById('btnLoginCancel').addEventListener('click', closeLoginModal);
document.getElementById('loginOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeLoginModal(); });

// Profile modal
document.getElementById('btnProfileClose').addEventListener('click', closeProfileModal);
document.getElementById('btnProfileCancel').addEventListener('click', closeProfileModal);
document.getElementById('btnSignOut').addEventListener('click', signOut);
document.getElementById('profileOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeProfileModal(); });

// FAB: Toggle stats
document.getElementById('fabItemStats').addEventListener('click', () => {
    closeFab();
    switchView(currentView === 'stats' ? 'timers' : 'stats');
});

// Empty state add button
document.getElementById('btnAddEmpty').addEventListener('click', openAddModal);

// Period tabs
document.querySelectorAll('.period-tab').forEach(btn => {
    btn.addEventListener('click', () => switchPeriod(btn.dataset.period));
});
document.getElementById('btnPeriodPrev').addEventListener('click', () => navigatePeriod(-1));
document.getElementById('btnPeriodNext').addEventListener('click', () => navigatePeriod(+1));

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
    clearAllSessionsFromCloud();
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
        closeLoginModal();
        closeProfileModal();
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
try { currentUser = JSON.parse(localStorage.getItem(USER_KEY)); } catch {}
targets  = loadTargets();
sessions = loadSessions();
updateClock();
updateAuthUI();
renderAll();
setInterval(tick, 1000);

// Init Supabase
if (SUPABASE_URL !== 'YOUR_SUPABASE_URL' && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supabaseClient.auth.getSession().then(async ({ data: { session } }) => {
        if (!session) return;
        const u = session.user;
        currentUser = {
            id:      u.id,
            name:    u.user_metadata.full_name || u.user_metadata.name || u.email,
            email:   u.email,
            picture: u.user_metadata.avatar_url || u.user_metadata.picture || '',
        };
        localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
        targets  = loadTargets();
        sessions = loadSessions();
        updateAuthUI();
        renderAll();
        loadFromCloud().then(() => { renderAll(); if (currentView === 'stats') renderStats(); });
    });
}

// Init Google auth (GIS script loads async)
if (window.google?.accounts?.id) {
    initGoogleAuth();
} else {
    window.addEventListener('load', () => setTimeout(initGoogleAuth, 200));
}
