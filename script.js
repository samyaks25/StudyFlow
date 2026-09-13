
/* =========================================
   STUDYFLOW - TASK MANAGEMENT
   ========================================= */

// Store all tasks in an array.
let tasks = JSON.parse(localStorage.getItem("studyflow-tasks")) || [];

// Get references to HTML elements.
const taskList = document.getElementById("task-list");
const emptyState = document.getElementById("empty-state");
const taskFilter = document.getElementById("task-filter");

const totalTasksElement = document.getElementById("total-tasks");
const completedTasksElement = document.getElementById("completed-tasks");
const studyHoursElement = document.getElementById("study-hours");
const completionRateElement = document.getElementById("completion-rate");

const weeklyHoursElement = document.getElementById("weekly-hours");
const progressFill = document.getElementById("progress-fill");
const progressPercentage = document.getElementById("progress-percentage");
const activityBars = document.getElementById("activity-bars");

// Modal elements.
const taskModal = document.getElementById("task-modal");
const addTaskButton = document.getElementById("add-task-button");
const closeModalButton = document.getElementById("close-modal");
const cancelTaskButton = document.getElementById("cancel-task");
const taskForm = document.getElementById("task-form");

// Form fields.
const taskTitleInput = document.getElementById("task-title");
const taskSubjectInput = document.getElementById("task-subject");
const taskPriorityInput = document.getElementById("task-priority");
const taskHoursInput = document.getElementById("task-hours");
const taskDateInput = document.getElementById("task-date");
/* =========================================
   STORAGE
   ========================================= */

// Save the current tasks to browser storage.
function saveTasks() {
    localStorage.setItem("studyflow-tasks", JSON.stringify(tasks));
}

/* =========================================
   MODAL FUNCTIONS
   ========================================= */

function openModal() {
    taskModal.classList.remove("hidden");

    const today = new Date().toISOString().split("T")[0];

    taskDateInput.value = today;
    taskTitleInput.focus();
}

function closeModal() {
    taskModal.classList.add("hidden");

    taskForm.reset();

    taskHoursInput.value = "1";
}

addTaskButton.addEventListener("click", openModal);
closeModalButton.addEventListener("click", closeModal);
cancelTaskButton.addEventListener("click", closeModal);

// Close the modal when clicking outside the form.
taskModal.addEventListener("click", function (event) {
    if (event.target === taskModal) {
        closeModal();
    }
});

/* =========================================
   ADD TASK
   ========================================= */

taskForm.addEventListener("submit", function (event) {
    event.preventDefault();

   const title = taskTitleInput.value.trim();
const subject = taskSubjectInput.value.trim();
const priority = taskPriorityInput.value;
const hours = Number(taskHoursInput.value);
const taskDate = taskDateInput.value;
   if (
    !title ||
    !subject ||
    !taskDate ||
    !Number.isFinite(hours) ||
    hours < 0
) {
    return;
}

    const newTask = {
    id: crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString(),

    title: title,
    subject: subject,
    priority: priority,
    hours: hours,
    date: taskDate,
    completed: false,
    completedAt: null,
    createdAt: new Date().toISOString()
};
    tasks.push(newTask);

    saveTasks();
    renderDashboard();
    closeModal();
});

/* =========================================
   TASK ACTIONS
   ========================================= */

// Toggle a task between completed and pending.
function toggleTask(taskId) {
    tasks = tasks.map(function (task) {

        if (task.id === taskId) {

            const isCompleting = !task.completed;

            return {
                ...task,
                completed: isCompleting,
                completedAt: isCompleting
                    ? new Date().toISOString()
                    : null
            };
        }

        return task;
    });

    saveTasks();
    renderDashboard();
}

// Delete a task.
function deleteTask(taskId) {
    tasks = tasks.filter(function (task) {
        return task.id !== taskId;
    });

    saveTasks();
    renderDashboard();
}

/* =========================================
   RENDER TASKS
   ========================================= */

function renderTasks() {

    const filter = taskFilter.value;

    let filteredTasks = tasks;

    if (filter === "pending") {
        filteredTasks = tasks.filter(function (task) {
            return !task.completed;
        });
    }

    if (filter === "completed") {
        filteredTasks = tasks.filter(function (task) {
            return task.completed;
        });
    }

    taskList.innerHTML = "";

    emptyState.style.display =
        filteredTasks.length === 0 ? "block" : "none";

    filteredTasks.forEach(function (task) {

        const taskItem = document.createElement("div");
        taskItem.className = "task-item";

        if (task.completed) {
            taskItem.classList.add("completed");
        }

        const checkButton = document.createElement("button");
        checkButton.className = "task-check";
        checkButton.type = "button";
        checkButton.setAttribute(
            "aria-label",
            task.completed
                ? "Mark task as pending"
                : "Mark task as completed"
        );

        const taskDetails = document.createElement("div");
        taskDetails.className = "task-details";

        const taskTitle = document.createElement("h4");
        taskTitle.textContent = task.title;

      const taskSubject = document.createElement("p");

const formattedDate = task.date
    ? new Date(`${task.date}T00:00:00`).toLocaleDateString(
        undefined,
        {
            month: "short",
            day: "numeric"
        }
    )
    : "No date";

taskSubject.textContent =
    `${task.subject} • ${formattedDate}`;
        taskDetails.appendChild(taskTitle);
        taskDetails.appendChild(taskSubject);

        const priorityBadge = document.createElement("span");
        priorityBadge.className = `priority ${task.priority}`;
        priorityBadge.textContent =
            task.priority.charAt(0).toUpperCase() +
            task.priority.slice(1);

        const deleteButton = document.createElement("button");
        deleteButton.className = "task-delete";
        deleteButton.type = "button";
        deleteButton.textContent = "×";
        deleteButton.setAttribute("aria-label", "Delete task");

        checkButton.addEventListener("click", function () {
            toggleTask(task.id);
        });

        deleteButton.addEventListener("click", function () {
            deleteTask(task.id);
        });

        taskItem.appendChild(checkButton);
        taskItem.appendChild(taskDetails);
        taskItem.appendChild(priorityBadge);
        taskItem.appendChild(deleteButton);

        taskList.appendChild(taskItem);
    });
}

/* =========================================
   UPDATE STATISTICS
   ========================================= */

function updateStatistics() {

    const totalTasks = tasks.length;

    const completedTasks = tasks.filter(function (task) {
        return task.completed;
    }).length;

    const totalHours = tasks.reduce(function (sum, task) {
        return sum + task.hours;
    }, 0);

    const completionRate = totalTasks === 0
        ? 0
        : Math.round((completedTasks / totalTasks) * 100);

    totalTasksElement.textContent = totalTasks;
    completedTasksElement.textContent = completedTasks;
    studyHoursElement.textContent = totalHours.toFixed(1);
    completionRateElement.textContent = `${completionRate}%`;
}

/* =========================================
   UPDATE PROGRESS
   ========================================= */

function updateProgress() {

    const completedHours = tasks
        .filter(function (task) {
            return task.completed;
        })
        .reduce(function (sum, task) {
            return sum + task.hours;
        }, 0);

    const weeklyGoal = 10;

    const percentage = Math.min(
        Math.round((completedHours / weeklyGoal) * 100),
        100
    );

    weeklyHoursElement.textContent = completedHours.toFixed(1);
    progressFill.style.width = `${percentage}%`;
    progressPercentage.textContent = `${percentage}% completed`;
}

/* =========================================
   WEEKLY ACTIVITY
   ========================================= */

function renderActivityBars() {

    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const activity = {
        Mon: 0,
        Tue: 0,
        Wed: 0,
        Thu: 0,
        Fri: 0,
        Sat: 0,
        Sun: 0
    };

    tasks.forEach(function (task) {

        if (!task.completed || !task.completedAt) {
            return;
        }

        const date = new Date(task.completedAt);

        const dayIndex = date.getDay();

        const dayName =
            days[(dayIndex + 6) % 7];

        activity[dayName] += task.hours;
    });

    const maxHours = Math.max(
        ...Object.values(activity),
        1
    );

    activityBars.innerHTML = "";

    days.forEach(function (day) {

        const dayContainer =
            document.createElement("div");

        dayContainer.className = "activity-day";

        const bar =
            document.createElement("div");

        bar.className = "activity-bar";

        const percentage =
            (activity[day] / maxHours) * 100;

        bar.style.height =
            `${Math.max(5, percentage)}%`;

        bar.title =
            `${activity[day].toFixed(1)} study hours`;

        const label =
            document.createElement("span");

        label.textContent = day;

        dayContainer.appendChild(bar);
        dayContainer.appendChild(label);

        activityBars.appendChild(dayContainer);
    });
}

/* =========================================
   DASHBOARD RENDERING
   ========================================= */

function renderDashboard() {
    renderTasks();
    updateStatistics();
    updateProgress();
    renderActivityBars();
}

// Re-render when the filter changes.
taskFilter.addEventListener("change", renderTasks);

// Initial render when the page loads.
renderDashboard();