/* ==========================================================================
   STUDYFLOW - CORE APPLICATION SCRIPT
   Complete Student Productivity & Study Management Architecture
   ========================================================================== */

(function () {
    'use strict';

    /* ==========================================================================
       1. DATE UTILITIES (Safe Date Math & Timezone Shield)
       ========================================================================== */
    const DateUtils = {
        /**
         * Safely parses YYYY-MM-DD into a local Date set to midday (12:00:00)
         * to completely eliminate timezone-rollover day-shifting bugs.
         */
        parseDate(dateStr) {
            if (!dateStr || typeof dateStr !== 'string') return new Date();
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const day = parseInt(parts[2], 10);
                if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                    return new Date(year, month, day, 12, 0, 0);
                }
            }
            const fallback = new Date(dateStr);
            return isNaN(fallback.getTime()) ? new Date() : fallback;
        },

        formatDate(dateObj) {
            if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
                dateObj = new Date();
            }
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        },

        getTodayStr() {
            return this.formatDate(new Date());
        },

        getDisplayDate(dateStr) {
            if (!dateStr) return 'No due date';
            const todayStr = this.getTodayStr();
            const d = this.parseDate(dateStr);
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = this.formatDate(tomorrow);

            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = this.formatDate(yesterday);

            if (dateStr === todayStr) return 'Today';
            if (dateStr === tomorrowStr) return 'Tomorrow';
            if (dateStr === yesterdayStr) return 'Yesterday';

            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        },

        /**
         * Returns Monday 00:00:00.000 for the week containing targetDate
         */
        getMonday(dateObj) {
            const d = new Date(dateObj);
            const day = d.getDay(); // 0 is Sunday, 1 is Monday...
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            d.setDate(diff);
            d.setHours(0, 0, 0, 0);
            return d;
        },

        getSunday(dateObj) {
            const monday = this.getMonday(dateObj);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            sunday.setHours(23, 59, 59, 999);
            return sunday;
        },

        getWeekDays(monday) {
            const days = [];
            for (let i = 0; i < 7; i++) {
                const day = new Date(monday);
                day.setDate(monday.getDate() + i);
                days.push(day);
            }
            return days;
        },

        isSameDay(d1, d2) {
            return d1.getFullYear() === d2.getFullYear() &&
                   d1.getMonth() === d2.getMonth() &&
                   d1.getDate() === d2.getDate();
        },

        isDateInWeek(dateObj, mondayObj) {
            const monTime = this.getMonday(mondayObj).getTime();
            const sunTime = this.getSunday(mondayObj).getTime();
            const t = dateObj.getTime();
            return t >= monTime && t <= sunTime;
        }
    };

    /* ==========================================================================
       2. STORAGE MANAGER (Schema Validation, Migration, Resilience)
       ========================================================================== */
    const StorageManager = {
        TASKS_KEY: 'studyflow-tasks',
        SETTINGS_KEY: 'studyflow-settings',

        defaultSettings: {
            weeklyGoal: 10,
            focusMinutes: 25,
            shortBreakMinutes: 5,
            longBreakMinutes: 15,
            soundEnabled: true,
            activeView: 'dashboard'
        },

        normalizeTask(raw) {
            if (!raw || typeof raw !== 'object') return null;

            const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString());
            const title = typeof raw.title === 'string' ? raw.title.trim() : '';
            if (!title) return null; // title is mandatory

            const subject = typeof raw.subject === 'string' && raw.subject.trim() ? raw.subject.trim() : 'General';
            const validPriorities = ['high', 'medium', 'low'];
            const priority = validPriorities.includes(raw.priority) ? raw.priority : 'medium';
            const hours = Number(raw.hours) > 0 && Number.isFinite(Number(raw.hours)) ? Math.min(24, Math.max(0.25, Number(raw.hours))) : 1;
            const date = typeof raw.date === 'string' && raw.date.trim() ? raw.date.trim() : DateUtils.getTodayStr();
            const completed = Boolean(raw.completed);
            const completedAt = raw.completedAt && !isNaN(new Date(raw.completedAt).getTime()) ? new Date(raw.completedAt).toISOString() : (completed ? new Date().toISOString() : null);
            const createdAt = raw.createdAt && !isNaN(new Date(raw.createdAt).getTime()) ? new Date(raw.createdAt).toISOString() : new Date().toISOString();

            return {
                id,
                title,
                subject,
                priority,
                hours,
                date,
                completed,
                completedAt,
                createdAt
            };
        },

        loadTasks() {
            try {
                const raw = localStorage.getItem(this.TASKS_KEY);
                if (!raw) return [];
                const parsed = JSON.parse(raw);
                if (!Array.isArray(parsed)) return [];
                const validTasks = [];
                for (const item of parsed) {
                    const norm = this.normalizeTask(item);
                    if (norm) validTasks.push(norm);
                }
                return validTasks;
            } catch (err) {
                console.error('StudyFlow: Failed to parse localStorage tasks. Recovering...', err);
                return [];
            }
        },

        saveTasks(tasks) {
            try {
                localStorage.setItem(this.TASKS_KEY, JSON.stringify(tasks));
                return true;
            } catch (err) {
                console.error('StudyFlow: Failed to save tasks to localStorage:', err);
                return false;
            }
        },

        loadSettings() {
            try {
                const raw = localStorage.getItem(this.SETTINGS_KEY);
                if (!raw) return { ...this.defaultSettings };
                const parsed = JSON.parse(raw);
                return {
                    ...this.defaultSettings,
                    ...(typeof parsed === 'object' && parsed !== null ? parsed : {})
                };
            } catch (err) {
                console.warn('StudyFlow: Failed to load settings, using defaults.', err);
                return { ...this.defaultSettings };
            }
        },

        saveSettings(settings) {
            try {
                localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
                return true;
            } catch (err) {
                console.error('StudyFlow: Failed to save settings:', err);
                return false;
            }
        },

        exportData(tasks, settings) {
            const payload = {
                app: 'StudyFlow',
                version: '2.0.0',
                exportedAt: new Date().toISOString(),
                settings,
                tasks
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `studyflow-backup-${DateUtils.getTodayStr()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    };

    /* ==========================================================================
       3. WEB AUDIO CHIME (Zero External Audio File Dependency)
       ========================================================================== */
    const SoundAlert = {
        audioCtx: null,

        init() {
            if (!this.audioCtx && (window.AudioContext || window.webkitAudioContext)) {
                const AudioConstructor = window.AudioContext || window.webkitAudioContext;
                this.audioCtx = new AudioConstructor();
            }
        },

        playChime() {
            try {
                this.init();
                if (!this.audioCtx) return;
                if (this.audioCtx.state === 'suspended') {
                    this.audioCtx.resume();
                }

                const ctx = this.audioCtx;
                const now = ctx.currentTime;

                // Play two harmonic notes (E5 659.25Hz -> A5 880Hz)
                const playTone = (freq, startTime, duration) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();

                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, startTime);

                    gain.gain.setValueAtTime(0.001, startTime);
                    gain.gain.exponentialRampToValueAtTime(0.2, startTime + 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

                    osc.connect(gain);
                    gain.connect(ctx.destination);

                    osc.start(startTime);
                    osc.stop(startTime + duration);
                };

                playTone(659.25, now, 0.4);
                playTone(880.00, now + 0.2, 0.6);
            } catch (err) {
                console.warn('StudyFlow: Audio play failed or blocked by policy.', err);
            }
        }
    };

    /* ==========================================================================
       4. SUBJECT COLOR MAPPING (Visual Differentiation)
       ========================================================================== */
    const SubjectColors = {
        palette: [
            { border: '#60a5fa', text: '#93c5fd', bg: 'rgba(96, 165, 250, 0.12)' }, // Blue
            { border: '#34d399', text: '#6ee7b7', bg: 'rgba(52, 211, 153, 0.12)' }, // Green
            { border: '#c084fc', text: '#d8b4fe', bg: 'rgba(192, 132, 252, 0.12)' }, // Purple
            { border: '#fbbf24', text: '#fde68a', bg: 'rgba(251, 191, 36, 0.12)' }, // Amber
            { border: '#f87171', text: '#fca5a5', bg: 'rgba(248, 113, 113, 0.12)' }, // Red
            { border: '#38bdf8', text: '#7dd3fc', bg: 'rgba(56, 189, 248, 0.12)' }, // Sky
            { border: '#f472b6', text: '#fbcfe8', bg: 'rgba(244, 114, 182, 0.12)' }, // Pink
            { border: '#a3e635', text: '#bef264', bg: 'rgba(163, 230, 53, 0.12)' }  // Lime
        ],

        getColor(subjectName) {
            if (!subjectName) return this.palette[0];
            let hash = 0;
            for (let i = 0; i < subjectName.length; i++) {
                hash = subjectName.charCodeAt(i) + ((hash << 5) - hash);
            }
            const index = Math.abs(hash) % this.palette.length;
            return this.palette[index];
        }
    };

    /* ==========================================================================
       5. TASK MANAGER (Business Logic, Filtering, Analytics Calculations)
       ========================================================================== */
    class TaskManager {
        constructor() {
            this.tasks = StorageManager.loadTasks();
            this.settings = StorageManager.loadSettings();
            this.recentlyDeleted = null;
            this.undoTimeout = null;
        }

        save() {
            StorageManager.saveTasks(this.tasks);
        }

        saveSettings() {
            StorageManager.saveSettings(this.settings);
        }

        addTask(data) {
            const newTask = StorageManager.normalizeTask({
                id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
                ...data,
                completed: false,
                completedAt: null,
                createdAt: new Date().toISOString()
            });
            if (newTask) {
                this.tasks.unshift(newTask);
                this.save();
                return newTask;
            }
            return null;
        }

        updateTask(id, data) {
            let updated = null;
            this.tasks = this.tasks.map(t => {
                if (t.id === id) {
                    updated = StorageManager.normalizeTask({
                        ...t,
                        ...data,
                        id: t.id,
                        createdAt: t.createdAt
                    });
                    return updated;
                }
                return t;
            });
            if (updated) this.save();
            return updated;
        }

        deleteTask(id) {
            const task = this.tasks.find(t => t.id === id);
            if (!task) return null;
            this.recentlyDeleted = task;
            this.tasks = this.tasks.filter(t => t.id !== id);
            this.save();
            return task;
        }

        undoDelete() {
            if (this.recentlyDeleted) {
                this.tasks.unshift(this.recentlyDeleted);
                const restored = this.recentlyDeleted;
                this.recentlyDeleted = null;
                this.save();
                return restored;
            }
            return null;
        }

        toggleTask(id) {
            let target = null;
            this.tasks = this.tasks.map(t => {
                if (t.id === id) {
                    const nextCompleted = !t.completed;
                    target = {
                        ...t,
                        completed: nextCompleted,
                        completedAt: nextCompleted ? new Date().toISOString() : null
                    };
                    return target;
                }
                return t;
            });
            if (target) this.save();
            return target;
        }

        clearCompleted() {
            const count = this.tasks.filter(t => t.completed).length;
            this.tasks = this.tasks.filter(t => !t.completed);
            this.save();
            return count;
        }

        getDistinctSubjects() {
            const set = new Set();
            for (const t of this.tasks) {
                if (t.subject) set.add(t.subject);
            }
            return Array.from(set).sort();
        }

        /**
         * Comprehensive Filter & Sort function
         */
        getFilteredTasks(options = {}) {
            const {
                status = 'all',
                subject = 'all',
                priority = 'all',
                search = '',
                sortBy = 'date-asc'
            } = options;

            let result = [...this.tasks];

            // 1. Status Filter
            if (status === 'pending') {
                result = result.filter(t => !t.completed);
            } else if (status === 'completed') {
                result = result.filter(t => t.completed);
            }

            // 2. Subject Filter
            if (subject && subject !== 'all') {
                result = result.filter(t => t.subject.toLowerCase() === subject.toLowerCase());
            }

            // 3. Priority Filter
            if (priority && priority !== 'all') {
                result = result.filter(t => t.priority === priority);
            }

            // 4. Search Filter
            if (search && search.trim()) {
                const query = search.trim().toLowerCase();
                result = result.filter(t =>
                    t.title.toLowerCase().includes(query) ||
                    t.subject.toLowerCase().includes(query)
                );
            }

            // 5. Sorting
            const priorityWeight = { high: 3, medium: 2, low: 1 };
            result.sort((a, b) => {
                switch (sortBy) {
                    case 'date-asc':
                        return a.date.localeCompare(b.date) || (b.createdAt.localeCompare(a.createdAt));
                    case 'date-desc':
                        return b.date.localeCompare(a.date) || (b.createdAt.localeCompare(a.createdAt));
                    case 'priority-desc':
                        return (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
                    case 'priority-asc':
                        return (priorityWeight[a.priority] || 0) - (priorityWeight[b.priority] || 0);
                    case 'hours-desc':
                        return b.hours - a.hours;
                    case 'hours-asc':
                        return a.hours - b.hours;
                    case 'created-desc':
                    default:
                        return b.createdAt.localeCompare(a.createdAt);
                }
            });

            return result;
        }

        /**
         * Computes accurate current-week stats and overall metrics
         */
        getMetrics() {
            const totalTasks = this.tasks.length;
            const completedTasks = this.tasks.filter(t => t.completed).length;
            const pendingTasks = totalTasks - completedTasks;
            const completionRate = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

            // Current Monday to Sunday bounds
            const now = new Date();
            const currentMonday = DateUtils.getMonday(now);
            const currentSunday = DateUtils.getSunday(now);

            // Hours This Week (strictly completed tasks in the current calendar week)
            let weekCompletedHours = 0;
            let allTimeCompletedHours = 0;

            for (const t of this.tasks) {
                if (t.completed && t.completedAt) {
                    const compDate = new Date(t.completedAt);
                    allTimeCompletedHours += t.hours;
                    if (compDate >= currentMonday && compDate <= currentSunday) {
                        weekCompletedHours += t.hours;
                    }
                }
            }

            // Weekly goal progress
            const weeklyGoal = Math.max(1, Number(this.settings.weeklyGoal) || 10);
            const goalPercentage = Math.min(100, Math.round((weekCompletedHours / weeklyGoal) * 100));
            const remainingHours = Math.max(0, weeklyGoal - weekCompletedHours);

            // Streak calculation (days with completed study tasks)
            let streak = 0;
            const completionDays = new Set(
                this.tasks
                    .filter(t => t.completed && t.completedAt)
                    .map(t => DateUtils.formatDate(new Date(t.completedAt)))
            );

            let checkDay = new Date();
            // If nothing done today, start checking from yesterday
            if (!completionDays.has(DateUtils.formatDate(checkDay))) {
                checkDay.setDate(checkDay.getDate() - 1);
            }
            while (completionDays.has(DateUtils.formatDate(checkDay))) {
                streak++;
                checkDay.setDate(checkDay.getDate() - 1);
            }

            return {
                totalTasks,
                completedTasks,
                pendingTasks,
                completionRate,
                weekCompletedHours,
                allTimeCompletedHours,
                weeklyGoal,
                goalPercentage,
                remainingHours,
                streak: Math.max(1, streak)
            };
        }

        /**
         * Strictly returns hours completed on each day of the specified Monday-Sunday week
         */
        getWeeklyActivity(mondayObj) {
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const dayDates = DateUtils.getWeekDays(mondayObj);
            const activity = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };

            for (const task of this.tasks) {
                if (!task.completed || !task.completedAt) continue;
                const compDate = new Date(task.completedAt);

                for (let i = 0; i < 7; i++) {
                    if (DateUtils.isSameDay(compDate, dayDates[i])) {
                        activity[days[i]] += task.hours;
                    }
                }
            }

            return { activity, days, dayDates };
        }

        getUpcomingDeadlines(limit = 4) {
            const today = DateUtils.getTodayStr();
            const threeDaysFromNow = new Date();
            threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
            const limitStr = DateUtils.formatDate(threeDaysFromNow);

            return this.tasks
                .filter(t => !t.completed)
                .sort((a, b) => a.date.localeCompare(b.date))
                .slice(0, limit);
        }

        getSubjectDistribution() {
            const map = {};
            let totalSubjectHours = 0;

            for (const t of this.tasks) {
                if (t.completed) {
                    map[t.subject] = (map[t.subject] || 0) + t.hours;
                    totalSubjectHours += t.hours;
                }
            }

            const items = Object.entries(map).map(([subject, hours]) => ({
                subject,
                hours,
                percent: totalSubjectHours > 0 ? Math.round((hours / totalSubjectHours) * 100) : 0,
                color: SubjectColors.getColor(subject)
            }));

            items.sort((a, b) => b.hours - a.hours);
            return { items, totalSubjectHours };
        }

        getMonthCompletedHours() {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();
            let hours = 0;

            for (const t of this.tasks) {
                if (t.completed && t.completedAt) {
                    const d = new Date(t.completedAt);
                    if (d.getFullYear() === year && d.getMonth() === month) {
                        hours += t.hours;
                    }
                }
            }
            return hours;
        }
    }

    /* ==========================================================================
       6. FOCUS STUDY TIMER (Pomodoro Engine with Background Sleep Resilience)
       ========================================================================== */
    class StudyTimer {
        constructor(taskManager, onTick, onComplete) {
            this.taskManager = taskManager;
            this.onTick = onTick;
            this.onComplete = onComplete;

            this.mode = 'focus'; // 'focus' | 'shortBreak' | 'longBreak'
            this.remainingSeconds = 25 * 60;
            this.totalSeconds = 25 * 60;
            this.isRunning = false;
            this.activeTaskId = null;
            this.intervalId = null;
            this.targetEndTime = null;

            this.initSettings();
            this.setupVisibilityListener();
        }

        initSettings() {
            const s = this.taskManager.settings;
            this.durations = {
                focus: (Number(s.focusMinutes) || 25) * 60,
                shortBreak: (Number(s.shortBreakMinutes) || 5) * 60,
                longBreak: (Number(s.longBreakMinutes) || 15) * 60
            };
            this.setMode(this.mode, false);
        }

        setupVisibilityListener() {
            // Re-sync exact time when switching back to this tab
            document.addEventListener('visibilitychange', () => {
                if (this.isRunning && this.targetEndTime) {
                    const now = Date.now();
                    this.remainingSeconds = Math.max(0, Math.round((this.targetEndTime - now) / 1000));
                    if (this.remainingSeconds <= 0) {
                        this.handleCompletion();
                    } else {
                        this.onTick(this.getState());
                    }
                }
            });
        }

        getState() {
            return {
                mode: this.mode,
                remainingSeconds: this.remainingSeconds,
                totalSeconds: this.totalSeconds,
                isRunning: this.isRunning,
                activeTaskId: this.activeTaskId,
                percent: Math.min(100, Math.round(((this.totalSeconds - this.remainingSeconds) / this.totalSeconds) * 100))
            };
        }

        setMode(newMode, shouldStart = false) {
            this.pause();
            this.mode = newMode;
            this.totalSeconds = this.durations[newMode] || 25 * 60;
            this.remainingSeconds = this.totalSeconds;
            this.targetEndTime = null;
            if (shouldStart) this.start();
            this.onTick(this.getState());
        }

        start() {
            if (this.isRunning) return;
            SoundAlert.init(); // Initialize audio context on user gesture
            this.isRunning = true;
            this.targetEndTime = Date.now() + this.remainingSeconds * 1000;

            this.intervalId = setInterval(() => {
                const now = Date.now();
                this.remainingSeconds = Math.max(0, Math.round((this.targetEndTime - now) / 1000));
                this.onTick(this.getState());

                if (this.remainingSeconds <= 0) {
                    this.handleCompletion();
                }
            }, 500);

            this.onTick(this.getState());
        }

        pause() {
            if (!this.isRunning) return;
            this.isRunning = false;
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.targetEndTime = null;
            this.onTick(this.getState());
        }

        reset() {
            this.pause();
            this.remainingSeconds = this.totalSeconds;
            this.targetEndTime = null;
            this.onTick(this.getState());
        }

        skip() {
            this.pause();
            if (this.mode === 'focus') {
                this.setMode('shortBreak');
            } else {
                this.setMode('focus');
            }
        }

        handleCompletion() {
            this.pause();
            this.remainingSeconds = 0;
            this.onTick(this.getState());

            if (this.taskManager.settings.soundEnabled !== false) {
                SoundAlert.playChime();
            }

            const completedMode = this.mode;
            const completedDurationSeconds = this.totalSeconds;
            const linkedTaskId = this.activeTaskId;

            // Log time if it was a focus session
            if (completedMode === 'focus') {
                const hoursToAdd = Number((completedDurationSeconds / 3600).toFixed(2));
                if (linkedTaskId) {
                    const task = this.taskManager.tasks.find(t => t.id === linkedTaskId);
                    if (task) {
                        this.taskManager.updateTask(linkedTaskId, {
                            hours: Number((task.hours + hoursToAdd).toFixed(2))
                        });
                    }
                }
                // Transition to break
                this.setMode('shortBreak');
            } else {
                // Break ended, back to focus
                this.setMode('focus');
            }

            if (this.onComplete) {
                this.onComplete({
                    mode: completedMode,
                    durationSeconds: completedDurationSeconds,
                    linkedTaskId
                });
            }
        }

        formatTime(seconds) {
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
    }

    /* ==========================================================================
       7. UI CONTROLLER (DOM Management, Navigation & Accessibility)
       ========================================================================== */
    class UIController {
        constructor() {
            this.taskManager = new TaskManager();
            this.plannerMonday = DateUtils.getMonday(new Date());

            // ── IMPORTANT: DOM must be queried BEFORE constructing StudyTimer.
            // StudyTimer.constructor calls initSettings() → setMode() → onTick()
            // synchronously during construction. That onTick fires updateTimerUI(),
            // which reads this.dom and this.timer. Both must exist by that point.
            // this.timer is kept null until after the constructor returns, and
            // updateTimerUI() guards against that window with an early-return.
            this.timer = null;

            // Query DOM References FIRST (before StudyTimer construction)
            this.dom = {
                // Navigation
                sidebar: document.getElementById('app-sidebar'),
                sidebarOverlay: document.getElementById('sidebar-overlay'),
                mobileMenuToggle: document.getElementById('mobile-menu-toggle'),
                sidebarCloseBtn: document.getElementById('sidebar-close-btn'),
                navLinks: document.querySelectorAll('.nav-link'),
                viewContainers: document.querySelectorAll('.view-container'),
                currentViewTitle: document.getElementById('current-view-title'),
                currentViewKicker: document.getElementById('current-view-kicker'),
                navPendingCount: document.getElementById('nav-pending-count'),

                // Global Buttons
                globalAddTaskBtn: document.getElementById('global-add-task-btn'),
                headerTimerBtn: document.getElementById('header-timer-btn'),
                headerTimerText: document.getElementById('header-timer-text'),
                headerTimerDot: document.getElementById('header-timer-dot'),

                // Mini Timer in Sidebar
                miniTimerDigits: document.getElementById('mini-timer-digits'),
                miniTimerToggle: document.getElementById('mini-timer-toggle'),
                miniTimerPlayIcon: document.getElementById('mini-timer-icon-play'),
                miniTimerPauseIcon: document.getElementById('mini-timer-icon-pause'),

                // Dashboard Elements
                dashboardDateLabel: document.getElementById('dashboard-date-label'),
                dashboardGreeting: document.getElementById('dashboard-greeting'),
                studyStreakText: document.getElementById('study-streak-text'),
                totalTasks: document.getElementById('total-tasks'),
                completedTasks: document.getElementById('completed-tasks'),
                pendingTasksCount: document.getElementById('pending-tasks-count'),
                studyHours: document.getElementById('study-hours'),
                statAllTimeHours: document.getElementById('stat-alltime-hours'),
                completionRate: document.getElementById('completion-rate'),
                completionRateSub: document.getElementById('completion-rate-sub'),
                dashboardTaskFilter: document.getElementById('dashboard-task-filter'),
                dashboardTaskList: document.getElementById('dashboard-task-list'),
                dashboardEmptyState: document.getElementById('dashboard-empty-state'),
                btnViewAllTasks: document.getElementById('btn-view-all-tasks'),
                deadlinesList: document.getElementById('deadlines-list'),
                deadlinesEmpty: document.getElementById('deadlines-empty'),
                weeklyHours: document.getElementById('weekly-hours'),
                weeklyGoalTarget: document.getElementById('weekly-goal-target'),
                goalStatusBadge: document.getElementById('goal-status-badge'),
                progressFill: document.getElementById('progress-fill'),
                progressRemainingText: document.getElementById('progress-remaining-text'),
                progressPercentage: document.getElementById('progress-percentage'),
                btnOpenGoalModal: document.getElementById('btn-open-goal-modal'),
                activityBars: document.getElementById('activity-bars'),
                activityWeekRange: document.getElementById('activity-week-range'),
                dashboardLaunchTimerBtn: document.getElementById('dashboard-launch-timer-btn'),

                // My Tasks Elements
                taskSearchInput: document.getElementById('task-search-input'),
                taskSearchClear: document.getElementById('task-search-clear'),
                filterSubject: document.getElementById('filter-subject'),
                filterPriority: document.getElementById('filter-priority'),
                sortTasksBy: document.getElementById('sort-tasks-by'),
                statusTabButtons: document.querySelectorAll('.tasks-status-tabs .tab-button'),
                countTabAll: document.getElementById('count-tab-all'),
                countTabPending: document.getElementById('count-tab-pending'),
                countTabCompleted: document.getElementById('count-tab-completed'),
                myTasksList: document.getElementById('my-tasks-list'),
                myTasksEmptyState: document.getElementById('my-tasks-empty-state'),
                filteredTaskSummary: document.getElementById('filtered-task-summary'),
                btnQuickCleanCompleted: document.getElementById('btn-quick-clean-completed'),

                // Planner Elements
                plannerWeekTitle: document.getElementById('planner-week-title'),
                plannerPrevWeek: document.getElementById('planner-prev-week'),
                plannerTodayBtn: document.getElementById('planner-today-btn'),
                plannerNextWeek: document.getElementById('planner-next-week'),
                plannerGrid: document.getElementById('planner-grid'),

                // Analytics Elements
                analyticsWeekHours: document.getElementById('analytics-week-hours'),
                analyticsWeekPercent: document.getElementById('analytics-week-percent'),
                analyticsMonthHours: document.getElementById('analytics-month-hours'),
                analyticsAllTimeHours: document.getElementById('analytics-alltime-hours'),
                analyticsStreakDays: document.getElementById('analytics-streak-days'),
                subjectDistributionList: document.getElementById('subject-distribution-list'),
                subjectDistributionEmpty: document.getElementById('subject-distribution-empty'),
                ratioBarCompleted: document.getElementById('ratio-bar-completed'),
                ratioBarPending: document.getElementById('ratio-bar-pending'),
                ratioCompletedVal: document.getElementById('ratio-completed-val'),
                ratioPendingVal: document.getElementById('ratio-pending-val'),
                priorityDistributionList: document.getElementById('priority-distribution-list'),

                // Timer View Elements
                mainTimerDigits: document.getElementById('main-timer-digits'),
                mainTimerPhase: document.getElementById('main-timer-phase'),
                timerProgressSvg: document.getElementById('timer-progress-svg'),
                timerStartPauseBtn: document.getElementById('timer-start-pause-btn'),
                timerResetBtn: document.getElementById('timer-reset-btn'),
                timerSkipBtn: document.getElementById('timer-skip-btn'),
                timerModePills: document.querySelectorAll('.mode-pill'),
                timerActiveTaskSelect: document.getElementById('timer-active-task-select'),
                timerSoundToggle: document.getElementById('timer-sound-toggle'),
                btnOpenTimerSettings: document.getElementById('btn-open-timer-settings'),

                // Settings Elements
                prefWeeklyGoal: document.getElementById('pref-weekly-goal'),
                prefFocusTime: document.getElementById('pref-focus-time'),
                prefShortBreak: document.getElementById('pref-short-break'),
                prefLongBreak: document.getElementById('pref-long-break'),
                settingsPreferencesForm: document.getElementById('settings-preferences-form'),
                btnExportData: document.getElementById('btn-export-data'),
                btnTriggerImport: document.getElementById('btn-trigger-import'),
                importFileInput: document.getElementById('import-file-input'),
                btnClearAllData: document.getElementById('btn-clear-all-data'),

                // Modals
                taskModal: document.getElementById('task-modal'),
                modalTitle: document.getElementById('modal-title'),
                closeModal: document.getElementById('close-modal'),
                cancelTask: document.getElementById('cancel-task'),
                taskForm: document.getElementById('task-form'),
                taskTitleInput: document.getElementById('task-title'),
                taskSubjectInput: document.getElementById('task-subject'),
                taskPriorityInput: document.getElementById('task-priority'),
                taskHoursInput: document.getElementById('task-hours'),
                taskDateInput: document.getElementById('task-date'),
                subjectSuggestions: document.getElementById('subject-suggestions'),
                errTaskTitle: document.getElementById('err-task-title'),
                errTaskSubject: document.getElementById('err-task-subject'),
                errTaskDate: document.getElementById('err-task-date'),

                goalModal: document.getElementById('goal-modal'),
                closeGoalModal: document.getElementById('close-goal-modal'),
                cancelGoalModal: document.getElementById('cancel-goal-modal'),
                goalForm: document.getElementById('goal-form'),
                goalInputHours: document.getElementById('goal-input-hours'),

                importModal: document.getElementById('import-modal'),
                closeImportModal: document.getElementById('close-import-modal'),
                cancelImportModal: document.getElementById('cancel-import-modal'),
                confirmImportBtn: document.getElementById('confirm-import-btn'),
                importPreviewStats: document.getElementById('import-preview-stats'),

                // Toast Container
                toastContainer: document.getElementById('toast-container')
            };

            // Now that this.dom exists, construct StudyTimer. Its constructor calls
            // initSettings() → setMode() → onTick() synchronously, which triggers
            // updateTimerUI(). The defensive guard there will skip heavy DOM writes
            // while this.timer is still null, then this assignment completes the init.
            this.timer = new StudyTimer(
                this.taskManager,
                (state) => this.updateTimerUI(state),
                (completion) => this.handleTimerCompleted(completion)
            );

            this.currentView = this.taskManager.settings.activeView || 'dashboard';
            this.tasksFilterState = {
                status: 'all',
                subject: 'all',
                priority: 'all',
                search: '',
                sortBy: 'date-asc'
            };

            this.pendingImportData = null;
            this.init();
        }

        init() {
            this.setupNavigation();
            this.setupEventListeners();
            this.setupDelegatedEvents();
            this.setupKeyboardShortcuts();
            this.setupServiceWorker();

            // Populate settings inputs
            this.syncSettingsInputs();

            // Check URL hash for initial view
            const hash = window.location.hash.replace('#', '');
            if (['dashboard', 'tasks', 'planner', 'progress', 'timer', 'settings'].includes(hash)) {
                this.currentView = hash;
            }

            this.switchView(this.currentView);
            this.renderAll();
        }

        /* ==========================================================================
           ROUTING & VIEW SWITCHING
           ========================================================================== */
        setupNavigation() {
            this.dom.navLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    const targetView = link.dataset.view;
                    if (targetView) {
                        this.switchView(targetView);
                        this.closeMobileMenu();
                    }
                });
            });

            // Mobile menu handlers
            this.dom.mobileMenuToggle.addEventListener('click', () => {
                this.dom.sidebar.classList.toggle('open');
                this.dom.sidebarOverlay.classList.toggle('active');
            });

            this.dom.sidebarCloseBtn.addEventListener('click', () => this.closeMobileMenu());
            this.dom.sidebarOverlay.addEventListener('click', () => this.closeMobileMenu());

            // Header Quick Timer
            this.dom.headerTimerBtn.addEventListener('click', () => this.switchView('timer'));
            this.dom.dashboardLaunchTimerBtn.addEventListener('click', () => this.switchView('timer'));
            this.dom.btnViewAllTasks.addEventListener('click', () => this.switchView('tasks'));

            // Popstate handling for browser back/forward
            window.addEventListener('popstate', () => {
                const hash = window.location.hash.replace('#', '') || 'dashboard';
                if (hash !== this.currentView) {
                    this.switchView(hash, false);
                }
            });
        }

        closeMobileMenu() {
            this.dom.sidebar.classList.remove('open');
            this.dom.sidebarOverlay.classList.remove('active');
        }

        switchView(viewName, pushState = true) {
            const validViews = ['dashboard', 'tasks', 'planner', 'progress', 'timer', 'settings'];
            if (!validViews.includes(viewName)) viewName = 'dashboard';

            this.currentView = viewName;
            this.taskManager.settings.activeView = viewName;
            this.taskManager.saveSettings();

            if (pushState) {
                history.pushState(null, '', `#${viewName}`);
            }

            // Update Nav Active State
            this.dom.navLinks.forEach(l => {
                l.classList.toggle('active', l.dataset.view === viewName);
            });

            // Show active view container
            this.dom.viewContainers.forEach(container => {
                container.classList.toggle('active', container.id === `view-${viewName}`);
            });

            // Update Header Title
            const titles = {
                dashboard: { kicker: 'STUDENT PRODUCTIVITY', title: 'Dashboard' },
                tasks: { kicker: 'TASK MANAGEMENT', title: 'My Tasks' },
                planner: { kicker: 'WEEKLY SCHEDULE', title: 'Study Planner' },
                progress: { kicker: 'STUDY ANALYTICS', title: 'Progress & Insights' },
                timer: { kicker: 'FOCUS SESSION', title: 'Study Timer' },
                settings: { kicker: 'SYSTEM & DATA', title: 'Backup & Settings' }
            };
            const t = titles[viewName] || titles.dashboard;
            this.dom.currentViewKicker.textContent = t.kicker;
            this.dom.currentViewTitle.textContent = t.title;

            // Scroll to top of main content
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Re-render the active view
            this.renderCurrentView();
        }

        renderCurrentView() {
            switch (this.currentView) {
                case 'dashboard':
                    this.renderDashboard();
                    break;
                case 'tasks':
                    this.renderMyTasks();
                    break;
                case 'planner':
                    this.renderPlanner();
                    break;
                case 'progress':
                    this.renderAnalytics();
                    break;
                case 'timer':
                    this.renderTimer();
                    break;
                case 'settings':
                    this.syncSettingsInputs();
                    break;
            }
            this.updateBadgeCounts();
        }

        renderAll() {
            this.renderDashboard();
            this.renderMyTasks();
            this.renderPlanner();
            this.renderAnalytics();
            this.renderTimer();
            this.updateBadgeCounts();
            this.populateSubjectLists();
        }

        /* ==========================================================================
           EVENT LISTENERS & DELEGATION
           ========================================================================== */
        setupEventListeners() {
            // Global "+ Add Task" button triggers
            document.querySelectorAll('.add-task-trigger').forEach(btn => {
                btn.addEventListener('click', () => this.openTaskModal());
            });

            // Modal Controls
            this.dom.closeModal.addEventListener('click', () => this.closeTaskModal());
            this.dom.cancelTask.addEventListener('click', () => this.closeTaskModal());
            this.dom.taskModal.addEventListener('click', (e) => {
                if (e.target === this.dom.taskModal) this.closeTaskModal();
            });

            // Task Form Submit
            this.dom.taskForm.addEventListener('submit', (e) => this.handleTaskFormSubmit(e));

            // Dashboard Filter
            this.dom.dashboardTaskFilter.addEventListener('change', () => this.renderDashboardTasks());

            // My Tasks Search & Filter
            this.dom.taskSearchInput.addEventListener('input', () => {
                this.tasksFilterState.search = this.dom.taskSearchInput.value;
                this.dom.taskSearchClear.classList.toggle('hidden', !this.dom.taskSearchInput.value);
                this.renderMyTasks();
            });

            this.dom.taskSearchClear.addEventListener('click', () => {
                this.dom.taskSearchInput.value = '';
                this.tasksFilterState.search = '';
                this.dom.taskSearchClear.classList.add('hidden');
                this.renderMyTasks();
                this.dom.taskSearchInput.focus();
            });

            this.dom.filterSubject.addEventListener('change', (e) => {
                this.tasksFilterState.subject = e.target.value;
                this.renderMyTasks();
            });

            this.dom.filterPriority.addEventListener('change', (e) => {
                this.tasksFilterState.priority = e.target.value;
                this.renderMyTasks();
            });

            this.dom.sortTasksBy.addEventListener('change', (e) => {
                this.tasksFilterState.sortBy = e.target.value;
                this.renderMyTasks();
            });

            this.dom.statusTabButtons.forEach(tab => {
                tab.addEventListener('click', () => {
                    this.dom.statusTabButtons.forEach(b => {
                        b.classList.remove('active');
                        b.setAttribute('aria-selected', 'false');
                    });
                    tab.classList.add('active');
                    tab.setAttribute('aria-selected', 'true');
                    this.tasksFilterState.status = tab.dataset.status;
                    this.renderMyTasks();
                });
            });

            this.dom.btnQuickCleanCompleted.addEventListener('click', () => {
                const count = this.taskManager.clearCompleted();
                if (count > 0) {
                    this.showToast(`Cleaned up ${count} completed task${count > 1 ? 's' : ''}.`, 'success');
                    this.renderAll();
                } else {
                    this.showToast('No completed tasks to clean.', 'info');
                }
            });

            // Planner Navigation
            this.dom.plannerPrevWeek.addEventListener('click', () => {
                this.plannerMonday.setDate(this.plannerMonday.getDate() - 7);
                this.renderPlanner();
            });

            this.dom.plannerNextWeek.addEventListener('click', () => {
                this.plannerMonday.setDate(this.plannerMonday.getDate() + 7);
                this.renderPlanner();
            });

            this.dom.plannerTodayBtn.addEventListener('click', () => {
                this.plannerMonday = DateUtils.getMonday(new Date());
                this.renderPlanner();
            });

            // Weekly Goal Modal
            this.dom.btnOpenGoalModal.addEventListener('click', () => this.openGoalModal());
            this.dom.closeGoalModal.addEventListener('click', () => this.closeGoalModal());
            this.dom.cancelGoalModal.addEventListener('click', () => this.closeGoalModal());
            this.dom.goalModal.addEventListener('click', (e) => {
                if (e.target === this.dom.goalModal) this.closeGoalModal();
            });
            this.dom.goalForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const newGoal = Number(this.dom.goalInputHours.value);
                if (newGoal >= 1 && newGoal <= 100) {
                    this.taskManager.settings.weeklyGoal = newGoal;
                    this.taskManager.saveSettings();
                    this.closeGoalModal();
                    this.showToast(`Weekly goal updated to ${newGoal} hours!`, 'success');
                    this.renderAll();
                }
            });

            // Settings Preferences Form
            this.dom.settingsPreferencesForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.taskManager.settings.weeklyGoal = Number(this.dom.prefWeeklyGoal.value) || 10;
                this.taskManager.settings.focusMinutes = Number(this.dom.prefFocusTime.value) || 25;
                this.taskManager.settings.shortBreakMinutes = Number(this.dom.prefShortBreak.value) || 5;
                this.taskManager.settings.longBreakMinutes = Number(this.dom.prefLongBreak.value) || 15;
                this.taskManager.saveSettings();

                this.timer.initSettings();
                this.showToast('Study preferences saved successfully.', 'success');
                this.renderAll();
            });

            // Export & Import
            this.dom.btnExportData.addEventListener('click', () => {
                StorageManager.exportData(this.taskManager.tasks, this.taskManager.settings);
                this.showToast('StudyFlow backup downloaded.', 'success');
            });

            this.dom.btnTriggerImport.addEventListener('click', () => {
                this.dom.importFileInput.click();
            });

            this.dom.importFileInput.addEventListener('change', (e) => this.handleFileSelectedForImport(e));
            this.dom.closeImportModal.addEventListener('click', () => this.closeImportModal());
            this.dom.cancelImportModal.addEventListener('click', () => this.closeImportModal());
            this.dom.importModal.addEventListener('click', (e) => {
                if (e.target === this.dom.importModal) this.closeImportModal();
            });
            this.dom.confirmImportBtn.addEventListener('click', () => this.executeImport());

            // Clear All Data
            this.dom.btnClearAllData.addEventListener('click', () => {
                if (confirm('WARNING: Are you sure you want to permanently reset all StudyFlow tasks and study progress? This cannot be undone.')) {
                    localStorage.removeItem(StorageManager.TASKS_KEY);
                    localStorage.removeItem(StorageManager.SETTINGS_KEY);
                    this.taskManager = new TaskManager();
                    this.showToast('All StudyFlow data has been reset.', 'info');
                    this.renderAll();
                }
            });

            // Timer UI Controls
            this.dom.timerStartPauseBtn.addEventListener('click', () => {
                if (this.timer.isRunning) {
                    this.timer.pause();
                } else {
                    this.timer.start();
                }
            });

            this.dom.timerResetBtn.addEventListener('click', () => this.timer.reset());
            this.dom.timerSkipBtn.addEventListener('click', () => this.timer.skip());

            this.dom.miniTimerToggle.addEventListener('click', () => {
                if (this.timer.isRunning) {
                    this.timer.pause();
                } else {
                    this.timer.start();
                }
            });

            this.dom.timerModePills.forEach(pill => {
                pill.addEventListener('click', () => {
                    const mode = pill.dataset.mode;
                    this.timer.setMode(mode, false);
                });
            });

            this.dom.timerActiveTaskSelect.addEventListener('change', (e) => {
                this.timer.activeTaskId = e.target.value || null;
            });

            this.dom.timerSoundToggle.addEventListener('change', (e) => {
                this.taskManager.settings.soundEnabled = e.target.checked;
                this.taskManager.saveSettings();
            });

            this.dom.btnOpenTimerSettings.addEventListener('click', () => {
                this.switchView('settings');
            });
        }

        /**
         * Delegated event listeners for Task Items across Dashboard, My Tasks, and Planner
         */
        setupDelegatedEvents() {
            const handleTaskAction = (e) => {
                const target = e.target;
                const taskItem = target.closest('[data-task-id]');
                if (!taskItem) return;
                const taskId = taskItem.dataset.taskId;

                // 1. Toggle Checkbox
                if (target.closest('.task-check') || target.classList.contains('task-check')) {
                    const updated = this.taskManager.toggleTask(taskId);
                    if (updated) {
                        this.showToast(updated.completed ? 'Task marked completed!' : 'Task moved to pending.', 'success');
                        this.renderAll();
                    }
                    return;
                }

                // 2. Edit Action
                if (target.closest('.edit-trigger') || target.classList.contains('edit-trigger')) {
                    this.openTaskModal(taskId);
                    return;
                }

                // 3. Delete Action
                if (target.closest('.delete-trigger') || target.classList.contains('delete-trigger')) {
                    const deleted = this.taskManager.deleteTask(taskId);
                    if (deleted) {
                        this.showToast('Task deleted.', 'info', 'Undo', () => {
                            this.taskManager.undoDelete();
                            this.renderAll();
                        });
                        this.renderAll();
                    }
                    return;
                }

                // 4. Timer Trigger Action
                if (target.closest('.timer-trigger') || target.classList.contains('timer-trigger')) {
                    this.timer.activeTaskId = taskId;
                    this.switchView('timer');
                    this.timer.setMode('focus', true);
                    this.showToast(`Focus timer started for "${taskItem.dataset.taskTitle || 'Task'}"!`, 'info');
                    return;
                }

                // 5. Planner card click
                if (target.closest('.planner-task-card')) {
                    this.openTaskModal(taskId);
                }
            };

            this.dom.dashboardTaskList.addEventListener('click', handleTaskAction);
            this.dom.myTasksList.addEventListener('click', handleTaskAction);
            this.dom.plannerGrid.addEventListener('click', handleTaskAction);
        }

        setupKeyboardShortcuts() {
            document.addEventListener('keydown', (e) => {
                // Ignore shortcuts if actively typing in form controls
                const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
                const isTyping = ['input', 'select', 'textarea'].includes(activeTag) || (document.activeElement && document.activeElement.isContentEditable);

                // Escape key closes open modals
                if (e.key === 'Escape') {
                    if (!this.dom.taskModal.classList.contains('hidden')) {
                        this.closeTaskModal();
                    } else if (!this.dom.goalModal.classList.contains('hidden')) {
                        this.closeGoalModal();
                    } else if (!this.dom.importModal.classList.contains('hidden')) {
                        this.closeImportModal();
                    }
                    return;
                }

                if (isTyping) return;

                // 'n' -> New Task
                if (e.key === 'n' || e.key === 'N') {
                    e.preventDefault();
                    this.openTaskModal();
                }
                // 't' -> Timer view
                else if (e.key === 't' || e.key === 'T') {
                    e.preventDefault();
                    this.switchView('timer');
                }
            });
        }

        setupServiceWorker() {
            if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                    navigator.serviceWorker.register('./sw.js')
                        .then(reg => {
                            // Service worker registered
                        })
                        .catch(err => {
                            console.warn('StudyFlow: Service worker registration error:', err);
                        });
                });
            }
        }

        /* ==========================================================================
           TOAST NOTIFICATION ENGINE
           ========================================================================== */
        showToast(message, type = 'info', actionText = null, actionCallback = null) {
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.setAttribute('role', 'status');

            const textSpan = document.createElement('span');
            textSpan.textContent = message;
            toast.appendChild(textSpan);

            if (actionText && actionCallback) {
                const actionBtn = document.createElement('button');
                actionBtn.className = 'toast-action';
                actionBtn.type = 'button';
                actionBtn.textContent = actionText;
                actionBtn.addEventListener('click', () => {
                    actionCallback();
                    if (toast.parentNode) toast.remove();
                });
                toast.appendChild(actionBtn);
            }

            this.dom.toastContainer.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(10px)';
                toast.style.transition = 'all 0.3s ease';
                setTimeout(() => {
                    if (toast.parentNode) toast.remove();
                }, 300);
            }, 4500);
        }

        /* ==========================================================================
           RENDER: DASHBOARD VIEW
           ========================================================================== */
        renderDashboard() {
            const metrics = this.taskManager.getMetrics();

            // Date & Greeting
            const today = new Date();
            this.dom.dashboardDateLabel.textContent = today.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            }).toUpperCase();

            const hour = today.getHours();
            let greeting = 'Welcome back, Student!';
            if (hour < 12) greeting = 'Good morning, Student!';
            else if (hour < 18) greeting = 'Good afternoon, Student!';
            else greeting = 'Good evening, Student!';
            this.dom.dashboardGreeting.textContent = greeting;

            // Stats Cards
            this.dom.studyStreakText.textContent = `Study Streak: ${metrics.streak} day${metrics.streak > 1 ? 's' : ''}`;
            this.dom.totalTasks.textContent = metrics.totalTasks;
            this.dom.completedTasks.textContent = metrics.completedTasks;
            this.dom.pendingTasksCount.textContent = metrics.pendingTasks;
            this.dom.studyHours.textContent = metrics.weekCompletedHours.toFixed(1);
            this.dom.statAllTimeHours.textContent = metrics.allTimeCompletedHours.toFixed(1);
            this.dom.completionRate.textContent = `${metrics.completionRate}%`;

            // Goal Panel
            this.dom.weeklyHours.textContent = metrics.weekCompletedHours.toFixed(1);
            this.dom.weeklyGoalTarget.textContent = metrics.weeklyGoal.toFixed(1);
            this.dom.progressFill.style.width = `${metrics.goalPercentage}%`;
            this.dom.progressPercentage.textContent = `${metrics.goalPercentage}% completed`;

            if (metrics.goalPercentage >= 100) {
                this.dom.goalStatusBadge.textContent = '🎉 Goal Reached!';
                this.dom.goalStatusBadge.className = 'goal-badge reached';
                this.dom.progressRemainingText.textContent = `Weekly goal completed (+${(metrics.weekCompletedHours - metrics.weeklyGoal).toFixed(1)}h extra)`;
            } else {
                this.dom.goalStatusBadge.textContent = 'In Progress';
                this.dom.goalStatusBadge.className = 'goal-badge';
                this.dom.progressRemainingText.textContent = `${metrics.remainingHours.toFixed(1)} study hours to go`;
            }

            // Weekly Activity Bars (strictly current Monday-to-Sunday week)
            this.renderActivityHistogram();

            // Dashboard Task List
            this.renderDashboardTasks();

            // Upcoming Deadlines Widget
            this.renderDeadlines();
        }

        renderActivityHistogram() {
            const currentMonday = DateUtils.getMonday(new Date());
            const currentSunday = DateUtils.getSunday(new Date());
            const { activity, days, dayDates } = this.taskManager.getWeeklyActivity(currentMonday);

            const monLabel = currentMonday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const sunLabel = currentSunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            this.dom.activityWeekRange.textContent = `${monLabel} – ${sunLabel}`;

            const maxHours = Math.max(...Object.values(activity), 1);
            this.dom.activityBars.innerHTML = '';
            const today = new Date();

            days.forEach((day, idx) => {
                const dayDate = dayDates[idx];
                const isToday = DateUtils.isSameDay(dayDate, today);
                const hours = activity[day];
                const percent = (hours / maxHours) * 100;

                const dayContainer = document.createElement('div');
                dayContainer.className = 'activity-day';

                const bar = document.createElement('div');
                bar.className = `activity-bar${isToday ? ' today' : ''}`;
                bar.style.height = `${Math.max(6, percent)}%`;
                bar.title = `${dayDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${hours.toFixed(1)} study hours`;

                const label = document.createElement('span');
                label.textContent = day;
                if (isToday) label.style.color = 'var(--primary-color)';

                dayContainer.appendChild(bar);
                dayContainer.appendChild(label);
                this.dom.activityBars.appendChild(dayContainer);
            });
        }

        renderDashboardTasks() {
            const filter = this.dom.dashboardTaskFilter.value;
            const tasks = this.taskManager.getFilteredTasks({
                status: filter,
                sortBy: 'date-asc'
            }).slice(0, 6); // Keep dashboard concise

            this.dom.dashboardTaskList.innerHTML = '';
            this.dom.dashboardEmptyState.classList.toggle('hidden', tasks.length > 0);

            tasks.forEach(task => {
                this.dom.dashboardTaskList.appendChild(this.createTaskDOMItem(task));
            });
        }

        renderDeadlines() {
            const deadlines = this.taskManager.getUpcomingDeadlines(4);
            this.dom.deadlinesList.innerHTML = '';
            this.dom.deadlinesEmpty.classList.toggle('hidden', deadlines.length > 0);

            const todayStr = DateUtils.getTodayStr();

            deadlines.forEach(task => {
                const item = document.createElement('div');
                item.className = 'deadline-item';

                const info = document.createElement('div');
                info.className = 'deadline-info';

                const title = document.createElement('h5');
                title.textContent = task.title;

                const sub = document.createElement('p');
                sub.textContent = `${task.subject} • ${task.hours}h required`;
                info.appendChild(title);
                info.appendChild(sub);

                const badge = document.createElement('span');
                if (task.date < todayStr) {
                    badge.className = 'deadline-badge overdue';
                    badge.textContent = 'Overdue';
                } else if (task.date === todayStr) {
                    badge.className = 'deadline-badge today';
                    badge.textContent = 'Due Today';
                } else {
                    badge.className = 'deadline-badge upcoming';
                    badge.textContent = DateUtils.getDisplayDate(task.date);
                }

                item.appendChild(info);
                item.appendChild(badge);
                this.dom.deadlinesList.appendChild(item);
            });
        }

        /* ==========================================================================
           RENDER: MY TASKS VIEW
           ========================================================================== */
        renderMyTasks() {
            const tasks = this.taskManager.getFilteredTasks(this.tasksFilterState);

            this.dom.myTasksList.innerHTML = '';
            this.dom.myTasksEmptyState.classList.toggle('hidden', tasks.length > 0);

            tasks.forEach(task => {
                this.dom.myTasksList.appendChild(this.createTaskDOMItem(task));
            });

            // Summary text
            const total = this.taskManager.tasks.length;
            const shown = tasks.length;
            this.dom.filteredTaskSummary.textContent = shown === total
                ? `Showing all ${total} tasks`
                : `Showing ${shown} of ${total} tasks`;
        }

        createTaskDOMItem(task) {
            const item = document.createElement('div');
            item.className = `task-item${task.completed ? ' completed' : ''}`;
            item.dataset.taskId = task.id;
            item.dataset.taskTitle = task.title;

            // Check button
            const checkBtn = document.createElement('button');
            checkBtn.className = 'task-check';
            checkBtn.type = 'button';
            checkBtn.setAttribute('aria-label', task.completed ? 'Mark task as pending' : 'Mark task as completed');
            item.appendChild(checkBtn);

            // Details
            const details = document.createElement('div');
            details.className = 'task-details';

            const title = document.createElement('h4');
            title.textContent = task.title;
            details.appendChild(title);

            const metaLine = document.createElement('div');
            metaLine.className = 'task-meta-line';

            // Subject pill
            const color = SubjectColors.getColor(task.subject);
            const subjectSpan = document.createElement('span');
            subjectSpan.className = 'subject-pill';
            subjectSpan.style.borderColor = color.border;
            subjectSpan.style.color = color.text;
            subjectSpan.textContent = task.subject;
            metaLine.appendChild(subjectSpan);

            // Priority badge
            const priorityBadge = document.createElement('span');
            priorityBadge.className = `priority ${task.priority}`;
            const prioritySymbols = { high: '▲ High', medium: '■ Med', low: '▼ Low' };
            priorityBadge.textContent = prioritySymbols[task.priority] || task.priority;
            metaLine.appendChild(priorityBadge);

            // Due Date
            const dueSpan = document.createElement('span');
            dueSpan.textContent = `📅 ${DateUtils.getDisplayDate(task.date)}`;
            metaLine.appendChild(dueSpan);

            // Hours
            const hoursSpan = document.createElement('span');
            hoursSpan.textContent = `⏱️ ${task.hours}h`;
            metaLine.appendChild(hoursSpan);

            details.appendChild(metaLine);
            item.appendChild(details);

            // Actions
            const actions = document.createElement('div');
            actions.className = 'task-actions';

            if (!task.completed) {
                const timerBtn = document.createElement('button');
                timerBtn.className = 'task-action-btn timer-trigger';
                timerBtn.type = 'button';
                timerBtn.title = 'Start Pomodoro timer for this task';
                timerBtn.textContent = '⏱️ Focus';
                actions.appendChild(timerBtn);
            }

            const editBtn = document.createElement('button');
            editBtn.className = 'task-action-btn edit-trigger';
            editBtn.type = 'button';
            editBtn.title = 'Edit task';
            editBtn.textContent = 'Edit';
            actions.appendChild(editBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'task-action-btn delete-trigger';
            deleteBtn.type = 'button';
            deleteBtn.title = 'Delete task';
            deleteBtn.textContent = '×';
            actions.appendChild(deleteBtn);

            item.appendChild(actions);
            return item;
        }

        /* ==========================================================================
           RENDER: STUDY PLANNER VIEW (7-DAY WEEKLY CALENDAR)
           ========================================================================== */
        renderPlanner() {
            const monday = this.plannerMonday;
            const sunday = DateUtils.getSunday(monday);
            const weekDays = DateUtils.getWeekDays(monday);
            const today = new Date();

            const monText = monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const sunText = sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            this.dom.plannerWeekTitle.textContent = `Week of ${monText} – ${sunText}`;

            this.dom.plannerGrid.innerHTML = '';

            const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

            weekDays.forEach((dayDate, idx) => {
                const dateStr = DateUtils.formatDate(dayDate);
                const isToday = DateUtils.isSameDay(dayDate, today);
                const dayTasks = this.taskManager.tasks.filter(t => t.date === dateStr);

                const col = document.createElement('div');
                col.className = `planner-day-col${isToday ? ' today' : ''}`;

                // Header
                const header = document.createElement('div');
                header.className = 'planner-day-header';

                const info = document.createElement('div');
                info.className = 'planner-day-info';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'planner-day-name';
                nameSpan.textContent = isToday ? 'TODAY' : dayNames[idx];

                const dateSpan = document.createElement('span');
                dateSpan.className = 'planner-day-date';
                dateSpan.textContent = dayDate.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });

                info.appendChild(nameSpan);
                info.appendChild(dateSpan);

                // Quick add task for this specific date button
                const addBtn = document.createElement('button');
                addBtn.className = 'planner-add-task-btn';
                addBtn.type = 'button';
                addBtn.title = `Add task for ${dateStr}`;
                addBtn.textContent = '+';
                addBtn.addEventListener('click', () => {
                    this.openTaskModal(null, dateStr);
                });

                header.appendChild(info);
                header.appendChild(addBtn);
                col.appendChild(header);

                // Tasks Container
                const tasksContainer = document.createElement('div');
                tasksContainer.className = 'planner-tasks-container';

                if (dayTasks.length === 0) {
                    const empty = document.createElement('p');
                    empty.className = 'empty-desc';
                    empty.style.textAlign = 'center';
                    empty.style.marginTop = '24px';
                    empty.textContent = 'No tasks';
                    tasksContainer.appendChild(empty);
                } else {
                    dayTasks.forEach(task => {
                        const card = document.createElement('div');
                        card.className = `planner-task-card${task.completed ? ' completed' : ''}`;
                        card.dataset.taskId = task.id;

                        const cardTitle = document.createElement('div');
                        cardTitle.className = 'planner-task-title';
                        cardTitle.textContent = task.title;
                        card.appendChild(cardTitle);

                        const cardMeta = document.createElement('div');
                        cardMeta.className = 'planner-task-meta';

                        const color = SubjectColors.getColor(task.subject);
                        const subj = document.createElement('span');
                        subj.style.color = color.text;
                        subj.textContent = task.subject;

                        const hrs = document.createElement('span');
                        hrs.textContent = `${task.hours}h`;

                        cardMeta.appendChild(subj);
                        cardMeta.appendChild(hrs);
                        card.appendChild(cardMeta);

                        tasksContainer.appendChild(card);
                    });
                }

                col.appendChild(tasksContainer);
                this.dom.plannerGrid.appendChild(col);
            });
        }

        /* ==========================================================================
           RENDER: PROGRESS & ANALYTICS VIEW
           ========================================================================== */
        renderAnalytics() {
            const metrics = this.taskManager.getMetrics();
            const monthHours = this.taskManager.getMonthCompletedHours();

            this.dom.analyticsWeekHours.textContent = `${metrics.weekCompletedHours.toFixed(1)}h`;
            this.dom.analyticsWeekPercent.textContent = `${metrics.goalPercentage}% of ${metrics.weeklyGoal}h weekly goal`;
            this.dom.analyticsMonthHours.textContent = `${monthHours.toFixed(1)}h`;
            this.dom.analyticsAllTimeHours.textContent = `${metrics.allTimeCompletedHours.toFixed(1)}h`;
            this.dom.analyticsStreakDays.textContent = `${metrics.streak} Day${metrics.streak > 1 ? 's' : ''}`;

            // Subject Distribution
            const { items: subjects, totalSubjectHours } = this.taskManager.getSubjectDistribution();
            this.dom.subjectDistributionList.innerHTML = '';
            this.dom.subjectDistributionEmpty.classList.toggle('hidden', subjects.length > 0);

            subjects.forEach(item => {
                const row = document.createElement('div');
                row.className = 'subject-bar-row';

                const meta = document.createElement('div');
                meta.className = 'subject-bar-meta';

                const nameSpan = document.createElement('span');
                nameSpan.innerHTML = `<span style="color: ${item.color.border}">●</span> ${item.subject}`;

                const valSpan = document.createElement('strong');
                valSpan.textContent = `${item.hours.toFixed(1)}h (${item.percent}%)`;

                meta.appendChild(nameSpan);
                meta.appendChild(valSpan);

                const track = document.createElement('div');
                track.className = 'subject-bar-track';

                const fill = document.createElement('div');
                fill.className = 'subject-bar-fill';
                fill.style.width = `${item.percent}%`;
                fill.style.backgroundColor = item.color.border;

                track.appendChild(fill);
                row.appendChild(meta);
                row.appendChild(track);
                this.dom.subjectDistributionList.appendChild(row);
            });

            // Completion Ratio
            const total = metrics.totalTasks;
            const completed = metrics.completedTasks;
            const pending = metrics.pendingTasks;
            const compPercent = total > 0 ? (completed / total) * 100 : 0;
            const pendPercent = total > 0 ? (pending / total) * 100 : 100;

            this.dom.ratioBarCompleted.style.width = `${compPercent}%`;
            this.dom.ratioBarPending.style.width = `${pendPercent}%`;
            this.dom.ratioCompletedVal.textContent = completed;
            this.dom.ratioPendingVal.textContent = pending;

            // Priority distribution
            const highCount = this.taskManager.tasks.filter(t => t.priority === 'high').length;
            const medCount = this.taskManager.tasks.filter(t => t.priority === 'medium').length;
            const lowCount = this.taskManager.tasks.filter(t => t.priority === 'low').length;

            this.dom.priorityDistributionList.innerHTML = '';
            const pItems = [
                { label: 'High Priority', count: highCount, color: 'var(--danger-color)' },
                { label: 'Medium Priority', count: medCount, color: 'var(--warning-color)' },
                { label: 'Low Priority', count: lowCount, color: 'var(--success-color)' }
            ];

            pItems.forEach(p => {
                const pct = total > 0 ? Math.round((p.count / total) * 100) : 0;
                const row = document.createElement('div');
                row.className = 'subject-bar-row';
                row.innerHTML = `
                    <div class="subject-bar-meta">
                        <span>${p.label}</span>
                        <strong>${p.count} tasks (${pct}%)</strong>
                    </div>
                    <div class="subject-bar-track">
                        <div class="subject-bar-fill" style="width: ${pct}%; background-color: ${p.color};"></div>
                    </div>
                `;
                this.dom.priorityDistributionList.appendChild(row);
            });
        }

        /* ==========================================================================
           RENDER: STUDY TIMER VIEW
           ========================================================================== */
        renderTimer() {
            this.updateTimerUI(this.timer.getState());

            // Populate active task selector
            const pendingTasks = this.taskManager.tasks.filter(t => !t.completed);
            const currentSelected = this.dom.timerActiveTaskSelect.value;
            this.dom.timerActiveTaskSelect.innerHTML = '<option value="">General Study (Not linked to a task)</option>';

            pendingTasks.forEach(task => {
                const opt = document.createElement('option');
                opt.value = task.id;
                opt.textContent = `${task.title} (${task.subject}, ${task.hours}h)`;
                if (task.id === this.timer.activeTaskId || task.id === currentSelected) {
                    opt.selected = true;
                }
                this.dom.timerActiveTaskSelect.appendChild(opt);
            });

            this.dom.timerSoundToggle.checked = this.taskManager.settings.soundEnabled !== false;
        }

        updateTimerUI(state) {
            // Defensive guard: this.timer may be null during the brief window when
            // StudyTimer's constructor fires onTick() before the assignment completes.
            // Also guards against missing DOM elements in unusual environments.
            if (!this.timer || !this.dom || !this.dom.mainTimerDigits) return;

            const timeFormatted = this.timer.formatTime(state.remainingSeconds);

            // 1. Digital Display
            this.dom.mainTimerDigits.textContent = timeFormatted;
            this.dom.miniTimerDigits.textContent = timeFormatted;

            // 2. Mode Label
            const phaseLabels = {
                focus: 'FOCUS SESSION',
                shortBreak: 'SHORT BREAK',
                longBreak: 'LONG BREAK'
            };
            this.dom.mainTimerPhase.textContent = phaseLabels[state.mode] || 'FOCUS INTERVAL';

            // 3. SVG Circular Progress Ring
            // Radius is 90 -> Circumference is ~565.48
            const circumference = 565.48;
            const fraction = (state.totalSeconds - state.remainingSeconds) / state.totalSeconds;
            const offset = circumference - fraction * circumference;
            this.dom.timerProgressSvg.style.strokeDashoffset = offset;

            // 4. Mode Pills
            this.dom.timerModePills.forEach(pill => {
                pill.classList.toggle('active', pill.dataset.mode === state.mode);
            });

            // 5. Start/Pause Button Text
            if (state.isRunning) {
                this.dom.timerStartPauseBtn.textContent = 'Pause';
                this.dom.timerStartPauseBtn.classList.remove('timer-btn-primary');
                this.dom.timerStartPauseBtn.classList.add('timer-btn-secondary');
                this.dom.miniTimerPlayIcon.classList.add('hidden');
                this.dom.miniTimerPauseIcon.classList.remove('hidden');
                this.dom.headerTimerDot.classList.add('active');
                this.dom.headerTimerText.textContent = timeFormatted;
            } else {
                this.dom.timerStartPauseBtn.textContent = state.remainingSeconds === state.totalSeconds ? `Start ${state.mode === 'focus' ? 'Focus' : 'Break'}` : 'Resume';
                this.dom.timerStartPauseBtn.classList.add('timer-btn-primary');
                this.dom.timerStartPauseBtn.classList.remove('timer-btn-secondary');
                this.dom.miniTimerPlayIcon.classList.remove('hidden');
                this.dom.miniTimerPauseIcon.classList.add('hidden');
                this.dom.headerTimerDot.classList.remove('active');
                this.dom.headerTimerText.textContent = `Timer ${timeFormatted}`;
            }
        }

        handleTimerCompleted(completion) {
            if (completion.mode === 'focus') {
                const mins = Math.round(completion.durationSeconds / 60);
                this.showToast(`🎉 Focus session complete! Logged ${mins} minutes to study progress.`, 'success');
                this.renderAll();
            } else {
                this.showToast('Break finished! Ready to focus again?', 'info');
            }
        }

        /* ==========================================================================
           MODAL MANAGERS & FORM SUBMISSION
           ========================================================================== */
        openTaskModal(editTaskId = null, defaultDate = null) {
            this.clearFormErrors();
            this.populateSubjectLists();

            if (editTaskId) {
                const task = this.taskManager.tasks.find(t => t.id === editTaskId);
                if (!task) return;
                this.dom.modalTitle.textContent = 'Edit Task';
                this.dom.taskTitleInput.value = task.title;
                this.dom.taskSubjectInput.value = task.subject;
                this.dom.taskPriorityInput.value = task.priority;
                this.dom.taskHoursInput.value = task.hours;
                this.dom.taskDateInput.value = task.date;
                this.dom.taskForm.dataset.editingId = editTaskId;
            } else {
                this.dom.modalTitle.textContent = 'Add New Task';
                this.dom.taskForm.reset();
                this.dom.taskDateInput.value = defaultDate || DateUtils.getTodayStr();
                this.dom.taskHoursInput.value = '1';
                this.dom.taskPriorityInput.value = 'medium';
                delete this.dom.taskForm.dataset.editingId;
            }

            this.dom.taskModal.classList.remove('hidden');
            setTimeout(() => this.dom.taskTitleInput.focus(), 50);
        }

        closeTaskModal() {
            this.dom.taskModal.classList.add('hidden');
            this.dom.taskForm.reset();
            delete this.dom.taskForm.dataset.editingId;
            this.clearFormErrors();
        }

        clearFormErrors() {
            this.dom.errTaskTitle.textContent = '';
            this.dom.errTaskSubject.textContent = '';
            this.dom.errTaskDate.textContent = '';
        }

        handleTaskFormSubmit(e) {
            e.preventDefault();
            this.clearFormErrors();

            const title = this.dom.taskTitleInput.value.trim();
            const subject = this.dom.taskSubjectInput.value.trim() || 'General';
            const priority = this.dom.taskPriorityInput.value;
            const hours = Number(this.dom.taskHoursInput.value);
            const date = this.dom.taskDateInput.value;

            let hasError = false;
            if (!title) {
                this.dom.errTaskTitle.textContent = 'Please enter a task title.';
                hasError = true;
            }
            if (!subject) {
                this.dom.errTaskSubject.textContent = 'Please enter or select a subject.';
                hasError = true;
            }
            if (!date) {
                this.dom.errTaskDate.textContent = 'Please choose a due date.';
                hasError = true;
            }
            if (!hours || hours <= 0 || !Number.isFinite(hours)) {
                hasError = true;
            }

            if (hasError) return;

            const editingId = this.dom.taskForm.dataset.editingId;
            if (editingId) {
                this.taskManager.updateTask(editingId, { title, subject, priority, hours, date });
                this.showToast('Task updated successfully.', 'success');
            } else {
                this.taskManager.addTask({ title, subject, priority, hours, date });
                this.showToast('Task added to your study schedule.', 'success');
            }

            this.closeTaskModal();
            this.renderAll();
        }

        openGoalModal() {
            this.dom.goalInputHours.value = this.taskManager.settings.weeklyGoal || 10;
            this.dom.goalModal.classList.remove('hidden');
            setTimeout(() => this.dom.goalInputHours.focus(), 50);
        }

        closeGoalModal() {
            this.dom.goalModal.classList.add('hidden');
        }

        /* ==========================================================================
           DATA IMPORT HANDLERS
           ========================================================================== */
        handleFileSelectedForImport(e) {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const json = JSON.parse(event.target.result);
                    let rawTasks = [];
                    let rawSettings = {};

                    if (Array.isArray(json)) {
                        rawTasks = json;
                    } else if (json && typeof json === 'object') {
                        if (Array.isArray(json.tasks)) rawTasks = json.tasks;
                        if (json.settings && typeof json.settings === 'object') rawSettings = json.settings;
                    } else {
                        throw new Error('Invalid StudyFlow backup file structure');
                    }

                    const validTasks = [];
                    for (const item of rawTasks) {
                        const t = StorageManager.normalizeTask(item);
                        if (t) validTasks.push(t);
                    }

                    if (validTasks.length === 0 && Object.keys(rawSettings).length === 0) {
                        alert('The selected file contains no valid StudyFlow tasks or settings.');
                        return;
                    }

                    this.pendingImportData = { tasks: validTasks, settings: rawSettings };
                    this.openImportModal(validTasks.length, Object.keys(rawSettings).length > 0);
                } catch (err) {
                    alert('Error reading JSON file: ' + err.message);
                } finally {
                    this.dom.importFileInput.value = '';
                }
            };
            reader.readAsText(file);
        }

        openImportModal(taskCount, hasSettings) {
            this.dom.importPreviewStats.innerHTML = `
                <li><strong>Tasks Found:</strong> ${taskCount} valid task${taskCount > 1 ? 's' : ''}</li>
                <li><strong>Custom Settings:</strong> ${hasSettings ? 'Included' : 'None'}</li>
            `;
            this.dom.importModal.classList.remove('hidden');
        }

        closeImportModal() {
            this.dom.importModal.classList.add('hidden');
            this.pendingImportData = null;
        }

        executeImport() {
            if (!this.pendingImportData) return;

            const modeRadio = document.querySelector('input[name="import-mode"]:checked');
            const mode = modeRadio ? modeRadio.value : 'merge';

            if (mode === 'replace') {
                this.taskManager.tasks = this.pendingImportData.tasks;
                if (this.pendingImportData.settings && Object.keys(this.pendingImportData.settings).length > 0) {
                    this.taskManager.settings = {
                        ...this.taskManager.settings,
                        ...this.pendingImportData.settings
                    };
                    this.taskManager.saveSettings();
                }
            } else {
                // Merge: add non-duplicate tasks
                const existingIds = new Set(this.taskManager.tasks.map(t => t.id));
                for (const imported of this.pendingImportData.tasks) {
                    if (existingIds.has(imported.id)) {
                        // Regenerate ID to avoid collisions
                        imported.id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString() + Math.random();
                    }
                    this.taskManager.tasks.push(imported);
                }
            }

            this.taskManager.save();
            this.closeImportModal();
            this.showToast(`Imported ${this.pendingImportData.tasks.length} tasks successfully!`, 'success');
            this.renderAll();
        }

        /* ==========================================================================
           HELPERS & STATE SYNC
           ========================================================================== */
        updateBadgeCounts() {
            const pending = this.taskManager.tasks.filter(t => !t.completed).length;
            const completed = this.taskManager.tasks.filter(t => t.completed).length;
            const total = this.taskManager.tasks.length;

            this.dom.navPendingCount.textContent = pending;
            this.dom.countTabAll.textContent = total;
            this.dom.countTabPending.textContent = pending;
            this.dom.countTabCompleted.textContent = completed;
        }

        populateSubjectLists() {
            const subjects = this.taskManager.getDistinctSubjects();

            // 1. Datalist for task form suggestions
            this.dom.subjectSuggestions.innerHTML = '';
            subjects.forEach(sub => {
                const opt = document.createElement('option');
                opt.value = sub;
                this.dom.subjectSuggestions.appendChild(opt);
            });

            // 2. Filter dropdown in My Tasks
            const currentSelected = this.dom.filterSubject.value;
            this.dom.filterSubject.innerHTML = '<option value="all">All Subjects</option>';
            subjects.forEach(sub => {
                const opt = document.createElement('option');
                opt.value = sub;
                opt.textContent = sub;
                if (sub === currentSelected) opt.selected = true;
                this.dom.filterSubject.appendChild(opt);
            });
        }

        syncSettingsInputs() {
            const s = this.taskManager.settings;
            this.dom.prefWeeklyGoal.value = s.weeklyGoal || 10;
            this.dom.prefFocusTime.value = s.focusMinutes || 25;
            this.dom.prefShortBreak.value = s.shortBreakMinutes || 5;
            this.dom.prefLongBreak.value = s.longBreakMinutes || 15;
        }
    }

    /* ==========================================================================
       8. APPLICATION BOOTSTRAP
       ========================================================================== */
    document.addEventListener('DOMContentLoaded', () => {
        window.studyFlowApp = new UIController();
    });

})();