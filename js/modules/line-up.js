// Line Up Module

App.lineUp = {
  container: null,
  modalOpen: false,
  currentPosition: null,
  lineUpData: {},
  playersOut: [],
  playerOutSnapshots: {},
  currentMode: 'normal', // 'normal', 'power', 'manuell'
  modes: ['normal', 'power', 'manuell'],
  goaliePositions: ['G', 'GK', 'GOALIE'], // Positions that identify goalies
  
  init() {
    this.container = document.getElementById("lineUpContainer");
    this.loadData();
    this.attachEventListeners();
    this.updateModeDisplay(); // This calls updateModeColors()
    this.render();
    this.updatePlayerOutButton();
  },
  
  loadData() {
    const currentTeamId = App.helpers.getCurrentTeamId();
    const savedPlayersOut = AppStorage.getItem(`playersOut_${currentTeamId}`);
    
    // Load team-specific stats data
    try {
      const savedStatsData = AppStorage.getItem(`statsData_${currentTeamId}`);
      App.data.statsData = savedStatsData ? JSON.parse(savedStatsData) : {};
    } catch (e) {
      App.data.statsData = {};
    }
    
    // Load mode-specific lineup data
    this.loadDataForMode(this.currentMode);
    
    try {
      this.playersOut = savedPlayersOut ? JSON.parse(savedPlayersOut) : [];
    } catch (e) {
      this.playersOut = [];
    }
    
    // Load player-out snapshots
    try {
      const savedSnapshots = AppStorage.getItem(`playerOutSnapshots_${currentTeamId}`);
      this.playerOutSnapshots = savedSnapshots ? JSON.parse(savedSnapshots) : {};
    } catch (e) {
      this.playerOutSnapshots = {};
    }
  },
  
  saveData() {
    // Save to mode-specific storage
    this.saveDataForMode(this.currentMode);
  },
  
  saveDataForMode(mode) {
    const currentTeamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`lineUpData_${mode}_${currentTeamId}`, JSON.stringify(this.lineUpData));
  },
  
  loadDataForMode(mode) {
    const currentTeamId = App.helpers.getCurrentTeamId();
    const savedData = AppStorage.getItem(`lineUpData_${mode}_${currentTeamId}`);
    
    try {
      this.lineUpData = savedData ? JSON.parse(savedData) : {};
    } catch (e) {
      this.lineUpData = {};
    }
    
    // Remove any players that are marked as OUT
    let changed = false;
    Object.keys(this.lineUpData).forEach(posKey => {
      if (this.playersOut.includes(this.lineUpData[posKey])) {
        delete this.lineUpData[posKey];
        changed = true;
      }
    });
    
    // Save if we removed any players
    if (changed) {
      this.saveDataForMode(mode);
    }
    
    // Auto-fill lineup if empty and there are selected players
    const hasLineupData = Object.keys(this.lineUpData).length > 0;
    if (!hasLineupData) {
      const availablePlayers = this.getAvailablePlayers();
      if (availablePlayers && availablePlayers.length > 0) {
        // Auto-fill based on current mode
        if (mode === 'normal') {
          this.autoFillNormalMode();
        } else if (mode === 'power') {
          this.autoFillPowerMode();
        }
      }
    }
  },
  
  savePlayersOut() {
    const currentTeamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`playersOut_${currentTeamId}`, JSON.stringify(this.playersOut));
  },
  
  savePlayerOutSnapshots() {
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`playerOutSnapshots_${teamId}`, JSON.stringify(this.playerOutSnapshots || {}));
  },
  
  fillFirstEmptySlotForPlayer(playerName) {
    this.fillFirstEmptySlotForPlayerInData(playerName, this.lineUpData);
  },
  
  fillFirstEmptySlotForPlayerInData(playerName, dataObj) {
    const players = this.getAvailablePlayers();
    const player = players.find(p => p.name === playerName);
    const pos = (player?.position || '').toUpperCase();
    
    const isDefense = ['D', 'DL', 'DR', 'DEF'].includes(pos);
    const isOffense = ['C', 'W', 'LW', 'RW', 'F', 'FW'].includes(pos);
    
    let slots;
    if (isDefense) {
      slots = ['DL_pair1', 'DR_pair1', 'DL_pair2', 'DR_pair2', 'DL_pair3', 'DR_pair3'];
    } else if (isOffense) {
      slots = [
        'LW_line1', 'RW_line1', 'LW_line2', 'RW_line2',
        'C_line1', 'C_line2', 'C_line3', 'C_line4',
        'LW_line3', 'RW_line3', 'LW_line4', 'RW_line4'
      ];
    } else {
      slots = [
        'C_line1', 'LW_line1', 'RW_line1',
        'C_line2', 'LW_line2', 'RW_line2',
        'C_line3', 'LW_line3', 'RW_line3',
        'C_line4', 'LW_line4', 'RW_line4',
        'DL_pair1', 'DR_pair1',
        'DL_pair2', 'DR_pair2',
        'DL_pair3', 'DR_pair3'
      ];
    }
    
    for (const slot of slots) {
      if (!dataObj[slot]) {
        dataObj[slot] = playerName;
        return;
      }
    }
  },
  
  regenerateAutoFillStoragesExceptManuell() {
    const savedMode = this.currentMode;
    const savedLineUpData = Object.assign({}, this.lineUpData);
    
    // Generate and persist power mode storage
    this.currentMode = 'power';
    this.autoFillPowerMode();
    
    // Generate and persist normal mode storage
    this.currentMode = 'normal';
    this.autoFillNormalMode();
    
    // Restore original mode and in-memory data
    this.currentMode = savedMode;
    this.lineUpData = savedLineUpData;
  },
  
  getAvailablePlayers() {
    // Get players from player selection that are active
    const currentTeamId = App.helpers.getCurrentTeamId();
    const savedPlayersKey = `playerSelectionData_${currentTeamId}`;
    
    let players = [];
    try {
      const savedPlayers = JSON.parse(AppStorage.getItem(savedPlayersKey) || "[]");
      players = savedPlayers.filter(p => p.active && p.name && p.name.trim() !== "");
    } catch (e) {
      players = [];
    }
    
    // Fallback to App.data.selectedPlayers if available
    if (players.length === 0 && App.data.selectedPlayers && App.data.selectedPlayers.length > 0) {
      players = App.data.selectedPlayers.map(p => ({
        number: p.num || "",
        name: p.name,
        position: "",
        active: true
      }));
    }
    
    return players;
  },
  
  sortPlayersForLineup(players) {
    // Check if season data exists and has entries
    const hasSeasonData = App.data.seasonData && Object.keys(App.data.seasonData).length > 0;
    
    if (!hasSeasonData) {
      // Fallback: Sort alphabetically by name
      return players.sort((a, b) => {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
    }
    
    // Helper function to calculate MVP points for a player
    const calculateMVP = (playerName, seasonData) => {
      return App.helpers.calculateSeasonMVPPoints(playerName, seasonData);
    };
    
    // Sort by season statistics (MVP points)
    return players.sort((a, b) => {
      const seasonDataA = App.data.seasonData?.[a.name];
      const seasonDataB = App.data.seasonData?.[b.name];
      
      const mvpA = calculateMVP(a.name, seasonDataA);
      const mvpB = calculateMVP(b.name, seasonDataB);
      
      // Sort descending (higher MVP first), fallback to alphabetical
      if (mvpB !== mvpA) {
        return mvpB - mvpA;
      }
      
      // If MVP is equal, sort alphabetically
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  },
  
  attachEventListeners() {
    // Navigation buttons
    document.getElementById("lineUpPlayerSelectionBtn")?.addEventListener("click", () => {
      App.showPage("selection");
    });
    
    document.getElementById("lineUpGameDataBtn")?.addEventListener("click", () => {
      App.showPage("stats");
    });
    
    // Change Line button (merged Power Line + Team Line)
    document.getElementById("lineUpChangeLineBtn")?.addEventListener("click", () => {
      this.changeLineMode();
    });
    
    // Export PDF button
    document.getElementById("lineUpExportPdfBtn")?.addEventListener("click", () => {
      this.exportPDF();
    });
    
    // Player Out button - toggle dropdown
    document.getElementById("lineUpPlayerOutBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.togglePlayerOutDropdown();
    });
    
    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      const dropdown = document.getElementById("playerOutDropdown");
      const playerOutBtn = document.getElementById("lineUpPlayerOutBtn");
      const container = document.querySelector(".player-out-container");
      
      if (dropdown && dropdown.classList.contains("open")) {
        if (!container.contains(e.target)) {
          dropdown.classList.remove("open");
        }
      }
    });
    
    // Position buttons - delegate click events
    if (this.container) {
      this.container.addEventListener("click", (e) => {
        const posBtn = e.target.closest(".lineup-position");
        if (posBtn) {
          this.openPlayerModal(posBtn);
        }
      });
    }
    
    // Modal buttons
    document.getElementById("lineUpCancelModalBtn")?.addEventListener("click", () => {
      this.closePlayerModal();
    });
    
    document.getElementById("lineUpClearPositionBtn")?.addEventListener("click", () => {
      this.clearCurrentPosition();
    });
    
    // Modal overlay click to close
    const modal = document.getElementById("lineUpPlayerModal");
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          this.closePlayerModal();
        }
      });
    }
  },
  
  togglePlayerOutDropdown() {
    const dropdown = document.getElementById("playerOutDropdown");
    if (!dropdown) return;
    
    dropdown.classList.toggle("open");
    
    if (dropdown.classList.contains("open")) {
      this.renderPlayerOutList();
    }
  },
  
  renderPlayerOutList() {
    const list = document.getElementById("playerOutList");
    if (!list) return;
    
    // Get all available players and filter out goalies
    const allPlayers = this.getAvailablePlayers();
    const players = allPlayers.filter(p => {
      const pos = (p.position || p.pos || '').toUpperCase();
      return !this.goaliePositions.includes(pos);
    });
    
    if (players.length === 0) {
      list.innerHTML = '<div class="player-out-item" style="cursor: default; opacity: 0.7;">No active players</div>';
      return;
    }
    
    list.innerHTML = players.map(p => {
      const isOut = this.playersOut.includes(p.name);
      const number = p.number || '';
      const displayText = number ? `${number} ${p.name}` : p.name;
      
      return `
        <div class="player-out-item ${isOut ? 'is-out' : ''}" 
             data-player="${App.helpers.escapeHtml(p.name)}">
          ${App.helpers.escapeHtml(displayText)}
        </div>
      `;
    }).join('');
    
    // Add click handlers
    list.querySelectorAll(".player-out-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const playerName = item.dataset.player;
        if (playerName) {
          this.togglePlayerOut(playerName);
        }
      });
    });
  },
  
  togglePlayerOut(playerName) {
    const wasOut = this.playersOut.includes(playerName);
    const teamId = App.helpers.getCurrentTeamId();
    
    if (wasOut) {
      // REACTIVATE branch
      const index = this.playersOut.indexOf(playerName);
      this.playersOut.splice(index, 1);
      this.savePlayersOut();
      
      // Read current manuell storage
      let manuellData = {};
      try { manuellData = JSON.parse(AppStorage.getItem(`lineUpData_manuell_${teamId}`) || '{}'); } catch (e) {}
      
      // Restore snapshot positions into manuell storage (skip occupied slots)
      const snapshot = this.playerOutSnapshots?.[playerName]?.manuell;
      if (snapshot && Object.keys(snapshot).length > 0) {
        let restoredAny = false;
        Object.keys(snapshot).forEach(posKey => {
          if (!manuellData[posKey]) {
            manuellData[posKey] = playerName;
            restoredAny = true;
          }
        });
        if (!restoredAny) {
          this.fillFirstEmptySlotForPlayerInData(playerName, manuellData);
        }
      } else {
        this.fillFirstEmptySlotForPlayerInData(playerName, manuellData);
      }
      AppStorage.setItem(`lineUpData_manuell_${teamId}`, JSON.stringify(manuellData));
      
      // Regenerate power and normal storages (player is active again)
      this.regenerateAutoFillStoragesExceptManuell();
      
      // Delete snapshot
      if (this.playerOutSnapshots) {
        delete this.playerOutSnapshots[playerName];
        this.savePlayerOutSnapshots();
      }
      
      this.loadDataForMode(this.currentMode);
    } else {
      // OUT branch
      // Snapshot manuell positions from storage (NOT from this.lineUpData)
      let manuellData = {};
      try { manuellData = JSON.parse(AppStorage.getItem(`lineUpData_manuell_${teamId}`) || '{}'); } catch (e) {}
      
      const playerPositions = {};
      Object.entries(manuellData).forEach(([posKey, name]) => {
        if (name === playerName) playerPositions[posKey] = name;
      });
      
      this.playerOutSnapshots = this.playerOutSnapshots || {};
      this.playerOutSnapshots[playerName] = { manuell: playerPositions };
      this.savePlayerOutSnapshots();
      
      this.playersOut.push(playerName);
      this.savePlayersOut();
      
      // Remove player from all mode storages
      this.removePlayerFromAllModes(playerName);
      
      // Regenerate power and normal storages without this player
      this.regenerateAutoFillStoragesExceptManuell();
      
      this.loadDataForMode(this.currentMode);
    }
    
    this.renderPlayerOutList();
    this.updatePlayerOutButton();
    this.render();
  },
  
  removePlayerFromAllModes(playerName) {
    const modes = ['normal', 'power', 'manuell'];
    const currentTeamId = App.helpers.getCurrentTeamId();
    
    modes.forEach(mode => {
      const key = `lineUpData_${mode}_${currentTeamId}`;
      const savedData = AppStorage.getItem(key);
      
      if (savedData) {
        try {
          const lineUpData = JSON.parse(savedData);
          let changed = false;
          
          // Spieler aus allen Positionen entfernen
          Object.keys(lineUpData).forEach(posKey => {
            if (lineUpData[posKey] === playerName) {
              delete lineUpData[posKey];
              changed = true;
            }
          });
          
          if (changed) {
            AppStorage.setItem(key, JSON.stringify(lineUpData));
          }
        } catch (e) {
          console.error('Error removing player from mode:', mode, e);
        }
      }
    });
    
    // Aktuelle lineUpData auch aktualisieren
    Object.keys(this.lineUpData).forEach(posKey => {
      if (this.lineUpData[posKey] === playerName) {
        delete this.lineUpData[posKey];
      }
    });
  },
  
  generatePositionKey(posBtn) {
    const pos = posBtn.dataset.pos;
    const line = posBtn.dataset.line;
    const pair = posBtn.dataset.pair;
    const formation = posBtn.dataset.formation;
    
    if (line) return `${pos}_line${line}`;
    if (pair) return `${pos}_pair${pair}`;
    if (formation) return `${pos}_form${formation}`;
    return pos;
  },
  
  openPlayerModal(posBtn) {
    // NUR im Manuell-Modus erlauben!
    if (this.currentMode !== 'manuell') {
      return; // Nichts tun in Power/Balanced Modus
    }
    
    this.currentPosition = {
      element: posBtn,
      key: this.generatePositionKey(posBtn),
      pos: posBtn.dataset.pos,
      line: posBtn.dataset.line,
      pair: posBtn.dataset.pair,
      formation: posBtn.dataset.formation
    };
    
    const modal = document.getElementById("lineUpPlayerModal");
    const title = document.getElementById("lineUpModalTitle");
    const playerList = document.getElementById("lineUpPlayerList");
    
    if (!modal || !playerList) return;
    
    // Set modal title
    const posLabel = this.getPositionLabel(this.currentPosition);
    if (title) {
      title.textContent = `Select player for ${posLabel}`;
    }
    
    // Get available players (excluding OUT players)
    const allPlayers = this.getAvailablePlayers();
    let players = allPlayers.filter(p => !this.playersOut.includes(p.name));
    
    // Filter out goalies - they should not be available for lineup positions
    players = players.filter(p => {
      const pos = (p.position || '').toUpperCase();
      return !this.goaliePositions.includes(pos);
    });
    
    // Sort players (alphabetically if no season data, by MVP if season data exists)
    players = this.sortPlayersForLineup(players);
    
    // Get already assigned players in the same section only
    const currentSection = this.getPositionSection(this.currentPosition.key);
    const assignedInSection = [];
    Object.entries(this.lineUpData).forEach(([key, name]) => {
      if (this.getPositionSection(key) === currentSection) {
        assignedInSection.push(name);
      }
    });
    
    // Render player list
    playerList.innerHTML = players.map(player => {
      const isAssignedInSection = assignedInSection.includes(player.name);
      const isCurrentPosition = this.lineUpData[this.currentPosition.key] === player.name;
      
      return `
        <div class="lineup-player-option ${isCurrentPosition ? 'selected' : ''} ${isAssignedInSection && !isCurrentPosition ? 'assigned' : ''}"
             data-player="${App.helpers.escapeHtml(player.name)}">
          <span class="lineup-player-number">${App.helpers.escapeHtml(player.number || "")}</span>
          <span class="lineup-player-name">${App.helpers.escapeHtml(player.name)}</span>
          ${isAssignedInSection && !isCurrentPosition ? '<span class="lineup-player-assigned">✓</span>' : ''}
        </div>
      `;
    }).join('');
    
    // Add click handlers to player options
    playerList.querySelectorAll(".lineup-player-option").forEach(option => {
      option.addEventListener("click", () => {
        const playerName = option.dataset.player;
        this.assignPlayer(playerName);
      });
    });
    
    modal.style.display = "flex";
    this.modalOpen = true;
  },
  
  getPositionSection(positionKey) {
    if (positionKey.startsWith('PP-')) return 'powerplay';
    if (positionKey.startsWith('BP-')) return 'boxplay';
    return 'regular';
  },
  
  getPositionLabel(pos) {
    const labels = {
      "LW": "Left Wing",
      "C": "Center",
      "RW": "Right Wing",
      "DL": "Defense Left",
      "DR": "Defense Right",
      "BP-W": "Box Play Wing",
      "BP-C": "Box Play Center",
      "BP-DL": "Box Play Defense Left",
      "BP-DR": "Box Play Defense Right",
      "PP-LW": "Power Play Left Wing",
      "PP-C": "Power Play Center",
      "PP-RW": "Power Play Right Wing",
      "PP-DL": "Power Play Defense Left",
      "PP-DR": "Power Play Defense Right"
    };
    
    let label = labels[pos.pos] || pos.pos;
    
    if (pos.line) label += ` (Linie ${pos.line})`;
    if (pos.pair) label += ` (Paar ${pos.pair})`;
    if (pos.formation) label += ` (Formation ${pos.formation})`;
    
    return label;
  },
  
  assignPlayer(playerName) {
    if (!this.currentPosition) return;
    
    // Check if player is OUT
    if (this.playersOut.includes(playerName)) {
      alert('This player is OUT and cannot be assigned.');
      return;
    }
    
    // Determine which section the current position belongs to
    const currentKey = this.currentPosition.key;
    const currentSection = this.getPositionSection(currentKey);
    
    // Only remove the player from positions in the SAME section
    Object.keys(this.lineUpData).forEach(key => {
      if (this.lineUpData[key] === playerName && this.getPositionSection(key) === currentSection) {
        delete this.lineUpData[key];
      }
    });
    
    // Assign player to current position
    this.lineUpData[this.currentPosition.key] = playerName;
    
    this.saveData();
    this.render();
    this.closePlayerModal();
  },
  
  clearCurrentPosition() {
    if (!this.currentPosition) return;
    
    delete this.lineUpData[this.currentPosition.key];
    
    this.saveData();
    this.render();
    this.closePlayerModal();
  },
  
  closePlayerModal() {
    const modal = document.getElementById("lineUpPlayerModal");
    if (modal) {
      modal.style.display = "none";
    }
    this.modalOpen = false;
    this.currentPosition = null;
  },
  
  getPlayerDisplayName(key, defaultLabel) {
    const playerName = this.lineUpData[key];
    if (!playerName) return defaultLabel;
    
    // Try to get player number
    const players = this.getAvailablePlayers();
    const player = players.find(p => p.name === playerName);
    
    // Display format: "Nr. Name" (e.g., "8 Diego Warth")
    if (player) {
      const number = player.number || '';
      return number ? `${number} ${player.name}` : player.name;
    }
    
    return playerName;
  },
  
  render() {
    // Container prüfen - wenn nicht vorhanden, aus DOM holen
    if (!this.container) {
      this.container = document.getElementById("lineUpContainer");
    }
    if (!this.container) return;
    
    // Update all position buttons with assigned players
    const posButtons = this.container.querySelectorAll(".lineup-position");
    posButtons.forEach(btn => {
      const key = this.generatePositionKey(btn);
      const defaultLabel = btn.textContent;
      const pos = btn.dataset.pos;
      const line = btn.dataset.line;
      const pair = btn.dataset.pair;
      const formation = btn.dataset.formation;
      
      // Generate default label based on position data
      let label = pos;
      if (line) label += ` ${line}`;
      if (pair) label += ` ${pair}`;
      if (formation) label += ` ${formation}`;
      
      const displayName = this.getPlayerDisplayName(key, label);
      btn.textContent = displayName;
      
      // Add/remove assigned class
      if (this.lineUpData[key]) {
        btn.classList.add("assigned");
      } else {
        btn.classList.remove("assigned");
      }
    });
    
    // Update stats am Ende
    this.updateStats();
  },
  
  formatStat(value) {
    const num = parseFloat(value);
    if (Number.isInteger(num)) return num.toString();
    return num.toFixed(1);
  },
  
  updateStats() {
    // Update line stats
    for (let line = 1; line <= 4; line++) {
      // Erst im Container suchen, dann im ganzen Document
      let lineEl = this.container?.querySelector(`.lineup-line[data-line="${line}"] .lineup-line-stats`);
      if (!lineEl) {
        lineEl = document.querySelector(`#lineUpContainer .lineup-line[data-line="${line}"] .lineup-line-stats`);
      }
      if (lineEl) {
        const stats = this.calculateLineStats(line);
        lineEl.textContent = `${this.formatStat(stats.goals)} G | +/- ${this.formatStat(stats.plusMinus)} | ${this.formatStat(stats.shots)} Sh`;
      }
    }
    
    // Update defense pair stats
    for (let pair = 1; pair <= 3; pair++) {
      let pairEl = this.container?.querySelector(`.lineup-defense-pair[data-pair="${pair}"] .lineup-pair-stats`);
      if (!pairEl) {
        pairEl = document.querySelector(`#lineUpContainer .lineup-defense-pair[data-pair="${pair}"] .lineup-pair-stats`);
      }
      if (pairEl) {
        const stats = this.calculatePairStats(pair);
        pairEl.textContent = `${this.formatStat(stats.goals)} P | +/- ${this.formatStat(stats.plusMinus)} | ${this.formatStat(stats.shots)} Sh`;
      }
    }
  },
  
  calculateTotalStats() {
    let goals = 0;
    let plusMinus = 0;
    let shots = 0;
    
    Object.values(this.lineUpData).forEach(playerName => {
      const playerStats = App.data.statsData?.[playerName];
      if (playerStats) {
        goals += playerStats["Goals"] || 0;
        plusMinus += playerStats["+/-"] || 0;
        shots += playerStats["Shot"] || 0;
      }
    });
    
    return { goals, plusMinus, shots };
  },
  
  calculateLineStats(lineNum) {
    let goals = 0;
    let plusMinus = 0;
    let shots = 0;
    let games = 0;
    
    ["LW", "C", "RW"].forEach(pos => {
      const key = `${pos}_line${lineNum}`;
      const playerName = this.lineUpData[key];
      if (playerName) {
        const seasonData = App.data.seasonData?.[playerName];
        const statsData = App.data.statsData?.[playerName];
        
        if (seasonData || statsData) {
          // Try seasonData first (lowercase), then statsData (capitalized)
          goals += Number(seasonData?.goals || statsData?.Goals || 0);
          plusMinus += Number(seasonData?.plusMinus || statsData?.["+/-"] || 0);
          shots += Number(seasonData?.shots || statsData?.Shot || 0);
          const playerGames = Number(seasonData?.games || statsData?.Games || 0);
          games = Math.max(games, playerGames);
        }
      }
    });
    
    // Calculate per-game averages
    const divisor = games > 0 ? games : 1;
    return { 
      goals: goals / divisor, 
      plusMinus: plusMinus / divisor, 
      shots: shots / divisor 
    };
  },
  
  calculatePairStats(pairNum) {
    let goals = 0;
    let plusMinus = 0;
    let shots = 0;
    let games = 0;
    
    ["DL", "DR"].forEach(pos => {
      const key = `${pos}_pair${pairNum}`;
      const playerName = this.lineUpData[key];
      if (playerName) {
        const seasonData = App.data.seasonData?.[playerName];
        const statsData = App.data.statsData?.[playerName];
        
        if (seasonData || statsData) {
          // Try seasonData first (lowercase), then statsData (capitalized)
          // For defense, show Points (Goals + Assists) instead of Goals
          const playerGoals = Number(seasonData?.goals || statsData?.Goals || 0);
          const playerAssists = Number(seasonData?.assists || statsData?.Assists || 0);
          goals += playerGoals + playerAssists; // Points for defense
          plusMinus += Number(seasonData?.plusMinus || statsData?.["+/-"] || 0);
          shots += Number(seasonData?.shots || statsData?.Shot || 0);
          const playerGames = Number(seasonData?.games || statsData?.Games || 0);
          games = Math.max(games, playerGames);
        }
      }
    });
    
    // Calculate per-game averages
    const divisor = games > 0 ? games : 1;
    return { 
      goals: goals / divisor, // For defense, this is Points/Game
      plusMinus: plusMinus / divisor, 
      shots: shots / divisor 
    };
  },
  
  /**
   * Get active players sorted by MVP points for lineup assignment.
   * Filters out players marked as "OUT" and sorts by position and MVP score.
   * 
   * @returns {Object} Object containing sorted arrays:
   *   - centers: Centers sorted by MVP points (descending)
   *   - wings: Wings sorted by MVP points (descending)
   *   - defense: Defense players sorted by MVP points (descending)
   *   - allForwards: All forwards (C+W) sorted by MVP points (descending)
   */
  getActiveSortedPlayers() {
    const playersWithStats = this.getPlayersWithMVPPoints();
    const activePlayers = playersWithStats.filter(p => !this.playersOut.includes(p.name));
    
    // Alle nach MVP sortieren
    const centers = activePlayers.filter(p => p.position === 'C').sort((a, b) => b.mvpPoints - a.mvpPoints);
    const wings = activePlayers.filter(p => p.position === 'W').sort((a, b) => b.mvpPoints - a.mvpPoints);
    const defense = activePlayers.filter(p => p.position === 'D').sort((a, b) => b.mvpPoints - a.mvpPoints);
    const allForwards = [...centers, ...wings].sort((a, b) => b.mvpPoints - a.mvpPoints);
    
    // New: Get players without positions
    const noPosition = activePlayers.filter(p => !p.position || p.position.trim() === '').sort((a, b) => b.mvpPoints - a.mvpPoints);
    
    return { centers, wings, defense, allForwards, noPosition };
  },
  
  /**
   * Calculate and assign PowerPlay (PP) and Box Play (BP) positions.
   * Uses MVP-based logic to select the best players for special teams:
   * 
   * PowerPlay Logic:
   * - PP1: Best Center, Best Wing, Next best Forward
   * - PP2: Next best Center, Wing, Forward (not already in PP1)
   * - PP Defense: Best 4 defense players
   * 
   * Box Play Logic:
   * - BP Centers: Best 2 centers
   * - BP Wings: Best 2 wings  
   * - BP Defense: Best 4 defense players
   * 
   * This function modifies this.lineUpData and calls saveData().
   */
  calculateSpecialTeams() {
    const { centers, wings, defense, allForwards } = this.getActiveSortedPlayers();
    
    // === POWERPLAY BESETZEN ===
    const ppAssigned = new Set();
    
    // PP 1
    // PP-C 1 = Bester Center
    const ppC1 = centers[0];
    if (ppC1) {
      this.lineUpData['PP-C_form1'] = ppC1.name;
      ppAssigned.add(ppC1.name);
    }
    
    // PP-LW 1 = Bester Wing
    const ppLW1 = wings[0];
    if (ppLW1) {
      this.lineUpData['PP-LW_form1'] = ppLW1.name;
      ppAssigned.add(ppLW1.name);
    }
    
    // PP-RW 1 = Nächstbester Stürmer der noch nicht in PP ist
    const ppRW1 = allForwards.find(p => !ppAssigned.has(p.name));
    if (ppRW1) {
      this.lineUpData['PP-RW_form1'] = ppRW1.name;
      ppAssigned.add(ppRW1.name);
    }
    
    // PP 2
    // PP-C 2 = Nächstbester Center der noch nicht in PP ist
    const ppC2 = centers.find(p => !ppAssigned.has(p.name));
    if (ppC2) {
      this.lineUpData['PP-C_form2'] = ppC2.name;
      ppAssigned.add(ppC2.name);
    }
    
    // PP-LW 2 = Nächstbester Wing der noch nicht in PP ist
    const ppLW2 = wings.find(p => !ppAssigned.has(p.name));
    if (ppLW2) {
      this.lineUpData['PP-LW_form2'] = ppLW2.name;
      ppAssigned.add(ppLW2.name);
    }
    
    // PP-RW 2 = Nächstbester Stürmer der noch nicht in PP ist
    const ppRW2 = allForwards.find(p => !ppAssigned.has(p.name));
    if (ppRW2) {
      this.lineUpData['PP-RW_form2'] = ppRW2.name;
      ppAssigned.add(ppRW2.name);
    }
    
    // === PP DEFENSE ===
    if (defense[0]) {
      this.lineUpData['PP-DL_form1'] = defense[0].name;
    }
    if (defense[1]) {
      this.lineUpData['PP-DR_form1'] = defense[1].name;
    }
    if (defense[2]) {
      this.lineUpData['PP-DL_form2'] = defense[2].name;
    }
    if (defense[3]) {
      this.lineUpData['PP-DR_form2'] = defense[3].name;
    }
    
    // === BOX PLAY ===
    if (centers[0]) this.lineUpData['BP-C_form1'] = centers[0].name;
    if (centers[1]) this.lineUpData['BP-C_form2'] = centers[1].name;
    if (wings[0]) this.lineUpData['BP-W_form1'] = wings[0].name;
    if (wings[1]) this.lineUpData['BP-W_form2'] = wings[1].name;
    if (defense[0]) this.lineUpData['BP-DL_form1'] = defense[0].name;
    if (defense[1]) this.lineUpData['BP-DR_form1'] = defense[1].name;
    if (defense[2]) this.lineUpData['BP-DL_form2'] = defense[2].name;
    if (defense[3]) this.lineUpData['BP-DR_form2'] = defense[3].name;
    
    this.saveData();
  },
  
  /**
   * Helper function to fill remaining empty lineup positions with players who don't have positions assigned.
   * Fills in order: Centers → Left Wings → Right Wings → Defense Left → Defense Right
   * 
   * @param {Array} noPositionPlayers - Array of player objects without positions, sorted by MVP points
   * 
   * Behavior:
   * - Only fills positions that are currently empty (not already assigned)
   * - Stops filling when all noPositionPlayers have been placed or all positions are filled
   * - If there are more players than available slots, remaining players are not assigned
   * - Does NOT fill Power Play or Box Play positions (only normal lineup positions)
   */
  fillRemainingWithNoPositionPlayers(noPositionPlayers) {
    if (noPositionPlayers.length === 0) return;
    
    let noPosIndex = 0;
    
    // Fill Centers (C_line1, C_line2, C_line3, C_line4)
    const centerPositions = ['C_line1', 'C_line2', 'C_line3', 'C_line4'];
    for (const pos of centerPositions) {
      if (!this.lineUpData[pos] && noPosIndex < noPositionPlayers.length) {
        this.lineUpData[pos] = noPositionPlayers[noPosIndex].name;
        noPosIndex++;
      }
    }
    
    // Fill Left Wings (LW_line1, LW_line2, LW_line3, LW_line4)
    const lwPositions = ['LW_line1', 'LW_line2', 'LW_line3', 'LW_line4'];
    for (const pos of lwPositions) {
      if (!this.lineUpData[pos] && noPosIndex < noPositionPlayers.length) {
        this.lineUpData[pos] = noPositionPlayers[noPosIndex].name;
        noPosIndex++;
      }
    }
    
    // Fill Right Wings (RW_line1, RW_line2, RW_line3, RW_line4)
    const rwPositions = ['RW_line1', 'RW_line2', 'RW_line3', 'RW_line4'];
    for (const pos of rwPositions) {
      if (!this.lineUpData[pos] && noPosIndex < noPositionPlayers.length) {
        this.lineUpData[pos] = noPositionPlayers[noPosIndex].name;
        noPosIndex++;
      }
    }
    
    // Fill Defense Left (DL_pair1, DL_pair2, DL_pair3)
    const dlPositions = ['DL_pair1', 'DL_pair2', 'DL_pair3'];
    for (const pos of dlPositions) {
      if (!this.lineUpData[pos] && noPosIndex < noPositionPlayers.length) {
        this.lineUpData[pos] = noPositionPlayers[noPosIndex].name;
        noPosIndex++;
      }
    }
    
    // Fill Defense Right (DR_pair1, DR_pair2, DR_pair3)
    const drPositions = ['DR_pair1', 'DR_pair2', 'DR_pair3'];
    for (const pos of drPositions) {
      if (!this.lineUpData[pos] && noPosIndex < noPositionPlayers.length) {
        this.lineUpData[pos] = noPositionPlayers[noPosIndex].name;
        noPosIndex++;
      }
    }
  },
  
  autoFillPowerMode() {
    const { centers, wings, defense, noPosition } = this.getActiveSortedPlayers();
    
    this.lineUpData = {};
    
    // Calculate PP and BP using the new function
    this.calculateSpecialTeams();
    
    // === BALANCED LINIEN ===
    // C 1-4
    if (centers[0]) this.lineUpData['C_line1'] = centers[0].name;
    if (centers[1]) this.lineUpData['C_line2'] = centers[1].name;
    if (centers[2]) this.lineUpData['C_line3'] = centers[2].name;
    if (centers[3]) this.lineUpData['C_line4'] = centers[3].name;
    
    // LW/RW 1-4
    if (wings[0]) this.lineUpData['LW_line1'] = wings[0].name;
    if (wings[1]) this.lineUpData['RW_line1'] = wings[1].name;
    if (wings[2]) this.lineUpData['LW_line2'] = wings[2].name;
    if (wings[3]) this.lineUpData['RW_line2'] = wings[3].name;
    if (wings[4]) this.lineUpData['LW_line3'] = wings[4].name;
    if (wings[5]) this.lineUpData['RW_line3'] = wings[5].name;
    if (wings[6]) this.lineUpData['LW_line4'] = wings[6].name;
    if (wings[7]) this.lineUpData['RW_line4'] = wings[7].name;
    
    // Defense Pairs 1-3
    if (defense[0]) this.lineUpData['DL_pair1'] = defense[0].name;
    if (defense[1]) this.lineUpData['DR_pair1'] = defense[1].name;
    if (defense[2]) this.lineUpData['DL_pair2'] = defense[2].name;
    if (defense[3]) this.lineUpData['DR_pair2'] = defense[3].name;
    if (defense[4]) this.lineUpData['DL_pair3'] = defense[4].name;
    if (defense[5]) this.lineUpData['DR_pair3'] = defense[5].name;
    
    // Fill remaining spots with players without positions
    this.fillRemainingWithNoPositionPlayers(noPosition);
    
    this.saveData();
  },
  
  autoFillNormalMode() {
    const { centers, wings, defense, noPosition } = this.getActiveSortedPlayers();
    
    this.lineUpData = {};
    
    // === STÜRMER VERTEILUNG (ausgeglichen) ===
    // Center: 1-4 nach MVP
    if (centers[0]) this.lineUpData['C_line1'] = centers[0].name;
    if (centers[1]) this.lineUpData['C_line2'] = centers[1].name;
    if (centers[2]) this.lineUpData['C_line3'] = centers[2].name;
    if (centers[3]) this.lineUpData['C_line4'] = centers[3].name;
    
    // Wings: Ausgeglichene Verteilung, aber linienweise befüllen
    if (wings.length >= 4) {
      // Linie 1: stärkster Wing + #4 Wing (Balance)
      if (wings[0]) this.lineUpData['LW_line1'] = wings[0].name;
      if (wings[3]) this.lineUpData['RW_line1'] = wings[3].name;
      
      // Linie 2
      if (wings[1]) this.lineUpData['LW_line2'] = wings[1].name;
      if (wings[2]) this.lineUpData['RW_line2'] = wings[2].name;
      
      // Linie 3
      if (wings[4]) this.lineUpData['LW_line3'] = wings[4].name;
      if (wings[5]) this.lineUpData['RW_line3'] = wings[5].name;
      
      // Linie 4
      if (wings[6]) this.lineUpData['LW_line4'] = wings[6].name;
      if (wings[7]) this.lineUpData['RW_line4'] = wings[7].name;
    } else {
      // Wenige Wings: von außen nach innen paaren, damit möglichst komplette Linien entstehen
      const n = wings.length;
      const half = Math.ceil(n / 2);
      
      for (let i = 0; i < half && i < 4; i++) {
        const leftPlayer = wings[i];
        const rightPlayer = wings[n - 1 - i];
        
        if (leftPlayer) this.lineUpData[`LW_line${i + 1}`] = leftPlayer.name;
        if (rightPlayer && rightPlayer !== leftPlayer) this.lineUpData[`RW_line${i + 1}`] = rightPlayer.name;
      }
    }
    
    // === VERTEIDIGER VERTEILUNG (ausgeglichen), paarweise befüllen ===
    if (defense.length >= 6) {
      // Paar 1: D1 + D4, Paar 2: D2 + D5, Paar 3: D3 + D6
      if (defense[0]) this.lineUpData['DL_pair1'] = defense[0].name;
      if (defense[3]) this.lineUpData['DR_pair1'] = defense[3].name;
      if (defense[1]) this.lineUpData['DL_pair2'] = defense[1].name;
      if (defense[4]) this.lineUpData['DR_pair2'] = defense[4].name;
      if (defense[2]) this.lineUpData['DL_pair3'] = defense[2].name;
      if (defense[5]) this.lineUpData['DR_pair3'] = defense[5].name;
    } else {
      const n = defense.length;
      const half = Math.ceil(n / 2);
      
      for (let i = 0; i < half && i < 3; i++) {
        const leftPlayer = defense[i];
        const rightPlayer = defense[n - 1 - i];
        
        if (leftPlayer) this.lineUpData[`DL_pair${i + 1}`] = leftPlayer.name;
        if (rightPlayer && rightPlayer !== leftPlayer) this.lineUpData[`DR_pair${i + 1}`] = rightPlayer.name;
      }
    }
    
    // Fill remaining spots with players without positions
    this.fillRemainingWithNoPositionPlayers(noPosition);
    
    // === SPECIAL TEAMS (PP + BP) ===
    this.calculateSpecialTeams();
    
    this.saveData();
  },
  
  getPlayersWithMVPPoints() {
    const currentTeamId = App.helpers.getCurrentTeamId();
    const savedPlayersKey = `playerSelectionData_${currentTeamId}`;
    
    let players = [];
    try {
      const savedPlayers = JSON.parse(AppStorage.getItem(savedPlayersKey) || "[]");
      // Modified to NOT filter out players without positions
      players = savedPlayers.filter(p => p.active && p.name && p.name.trim() !== "");
    } catch (e) {
      players = [];
    }
    
    // Calculate MVP points for each player
    const playersWithMVP = players.map(player => {
      const seasonData = App.data.seasonData?.[player.name];
      let mvpPoints = 0;
      
      if (seasonData) {
        mvpPoints = App.helpers.calculateSeasonMVPPoints(player.name, seasonData);
      }
      
      return {
        name: player.name,
        number: player.number,
        position: player.position,
        mvpPoints: mvpPoints
      };
    });
    
    return playersWithMVP;
  },
  
  changeLineMode() {
    // Aktuelle Aufstellung für den aktuellen Modus speichern
    this.saveDataForMode(this.currentMode);
    
    // Zum nächsten Modus wechseln
    const currentIndex = this.modes.indexOf(this.currentMode);
    const nextIndex = (currentIndex + 1) % this.modes.length;
    this.currentMode = this.modes[nextIndex];
    
    // Modus-Anzeige aktualisieren (ruft auch updateModeColors() auf)
    this.updateModeDisplay();
    
    // Aufstellung für den neuen Modus laden/generieren
    if (this.currentMode === 'power') {
      this.autoFillPowerMode(); // Immer neu generieren
    } else if (this.currentMode === 'normal') {
      this.autoFillNormalMode(); // NEU: Immer neu generieren wie Power-Modus
    } else {
      this.loadDataForMode(this.currentMode); // Gespeicherte laden
    }
    
    // Optional: Aufstellung basierend auf Modus anpassen
    this.render();
  },
  
  updateModeDisplay() {
    const modeLabel = document.getElementById('lineupModeLabel');
    if (modeLabel) {
      const modeNames = {
        'normal': 'BALANCED',
        'power': 'POWER',
        'manuell': 'MANUELL'
      };
      modeLabel.textContent = modeNames[this.currentMode];
    }
    this.updateModeColors(); // Farben aktualisieren!
  },
  
  updateModeColors() {
    const colors = {
      'normal': { bg: '#FFD400', text: '#000000' },
      'power': { bg: '#FF6A00', text: '#ffffff' },
      'manuell': { bg: '#FFEEA5', text: '#000000' }
    };
    
    const config = colors[this.currentMode];
    
    // Change Line Button Farbe ändern
    const changeLineBtn = document.getElementById('lineUpChangeLineBtn');
    if (changeLineBtn) {
      changeLineBtn.style.backgroundColor = config.bg;
      changeLineBtn.style.color = config.text;
    }
    
    // Modus-Label Farbe ändern
    const modeLabel = document.getElementById('lineupModeLabel');
    if (modeLabel) {
      modeLabel.style.color = config.bg;
      modeLabel.style.webkitTextFillColor = config.bg;
      modeLabel.style.background = 'none';
    }
    
    // Box Play Title Farbe ändern
    const boxPlayTitle = document.querySelector('.lineup-boxplay .lineup-section-title');
    if (boxPlayTitle) {
      boxPlayTitle.style.color = config.bg;
    }
    
    // Power Play Title Farbe ändern
    const powerPlayTitle = document.querySelector('.lineup-powerplay .lineup-section-title');
    if (powerPlayTitle) {
      powerPlayTitle.style.color = config.bg;
    }
  },
  
  updatePlayerOutButton() {
    const btn = document.querySelector('#lineUpPage .lineup-player-out-btn');
    if (!btn) return;
    
    const outCount = this.playersOut.length;
    
    if (outCount > 0) {
      btn.textContent = `Player out (${outCount})`;
      btn.classList.add('has-players-out');
    } else {
      btn.textContent = 'Player out'; // Kein roter Punkt mehr!
      btn.classList.remove('has-players-out');
    }
  },
  
  exportPDF() {
    const container = document.getElementById("lineUpContainer");
    const modeLabel = document.getElementById("lineupModeLabel");
    const modeName = modeLabel ? modeLabel.textContent : this.currentMode.toUpperCase();
    
    if (!container) {
      console.error("Line up container not found");
      return;
    }
    
    // Check if libraries are loaded
    if (typeof html2canvas === 'undefined') {
      console.error("html2canvas is not loaded");
      alert("Export library not loaded. Please refresh the page and try again.");
      return;
    }
    
    if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
      console.error("jsPDF is not loaded");
      alert("PDF library not loaded. Please refresh the page and try again.");
      return;
    }
    
    // Show loading indicator (optional)
    console.log("Generating PDF...");
    
    // Temporär alle Boxen auf weiß setzen für den Export
    const lineupLines = container.querySelectorAll('.lineup-line');
    const originalBackgrounds = [];
    
    lineupLines.forEach((line, index) => {
      originalBackgrounds[index] = line.style.backgroundColor;
      line.style.backgroundColor = '#ffffff';
    });
    
    // Auch die Sections (Forwards, Defense, etc.)
    const lineupSections = container.querySelectorAll('.lineup-section');
    const originalSectionBgs = [];
    
    lineupSections.forEach((section, index) => {
      originalSectionBgs[index] = section.style.backgroundColor;
      section.style.backgroundColor = '#ffffff';
    });
    
    // Auch Defense-Pairs
    const lineupPairs = container.querySelectorAll('.lineup-defense-pair');
    const originalPairBgs = [];
    
    lineupPairs.forEach((pair, index) => {
      originalPairBgs[index] = pair.style.backgroundColor;
      pair.style.backgroundColor = '#ffffff';
    });
    
    // Auch Formations (Box Play und Power Play)
    const lineupFormations = container.querySelectorAll('.lineup-formation');
    const originalFormationBgs = [];
    
    lineupFormations.forEach((formation, index) => {
      originalFormationBgs[index] = formation.style.backgroundColor;
      formation.style.backgroundColor = '#ffffff';
    });
    
    // Force landscape layout for PDF capture (invisible to the user)
    const originalContainerWidth = container.style.width;
    const originalContainerPosition = container.style.position;
    const originalContainerLeft = container.style.left;
    const originalContainerTop = container.style.top;
    const originalContainerZIndex = container.style.zIndex;
    
    container.style.width = '1200px';
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0px';
    container.style.zIndex = '-1';
    
    const specialTeams = container.querySelector('.lineup-special-teams');
    const originalSpecialTeamsFlexDirection = specialTeams ? specialTeams.style.flexDirection : null;
    if (specialTeams) {
      specialTeams.style.flexDirection = 'row';
    }
    
    const lineupPositions = container.querySelectorAll('.lineup-position');
    const originalPositionMinWidths = [];
    lineupPositions.forEach((pos, index) => {
      originalPositionMinWidths[index] = pos.style.minWidth;
      pos.style.minWidth = '80px';
    });
    
    const restoreLandscapeStyles = () => {
      container.style.width = originalContainerWidth;
      container.style.position = originalContainerPosition;
      container.style.left = originalContainerLeft;
      container.style.top = originalContainerTop;
      container.style.zIndex = originalContainerZIndex;
      if (specialTeams) {
        specialTeams.style.flexDirection = originalSpecialTeamsFlexDirection || '';
      }
      lineupPositions.forEach((pos, index) => {
        pos.style.minWidth = originalPositionMinWidths[index] || '';
      });
    };
    
    // Capture the lineup container as image
    html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false
    }).then(canvas => {
      try {
        // Get jsPDF from the global scope
        const { jsPDF } = window.jspdf;
        
        // Create PDF in landscape mode
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4'
        });
        
        // Guard against division by zero
        if (canvas.width === 0 || canvas.height === 0) {
          throw new Error("Canvas has invalid dimensions");
        }
        
        // Calculate dimensions to fit the image on the page
        const pageWidth = 297; // A4 landscape width in mm
        const pageHeight = 210; // A4 landscape height in mm
        const titleHeight = 20; // Space reserved for title
        const availableHeight = pageHeight - titleHeight - 10; // 10mm bottom margin
        
        // Calculate scaling to fit both width and height
        let imgWidth = pageWidth;
        let imgHeight = (canvas.height * pageWidth) / canvas.width;
        
        // If height exceeds available space, scale down further
        if (imgHeight > availableHeight) {
          imgHeight = availableHeight;
          imgWidth = (canvas.width * availableHeight) / canvas.height;
        }
        
        // Center the image horizontally if it's narrower than the page
        const xOffset = (pageWidth - imgWidth) / 2;
        
        // Add title
        pdf.setFontSize(16);
        pdf.text(`LINE UP - ${modeName}`, pageWidth / 2, 15, { align: 'center' });
        
        // Add the image to PDF
        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', xOffset, titleHeight, imgWidth, imgHeight);
        
        // Generate filename with mode and date - sanitize mode name
        const date = App.helpers.getCurrentDateString();
        const sanitizedMode = App.helpers.sanitizeFilename(modeName);
        const filename = `lineup_${sanitizedMode}_${date}.pdf`;
        
        // Save the PDF
        pdf.save(filename);
        
        console.log("PDF export completed:", filename);
      } catch (error) {
        console.error("Error generating PDF:", error);
        alert("Error generating PDF: " + error.message);
      } finally {
        // Nach dem Export die Original-Farben wiederherstellen
        restoreLandscapeStyles();
        lineupLines.forEach((line, index) => {
          line.style.backgroundColor = originalBackgrounds[index] || '';
        });
        lineupSections.forEach((section, index) => {
          section.style.backgroundColor = originalSectionBgs[index] || '';
        });
        lineupPairs.forEach((pair, index) => {
          pair.style.backgroundColor = originalPairBgs[index] || '';
        });
        lineupFormations.forEach((formation, index) => {
          formation.style.backgroundColor = originalFormationBgs[index] || '';
        });
      }
    }).catch(error => {
      console.error("Error capturing lineup:", error);
      alert("Error capturing lineup: " + error.message);
      
      // Bei Fehler auch Original-Farben wiederherstellen
      restoreLandscapeStyles();
      lineupLines.forEach((line, index) => {
        line.style.backgroundColor = originalBackgrounds[index] || '';
      });
      lineupSections.forEach((section, index) => {
        section.style.backgroundColor = originalSectionBgs[index] || '';
      });
      lineupPairs.forEach((pair, index) => {
        pair.style.backgroundColor = originalPairBgs[index] || '';
      });
      lineupFormations.forEach((formation, index) => {
        formation.style.backgroundColor = originalFormationBgs[index] || '';
      });
    });
  }
};
