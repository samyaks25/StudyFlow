// StudyFlow Automated Test Suite
// Run with: node tests/test-runner.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        testsPassed++;
    } catch (err) {
        console.error(`  ✗ ${name}`);
        console.error(`    ${err.message}`);
        testsFailed++;
    }
}

console.log('\n--- 1. Testing DateUtils ---');

// Mock DateUtils as implemented in script.js
const DateUtils = {
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
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    getMonday(dateObj) {
        const d = new Date(dateObj);
        const day = d.getDay();
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

test('parseDate accurately sets midday to prevent midnight UTC rollback', () => {
    const d = DateUtils.parseDate('2026-09-18');
    assert.strictEqual(d.getFullYear(), 2026);
    assert.strictEqual(d.getMonth(), 8); // 0-indexed September is 8
    assert.strictEqual(d.getDate(), 18);
    assert.strictEqual(d.getHours(), 12);
});

test('getMonday identifies correct Monday from any day of week', () => {
    // Sunday Sep 20, 2026 -> Monday was Sep 14, 2026
    const sunday = new Date(2026, 8, 20, 15, 0, 0);
    const mon = DateUtils.getMonday(sunday);
    assert.strictEqual(DateUtils.formatDate(mon), '2026-09-14');

    // Wednesday Sep 16, 2026 -> Monday is Sep 14, 2026
    const wed = new Date(2026, 8, 16, 10, 0, 0);
    assert.strictEqual(DateUtils.formatDate(DateUtils.getMonday(wed)), '2026-09-14');
});

test('Week boundary crossing across month/year works seamlessly', () => {
    // Jan 1, 2026 (Thursday) -> Monday was Dec 29, 2025
    const jan1 = new Date(2026, 0, 1);
    const mon = DateUtils.getMonday(jan1);
    assert.strictEqual(DateUtils.formatDate(mon), '2025-12-29');

    const sun = DateUtils.getSunday(jan1);
    assert.strictEqual(DateUtils.formatDate(sun), '2026-01-04');

    const days = DateUtils.getWeekDays(mon);
    assert.strictEqual(days.length, 7);
    assert.strictEqual(DateUtils.formatDate(days[0]), '2025-12-29');
    assert.strictEqual(DateUtils.formatDate(days[6]), '2026-01-04');
});

console.log('\n--- 2. Testing StorageManager & Task Normalization ---');

const StorageManager = {
    normalizeTask(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : 'gen-id';
        const title = typeof raw.title === 'string' ? raw.title.trim() : '';
        if (!title) return null;
        const subject = typeof raw.subject === 'string' && raw.subject.trim() ? raw.subject.trim() : 'General';
        const validPriorities = ['high', 'medium', 'low'];
        const priority = validPriorities.includes(raw.priority) ? raw.priority : 'medium';
        const hours = Number(raw.hours) > 0 && Number.isFinite(Number(raw.hours)) ? Math.min(24, Math.max(0.25, Number(raw.hours))) : 1;
        const date = typeof raw.date === 'string' && raw.date.trim() ? raw.date.trim() : '2026-09-18';
        const completed = Boolean(raw.completed);
        const completedAt = raw.completedAt && !isNaN(new Date(raw.completedAt).getTime()) ? new Date(raw.completedAt).toISOString() : (completed ? new Date().toISOString() : null);
        const createdAt = raw.createdAt && !isNaN(new Date(raw.createdAt).getTime()) ? new Date(raw.createdAt).toISOString() : new Date().toISOString();

        return { id, title, subject, priority, hours, date, completed, completedAt, createdAt };
    }
};

test('normalizeTask sanitizes invalid priority and missing fields', () => {
    const raw = {
        title: 'Study Physics',
        priority: 'hacked_class" onmouseover="alert(1)',
        hours: -5,
        completed: true
    };
    const norm = StorageManager.normalizeTask(raw);
    assert.strictEqual(norm.title, 'Study Physics');
    assert.strictEqual(norm.priority, 'medium'); // sanitized to default
    assert.strictEqual(norm.hours, 1); // negative hours clamped to 1
    assert.strictEqual(norm.subject, 'General'); // default subject
    assert.strictEqual(norm.completed, true);
    assert(norm.completedAt !== null);
});

test('normalizeTask rejects tasks without title', () => {
    assert.strictEqual(StorageManager.normalizeTask({ title: '   ' }), null);
    assert.strictEqual(StorageManager.normalizeTask(null), null);
    assert.strictEqual(StorageManager.normalizeTask('not an object'), null);
});

console.log('\n--- 3. Testing TaskManager CRUD & Metrics ---');

class MockTaskManager {
    constructor() {
        this.tasks = [];
        this.settings = { weeklyGoal: 10 };
    }

    addTask(data) {
        const t = StorageManager.normalizeTask(data);
        if (t) {
            this.tasks.push(t);
            return t;
        }
        return null;
    }

    toggleTask(id) {
        const t = this.tasks.find(item => item.id === id);
        if (t) {
            t.completed = !t.completed;
            t.completedAt = t.completed ? new Date().toISOString() : null;
        }
        return t;
    }

    getFilteredTasks(opts = {}) {
        let res = [...this.tasks];
        if (opts.status === 'pending') res = res.filter(t => !t.completed);
        if (opts.status === 'completed') res = res.filter(t => t.completed);
        if (opts.subject && opts.subject !== 'all') res = res.filter(t => t.subject === opts.subject);
        if (opts.priority && opts.priority !== 'all') res = res.filter(t => t.priority === opts.priority);
        if (opts.search) {
            const q = opts.search.toLowerCase();
            res = res.filter(t => t.title.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q));
        }
        return res;
    }

    getMetrics() {
        const totalTasks = this.tasks.length;
        const completedTasks = this.tasks.filter(t => t.completed).length;
        const currentMonday = DateUtils.getMonday(new Date());
        const currentSunday = DateUtils.getSunday(new Date());

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
        const weeklyGoal = this.settings.weeklyGoal || 10;
        const goalPercentage = Math.min(100, Math.round((weekCompletedHours / weeklyGoal) * 100));

        return {
            totalTasks,
            completedTasks,
            pendingTasks: totalTasks - completedTasks,
            weekCompletedHours,
            allTimeCompletedHours,
            goalPercentage
        };
    }
}

test('TaskManager correctly filters and computes metrics', () => {
    const tm = new MockTaskManager();
    tm.addTask({ id: '1', title: 'Calculus Assignment', subject: 'Math', priority: 'high', hours: 2, completed: false });
    tm.addTask({ id: '2', title: 'Data Structures Lab', subject: 'CS', priority: 'medium', hours: 3, completed: false });
    tm.addTask({ id: '3', title: 'Physics Notes', subject: 'Physics', priority: 'low', hours: 1.5, completed: false });

    assert.strictEqual(tm.tasks.length, 3);
    assert.strictEqual(tm.getFilteredTasks({ status: 'pending' }).length, 3);

    // Complete task 1 today
    tm.toggleTask('1');
    assert.strictEqual(tm.getFilteredTasks({ status: 'completed' }).length, 1);
    assert.strictEqual(tm.getFilteredTasks({ status: 'pending' }).length, 2);

    // Complete task 2 with completion date 3 weeks ago (historical task!)
    tm.toggleTask('2');
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 25);
    tm.tasks.find(t => t.id === '2').completedAt = oldDate.toISOString();

    const metrics = tm.getMetrics();
    // Task 1 (2h) was done this week. Task 2 (3h) was done 25 days ago.
    // So weekCompletedHours must be 2.0, while allTimeCompletedHours must be 5.0!
    assert.strictEqual(metrics.weekCompletedHours, 2);
    assert.strictEqual(metrics.allTimeCompletedHours, 5);
    assert.strictEqual(metrics.goalPercentage, 20); // 2h out of 10h = 20%
});

test('Search filter matches case-insensitively across title and subject', () => {
    const tm = new MockTaskManager();
    tm.addTask({ id: '1', title: 'Read Machine Learning Paper', subject: 'Artificial Intelligence' });
    tm.addTask({ id: '2', title: 'Solve Differential Equations', subject: 'Calculus' });

    assert.strictEqual(tm.getFilteredTasks({ search: 'machine' }).length, 1);
    assert.strictEqual(tm.getFilteredTasks({ search: 'intelligence' }).length, 1);
    assert.strictEqual(tm.getFilteredTasks({ search: 'CALCULUS' }).length, 1);
    assert.strictEqual(tm.getFilteredTasks({ search: 'nonexistent' }).length, 0);
});

console.log('\n--- 4. Testing HTML & Script DOM ID Integrity ---');

test('All elements queried by script.js exist in index.html', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf-8');
    const js = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf-8');

    // Extract all document.getElementById("...") from script.js
    const regex = /document\.getElementById\(['"]([a-zA-Z0-9_-]+)['"]\)/g;
    let match;
    const requiredIds = new Set();
    while ((match = regex.exec(js)) !== null) {
        requiredIds.add(match[1]);
    }

    const missing = [];
    for (const id of requiredIds) {
        if (!html.includes(`id="${id}"`)) {
            missing.push(id);
        }
    }

    if (missing.length > 0) {
        throw new Error(`Missing IDs in index.html: ${missing.join(', ')}`);
    }
    assert.strictEqual(missing.length, 0);
});

console.log('\n--- 5. Testing Manifest & Service Worker ---');

test('manifest.json has valid JSON and required PWA fields', () => {
    const manifestRaw = fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf-8');
    const manifest = JSON.parse(manifestRaw);
    assert.strictEqual(manifest.name, 'StudyFlow - Student Productivity & Study Planner');
    assert.strictEqual(manifest.display, 'standalone');
    assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
});

test('sw.js exists and references relative assets', () => {
    const sw = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf-8');
    assert(sw.includes('./index.html'));
    assert(sw.includes('./style.css'));
    assert(sw.includes('./script.js'));
});

console.log(`\nTest Results: ${testsPassed} passed, ${testsFailed} failed\n`);
if (testsFailed > 0) {
    process.exit(1);
}
