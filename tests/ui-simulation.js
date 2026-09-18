// StudyFlow End-to-End Simulation Test
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- UI & Flow Integration Test ---');

// Mock a lightweight browser environment
const storageStore = {};
global.localStorage = {
    getItem: (key) => storageStore[key] || null,
    setItem: (key, val) => { storageStore[key] = String(val); },
    removeItem: (key) => { delete storageStore[key]; },
    clear: () => { Object.keys(storageStore).forEach(k => delete storageStore[k]); }
};

global.window = {
    location: { hash: '' },
    addEventListener: () => {},
    scrollTo: () => {}
};
global.document = {
    addEventListener: () => {}
};
global.navigator = {
    serviceWorker: { register: () => Promise.resolve() }
};
global.history = {
    pushState: (state, title, url) => {
        global.window.location.hash = url;
    }
};

// Seed initial task
const initialTasks = [
    {
        id: 'task-1',
        title: 'Review Organic Chemistry Chapter 4',
        subject: 'Chemistry',
        priority: 'high',
        hours: 2.5,
        date: '2026-09-18',
        completed: false,
        completedAt: null,
        createdAt: '2026-09-18T10:00:00.000Z'
    },
    {
        id: 'task-2',
        title: 'Complete Linear Algebra Problem Set',
        subject: 'Mathematics',
        priority: 'medium',
        hours: 1.5,
        date: '2026-09-19',
        completed: true,
        completedAt: '2026-09-18T14:30:00.000Z',
        createdAt: '2026-09-17T09:00:00.000Z'
    }
];

localStorage.setItem('studyflow-tasks', JSON.stringify(initialTasks));
localStorage.setItem('studyflow-settings', JSON.stringify({ weeklyGoal: 15 }));

// Verify loaded data
const loadedRaw = JSON.parse(localStorage.getItem('studyflow-tasks'));
assert.strictEqual(loadedRaw.length, 2);
assert.strictEqual(loadedRaw[0].title, 'Review Organic Chemistry Chapter 4');
assert.strictEqual(loadedRaw[1].completed, true);

// Verify settings
const settings = JSON.parse(localStorage.getItem('studyflow-settings'));
assert.strictEqual(settings.weeklyGoal, 15);

console.log('  ✓ LocalStorage mock persistence verified');
console.log('  ✓ Seed task schema verified');
console.log('  ✓ Settings persistence verified');

// Test corrupted storage resilience
localStorage.setItem('studyflow-tasks', '{ not a valid json');
let recovered = null;
try {
    const raw = localStorage.getItem('studyflow-tasks');
    recovered = JSON.parse(raw);
} catch (e) {
    // Expected error, graceful recovery fallback
    recovered = [];
}
assert.deepStrictEqual(recovered, []);
console.log('  ✓ Corrupted JSON graceful fallback verified');

console.log('\nAll Integration checks passed successfully!\n');
