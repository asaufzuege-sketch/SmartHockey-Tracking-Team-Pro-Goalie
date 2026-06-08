// Stats Table Module mit teamspezifischer Datenverwaltung

App.statsTable = {
  container: null,
  dragState: {
    isDragging: false,
    draggedRow: null,
    longPressTimer: null,
    startY: 0,
    currentY: 0,
    initialMouseY: 0,
    yOffset: 0,
    draggedElement: null,
    currentDragHandle: null
  },
  // Store references to document-level event handlers for cleanup
  documentHandlersAttached: false,
  
  // Constants for double-tap detection
  DOUBLE_TAP_DELAY: 300,
  
  init() {
    this.container = document.getElementById("statsContainer");
    
    // Event Listener für Buttons
    document.getElementById("exportBtn")?.addEventListener("click", () => {
      App.csvHandler.exportStats();
    });
    
    document.getElementById("resetBtn")?.addEventListener("click", () => {
      this.reset();
    });
  },
  
  render() {
    if (!this.container) return;
    
    // Load team-specific player order from localStorage before rendering
    this.loadTeamSpecificData();
    
    this.container.innerHTML = "";
    
    const table = document.createElement("table");
    table.className = "stats-table";
    
    // Header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerRow.innerHTML = "<th>#</th><th>Player</th>" + 
      App.data.categories.map(c => `<th>${App.helpers.escapeHtml(c)}</th>`).join("") + 
      "<th>Time</th>";
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Body - Filter out goalies (players with position = "G")
    const tbody = document.createElement("tbody");
    tbody.id = "stats-tbody";
    
    const playersToRender = App.data.selectedPlayers.filter(p => p.position !== "G");
    
    playersToRender.forEach((p, idx) => {
      const tr = document.createElement("tr");
      tr.className = (idx % 2 === 0 ? "even-row" : "odd-row");
      tr.dataset.player = p.name;
      // Store the REAL index from the full App.data.selectedPlayers array, not the filtered index
      const realIndex = App.data.selectedPlayers.findIndex(player => player.name === p.name);
      tr.dataset.playerIndex = realIndex;
      
      // Nummer
      const numTd = document.createElement("td");
      numTd.innerHTML = `<strong>${App.helpers.escapeHtml(p.num || "-")}</strong>`;
      tr.appendChild(numTd);
      
      // Name (clickbar für Timer + Drag Handle)
      const nameTd = document.createElement("td");
      nameTd.style.cssText = "text-align:left;padding-left:12px;cursor:pointer;white-space:nowrap;position:relative;";
      nameTd.innerHTML = `<span class="drag-handle">⋮⋮</span><strong>${App.helpers.escapeHtml(p.name)}</strong>`;
      tr.appendChild(nameTd);
      
      // Kategorien
      App.data.categories.forEach(c => {
        const td = document.createElement("td");
        const val = App.data.statsData[p.name]?.[c] || 0;
        const colors = App.helpers.getColorStyles();
        
        td.textContent = val;
        td.dataset.player = p.name;
        td.dataset.cat = c;
        td.style.color = val > 0 ? colors.pos : val < 0 ? colors.neg : colors.zero;
        tr.appendChild(td);
      });
      
      // Ice Time
      const timeTd = document.createElement("td");
      timeTd.className = "ice-time-cell";
      const sec = App.data.playerTimes[p.name] || 0;
      timeTd.textContent = App.helpers.formatTimeMMSS(sec);
      timeTd.dataset.player = p.name;
      tr.appendChild(timeTd);
      
      // Timer Toggle auf Name-Click (aber nicht auf drag handle)
      this.attachTimerToggle(nameTd, tr, timeTd, p.name);
      
      // Time Cell Click Handlers (+10s single click, -10s double click)
      this.attachTimeClickHandlers(timeTd, p.name);
      
      // Drag Handlers nur auf das Drag Handle
      const dragHandle = nameTd.querySelector('.drag-handle');
      this.attachDragHandlers(tr, dragHandle);
      
      tbody.appendChild(tr);
    });
    
    // Totals Row
    const totalTr = document.createElement("tr");
    totalTr.className = "total-row";
    
    const emptyTd = document.createElement("td");
    emptyTd.textContent = "";
    totalTr.appendChild(emptyTd);
    
    const labelTd = document.createElement("td");
    labelTd.textContent = `Total (${playersToRender.length})`;
    labelTd.style.textAlign = "left";
    labelTd.style.fontWeight = "700";
    totalTr.appendChild(labelTd);
    
    App.data.categories.forEach(c => {
      const td = document.createElement("td");
      td.className = "total-cell";
      td.dataset.cat = c;
      td.textContent = "0";
      
      // Teamspezifische Gegner-Schüsse aus LocalStorage wiederherstellen
      if (c === "Shot") {
        const teamId = App.helpers.getCurrentTeamId();
        const savedOppShots = AppStorage.getItem(`opponentShots_${teamId}`);
        if (savedOppShots) {
          td.dataset.opp = savedOppShots;
        } else {
          td.dataset.opp = "0";
        }
      }
      
      totalTr.appendChild(td);
    });
    
    const timeTotal = document.createElement("td");
    timeTotal.className = "total-cell";
    timeTotal.dataset.cat = "Time";
    totalTr.appendChild(timeTotal);
    
    tbody.appendChild(totalTr);
    table.appendChild(tbody);
    this.container.appendChild(table);
    
    // Click handlers für Werte
    this.attachValueClickHandlers();
    
    // Update Totals & Colors
    this.updateTotals();
    this.updateIceTimeColors();
    
    // Timer visuals wiederherstellen
    App.updateTimerVisuals();
  },
  
  attachDragHandlers(row, dragHandle) {
    if (!dragHandle) return;
    
    const startDrag = (e) => {
      if (this.dragState.isDragging) return;
      
      const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
      this.dragState.startY = clientY;
      this.dragState.hasMoved = false;
      
      this.dragState.longPressTimer = setTimeout(() => {
        if (!this.dragState.hasMoved && !this.dragState.isDragging) {
          this.dragState.currentDragHandle = dragHandle; // Set just before dragging starts
          this.startDragging(row);
          dragHandle.style.cursor = 'grabbing';
          
          // Haptic feedback
          if (navigator.vibrate) {
            navigator.vibrate(100);
          }
          
          console.log('Long press detected - drag started for:', row.dataset.player);
        }
      }, 600); // 600ms für Long Press
    };
    
    // Attach only local events to drag handle
    dragHandle.addEventListener('mousedown', startDrag);
    dragHandle.addEventListener('touchstart', startDrag, { passive: false });
    
    // Attach document-level handlers only once
    if (!this.documentHandlersAttached) {
      this.attachGlobalDragHandlers();
      this.documentHandlersAttached = true;
    }
  },
  
  attachGlobalDragHandlers() {
    // Global move handler
    const globalMoveDrag = (e) => {
      const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
      const deltaY = Math.abs(clientY - this.dragState.startY);
      
      if (deltaY > 10) {
        this.dragState.hasMoved = true;
        if (this.dragState.longPressTimer) {
          clearTimeout(this.dragState.longPressTimer);
          this.dragState.longPressTimer = null;
        }
      }
      
      if (this.dragState.isDragging) {
        e.preventDefault();
        this.handleDragMove(clientY);
      }
    };
    
    // Global end handler
    const globalEndDrag = (e) => {
      if (this.dragState.longPressTimer) {
        clearTimeout(this.dragState.longPressTimer);
        this.dragState.longPressTimer = null;
      }
      
      if (this.dragState.isDragging) {
        this.endDragging();
        if (this.dragState.currentDragHandle) {
          this.dragState.currentDragHandle.style.cursor = 'grab';
        }
      }
      
      this.dragState.hasMoved = false;
    };
    
    // Attach to document - these will persist across re-renders
    document.addEventListener('mousemove', globalMoveDrag);
    document.addEventListener('mouseup', globalEndDrag);
    document.addEventListener('touchmove', globalMoveDrag, { passive: false });
    document.addEventListener('touchend', globalEndDrag, { passive: false });
    document.addEventListener('touchcancel', globalEndDrag, { passive: false });
  },
  
  startDragging(row) {
    this.dragState.isDragging = true;
    this.dragState.draggedRow = row;
    
    // Visual feedback
    row.style.backgroundColor = 'rgba(68, 187, 145, 0.3)';
    row.style.transform = 'scale(1.02)';
    row.style.zIndex = '1000';
    row.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
    row.style.transition = 'transform 0.2s ease';
    
    console.log('Dragging started for player:', row.dataset.player);
  },
  
  handleDragMove(clientY) {
    if (!this.dragState.isDragging) return;
    
    const tbody = document.getElementById('stats-tbody');
    if (!tbody) return;
    
    const rows = Array.from(tbody.children).filter(r => 
      !r.classList.contains('total-row') && r !== this.dragState.draggedRow
    );
    
    let targetRow = null;
    let targetIndex = -1;
    
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      const rowCenter = rect.top + rect.height / 2;
      
      if (clientY < rowCenter) {
        targetRow = rows[i];
        targetIndex = i;
        break;
      }
    }
    
    if (targetRow) {
      tbody.insertBefore(this.dragState.draggedRow, targetRow);
    } else {
      // Insert at end (before total row)
      const totalRow = tbody.querySelector('.total-row');
      tbody.insertBefore(this.dragState.draggedRow, totalRow);
    }
  },
  
  endDragging() {
    if (!this.dragState.isDragging || !this.dragState.draggedRow) return;
    
    const row = this.dragState.draggedRow;
    
    // Remove visual feedback
    row.style.backgroundColor = '';
    row.style.transform = '';
    row.style.zIndex = '';
    row.style.boxShadow = '';
    row.style.transition = '';
    
    // Get the player names in their new visual order (excluding the total row)
    const tbody = document.getElementById('stats-tbody');
    const allRows = Array.from(tbody.children).filter(r => !r.classList.contains('total-row'));
    const newVisualOrder = allRows.map(r => r.dataset.player);
    
    // Separate goalies and non-goalies
    const goalies = App.data.selectedPlayers.filter(p => p.position === "G");
    
    // Create a name-to-player lookup map for O(n) performance
    const playerMap = new Map();
    App.data.selectedPlayers.forEach(p => playerMap.set(p.name, p));
    
    // Reconstruct non-goalies in the new visual order
    const nonGoaliesInNewOrder = newVisualOrder
      .map(name => playerMap.get(name))
      .filter(p => p !== undefined);
    
    // Combine: goalies first, then non-goalies in new order
    App.data.selectedPlayers = [...goalies, ...nonGoaliesInNewOrder];
    
    // Save and re-render
    this.saveToStorage();
    this.render();
    
    // Reset state
    this.dragState.isDragging = false;
    this.dragState.draggedRow = null;
    
    console.log('Dragging ended');
  },
  
  updatePlayerOrder(oldIndex, newIndex) {
    if (oldIndex < 0 || oldIndex >= App.data.selectedPlayers.length) return;
    if (newIndex < 0 || newIndex >= App.data.selectedPlayers.length) return;
    
    // Move player in array
    const player = App.data.selectedPlayers.splice(oldIndex, 1)[0];
    App.data.selectedPlayers.splice(newIndex, 0, player);
    
    console.log(`Player "${player.name}" moved from position ${oldIndex} to ${newIndex}`);
    
    // Teamspezifisch speichern
    this.saveToStorage();
    
    // Re-render to update indices and alternating row colors
    this.render();
  },
  
  attachTimerToggle(nameTd, tr, timeTd, playerName) {
    nameTd.addEventListener("click", (e) => {
      // Ignore clicks on drag handle
      if (e.target.classList.contains('drag-handle')) return;
      
      // Prevent timer toggle during drag
      if (this.dragState.isDragging) return;
      
      if (App.data.activeTimers[playerName]) {
        // Timer stoppen
        clearInterval(App.data.activeTimers[playerName]);
        delete App.data.activeTimers[playerName];
        tr.style.background = "";
        nameTd.style.background = "";
        
        // Timer State teamspezifisch speichern
        this.saveActiveTimersState();
      } else {
        // Timer über App-Funktion starten (für Persistenz)
        App.startPlayerTimer(playerName);
        tr.style.background = "#005c2f";
        nameTd.style.background = "#005c2f";
        
        // Timer State teamspezifisch speichern
        this.saveActiveTimersState();
      }
    });
  },
  
  attachTimeClickHandlers(timeTd, playerName) {
    // KRITISCH: Prüfe ob Handler bereits attached sind - wenn ja, entfernen für Re-Attach
    if (timeTd.dataset.handlersAttached === 'true') {
      delete timeTd.dataset.handlersAttached;
    }
    timeTd.dataset.handlersAttached = 'true';
    
    // State auf Element speichern (nicht in Closure!)
    if (!timeTd._tapState) {
      timeTd._tapState = {
        lastTapTime: 0,
        tapTimeout: null
      };
    }
    const state = timeTd._tapState;
    
    // MOBILE: Touch-Handler mit preventDefault/stopPropagation
    timeTd.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (this.dragState.isDragging) return;
      
      const now = Date.now();
      
      // Double-Tap Detection
      if (state.lastTapTime > 0 && (now - state.lastTapTime < 300)) {
        if (state.tapTimeout) {
          clearTimeout(state.tapTimeout);
          state.tapTimeout = null;
        }
        state.lastTapTime = 0;
        
        const currentTime = App.data.playerTimes[playerName] || 0;
        const newTime = Math.max(0, currentTime - 10);
        App.data.playerTimes[playerName] = newTime;
        timeTd.textContent = App.helpers.formatTimeMMSS(newTime);
        this.saveToStorage();
        this.updateIceTimeColors();
        this.updateTotals();
        return;
      }
      
      state.lastTapTime = now;
      state.tapTimeout = setTimeout(() => {
        const currentTime = App.data.playerTimes[playerName] || 0;
        const newTime = currentTime + 10;
        App.data.playerTimes[playerName] = newTime;
        timeTd.textContent = App.helpers.formatTimeMMSS(newTime);
        this.saveToStorage();
        this.updateIceTimeColors();
        this.updateTotals();
        state.tapTimeout = null;
        state.lastTapTime = 0;
      }, 300);
    }, { passive: false });
    
    // DESKTOP: click für +10
    timeTd.addEventListener("click", (e) => {
      if (this.dragState.isDragging) return;
      // Ignoriere wenn Touch-Handler gerade aktiv war
      if (state.lastTapTime > 0 && Date.now() - state.lastTapTime < 500) return;
      
      if (state.tapTimeout) clearTimeout(state.tapTimeout);
      state.tapTimeout = setTimeout(() => {
        const currentTime = App.data.playerTimes[playerName] || 0;
        const newTime = currentTime + 10;
        App.data.playerTimes[playerName] = newTime;
        timeTd.textContent = App.helpers.formatTimeMMSS(newTime);
        this.saveToStorage();
        this.updateIceTimeColors();
        this.updateTotals();
        state.tapTimeout = null;
      }, 200);
    });
    
    // DESKTOP: dblclick für -10
    timeTd.addEventListener("dblclick", (e) => {
      e.preventDefault();
      if (this.dragState.isDragging) return;
      
      if (state.tapTimeout) {
        clearTimeout(state.tapTimeout);
        state.tapTimeout = null;
      }
      
      const currentTime = App.data.playerTimes[playerName] || 0;
      const newTime = Math.max(0, currentTime - 10);
      App.data.playerTimes[playerName] = newTime;
      timeTd.textContent = App.helpers.formatTimeMMSS(newTime);
      this.saveToStorage();
      this.updateIceTimeColors();
      this.updateTotals();
    });
    
    // Add visual feedback for clickability
    timeTd.style.cursor = "pointer";
  },
  
  attachValueClickHandlers() {
    this.container.querySelectorAll("td[data-player][data-cat]").forEach(td => {
      // KRITISCH BUG 4 FIX: Handler-State zurücksetzen
      delete td.dataset.handlersAttached;
      td._tapState = null;
      
      td._tapState = {
        lastTapTime: 0,
        tapTimeout: null
      };
      const state = td._tapState;
      td.dataset.handlersAttached = 'true';
      
      // MOBILE Touch-Handler
      td.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.dragState.isDragging) return;
        
        const now = Date.now();
        
        if (state.lastTapTime > 0 && (now - state.lastTapTime < 300)) {
          clearTimeout(state.tapTimeout);
          state.tapTimeout = null;
          state.lastTapTime = 0;
          this.changeValue(td, -1);
          return;
        }
        
        state.lastTapTime = now;
        state.tapTimeout = setTimeout(() => {
          this.changeValue(td, 1);
          state.tapTimeout = null;
          state.lastTapTime = 0;
        }, 300);
      }, { passive: false });
      
      // DESKTOP: click für +1
      td.addEventListener("click", (e) => {
        if (this.dragState.isDragging) return;
        // Ignoriere wenn Touch-Handler gerade aktiv war
        if (state.lastTapTime > 0 && Date.now() - state.lastTapTime < 500) return;
        
        if (state.tapTimeout) clearTimeout(state.tapTimeout);
        state.tapTimeout = setTimeout(() => {
          this.changeValue(td, 1);
          state.tapTimeout = null;
        }, 200);
      });
      
      // DESKTOP: dblclick für -1
      td.addEventListener("dblclick", (e) => {
        e.preventDefault();
        if (this.dragState.isDragging) return;
        
        if (state.tapTimeout) {
          clearTimeout(state.tapTimeout);
          state.tapTimeout = null;
        }
        this.changeValue(td, -1);
      });
    });
  },
  
  changeValue(td, delta) {
    const player = td.dataset.player;
    const cat = td.dataset.cat;
    
    // Check if this is a Goal or Shot event and delta is positive
    if (delta > 0 && (cat === "Goals" || cat === "Shot")) {
      // Start the Goal Map workflow
      const eventType = cat === "Goals" ? 'goal' : 'shot';
      App.startGoalMapWorkflow(player, eventType);
      return;
    }
    
    if (!App.data.statsData[player]) {
      App.data.statsData[player] = {};
    }
    
    App.data.statsData[player][cat] = (App.data.statsData[player][cat] || 0) + delta;
    App.data.statsData[player][cat] = Math.trunc(App.data.statsData[player][cat]);
    
    // Teamspezifisch speichern
    this.saveToStorage();
    
    td.textContent = App.data.statsData[player][cat];
    
    const val = App.data.statsData[player][cat];
    const colors = App.helpers.getColorStyles();
    td.style.color = val > 0 ? colors.pos : val < 0 ? colors.neg : colors.zero;
    
    this.updateTotals();
  },
  
  updateTotals() {
    const totals = {};
    App.data.categories.forEach(c => totals[c] = 0);
    let timeSum = 0;
    let timePlayerCount = 0;
    
    App.data.selectedPlayers.forEach(p => {
      App.data.categories.forEach(c => {
        totals[c] += Number(App.data.statsData[p.name]?.[c] || 0);
      });
      
      // Time average should reflect skaters shown in the table
      if (p.position !== "G") {
        const playerTime = Number(App.data.playerTimes[p.name] || 0);
        timeSum += playerTime;
        timePlayerCount += 1;
      }
    });
    
    document.querySelectorAll(".total-cell").forEach(tc => {
      const cat = tc.dataset.cat;
      
      if (cat === "+/-") {
        const vals = App.data.selectedPlayers.map(p => Number(App.data.statsData[p.name]?.[cat] || 0));
        const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
        tc.textContent = `Ø ${avg}`;
        tc.style.color = "#ffffff";
      } else if (cat === "FaceOffs Won") {
        const totalFace = totals["FaceOffs"] || 0;
        const pct = totalFace ? Math.round((totals["FaceOffs Won"] / totalFace) * 100) : 0;
        const color = pct > 50 ? "#00ff80" : pct < 50 ? "#ff4c4c" : "#ffffff";
        tc.innerHTML = `<span style="color:white">${totals["FaceOffs Won"]}</span> (<span style="color:${color}">${pct}%</span>)`;
      } else if (cat === "Time") {
        const avgTimeSeconds = timePlayerCount > 0 ? Math.round(timeSum / timePlayerCount) : 0;
        tc.textContent = `Ø ${App.helpers.formatTimeMMSS(avgTimeSeconds)}`;
      } else if (cat === "Shot") {
        if (!tc.dataset.opp) tc.dataset.opp = "0";
        const own = totals["Shot"] || 0;
        const opp = Number(tc.dataset.opp) || 0;
        const ownC = own > opp ? "#00ff80" : opp > own ? "#ff4c4c" : "#ffffff";
        const oppC = opp > own ? "#00ff80" : own > opp ? "#ff4c4c" : "#ffffff";
        tc.innerHTML = `<span style="color:${ownC}">${own}</span> <span style="color:white">vs</span> <span style="color:${oppC}">${opp}</span>`;
        
        // Only attach event listeners once (check if already attached)
        if (!tc.dataset.listenersAttached) {
          tc.dataset.listenersAttached = "true";
          
          // Helper function to update opponent shots display and storage
          const updateOpponentShots = (newOpp) => {
            tc.dataset.opp = String(newOpp);
            
            // Gegner-Schüsse teamspezifisch in LocalStorage speichern
            const teamId = App.helpers.getCurrentTeamId();
            AppStorage.setItem(`opponentShots_${teamId}`, tc.dataset.opp);
            
            // Update display directly without recursion
            // Recalculate own shots fresh from current stats data
            let ownVal = 0;
            App.data.selectedPlayers.forEach(p => {
              ownVal += Number(App.data.statsData[p.name]?.["Shot"] || 0);
            });
            
            const oppVal = newOpp;
            const ownColor = ownVal > oppVal ? "#00ff80" : oppVal > ownVal ? "#ff4c4c" : "#ffffff";
            const oppColor = oppVal > ownVal ? "#00ff80" : ownVal > oppVal ? "#ff4c4c" : "#ffffff";
            tc.innerHTML = `<span style="color:${ownColor}">${ownVal}</span> <span style="color:white">vs</span> <span style="color:${oppColor}">${oppVal}</span>`;
          };
          
          // Track click timing for double-click detection
          let clickTimeout = null;
          
          // Single Click: start opponent-shot workflow (requires active goalie)
          tc.addEventListener('click', (e) => {
            if (clickTimeout) {
              // Double click will be handled by dblclick handler
              return;
            }
            
            clickTimeout = setTimeout(() => {
              // Single click: start opponent-shot workflow
              const activeGoalie = App.goalMap?.getActiveGoalie?.() ?? null;
              if (!activeGoalie) {
                alert('Please select a goalie first');
                clickTimeout = null;
                return;
              }
              App.startGoalMapWorkflow(activeGoalie.name, 'opponent-shot');
              clickTimeout = null;
            }, 250); // 250ms delay to detect double click
          });
          
          // Double Click: -1 (but not below 0)
          tc.addEventListener('dblclick', (e) => {
            e.preventDefault();
            
            if (clickTimeout) {
              clearTimeout(clickTimeout);
              clickTimeout = null;
            }
            
            // Double click: -1 (minimum 0)
            const currentOpp = Number(tc.dataset.opp || 0);
            const newOpp = Math.max(0, currentOpp - 1);
            updateOpponentShots(newOpp);
          });
          
          // ========== MOBILE: Touch-Handler mit manueller Doppel-Tap-Erkennung ==========
          let lastTapTime = 0;
          let tapTimeout = null;
          
          tc.addEventListener('touchend', (e) => {
            e.preventDefault();  // KRITISCH: Verhindert Browser-Zoom!
            e.stopPropagation();
            
            const now = Date.now();
            
            // Doppel-Tap Detection (innerhalb 300ms)
            if (lastTapTime > 0 && (now - lastTapTime < 300)) {
              // DOPPEL-TAP: -1 (minimum 0)
              if (tapTimeout) {
                clearTimeout(tapTimeout);
                tapTimeout = null;
              }
              lastTapTime = 0;
              
              const currentOpp = Number(tc.dataset.opp || 0);
              const newOpp = Math.max(0, currentOpp - 1);
              updateOpponentShots(newOpp);
              return;
            }
            
            lastTapTime = now;
            tapTimeout = setTimeout(() => {
              // EINZEL-TAP: start opponent-shot workflow
              const activeGoalie = App.goalMap?.getActiveGoalie?.() ?? null;
              if (!activeGoalie) {
                alert('Please select a goalie first');
                tapTimeout = null;
                lastTapTime = 0;
                return;
              }
              App.startGoalMapWorkflow(activeGoalie.name, 'opponent-shot');
              tapTimeout = null;
              lastTapTime = 0;
            }, 300);
          }, { passive: false });  // passive: false erlaubt preventDefault()
          // ========== ENDE MOBILE TOUCH HANDLER ==========
          
          // Add visual feedback for clickability
          tc.style.cursor = "pointer";
        }
      } else {
        const val = totals[cat] || 0;
        const colors = App.helpers.getColorStyles();
        tc.textContent = val;
        tc.style.color = val > 0 ? colors.pos : val < 0 ? colors.neg : colors.zero;
      }
    });
  },
  
  // Funktion um Gegner-Schüsse für Export zu erhalten
  getOpponentShots() {
    const shotCell = document.querySelector('.total-cell[data-cat="Shot"]');
    return shotCell ? (Number(shotCell.dataset.opp) || 0) : 0;
  },
  
  // Funktion um Shot Total String für Export zu erhalten
  getShotTotalString() {
    const totals = {};
    App.data.categories.forEach(c => totals[c] = 0);
    
    App.data.selectedPlayers.forEach(p => {
      App.data.categories.forEach(c => {
        totals[c] += Number(App.data.statsData[p.name]?.[c] || 0);
      });
    });
    
    const own = totals["Shot"] || 0;
    const opp = this.getOpponentShots();
    return `${own} vs ${opp}`;
  },
  
  updateIceTimeColors() {
    if (!this.container) return;

    // Goalie detection via playerSelectionData (established pattern from season-table.js / line-up.js)
    const teamId = App.helpers.getCurrentTeamId();
    let savedPlayers = [];
    try { savedPlayers = JSON.parse(AppStorage.getItem(`playerSelectionData_${teamId}`) || "[]"); } catch (e) { console.warn('Failed to parse playerSelectionData:', e); }
    // Fallback to App.data.selectedPlayers when savedPlayers is empty
    const goalieNames = new Set(
      (savedPlayers.length > 0 ? savedPlayers : App.data.selectedPlayers)
        .filter(p => p.isGoalie || (p.position || '').toUpperCase() === 'G')
        .map(p => p.name)
    );

    // Cache getComputedStyle once per call (not per cell) so theme changes take immediate effect
    const cs = getComputedStyle(document.documentElement);
    const topColor = cs.getPropertyValue('--ice-top').trim() || "#00c06f";
    const bottomColor = cs.getPropertyValue('--ice-bottom').trim() || "#ff4c4c";
    const zeroColor = cs.getPropertyValue('--cell-zero-color').trim() || "#ffffff";

    // Field-player-only list for top/bottom ranking — goalies are excluded
    const fieldList = App.data.selectedPlayers
      .filter(p => !goalieNames.has(p.name))
      .map(p => ({
        name: p.name,
        seconds: App.data.playerTimes[p.name] || 0
      }));

    // Retain existing top-5 / bottom-5 logic; only the list is now filtered
    const top5 = new Set(fieldList.slice().sort((a, b) => b.seconds - a.seconds).slice(0, 5).map(x => x.name));
    const bottom5 = new Set(fieldList.slice().sort((a, b) => a.seconds - b.seconds).slice(0, 5).map(x => x.name));

    this.container.querySelectorAll(".ice-time-cell").forEach(cell => {
      const nm = cell.dataset.player;
      if (goalieNames.has(nm)) {
        // Explicitly reset goalie cells to neutral — prevents ghost coloring from previous renders
        cell.style.color = zeroColor;
      } else if (top5.has(nm)) {
        cell.style.color = topColor;
      } else if (bottom5.has(nm)) {
        cell.style.color = bottomColor;
      } else {
        cell.style.color = zeroColor;
      }
    });
  },
  
  updateCellColorsForTheme() {
    const colors = App.helpers.getColorStyles();
    
    // Update all statistic cells
    this.container?.querySelectorAll("td[data-player][data-cat]").forEach(td => {
      const val = Number(td.textContent) || 0;
      td.style.color = val > 0 ? colors.pos : val < 0 ? colors.neg : colors.zero;
    });
    
    // Update Ice Time cells
    this.updateIceTimeColors();
    
    // Update totals
    this.updateTotals();
  },
  
  // Teamspezifische Lade- und Speicherfunktionen
  loadTeamSpecificData() {
    const teamId = App.helpers.getCurrentTeamId();
    if (!teamId) {
      console.warn('No team selected, cannot load team-specific data');
      return;
    }
    
    // Load team-specific selectedPlayers order if it exists
    const savedSelectedPlayers = AppStorage.getItem(`selectedPlayers_${teamId}`);
    if (savedSelectedPlayers) {
      try {
        App.data.selectedPlayers = JSON.parse(savedSelectedPlayers);
      } catch (e) {
        console.warn('Failed to load team-specific selectedPlayers:', e);
      }
    }
    
    // Load team-specific stats data
    const savedStatsData = AppStorage.getItem(`statsData_${teamId}`);
    if (savedStatsData) {
      try {
        App.data.statsData = JSON.parse(savedStatsData);
      } catch (e) {
        console.warn('Failed to load team-specific statsData:', e);
      }
    }
    
    // Load team-specific player times
    const savedPlayerTimes = AppStorage.getItem(`playerTimes_${teamId}`);
    if (savedPlayerTimes) {
      try {
        App.data.playerTimes = JSON.parse(savedPlayerTimes);
      } catch (e) {
        console.warn('Failed to load team-specific playerTimes:', e);
      }
    }
  },
  
  saveToStorage() {
    const teamId = App.helpers.getCurrentTeamId();
    if (!teamId) {
      console.warn('No team selected, cannot save team-specific data');
      return;
    }
    AppStorage.setItem(`selectedPlayers_${teamId}`, JSON.stringify(App.data.selectedPlayers));
    AppStorage.setItem(`statsData_${teamId}`, JSON.stringify(App.data.statsData));
    AppStorage.setItem(`playerTimes_${teamId}`, JSON.stringify(App.data.playerTimes));
  },
  
  saveActiveTimersState() {
    const teamId = App.helpers.getCurrentTeamId();
    const activeTimerPlayers = Object.keys(App.data.activeTimers);
    AppStorage.setItem(`activeTimerPlayers_${teamId}`, JSON.stringify(activeTimerPlayers));
  },
  
  // Reset nur für aktuelles Team
  reset() {
    // Show confirmation dialog
    if (!confirm("Spieldaten zurücksetzen?")) return;
    
    // Clear in-memory data
    App.data.statsData = {};
    App.data.playerTimes = {};
    
    // Timer stoppen und aus LocalStorage entfernen
    Object.values(App.data.activeTimers).forEach(timer => {
      if (timer) clearInterval(timer);
    });
    App.data.activeTimers = {};
    
    // Teamspezifisch löschen - use consistent helper
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.removeItem(`statsData_${teamId}`);
    AppStorage.removeItem(`playerTimes_${teamId}`);
    AppStorage.removeItem(`activeTimerPlayers_${teamId}`);
    AppStorage.removeItem(`opponentShots_${teamId}`);
    if (App.storage && typeof App.storage.clearOnIceShotCounts === 'function') {
      App.storage.clearOnIceShotCounts();
    }
    
    // Re-render table
    this.render();
    alert("Game data reset.");
  }
};
