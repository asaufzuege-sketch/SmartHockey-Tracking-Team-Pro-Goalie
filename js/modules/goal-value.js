// Goal Value Modul - MIT SCROLLING und STICKY COLUMN

App.goalValue = {
  container: null,
  clickTimers: {},
  isUpdatingData: false,
  isExpandingColumns: false,  // Flag to prevent infinite recursion
  
  // Constants for double-tap detection
  DOUBLE_TAP_DELAY: 300,
  
  init() {
    this.container = document.getElementById("goalValueContainer");
    
    document.getElementById("resetGoalValueBtn")?.addEventListener("click", () => {
      this.reset();
    });
    
    // NEU: Add Opponent Button
    document.getElementById("addOpponentBtn")?.addEventListener("click", () => {
      this.addOpponent();
    });
  },
  
  getOpponents() {
    const MIN_COLUMNS = 15;
    const DEFAULT_OPPONENT_PATTERN = /^Opponent \d+$/;  // Matches "Opponent 1", "Opponent 2", etc.
    
    try {
      const teamId = App.helpers.getCurrentTeamId();
      const raw = AppStorage.getItem(`goalValueOpponents_${teamId}`);
      if (raw) {
        let opponents = JSON.parse(raw);
        let needsSave = false;
        
        // Convert old German "Gegner" to English "Opponent"
        opponents = opponents.map((op, i) => {
          if (op && op.startsWith("Gegner")) {
            needsSave = true;
            const match = op.match(/Gegner\s+(\d+)/);
            return match ? `Opponent ${match[1]}` : `Opponent ${i + 1}`;
          }
          return op;
        });
        
        // Skip trimming logic if skipTrimming flag is set (e.g., when adding a new opponent)
        if (this.skipTrimming) {
          if (needsSave) {
            this.setOpponents(opponents);
          }
          return opponents;
        }
        
        // Get bottom values to check which columns are "used"
        const bottom = this.getBottom();
        
        // Count how many columns have REAL opponent names (not default "Opponent X")
        // OR have a bottom value > 0
        const usedColumns = opponents.filter((op, idx) => {
          const hasRealName = op && !DEFAULT_OPPONENT_PATTERN.test(op);
          const hasBottomValue = idx < bottom.length && Number(bottom[idx]) > 0;
          return hasRealName || hasBottomValue;
        }).length;
        
        // If ALL columns are default/empty, reset to exactly MIN_COLUMNS
        if (usedColumns === 0) {
          needsSave = true;
          opponents = Array.from({ length: MIN_COLUMNS }, (_, i) => `Opponent ${i + 1}`);
          // Also reset bottom and gameCounts arrays
          this.setBottom(Array(MIN_COLUMNS).fill(0));
          this.setGameCounts(Array(MIN_COLUMNS).fill(0));
          
          // Reset player data to match new column count
          const data = this.getData();
          Object.keys(data).forEach(playerName => {
            data[playerName] = Array(MIN_COLUMNS).fill(0);
          });
          this.setData(data);
        } else {
          // Find the last used column index
          let lastUsedIndex = -1;
          for (let i = opponents.length - 1; i >= 0; i--) {
            const hasRealName = opponents[i] && !DEFAULT_OPPONENT_PATTERN.test(opponents[i]);
            const hasBottomValue = i < bottom.length && Number(bottom[i]) > 0;
            if (hasRealName || hasBottomValue) {
              lastUsedIndex = i;
              break;
            }
          }
          
          // Calculate target column count: used columns + 1 empty, but at least MIN_COLUMNS
          // +2 = +1 to convert index to count + 1 for extra empty column
          const targetColumns = Math.max(MIN_COLUMNS, lastUsedIndex + 2);
          
          // Adjust to target columns (reduce if too many empty at end, expand if needed)
          if (opponents.length > targetColumns) {
            // Reduce to target (keeping all used columns + 1 empty)
            needsSave = true;
            opponents = opponents.slice(0, targetColumns);
            // Also trim bottom and gameCounts
            const trimmedBottom = bottom.slice(0, targetColumns);
            while (trimmedBottom.length < targetColumns) trimmedBottom.push(0);
            this.setBottom(trimmedBottom);
            
            const gameCounts = this.getGameCounts();
            const trimmedGameCounts = gameCounts.slice(0, targetColumns);
            while (trimmedGameCounts.length < targetColumns) trimmedGameCounts.push(0);
            this.setGameCounts(trimmedGameCounts);
            
            // Trim player data arrays to match new column count
            const data = this.getData();
            Object.keys(data).forEach(playerName => {
              if (Array.isArray(data[playerName])) {
                data[playerName] = data[playerName].slice(0, targetColumns);
                while (data[playerName].length < targetColumns) {
                  data[playerName].push(0);
                }
              }
            });
            this.setData(data);
          } else if (opponents.length < MIN_COLUMNS) {
            // Expand to MIN_COLUMNS
            needsSave = true;
            while (opponents.length < MIN_COLUMNS) {
              opponents.push(`Opponent ${opponents.length + 1}`);
            }
          }
        }
        
        if (needsSave) {
          this.setOpponents(opponents);
        }
        return opponents;
      }
    } catch (e) {
      console.error("[Goal Value] Error loading opponents:", e);
    }
    
    // Default: 15 empty columns
    return Array.from({ length: MIN_COLUMNS }, (_, i) => `Opponent ${i + 1}`);
  },
  
  setOpponents(arr) {
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`goalValueOpponents_${teamId}`, JSON.stringify(arr));
  },
  
  getData() {
    try {
      const teamId = App.helpers.getCurrentTeamId();
      const raw = AppStorage.getItem(`goalValueData_${teamId}`);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {};
  },
  
  setData(obj, forceWrite = false) {
    if (this.isUpdatingData && !forceWrite) {
      console.warn("[Goal Value] setData blocked during update to prevent recursion");
      return;
    }
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`goalValueData_${teamId}`, JSON.stringify(obj));
  },
  
  getBottom() {
    try {
      const teamId = App.helpers.getCurrentTeamId();
      const raw = AppStorage.getItem(`goalValueBottom_${teamId}`);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return this.getOpponents().map(() => 0);
  },
  
  setBottom(arr) {
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`goalValueBottom_${teamId}`, JSON.stringify(arr));
  },
  
  getGameCounts() {
    try {
      const teamId = App.helpers.getCurrentTeamId();
      const raw = AppStorage.getItem(`goalValueGameCounts_${teamId}`);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return this.getOpponents().map(() => 0);
  },
  
  setGameCounts(arr) {
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`goalValueGameCounts_${teamId}`, JSON.stringify(arr));
  },
  
  computeValueForPlayer(name) {
    const data = this.getData();
    const bottom = this.getBottom();
    const vals = Array.isArray(data[name]) ? data[name] : [];
    return bottom.reduce((sum, w, i) => sum + (Number(vals[i] || 0) * Number(w || 0)), 0);
  },
  
  formatValueNumber(v) {
    return Math.abs(v - Math.round(v)) < 1e-4 ? String(Math.round(v)) : String(Number(v.toFixed(1))); 
  },
  
  ensureDataForSeason() {
    if (this.isUpdatingData) {
      console.warn("[Goal Value] ensureDataForSeason blocked to prevent recursion");
      return;
    }
    
    this.isUpdatingData = true;
    
    try {
      const opponents = this.getOpponents();
      const all = this.getData();
      
      Object.keys(App.data.seasonData).forEach(name => {
        if (!all[name] || !Array.isArray(all[name])) {
          all[name] = opponents.map(() => 0);
        } else {
          while (all[name].length < opponents.length) all[name].push(0);
          if (all[name].length > opponents.length) all[name] = all[name].slice(0, opponents.length);
        }
      });
      
      const teamId = App.helpers.getCurrentTeamId();
      AppStorage.setItem(`goalValueData_${teamId}`, JSON.stringify(all));
      console.log("[Goal Value] ensureDataForSeason completed");
    } finally {
      this.isUpdatingData = false;
    }
  },
  
  render() {
    if (!this.container) return;
    
    // Container leer
    this.container.innerHTML = "";
    
    const opponents = this.getOpponents();
    const gData = this.getData();
    const bottom = this.getBottom();
    
    // Get player list and filter out goalies
    let playersList = Object.keys(App.data.seasonData).length 
      ? Object.keys(App.data.seasonData).sort() 
      : App.data.selectedPlayers.map(p => p.name);
    
    // Filter out goalies - check both playerSelectionData and selectedPlayers
    const currentTeamId = App.helpers.getCurrentTeamId();
    const savedPlayersKey = `playerSelectionData_${currentTeamId}`;
    
    try {
      const savedPlayers = JSON.parse(AppStorage.getItem(savedPlayersKey) || "[]");
      const goalieNames = savedPlayers
        .filter(p => p.position === "G" || p.isGoalie)
        .map(p => p.name);
      const fieldPlayerNames = savedPlayers
        .filter(p => p.position !== "G" && !p.isGoalie && p.name && p.name.trim() !== "")
        .map(p => p.name);
      
      // Only filter out names that are EXCLUSIVELY goalies (not also field players)
      playersList = playersList.filter(name => !goalieNames.includes(name) || fieldPlayerNames.includes(name));
    } catch (e) {
      // Fallback: filter from selectedPlayers
      const goalieNames = (App.data.selectedPlayers || [])
        .filter(p => p.position === "G" || p.isGoalie)
        .map(p => p.name);
      playersList = playersList.filter(name => !goalieNames.includes(name));
    }
    
    const colors = App.helpers.getColorStyles();
    const valueCellMap = {};
    
    // Container für horizontales Scrolling
    const scrollWrapper = document.createElement("div");
    scrollWrapper.className = "goal-value-scroll-wrapper";
    
    // EINE EINZIGE TABELLE
    const table = document.createElement("table");
    table.className = "goal-value-table";
    
    // THEAD - Header Zeile
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    
    // Player Header (sticky)
    const playerTh = document.createElement("th");
    playerTh.textContent = "Player";
    playerTh.className = "sticky-col";
    headerRow.appendChild(playerTh);
    
    // Opponent Headers
    opponents.forEach((op, idx) => {
      const th = document.createElement("th");
      const input = document.createElement("input");
      input.type = "text";
      input.value = op || "";
      input.placeholder = `Opponent ${idx+1}`;
      input.className = "goalvalue-title-input";
      input.addEventListener("change", () => {
        const arr = this.getOpponents();
        arr[idx] = input.value || "";
        this.setOpponents(arr);
        this.render();
      });
      th.appendChild(input);
      headerRow.appendChild(th);
    });
    
    // Value Header
    const valueTh = document.createElement("th");
    valueTh.textContent = "Value";
    headerRow.appendChild(valueTh);
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // TBODY - Spieler Zeilen
    const tbody = document.createElement("tbody");
    
    playersList.forEach((name, rowIdx) => {
      const row = document.createElement("tr");
      row.className = (rowIdx % 2 === 0 ? "even-row" : "odd-row");
      
      // Player Name (sticky)
      const nameTd = document.createElement("td");
      nameTd.textContent = name;
      nameTd.className = "sticky-col";
      row.appendChild(nameTd);
      
      // Values für jeden Gegner
      const vals = (gData[name] && Array.isArray(gData[name])) ? gData[name].slice() : opponents.map(() => 0);
      while (vals.length < opponents.length) vals.push(0);
      
      opponents.forEach((_, i) => {
        const td = document.createElement("td");
        td.dataset.player = name;
        td.dataset.oppIdx = String(i);
        td.className = "gv-data-cell";
        
        const v = Number(vals[i] || 0);
        td.textContent = String(v);
        td.style.color = v > 0 ? colors.pos : v < 0 ? colors.neg : colors.zero;
        td.style.fontWeight = v !== 0 ? "700" : "400";
        
        // KRITISCH BUG 9 FIX: Handler-State zurücksetzen
        delete td.dataset.handlersAttached;
        td._tapState = null;
        
        td._tapState = {
          lastTapTime: 0,
          tapTimeout: null,
          startX: 0,
          startY: 0,
          moved: false
        };
        const state = td._tapState;
        td.dataset.handlersAttached = 'true';

        td.addEventListener('touchstart', (e) => {
          const touch = e.touches?.[0];
          state.startX = touch?.clientX ?? 0;
          state.startY = touch?.clientY ?? 0;
          state.moved = false;
        }, { passive: true });

        td.addEventListener('touchmove', (e) => {
          const touch = e.touches?.[0];
          if (!touch) return;

          const dx = touch.clientX - state.startX;
          const dy = touch.clientY - state.startY;
          if (Math.hypot(dx, dy) > 10) {
            state.moved = true;
            if (state.tapTimeout) {
              clearTimeout(state.tapTimeout);
              state.tapTimeout = null;
            }
            state.lastTapTime = 0;
          }
        }, { passive: true });
        
        // MOBILE: Touch-Handler mit preventDefault/stopPropagation
        td.addEventListener('touchend', (e) => {
          if (state.moved) {
            state.moved = false;
            state.lastTapTime = 0;
            return;
          }

          e.preventDefault();
          e.stopPropagation();
          
          const now = Date.now();
          const playerName = td.dataset.player;
          const oppIdx = Number(td.dataset.oppIdx);
          
          // Double-Tap Detection
          if (state.lastTapTime > 0 && (now - state.lastTapTime < 300)) {
            clearTimeout(state.tapTimeout);
            state.tapTimeout = null;
            state.lastTapTime = 0;
            
            const d = this.getData();
            if (!d[playerName]) d[playerName] = opponents.map(() => 0);
            d[playerName][oppIdx] = Math.max(0, Number(d[playerName][oppIdx] || 0) - 1);
            this.setData(d, true);
            
            const nv = d[playerName][oppIdx];
            td.textContent = String(nv);
            td.style.color = nv > 0 ? colors.pos : nv < 0 ? colors.neg : colors.zero;
            td.style.fontWeight = nv !== 0 ? "700" : "400";
            
            this.updateValueCell(playerName, valueCellMap);
            return;
          }
          
          state.lastTapTime = now;
          state.tapTimeout = setTimeout(() => {
            const d = this.getData();
            if (!d[playerName]) d[playerName] = opponents.map(() => 0);
            d[playerName][oppIdx] = Number(d[playerName][oppIdx] || 0) + 1;
            this.setData(d, true);
            
            const nv = d[playerName][oppIdx];
            td.textContent = String(nv);
            td.style.color = nv > 0 ? colors.pos : nv < 0 ? colors.neg : colors.zero;
            td.style.fontWeight = nv !== 0 ? "700" : "400";
            
            this.updateValueCell(playerName, valueCellMap);
            
            state.tapTimeout = null;
            state.lastTapTime = 0;
          }, 300);
        }, { passive: false });

        td.addEventListener('touchcancel', () => {
          if (state.tapTimeout) {
            clearTimeout(state.tapTimeout);
            state.tapTimeout = null;
          }
          state.lastTapTime = 0;
          state.moved = false;
        }, { passive: true });
        
        // DESKTOP: Click handler
        td.addEventListener("click", (e) => {
          e.preventDefault();
          
          // Ignoriere wenn Touch-Handler gerade aktiv war
          if (state.lastTapTime > 0 && Date.now() - state.lastTapTime < 500) return;
          
          const cellId = `${name}-${i}`;
          const playerName = td.dataset.player;
          const oppIdx = Number(td.dataset.oppIdx);
          
          if (this.clickTimers[cellId]) {
            clearTimeout(this.clickTimers[cellId]);
            delete this.clickTimers[cellId];
            
            // DOPPELKLICK: -1
            const d = this.getData();
            if (! d[playerName]) d[playerName] = opponents.map(() => 0);
            d[playerName][oppIdx] = Math.max(0, Number(d[playerName][oppIdx] || 0) - 1);
            this.setData(d, true);
            
            const nv = d[playerName][oppIdx];
            td.textContent = String(nv);
            td.style.color = nv > 0 ?  colors.pos : nv < 0 ? colors.neg : colors.zero;
            td.style.fontWeight = nv !== 0 ? "700" : "400";
            
            this.updateValueCell(playerName, valueCellMap);
            
          } else {
            this.clickTimers[cellId] = setTimeout(() => {
              delete this.clickTimers[cellId];
              
              // EINZELKLICK: +1
              const d = this.getData();
              if (!d[playerName]) d[playerName] = opponents.map(() => 0);
              d[playerName][oppIdx] = Number(d[playerName][oppIdx] || 0) + 1;
              this.setData(d, true);
              
              const nv = d[playerName][oppIdx];
              td.textContent = String(nv);
              td.style.color = nv > 0 ? colors.pos : nv < 0 ? colors.neg : colors.zero;
              td.style.fontWeight = nv !== 0 ? "700" : "400";
              
              this.updateValueCell(playerName, valueCellMap);
            }, 300);
          }
        });
        
        row.appendChild(td);
      });
      
      // Value (Durchschnitt)
      const valueTd = document.createElement("td");
      valueTd.className = "gv-value-cell";
      const val = this.computeValueForPlayer(name);
      valueTd.textContent = this.formatValueNumber(val);
      valueTd.style.color = val > 0 ? colors.pos : val < 0 ? colors.neg : colors.zero;
      valueTd.style.fontWeight = val !== 0 ? "700" : "400";
      row.appendChild(valueTd);
      
      valueCellMap[name] = valueTd;
      tbody.appendChild(row);
    });
    
    // Bottom/Total Zeile
    const bottomRow = document.createElement("tr");
    bottomRow.className = "bottom-row";
    
    const bottomLabelTd = document.createElement("td");
    bottomLabelTd.textContent = "";  // Leer lassen
    bottomLabelTd.className = "sticky-col";
    bottomRow.appendChild(bottomLabelTd);
    
    const scaleOptions = [];
    for (let v = 0; v <= 10; v++) scaleOptions.push((v * 0.5).toFixed(1));
    
    const storedBottom = this.getBottom();
    while (storedBottom.length < opponents.length) storedBottom.push(0);
    if (storedBottom.length > opponents.length) storedBottom.length = opponents.length;
    this.setBottom(storedBottom);
    
    opponents.forEach((_, i) => {
      const td = document.createElement("td");
      const select = document.createElement("select");
      select.className = "gv-scale-dropdown";
      
      scaleOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        select.appendChild(option);
      });
      
      // KRITISCH: Gespeicherten Wert setzen (auf 0.5 gerundet)
      const savedValue = storedBottom[i] || 0;
      const roundedValue = Math.round(savedValue * 2) / 2; // Auf 0.5 runden
      select.value = roundedValue.toFixed(1);
      
      select.addEventListener("change", () => {
        const newValue = parseFloat(select.value);
        const arr = this.getBottom();
        arr[i] = newValue;
        this.setBottom(arr);
        
        Object.keys(valueCellMap).forEach(pn => {
          this.updateValueCell(pn, valueCellMap);
        });
      });
      
      td.appendChild(select);
      bottomRow.appendChild(td);
    });
    
    const emptyValueTd = document.createElement("td");
    bottomRow.appendChild(emptyValueTd);
    
    tbody.appendChild(bottomRow);
    table.appendChild(tbody);
    
    scrollWrapper.appendChild(table);
    this.container.appendChild(scrollWrapper);
    
    console.log('Goal Value Table rendered with single unified table');
    
    // Check if dynamic expansion is needed
    this.checkAndExpandColumns();
  },
  
  checkAndExpandColumns() {
    // Prevent infinite recursion
    if (this.isExpandingColumns) {
      console.log("[Goal Value] Column expansion already in progress, skipping");
      return;
    }
    
    const opponents = this.getOpponents();
    const bottom = this.getBottom();
    
    // Ensure bottom array matches opponents length
    while (bottom.length < opponents.length) {
      bottom.push(0);
    }
    if (bottom.length > opponents.length) {
      bottom.length = opponents.length;
    }
    
    // Check if ALL columns have a Bottom value > 0
    const allFilled = opponents.every((_, idx) => {
      return idx < bottom.length && Number(bottom[idx]) > 0;
    });
    
    if (allFilled) {
      this.isExpandingColumns = true;
      
      // Add new column
      const newOpponents = [...opponents, `Opponent ${opponents.length + 1}`];
      this.setOpponents(newOpponents);
      
      // Extend Bottom array
      const newBottom = [...bottom, 0];
      this.setBottom(newBottom);
      
      // Extend GameCounts array
      const gameCounts = this.getGameCounts();
      gameCounts.push(0);
      this.setGameCounts(gameCounts);
      
      // Extend data for all players
      const data = this.getData();
      Object.keys(data).forEach(playerName => {
        if (Array.isArray(data[playerName])) {
          data[playerName].push(0);
        }
      });
      this.setData(data);
      
      console.log("[Goal Value] Added new column, total:", newOpponents.length);
      
      // Re-render table with new column
      // Use setTimeout to avoid recursion
      setTimeout(() => {
        this.isExpandingColumns = false;
        this.render();
      }, 0);
    }
  },
  
  updateValueCell(playerName, valueCellMap) {
    const vc = valueCellMap[playerName];
    if (!vc) return;
    
    const colors = App.helpers.getColorStyles();
    const val = this.computeValueForPlayer(playerName);
    vc.textContent = this.formatValueNumber(val);
    vc.style.color = val > 0 ? colors.pos : val < 0 ? colors.neg : colors.zero;
    vc.style.fontWeight = val !== 0 ? "700" : "400";
  },
  
  addOpponent() {
    // Set flag to skip trimming during next render
    this.skipTrimming = true;
    
    // 1. Extend opponents array
    const opponents = this.getOpponents();
    const newOpponentName = `Opponent ${opponents.length + 1}`;
    opponents.push(newOpponentName);
    this.setOpponents(opponents);
    
    // 2. Extend bottom array
    const bottom = this.getBottom();
    bottom.push(0);
    this.setBottom(bottom);
    
    // 3. Extend gameCounts array
    const gameCounts = this.getGameCounts();
    gameCounts.push(0);
    this.setGameCounts(gameCounts);
    
    // 4. Extend data for each player
    const data = this.getData();
    Object.keys(data).forEach(playerName => {
      if (Array.isArray(data[playerName])) {
        data[playerName].push(0);
      }
    });
    this.setData(data, true);  // forceWrite = true
    
    console.log("[Goal Value] Added new opponent:", newOpponentName);
    
    // 5. Re-render table
    this.render();
    
    // Reset flag after render
    this.skipTrimming = false;
  },
  
  reset() {
    if (!confirm("Reset Goal Value?")) return;
    
    const teamId = App.helpers.getCurrentTeamId();
    const MIN_COLUMNS = 15;
    
    // Reset to exactly 15 columns
    AppStorage.removeItem(`goalValueOpponents_${teamId}`);
    AppStorage.removeItem(`goalValueData_${teamId}`);
    AppStorage.removeItem(`goalValueBottom_${teamId}`);
    AppStorage.removeItem(`goalValueGameCounts_${teamId}`);
    
    // Set fresh 15-column defaults
    this.setOpponents(Array.from({ length: MIN_COLUMNS }, (_, i) => `Opponent ${i + 1}`));
    this.setBottom(Array(MIN_COLUMNS).fill(0));
    this.setGameCounts(Array(MIN_COLUMNS).fill(0));
    
    this.render();
    alert("Goal Value reset.");
  }
};
