// Agent Board - Dashboard App
(function () {
  const API = "/api";

  // --- PIN Protection ---
  const PIN_SESSION_KEY = "ab-pin-unlocked";
  function checkPin() {
    if (sessionStorage.getItem(PIN_SESSION_KEY) === "1") return;
    fetch("/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "" })
    }).then(r => r.json()).then(data => {
      if (data.ok) {
        sessionStorage.setItem(PIN_SESSION_KEY, "1");
      } else {
        const overlay = document.getElementById("pinOverlay");
        if (overlay) overlay.classList.remove("hidden");
      }
    }).catch(() => {
      const overlay = document.getElementById("pinOverlay");
      if (overlay) overlay.classList.remove("hidden");
    });
  }
  function setupPinForm() {
    const btn = document.getElementById("pinSubmit");
    const input = document.getElementById("pinInput");
    const errEl = document.getElementById("pinError");
    if (!btn || !input) return;
    function tryUnlock() {
      const pin = input.value.trim();
      if (!pin) return;
      fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      }).then(r => r.json()).then(data => {
        if (data.ok) {
          sessionStorage.setItem(PIN_SESSION_KEY, "1");
          const overlay = document.getElementById("pinOverlay");
          if (overlay) overlay.classList.add("hidden");
          if (errEl) errEl.classList.add("hidden");
        } else {
          if (errEl) errEl.classList.remove("hidden");
          input.value = "";
          input.focus();
        }
      });
    }
    btn.addEventListener("click", tryUnlock);
    input.addEventListener("keydown", e => { if (e.key === "Enter") tryUnlock(); });
  }
  document.addEventListener("DOMContentLoaded", () => { setupPinForm(); checkPin(); });
  // --- End PIN Protection ---

  const COLUMNS = ["backlog", "todo", "doing", "review", "rework", "done", "failed"];
  const COL_LABELS = { backlog: "Backlog", todo: "To Do", doing: "Doing", review: "Review", rework: "Rework", done: "Done", failed: "Failed" };

  // Load saved project from localStorage
  function getSavedProject() {
    try {
      return localStorage.getItem("ab-currentProject");
    } catch { return null; }
  }

  function saveCurrentProject(projectId) {
    try {
      if (projectId) {
        localStorage.setItem("ab-currentProject", projectId);
      } else {
        localStorage.removeItem("ab-currentProject");
      }
    } catch { /* ignore */ }
  }

  let state = {
    projects: [],
    tasks: [],
    agents: [],
    currentProject: getSavedProject(),
    currentView: "board",
    filterAgent: null,
    showArchived: false,
  };

  // --- Theme ---
  const themeToggle = document.getElementById("themeToggle");
  function initTheme() {
    const saved = localStorage.getItem("ab-theme");
    if (saved === "dark" || (!saved && matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.setAttribute("data-theme", "dark");
      themeToggle.textContent = "\u2600";
    }
  }
  themeToggle.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    document.documentElement.setAttribute("data-theme", isDark ? "light" : "dark");
    themeToggle.textContent = isDark ? "\u263E" : "\u2600";
    localStorage.setItem("ab-theme", isDark ? "light" : "dark");
  });
  initTheme();

  // --- API helpers ---
  async function api(path, opts) {
    const res = await fetch(API + path, {
      headers: { "Content-Type": "application/json", "X-API-Key": "sk-dashboard-001" },
      ...opts,
    });
    return res.json();
  }

  // --- Data loading ---
  async function loadProjects() {
    state.projects = await api("/projects");
    renderProjectSelect();
    
    // Use saved project if it exists and is still valid
    const savedProject = getSavedProject();
    const projectExists = state.projects.some(p => p.id === savedProject);
    
    if (state.projects.length && (!state.currentProject || !projectExists)) {
      state.currentProject = state.projects[0].id;
      saveCurrentProject(state.currentProject);
    } else if (projectExists) {
      state.currentProject = savedProject;
    }
  }

  async function loadTasks() {
    if (!state.currentProject) { state.tasks = []; return; }
    state.tasks = await api("/tasks?projectId=" + state.currentProject);
  }

  async function loadAgents() {
    state.agents = await api("/agents");
  }

  async function refresh() {
    await Promise.all([loadProjects(), loadAgents()]);
    await loadTasks();
    render();
  }

  // --- Project selector ---
  const projectSelect = document.getElementById("projectSelect");
  function renderProjectSelect() {
    if (!state.projects.length) {
      projectSelect.innerHTML = '<option value="">No projects</option>';
      return;
    }
    projectSelect.innerHTML = state.projects
      .map((p) => `<option value="${p.id}" ${p.id === state.currentProject ? "selected" : ""}>${p.name}</option>`)
      .join("");
  }

  projectSelect.addEventListener("change", async () => {
    state.currentProject = projectSelect.value;
    saveCurrentProject(state.currentProject);
    await loadTasks();
    render();
  });

  // --- Agent filter ---
  const agentFilter = document.getElementById("agentFilter");
  function renderAgentFilter() {
    // Get unique agents from tasks
    const agents = [...new Set(state.tasks.map(t => t.assignee).filter(Boolean))].sort();
    agentFilter.innerHTML = '<option value="">All Agents</option>' +
      agents.map(a => `<option value="${a}" ${a === state.filterAgent ? "selected" : ""}>${a}</option>`).join("");
  }

  agentFilter.addEventListener("change", () => {
    state.filterAgent = agentFilter.value || null;
    render();
  });

  // --- Archive toggle ---
  document.getElementById("archiveToggle").addEventListener("change", (e) => {
    state.showArchived = e.target.checked;
    render();
  });

  // --- View tabs ---
  document.getElementById("viewTabs").addEventListener("click", (e) => {
    if (!e.target.classList.contains("tab")) return;
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    e.target.classList.add("active");
    state.currentView = e.target.dataset.view;
    render();
  });

  // --- Render ---
  function render() {
    const boardView = document.getElementById("boardView");
    const agentsView = document.getElementById("agentsView");
    const statsView = document.getElementById("statsView");

    boardView.classList.add("hidden");
    agentsView.classList.add("hidden");
    statsView.classList.add("hidden");

    if (state.currentView === "board") {
      boardView.classList.remove("hidden");
      renderAgentFilter();
      renderBoard();
    } else if (state.currentView === "agents") {
      agentsView.classList.remove("hidden");
      renderAgents();
    } else if (state.currentView === "stats") {
      statsView.classList.remove("hidden");
      renderStats();
    }
  }

  function formatDuration(ms) {
    if (!ms) return "\u2014";
    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m`;
  }

  async function renderStats() {
    const view = document.getElementById("statsView");
    view.innerHTML = '<div style="padding:24px;color:var(--text-muted)">Loading stats...</div>';
    const stats = await api("/stats");

    const statusBars = Object.entries(stats.byStatus || {}).map(([s, c]) =>
      `<div class="stat-bar"><span class="stat-label">${s}</span><div class="stat-fill" style="width:${Math.max(5, (c / Math.max(stats.totalTasks, 1)) * 100)}%;background:var(--col-${s},#666)"></div><span class="stat-val">${c}</span></div>`
    ).join("");

    const agentRows = (stats.agentStats || []).map(a =>
      `<tr>
        <td><strong>${esc(a.agentId)}</strong></td>
        <td>${a.totalTasks}</td>
        <td>${a.completed}</td>
        <td>${a.failed}</td>
        <td>${a.inProgress}</td>
        <td>${formatDuration(a.avgDurationMs)}</td>
        <td>${(a.completionRate * 100).toFixed(0)}%</td>
      </tr>`
    ).join("");

    const oldest = stats.oldestDoingTask;
    const alertHtml = oldest && oldest.ageMs > 7200000
      ? `<div class="stat-alert">\u26A0 Stuck task: "${esc(oldest.title)}" (${esc(oldest.assignee)}) \u2014 in progress for ${formatDuration(oldest.ageMs)}</div>`
      : "";

    view.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-number">${stats.totalTasks}</div>
          <div class="stat-title">Total Tasks</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${(stats.completionRate * 100).toFixed(0)}%</div>
          <div class="stat-title">Completion Rate</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${formatDuration(stats.avgDurationMs)}</div>
          <div class="stat-title">Avg Duration</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${stats.byStatus?.failed || 0}</div>
          <div class="stat-title">Failed</div>
        </div>
      </div>
      ${alertHtml}
      <h3 style="margin:24px 0 12px">Status Breakdown</h3>
      <div class="stat-bars">${statusBars}</div>
      <h3 style="margin:24px 0 12px">Agent Performance</h3>
      <table class="stats-table">
        <thead><tr><th>Agent</th><th>Total</th><th>Done</th><th>Failed</th><th>Active</th><th>Avg Time</th><th>Rate</th></tr></thead>
        <tbody>${agentRows || '<tr><td colspan="7">No agent data yet</td></tr>'}</tbody>
      </table>
    `;
  }

  function renderBoard() {
    const board = document.getElementById("boardView");
    board.innerHTML = COLUMNS.map((col) => {
      let tasks = state.tasks.filter((t) => t.column === col);
      // Hide archived unless toggled
      if (!state.showArchived) {
        tasks = tasks.filter((t) => !t.archived);
      }
      // Apply agent filter if set
      if (state.filterAgent) {
        tasks = tasks.filter((t) => t.assignee === state.filterAgent);
      }
      const archiveAllBtn = (col === "done" && tasks.length > 0)
        ? `<button class="archive-all-btn" data-col="done">\uD83D\uDDC4 Archive all</button>`
        : "";
      return `
        <div class="column" data-col="${col}">
          <div class="column-header">
            <span><span class="dot" style="background:var(--col-${col})"></span>${COL_LABELS[col]}</span>
            <span class="count">${tasks.length}</span>
          </div>
          <div class="column-body" data-col="${col}">
            ${tasks.map(renderCard).join("")}
            ${archiveAllBtn}
            <button class="add-task-btn" data-col="${col}">+ Add task</button>
          </div>
        </div>`;
    }).join("");

    // Drag & drop
    board.querySelectorAll(".card").forEach(initDrag);
    board.querySelectorAll(".column-body").forEach(initDrop);

    // Click to open detail
    board.querySelectorAll(".card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.defaultPrevented) return;
        openDetail(card.dataset.id);
      });
    });

    // Add task buttons
    board.querySelectorAll(".add-task-btn").forEach((btn) => {
      btn.addEventListener("click", () => showTaskModal(btn.dataset.col));
    });

    // Archive all done
    board.querySelectorAll(".archive-all-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const doneTasks = state.tasks.filter((t) => t.column === "done" && !t.archived);
        for (const t of doneTasks) {
          await api("/tasks/" + t.id, { method: "PATCH", body: JSON.stringify({ archived: true }) });
        }
        await loadTasks();
        render();
      });
    });
  }

  function getUnresolvedDeps(task) {
    if (!task.dependencies || !task.dependencies.length) return [];
    return task.dependencies
      .map((depId) => state.tasks.find((t) => t.id === depId))
      .filter((dep) => dep && dep.column !== "done");
  }

  function renderCard(task) {
    const priorityClass = `badge-priority-${task.priority}`;
    const tags = task.tags.map((t) => `<span class="badge badge-tag">${esc(t)}</span>`).join("");
    const comments = task.comments.length ? `<span class="card-comments">${task.comments.length} comment${task.comments.length > 1 ? "s" : ""}</span>` : "";

    // Check unresolved dependencies
    const blockers = getUnresolvedDeps(task);
    const lockHtml = blockers.length
      ? `<span class="badge badge-locked" title="Blocked by: ${blockers.map((b) => esc(b.title)).join(", ")}">&#x1F512; ${blockers.length} dep${blockers.length > 1 ? "s" : ""}</span>`
      : "";

    // Check if deadline is overdue
    let overdueClass = "";
    let deadlineHtml = "";
    if (task.deadline) {
      const deadlineDate = new Date(task.deadline);
      const now = new Date();
      const isOverdue = deadlineDate < now && task.column !== "done";
      overdueClass = isOverdue ? "card-overdue" : "";
      const deadlineStr = deadlineDate.toLocaleDateString();
      deadlineHtml = `<span class="badge badge-deadline ${isOverdue ? "badge-overdue" : ""}">${isOverdue ? "\u26A0 " : ""}\uD83D\uDCC5 ${deadlineStr}</span>`;
    }

    // Complexity + planning badges on card
    const complexHtml = task.complexity === "complex" ? '<span class="badge badge-complex">Complex</span>' : "";
    const planHtml = task.planningMode ? '<span class="badge badge-planning">\uD83D\uDCCB</span>' : "";

    return `
      <div class="card ${overdueClass} ${blockers.length ? "card-blocked" : ""}" draggable="true" data-id="${task.id}">
        <div class="card-title">${lockHtml ? lockHtml + " " : ""}${esc(task.title)}</div>
        ${task.description ? `<div class="card-desc">${esc(task.description)}</div>` : ""}
        <div class="card-meta">
          ${task.assignee ? `<span class="badge badge-assignee">${esc(task.assignee)}</span>` : ""}
          <span class="badge ${priorityClass}">${task.priority}</span>
          ${complexHtml}
          ${planHtml}
          ${tags}
          ${deadlineHtml}
          ${comments}
        </div>
      </div>`;
  }

  function renderAgents() {
    const view = document.getElementById("agentsView");
    if (!state.agents.length) {
      view.innerHTML = '<div style="padding:24px;color:var(--text-muted)">No agents registered. Use the API to register agents.</div>';
      return;
    }
    view.innerHTML = state.agents.map((a) => {
      const taskCount = state.tasks.filter((t) => t.assignee === a.id).length;
      return `
        <div class="agent-card">
          <h3>${esc(a.name)}</h3>
          <div class="role">${esc(a.role)} &middot; ${a.status} &middot; ${taskCount} task${taskCount !== 1 ? "s" : ""}</div>
          <div class="caps">${a.capabilities.map((c) => `<span class="badge badge-tag">${esc(c)}</span>`).join("")}</div>
        </div>`;
    }).join("");
  }

  // --- Drag & Drop ---
  let draggedId = null;

  function initDrag(card) {
    // Desktop: HTML5 drag & drop
    card.addEventListener("dragstart", (e) => {
      draggedId = card.dataset.id;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      card.style.touchAction = "";
      draggedId = null;
    });

    // Mobile: touch drag via Pointer Events
    let isDragging = false;
    let ghost = null;
    let startX = 0, startY = 0;
    let touchTimer = null;

    card.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      startX = e.clientX;
      startY = e.clientY;
      touchTimer = setTimeout(() => {
        isDragging = true;
        draggedId = card.dataset.id;
        ghost = card.cloneNode(true);
        const rect = card.getBoundingClientRect();
        ghost.style.cssText = `position:fixed;top:${rect.top}px;left:${rect.left}px;width:${card.offsetWidth}px;opacity:0.75;pointer-events:none;z-index:9999;transform:rotate(2deg) scale(1.03);transition:none;`;
        document.body.appendChild(ghost);
        card.classList.add("dragging");
        card.style.touchAction = "none";
        navigator.vibrate && navigator.vibrate(30);
      }, 200);
    });

    card.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") return;
      if (!isDragging) {
        if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) clearTimeout(touchTimer);
        return;
      }
      e.preventDefault();
      if (ghost) {
        ghost.style.top = (e.clientY - ghost.offsetHeight / 2) + "px";
        ghost.style.left = (e.clientX - ghost.offsetWidth / 2) + "px";
        ghost.style.display = "none";
        const el = document.elementFromPoint(e.clientX, e.clientY);
        ghost.style.display = "";
        document.querySelectorAll(".col-body").forEach(c => c.classList.remove("drag-over"));
        const colBody = el && el.closest(".col-body");
        if (colBody) colBody.classList.add("drag-over");
      }
    });

    const endDrag = async (e) => {
      if (e.pointerType === "mouse") return;
      clearTimeout(touchTimer);
      if (!isDragging) return;
      isDragging = false;
      if (ghost) { ghost.remove(); ghost = null; }
      card.classList.remove("dragging");
      card.style.touchAction = "";
      document.querySelectorAll(".col-body").forEach(c => c.classList.remove("drag-over"));
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const colBody = el && el.closest(".col-body");
      const newCol = colBody && colBody.dataset.col;
      if (newCol && draggedId) {
        await api("/tasks/" + draggedId + "/move", { method: "POST", body: JSON.stringify({ column: newCol }) });
        await loadTasks();
        render();
      }
      draggedId = null;
    };

    card.addEventListener("pointerup", endDrag);
    card.addEventListener("pointercancel", endDrag);
  }

  function initDrop(colBody) {
    colBody.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      colBody.classList.add("drag-over");
    });
    colBody.addEventListener("dragleave", () => {
      colBody.classList.remove("drag-over");
    });
    colBody.addEventListener("drop", async (e) => {
      e.preventDefault();
      colBody.classList.remove("drag-over");
      if (!draggedId) return;
      const newCol = colBody.dataset.col;
      await api("/tasks/" + draggedId + "/move", {
        method: "POST",
        body: JSON.stringify({ column: newCol }),
      });
      await loadTasks();
      render();
    });
  }

  // --- Task Detail Panel ---
  const detailPanel = document.getElementById("detailPanel");
  const detailContent = document.getElementById("detailContent");
  let threadInterval = null;
  let currentDetailTaskId = null;

  document.getElementById("closeDetail").addEventListener("click", () => {
    detailPanel.classList.remove("open");
    if (threadInterval) { clearInterval(threadInterval); threadInterval = null; }
    currentDetailTaskId = null;
  });

  // --- Timeline helpers ---
  function getMessageType(c) {
    if (c.author === "system") return "system";
    if (c.text.startsWith("\u270D\uFE0F")) return "tz";
    if (c.text.startsWith("\u2705")) return "report";
    if (c.text.startsWith("\uD83D\uDD04")) return "rework";
    if (c.text.startsWith("\u26A1")) return "escalation";
    return "message";
  }

  function fmtTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " \u00B7 " + d.toLocaleDateString([], { day: "numeric", month: "short" });
  }

  function renderTimeline(comments) {
    const el = document.getElementById("timelineMessages");
    if (!el) return;
    if (!comments.length) {
      el.innerHTML = '<div class="tl-empty">No activity yet.</div>';
      return;
    }
    const sorted = [...comments].sort((a, b) => new Date(a.at) - new Date(b.at));
    el.innerHTML = sorted.map((c) => {
      const type = getMessageType(c);
      if (type === "system") {
        return `<div class="tl-msg tl-system"><span>${esc(c.text)}</span><span class="tl-time">${fmtTime(c.at)}</span></div>`;
      }
      const badges = { tz: "TZ", report: "Report", rework: "Rework", escalation: "Escalation" };
      const badge = badges[type] ? `<span class="tl-badge tl-badge-${type}">${badges[type]}</span>` : "";
      return `<div class="tl-msg tl-${type}">
        <div class="tl-header"><span class="tl-author">${esc(c.author)}</span>${badge}<span class="tl-time">${fmtTime(c.at)}</span></div>
        <div class="tl-text">${esc(c.text)}</div>
      </div>`;
    }).join("");
    el.scrollTop = el.scrollHeight;
  }

  async function refreshTimeline(taskId) {
    try {
      const comments = await api("/tasks/" + taskId + "/comments");
      if (currentDetailTaskId === taskId) renderTimeline(comments);
    } catch (e) { /* ignore polling errors */ }
  }

  function openDetail(taskId) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    currentDetailTaskId = taskId;

    const complexBadge = task.complexity === "complex" ? '<span class="badge badge-complex">Complex</span>' : "";
    const planningBadge = task.planningMode ? '<span class="badge badge-planning">\uD83D\uDCCB Planning</span>' : "";
    const escalateBtn = task.assignee !== "pasha" && task.complexity !== "complex"
      ? '<button class="btn-escalate" id="escalateBtn">\u26A1 Escalate to Pasha</button>'
      : "";
    const archiveBtn = (task.column === "done" || task.column === "failed") && !task.archived
      ? '<button class="btn-archive" id="archiveBtn">\uD83D\uDDC4 Archive</button>'
      : "";
    const unarchivedBadge = task.archived ? '<span class="badge badge-archived">Archived</span>' : "";

    const atts = task.attachments || [];
    const attHtml = atts.map((a) => {
      if (a.mimeType && a.mimeType.startsWith("image/")) {
        return `<img class="attachment-thumb" src="data:${a.mimeType};base64,${a.data}" title="${esc(a.filename)}" onclick="window.open(this.src)">`;
      }
      return `<span class="attachment-file" title="${esc(a.filename)}">\uD83D\uDCCE ${esc(a.filename)}</span>`;
    }).join("");

    const approveLabel = task.planningMode ? "\u2705 Approve TZ" : "\u2705 Approve";
    const reworkLabel = task.planningMode ? "\uD83D\uDD01 Rework TZ" : "\uD83D\uDD01 Request Rework";
    const reworkPlaceholder = task.planningMode ? "What needs to change in the TZ..." : "Describe what needs to be fixed...";
    const reviewHtml = task.column === "review" ? `
      <div class="detail-actions">
        <button class="btn-approve" id="approveBtn">${approveLabel}</button>
        <button class="btn-rework" id="reworkBtn">${reworkLabel}</button>
      </div>
      <div class="rework-comment-area hidden" id="reworkArea">
        <textarea id="reworkComment" placeholder="${reworkPlaceholder}"></textarea>
        <button id="reworkSubmitBtn">Send</button>
      </div>
    ` : "";

    detailContent.innerHTML = `
      <div class="detail-header">
        <h2>${esc(task.title)}</h2>
        <div class="detail-meta-row">
          <span class="badge" style="background:var(--col-${task.column});color:#fff">${task.column}</span>
          ${task.assignee ? `<span class="badge badge-assignee">${esc(task.assignee)}</span>` : ""}
          <span class="badge badge-priority-${task.priority}">${task.priority}</span>
          ${complexBadge}
          ${planningBadge}
          ${unarchivedBadge}
          ${task.tags.map((t) => `<span class="badge badge-tag">${esc(t)}</span>`).join("")}
        </div>
        ${task.description ? `<div class="detail-desc">${esc(task.description)}</div>` : ""}
        <div class="detail-header-actions">${escalateBtn}${archiveBtn}${deleteBtn}</div>
      </div>
      <div class="timeline-container" id="timelineMessages"></div>
      <div class="timeline-input">
        <input type="text" id="commentAuthor" placeholder="steve" value="steve" class="tl-author-input">
        <div class="tl-send-row">
          <input type="text" id="commentText" placeholder="Message..." class="tl-text-input">
          <button class="btn btn-primary" id="addCommentBtn">Send</button>
        </div>
      </div>
      ${reviewHtml}
      <div class="detail-attachments">
        <div class="detail-attach-toggle" id="toggleAttachments">\uD83D\uDCCE Attachments (${atts.length})</div>
        <div class="detail-attach-body" id="attachBody">
          <div class="attachment-grid" id="attachmentGrid">${attHtml}</div>
          <button class="btn-attach" id="attachBtn">\uD83D\uDCCE Attach file</button>
        </div>
      </div>
    `;

    renderTimeline(task.comments);

    // Send comment
    async function sendComment() {
      const author = document.getElementById("commentAuthor").value.trim() || "steve";
      const text = document.getElementById("commentText").value.trim();
      if (!text) return;
      document.getElementById("commentText").value = "";
      await api("/tasks/" + taskId + "/comments", {
        method: "POST",
        body: JSON.stringify({ author, text }),
      });
      await refreshTimeline(taskId);
      await loadTasks();
    }

    document.getElementById("addCommentBtn").addEventListener("click", sendComment);
    document.getElementById("commentText").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); }
    });

    // Escalate to Pasha
    const escBtn = document.getElementById("escalateBtn");
    if (escBtn) {
      escBtn.addEventListener("click", async () => {
        await api("/tasks/" + taskId, {
          method: "PATCH",
          body: JSON.stringify({ complexity: "complex", assignee: "pasha" }),
        });
        await api("/tasks/" + taskId + "/comments", {
          method: "POST",
          body: JSON.stringify({ author: "system", text: "\u26A1 Escalated to Pasha for architectural analysis" }),
        });
        if (task.column !== "todo") {
          await api("/tasks/" + taskId + "/move", {
            method: "POST",
            body: JSON.stringify({ column: "todo" }),
          });
        }
        await loadTasks();
        openDetail(taskId);
      });
    }

    // Archive task
    const archBtn = document.getElementById("archiveBtn");
    if (archBtn) {
      archBtn.addEventListener("click", async () => {
        await api("/tasks/" + taskId, { method: "PATCH", body: JSON.stringify({ archived: true }) });
        detailPanel.classList.remove("open");
        await loadTasks();
        render();
      });
    }

    // Toggle attachments
    document.getElementById("toggleAttachments").addEventListener("click", () => {
      document.getElementById("attachBody").classList.toggle("hidden");
    });

    // Review actions
    if (task.column === "review") {
      document.getElementById("approveBtn").addEventListener("click", async () => {
        await api("/tasks/" + taskId + "/move", { method: "POST", body: JSON.stringify({ column: "done" }) });
        detailPanel.classList.remove("open");
        await loadTasks();
        render();
      });

      document.getElementById("reworkBtn").addEventListener("click", () => {
        document.getElementById("reworkArea").classList.toggle("hidden");
        document.getElementById("reworkComment").focus();
      });

      document.getElementById("reworkSubmitBtn").addEventListener("click", async () => {
        const reason = document.getElementById("reworkComment").value.trim();
        await api("/tasks/" + taskId + "/move", { method: "POST", body: JSON.stringify({ column: "rework" }) });
        await api("/tasks/" + taskId, { method: "PATCH", body: JSON.stringify({ assignee: "org" }) });
        if (reason) {
          await api("/tasks/" + taskId + "/comments", {
            method: "POST",
            body: JSON.stringify({ author: "reviewer", text: "\uD83D\uDD04 Rework requested: " + reason }),
          });
        }
        detailPanel.classList.remove("open");
        await loadTasks();
        render();
      });
    }

    // Attachment upload
    const attachBtn = document.getElementById("attachBtn");
    const fileInput = document.getElementById("attachFileInput");
    attachBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target.result;
        const [header, data] = dataUrl.split(",");
        const mimeType = header.match(/:(.*?);/)[1];
        await api("/tasks/" + taskId + "/attachments", {
          method: "POST",
          body: JSON.stringify({ filename: file.name, mimeType, data, uploadedBy: "user" }),
        });
        fileInput.value = "";
        await loadTasks();
        const updated = state.tasks.find((t) => t.id === taskId);
        if (updated) openDetail(taskId);
      };
      reader.readAsDataURL(file);
    });

    // Auto-refresh timeline every 10s
    if (threadInterval) clearInterval(threadInterval);
    threadInterval = setInterval(() => refreshTimeline(taskId), 10000);

    detailPanel.classList.add("open");
  }

  // --- Modals ---
  function showModal(html) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal">${html}</div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    return overlay;
  }

  document.getElementById("newProjectBtn").addEventListener("click", () => {
    const overlay = showModal(`
      <h2>New Project</h2>
      <label>Name</label>
      <input type="text" id="modalProjName" autofocus>
      <label>Owner</label>
      <input type="text" id="modalProjOwner" placeholder="e.g. agency">
      <label>Description</label>
      <textarea id="modalProjDesc"></textarea>
      <div class="modal-actions">
        <button class="btn" id="modalCancel">Cancel</button>
        <button class="btn btn-primary" id="modalConfirm">Create</button>
      </div>
    `);
    overlay.querySelector("#modalCancel").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#modalConfirm").addEventListener("click", async () => {
      const name = overlay.querySelector("#modalProjName").value.trim();
      if (!name) return;
      const project = await api("/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          owner: overlay.querySelector("#modalProjOwner").value.trim() || "unknown",
          description: overlay.querySelector("#modalProjDesc").value.trim(),
        }),
      });
      state.currentProject = project.id;
      overlay.remove();
      await refresh();
    });
  });

  function showTaskModal(column) {
    if (!state.currentProject) return;
    const overlay = showModal(`
      <h2>New Task</h2>
      <label>Title</label>
      <input type="text" id="modalTaskTitle" autofocus>
      <label>Description</label>
      <textarea id="modalTaskDesc"></textarea>
      <label>Assignee</label>
      <input type="text" id="modalTaskAssignee" placeholder="org">
      <label>Priority</label>
      <select id="modalTaskPriority">
        <option value="medium" selected>Medium</option>
        <option value="low">Low</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
      <label>Tags (comma-separated)</label>
      <input type="text" id="modalTaskTags" placeholder="seo, audit">
      <div class="modal-modes">
        <label class="modal-mode-item" id="planningModeToggle">
          <div class="modal-mode-info">
            <span class="modal-mode-icon">📋</span>
            <div>
              <div class="modal-mode-title">Planning mode</div>
              <div class="modal-mode-desc">TZ согласовывается со Steve перед запуском</div>
            </div>
          </div>
          <div class="toggle-switch">
            <input type="checkbox" id="modalPlanningMode">
            <span class="toggle-thumb"></span>
          </div>
        </label>
        <label class="modal-mode-item" id="complexModeToggle">
          <div class="modal-mode-info">
            <span class="modal-mode-icon">⚡</span>
            <div>
              <div class="modal-mode-title">Complex → Pasha</div>
              <div class="modal-mode-desc">Архитектурный анализ перед исполнением</div>
            </div>
          </div>
          <div class="toggle-switch">
            <input type="checkbox" id="modalComplexMode">
            <span class="toggle-thumb"></span>
          </div>
        </label>
      </div>
      <label>📎 Attachments</label>
      <div class="modal-file-drop" id="modalFileDrop">
        <input type="file" id="modalFileInput" multiple accept="image/*,.pdf,.txt,.md,.json">
        <span class="modal-file-drop-text">Choose files or drag here</span>
      </div>
      <div class="modal-file-list" id="modalFileList"></div>
      <div class="modal-actions">
        <button class="btn" id="modalCancel">Cancel</button>
        <button class="btn btn-primary" id="modalConfirm">Create</button>
      </div>
    `);

    // Complex mode → auto-set assignee to pasha
    const complexCb = overlay.querySelector("#modalComplexMode");
    const assigneeInput = overlay.querySelector("#modalTaskAssignee");
    complexCb.addEventListener("change", () => {
      if (complexCb.checked) {
        assigneeInput.value = "pasha";
        assigneeInput.readOnly = true;
        assigneeInput.style.opacity = "0.6";
      } else {
        assigneeInput.readOnly = false;
        assigneeInput.style.opacity = "1";
        if (assigneeInput.value === "pasha") assigneeInput.value = "";
      }
    });

    // File list preview
    const fileInput = overlay.querySelector("#modalFileInput");
    const fileList = overlay.querySelector("#modalFileList");
    fileInput.addEventListener("change", () => {
      fileList.innerHTML = [...fileInput.files].map((f) =>
        `<span class="modal-file-item">\uD83D\uDCCE ${esc(f.name)}</span>`
      ).join("");
    });

    overlay.querySelector("#modalCancel").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#modalConfirm").addEventListener("click", async () => {
      const title = overlay.querySelector("#modalTaskTitle").value.trim();
      if (!title) return;
      const tags = overlay.querySelector("#modalTaskTags").value.trim();
      const isComplex = overlay.querySelector("#modalComplexMode").checked;
      const isPlanning = overlay.querySelector("#modalPlanningMode").checked;
      const assignee = assigneeInput.value.trim() || "org";

      // Create task
      const task = await api("/tasks", {
        method: "POST",
        body: JSON.stringify({
          projectId: state.currentProject,
          title,
          description: overlay.querySelector("#modalTaskDesc").value.trim(),
          assignee,
          priority: overlay.querySelector("#modalTaskPriority").value,
          tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
          column: column || "backlog",
          complexity: isComplex ? "complex" : "normal",
          planningMode: isPlanning,
        }),
      });

      // Upload attachments if any
      const files = fileInput.files;
      if (files.length && task && task.id) {
        for (const file of files) {
          await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
              const dataUrl = e.target.result;
              const [header, data] = dataUrl.split(",");
              const mimeType = header.match(/:(.*?);/)[1];
              await api("/tasks/" + task.id + "/attachments", {
                method: "POST",
                body: JSON.stringify({ filename: file.name, mimeType, data, uploadedBy: "steve" }),
              });
              resolve();
            };
            reader.readAsDataURL(file);
          });
        }
      }

      overlay.remove();
      await loadTasks();
      render();
    });
  }

  document.getElementById("newTaskBtn").addEventListener("click", () => showTaskModal("backlog"));

  // --- Escape ---
  function esc(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Init ---
  refresh();

  // Auto-refresh every 5s
  setInterval(async () => {
    await loadTasks();
    if (state.currentView === "board") renderBoard();
  }, 5000);
})();
