// Season Table Modul

App.seasonTable = {
  container: null,
  sortState: { index: null, asc: true },
  isRendering: false, // NEU: Flag um Rekursion zu verhindern
  clickTimers: new WeakMap(), // Store click timers per cell to avoid race conditions
  positionFilter: '', // Aktueller Positionsfilter
  scrollListeners: { fixed: null, scroll: null }, // Track scroll event listeners
  isSyncing: false, // Prevent infinite scroll loops
  rowColors: null, // Cached row colors from CSS
  
  // Constants for double-tap detection
  DOUBLE_TAP_DELAY: 300,

  init() {
    this.container = document.getElementById("seasonContainer");
    
    // Cache row colors from CSS for better performance
    this.rowColors = {
      dark: getComputedStyle(document.documentElement).getPropertyValue('--row-dark-even').trim() || '#2a2a2a',
      light: getComputedStyle(document.documentElement).getPropertyValue('--row-dark-odd').trim() || '#333'
    };

    // Event Listeners
    document.getElementById("exportSeasonFromStatsBtn")?.addEventListener("click", () => {
      this.exportFromStats();
    });

    document.getElementById("exportSeasonBtn")?.addEventListener("click", () => {
      this.exportCSV();
    });

    document.getElementById("resetSeasonBtn")?.addEventListener("click", () => {
      this.reset();
    });
    
    // Add Time Modal Event Listeners
    document.getElementById("addTimeCancelBtn")?.addEventListener("click", () => {
      this.closeAddTimeDialog();
    });
    
    document.getElementById("addTimeConfirmBtn")?.addEventListener("click", () => {
      this.handleAddTime();
    });
    
    // Close modal when clicking outside
    document.getElementById("addTimeModal")?.addEventListener("click", (e) => {
      if (e.target.id === "addTimeModal") {
        this.closeAddTimeDialog();
      }
    });
    
    // Add Enter key support for time input
    document.getElementById("addTimeInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.handleAddTime();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.closeAddTimeDialog();
      }
    });
    
    // Resize listener removed - CSS vw units handle everything zoom-independently
    // this._resizeHandler = () => {
    //   this.setStickyOffsets();
    // };
    // window.addEventListener('resize', this._resizeHandler);
  },

  /**
   * DISABLED - CSS handles everything with vw units for zoom-independent display
   */
setStickyOffsets() {
  return; // KOMPLETT DEAKTIVIERT - CSS übernimmt alles
  },

  render() {
    if (!this.container) return;
    
    // WICHTIG: Verhindere rekursive render() Aufrufe
    if (this.isRendering) {
      console.warn("[Season Table] Render already in progress, skipping...");
      return;
    }
    
    this.isRendering = true;

    // Container komplett leeren
    this.container.innerHTML = "";
    
    console.log("[Season Table] Rendering started at:", new Date().toISOString());

    // === TWO TABLE CREATION WITH GAP ===
    // Create wrapper with flex layout
    const wrapper = document.createElement("div");
    wrapper.className = "season-table-wrapper";
    
    // Create fixed columns container (Nr, Player, Pos)
    const fixedContainer = document.createElement("div");
    fixedContainer.className = "fixed-columns";
    // No overflow set - CSS handles it
    
    const fixedTable = document.createElement("table");
    fixedTable.className = "season-table-fixed";
    
    const fixedThead = document.createElement("thead");
    const fixedHeaderRow = document.createElement("tr");
    
    const fixedHeaders = ["Nr", "Player", "Pos."];
    
    fixedHeaders.forEach((text, idx) => {
      const th = document.createElement("th");
      
      // Special handling for Pos. header with filter dropdown
      if (idx === 2) {
        th.className = "pos-header";
        th.dataset.colIndex = String(idx);
        
        const select = document.createElement("select");
        select.className = "pos-filter";
        select.id = "positionFilter";
        
        const options = [
          { value: "", text: "Pos." },
          { value: "C", text: "Center" },
          { value: "W", text: "Wing" },
          { value: "D", text: "Defense" }
        ];
        
        options.forEach(opt => {
          const option = document.createElement("option");
          option.value = opt.value;
          option.textContent = opt.text;
          if (opt.value === this.positionFilter) {
            option.selected = true;
          }
          select.appendChild(option);
        });
        
        th.appendChild(select);
      } else {
        // Regular sortable header
        th.textContent = text;
        th.dataset.colIndex = String(idx);
        th.className = "sortable";
        th.style.cursor = "pointer";
        
        if (idx === 1) { // Player column
          th.style.textAlign = "left";
        }
        
        const arrow = document.createElement("span");
        arrow.className = "sort-arrow";
        arrow.style.marginLeft = "6px";
        th.appendChild(arrow);
      }
      
      fixedHeaderRow.appendChild(th);
    });
    
    fixedThead.appendChild(fixedHeaderRow);
    fixedTable.appendChild(fixedThead);
    
    const fixedTbody = document.createElement("tbody");
    
    // Create scrollable columns container (Games and all other stats)
    const scrollContainer = document.createElement("div");
    scrollContainer.className = "scrollable-columns";
    // No overflow set - CSS handles it
    
    // Create inner scroll wrapper for the table
    const tableScrollWrapper = document.createElement("div");
    tableScrollWrapper.className = "table-scroll";
    
    const scrollTable = document.createElement("table");
    scrollTable.className = "season-table-scroll";
    
    const scrollThead = document.createElement("thead");
    const scrollHeaderRow = document.createElement("tr");
    
    const scrollHeaders = [
      "Games", "Goals", "Assists", "Points", "+/-", "Ø +/-",
      "Shots", "Shots/Game", "Shots %", "Goals/Game", "Points/Game",
      "Penalty", "Goal Value", "FaceOffs", "FaceOffs Won", "FaceOffs %",
      "SF/min", "SA/min", "Shot Share %",
      "Time", "MVP", "MVP Points"
    ];
    
    scrollHeaders.forEach((text, idx) => {
      const th = document.createElement("th");
      th.textContent = text;
      th.dataset.colIndex = String(idx + 3); // Offset by 3 for fixed columns
      th.className = "sortable";
      th.style.cursor = "pointer";
      
      const arrow = document.createElement("span");
      arrow.className = "sort-arrow";
      arrow.style.marginLeft = "6px";
      th.appendChild(arrow);
      
      scrollHeaderRow.appendChild(th);
    });
    
    scrollThead.appendChild(scrollHeaderRow);
    scrollTable.appendChild(scrollThead);
    
    const scrollTbody = document.createElement("tbody");

    // WICHTIG: Goal Value Daten OHNE Trigger zu ensureDataForSeason
    // Wir rufen es NICHT auf, um die Rekursion zu verhindern
    // ensureDataForSeason wird nur beim ersten Laden oder explizit aufgerufen

    const headerCols = [
      "Nr", "Player", "Pos.", "Games",
      "Goals", "Assists", "Points", "+/-", "Ø +/-",
      "Shots", "Shots/Game", "Shots %", "Goals/Game", "Points/Game",
      "Penalty", "Goal Value", "FaceOffs", "FaceOffs Won", "FaceOffs %",
      "SF/min", "SA/min", "Shot Share %", "Time",
      "MVP", "MVP Points"
    ];

    const rows = Object.keys(App.data.seasonData).map(name => {
      const d = App.data.seasonData[name];
      const games = Number(d.games || 0);
      const goals = Number(d.goals || 0);
      const assists = Number(d.assists || 0);
      const points = goals + assists;
      const plusMinus = Number(d.plusMinus || 0);
      const shots = Number(d.shots || 0);
      const penalty = Number(d.penaltys || 0);
      const faceOffs = Number(d.faceOffs || 0);
      const faceOffsWon = Number(d.faceOffsWon || 0);
      const faceOffPercent = faceOffs ? Math.round((faceOffsWon / faceOffs) * 100) : 0;
      const timeSeconds = Number(d.timeSeconds || 0);
      const possessionStats = App.helpers.getSeasonPossessionStats(d);

      const avgPlusMinus = games ? (plusMinus / games) : 0;
      const shotsPerGame = games ? (shots / games) : 0;
      const goalsPerGame = games ? (goals / games) : 0;
      const pointsPerGame = games ? (points / games) : 0;
      const shotsPercent = shots ? Math.round((goals / shots) * 100) : 0;
      let goalValue = Number(d.goalValue || 0);
      try {
        if (App.goalValue && typeof App.goalValue.computeValueForPlayer === "function") {
          goalValue = App.goalValue.computeValueForPlayer(d.name) ?? Number(d.goalValue || 0);
        }
      } catch (e) {
        goalValue = Number(d.goalValue || 0);
      }

      const mvpPointsNum = App.helpers.calculateSeasonMVPPoints(d.name, d);

      const mvpPointsRounded = Number(mvpPointsNum.toFixed(1));

      const cells = [
        d.num || "",
        d.name,
        this.getPlayerPosition(d.name),
        games,
        goals,
        assists,
        points,
        plusMinus,
        Number(avgPlusMinus.toFixed(1)),
        shots,
        Number(shotsPerGame.toFixed(1)),
        String(shotsPercent) + "%",
        Number(goalsPerGame.toFixed(1)),
        Number(pointsPerGame.toFixed(1)),
        penalty,
        goalValue,
        faceOffs,
        faceOffsWon,
        String(faceOffPercent) + "%",
        possessionStats.sfPerMinDisplay,
        possessionStats.saPerMinDisplay,
        possessionStats.shotShareDisplay,
        App.helpers.formatTimeMMSS(timeSeconds),
        "",
        ""
      ];

      return {
        name: d.name,
        num: d.num || "",
        position: this.getPlayerPosition(d.name),
        cells,
        raw: {
          games,
          goals,
          assists,
          points,
          plusMinus,
          shots,
          penalty,
          faceOffs,
          faceOffsWon,
          faceOffPercent,
          timeSeconds,
          goalValue,
          shotsForOnIce: possessionStats.shotsForOnIce,
          shotsAgainstOnIce: possessionStats.shotsAgainstOnIce
        },
        mvpPointsRounded
      };
    });

    // Filter out goalies from the player list
    const currentTeamId = App.helpers.getCurrentTeamId();
    const savedPlayersKey = `playerSelectionData_${currentTeamId}`;

    let goalieNames = [];
    let fieldPlayerNames = [];
    try {
      const savedPlayers = JSON.parse(AppStorage.getItem(savedPlayersKey) || "[]");
      goalieNames = savedPlayers
        .filter(p => p.position === "G" || p.isGoalie)
        .map(p => p.name);
      fieldPlayerNames = savedPlayers
        .filter(p => p.position !== "G" && !p.isGoalie && p.name && p.name.trim() !== "")
        .map(p => p.name);
    } catch (e) {}

    // Filter out goalies from rows - only filter names that are EXCLUSIVELY goalies (not also field players)
    const filteredRows = rows.filter(r => !goalieNames.includes(r.name) || fieldPlayerNames.includes(r.name));

    // MVP Rank berechnen und eintragen
    const sortedByMvp = filteredRows.slice().sort((a, b) => (b.mvpPointsRounded || 0) - (a.mvpPointsRounded || 0));
    const uniqueScores = [...new Set(sortedByMvp.map(r => r.mvpPointsRounded))];
    const scoreToRank = {};
    uniqueScores.forEach((s, idx) => { scoreToRank[s] = idx + 1; });

    filteredRows.forEach(r => {
      const mvpIdx = headerCols.indexOf("MVP");
      const mvpPointsIdx = headerCols.indexOf("MVP Points");
      r.cells[mvpIdx] = (scoreToRank[r.mvpPointsRounded] || "");
      r.cells[mvpPointsIdx] = Number(r.mvpPointsRounded.toFixed(1));
    });

    // Sortieren
    let displayRows = filteredRows.slice();
    if (this.sortState.index === null) {
      displayRows.sort((a, b) => (b.raw.points || 0) - (a.raw.points || 0));
    } else {
      const idx = this.sortState.index;
      displayRows.sort((a, b) => {
        const va = App.helpers.parseForSort(a.cells[idx]);
        const vb = App.helpers.parseForSort(b.cells[idx]);
        if (typeof va === "number" && typeof vb === "number") {
          return this.sortState.asc ? va - vb : vb - va;
        }
        if (va < vb) return this.sortState.asc ? -1 : 1;
        if (va > vb) return this.sortState.asc ? 1 : -1;
        return 0;
      });
    }

    // Body rendern - TWO TABLES
    // Klickbare Statistik-Zellen mapping (indices in full cells array)
    const clickableStatMap = {
      [headerCols.indexOf("Games")]: 'games',
      [headerCols.indexOf("Goals")]: 'goals',
      [headerCols.indexOf("Assists")]: 'assists',
      [headerCols.indexOf("+/-")]: 'plusMinus',
      [headerCols.indexOf("Shots")]: 'shots',
      [headerCols.indexOf("Penalty")]: 'penaltys',
      [headerCols.indexOf("FaceOffs")]: 'faceOffs',
      [headerCols.indexOf("FaceOffs Won")]: 'faceOffsWon'
    };
    const timeIdx = headerCols.indexOf("Time");
    
    displayRows.forEach((r, rowIndex) => {
      const fixedTr = document.createElement("tr");
      const scrollTr = document.createElement("tr");
      
      // Row colors via CSS classes
      const rowClass = (rowIndex % 2 === 0) ? 'even-row' : 'odd-row';
      fixedTr.classList.add(rowClass);
      scrollTr.classList.add(rowClass);
      
      // Add fixed columns (Nr, Player, Pos)
      for (let i = 0; i < 3; i++) {
        const td = document.createElement("td");
        td.textContent = r.cells[i];
        
        if (i === 1) { // Player column
          td.style.textAlign = "left";
          td.style.fontWeight = "700";
        }
        
        if (i === 2) { // Pos column
          td.className = "pos-cell";
        }
        
        fixedTr.appendChild(td);
      }
      
      // Add scrollable columns (Games onwards)
      for (let i = 3; i < r.cells.length; i++) {
        const td = document.createElement("td");
        td.textContent = r.cells[i];
        
        // Attach click handlers for editable stats
        if (clickableStatMap[i]) {
          td.dataset.stat = clickableStatMap[i];
          this.attachStatClickHandlers(td, r.name, clickableStatMap[i]);
        }
        
        if (i === timeIdx) {
          td.className = "season-time-cell";
          td.dataset.player = r.name;
          this.attachLongPressHandler(td, r.name, r.raw.timeSeconds);
        }
        
        scrollTr.appendChild(td);
      }
      
      fixedTbody.appendChild(fixedTr);
      scrollTbody.appendChild(scrollTr);
    });

    // Variablen AUSSERHALB des if-Blocks deklarieren
    let fixedTfoot = null;
    let scrollTfoot = null;

    // Total-Zeile
    if (filteredRows.length > 0) {
      const sums = {
        games: 0, goals: 0, assists: 0, points: 0, plusMinus: 0,
        shots: 0, penalty: 0, faceOffs: 0, faceOffsWon: 0, timeSeconds: 0,
        shotsForOnIce: 0, shotsAgainstOnIce: 0
      };

      filteredRows.forEach(r => {
        const rs = r.raw;
        sums.games += rs.games;
        sums.goals += rs.goals;
        sums.assists += rs.assists;
        sums.points += rs.points;
        sums.plusMinus += rs.plusMinus;
        sums.shots += rs.shots;
        sums.penalty += rs.penalty;
        sums.faceOffs += rs.faceOffs;
        sums.faceOffsWon += rs.faceOffsWon;
        sums.timeSeconds += rs.timeSeconds;
        sums.shotsForOnIce += rs.shotsForOnIce;
        sums.shotsAgainstOnIce += rs.shotsAgainstOnIce;
      });

      const count = filteredRows.length;
      const avgShotsPercent = sums.shots ? Math.round((sums.goals / sums.shots) * 100) : 0;
      const avgFacePercent = sums.faceOffs ? Math.round((sums.faceOffsWon / sums.faceOffs) * 100) : 0;
      const avgTime = Math.round(sums.timeSeconds / count);
      const totalPossessionStats = App.helpers.getSeasonPossessionStats({
        shotsForOnIce: sums.shotsForOnIce,
        shotsAgainstOnIce: sums.shotsAgainstOnIce,
        timeSeconds: sums.timeSeconds
      });

      const fixedTotalTr = document.createElement("tr");
      fixedTotalTr.className = "total-row";
      
      const scrollTotalTr = document.createElement("tr");
      scrollTotalTr.className = "total-row";
      
      const totalCells = [
        "", // Nr
        "Total Ø", // Player
        "", // Pos
        (sums.games / count).toFixed(1),
        (sums.goals / count).toFixed(1),
        (sums.assists / count).toFixed(1),
        (sums.points / count).toFixed(1),
        (sums.plusMinus / count).toFixed(1),
        (sums.plusMinus / count).toFixed(1), // Ø +/-
        (sums.shots / count).toFixed(1),
        ((sums.shots / count) / ((sums.games / count) || 1)).toFixed(1),
        String(avgShotsPercent) + "%",
        ((sums.goals / count) / ((sums.games / count) || 1)).toFixed(1),
        ((sums.points / count) / ((sums.games / count) || 1)).toFixed(1),
        (sums.penalty / count).toFixed(1),
        "", // Goal Value
        (sums.faceOffs / count).toFixed(1),
        (sums.faceOffsWon / count).toFixed(1),
        String(avgFacePercent) + "%",
        totalPossessionStats.sfPerMinDisplay,
        totalPossessionStats.saPerMinDisplay,
        totalPossessionStats.shotShareDisplay,
        App.helpers.formatTimeMMSS(avgTime),
        "", // MVP
        ""  // MVP Points
      ];
      
      // Add fixed columns to fixed total row
      for (let i = 0; i < 3; i++) {
        const td = document.createElement("td");
        td.textContent = totalCells[i];
        if (i === 1) { // Player column in total row
          td.style.textAlign = "left";
          td.style.fontWeight = "700";
        }
        fixedTotalTr.appendChild(td);
      }
      
      // Add scrollable columns to scroll total row
      for (let i = 3; i < totalCells.length; i++) {
        const td = document.createElement("td");
        td.textContent = totalCells[i];
        scrollTotalTr.appendChild(td);
      }
      
      // Total-Zeile in tfoot für korrektes sticky bottom
      // WICHTIG: Variablen wurden oben mit let deklariert!
      fixedTfoot = document.createElement("tfoot");
      fixedTfoot.appendChild(fixedTotalTr);
      
      scrollTfoot = document.createElement("tfoot");
      scrollTfoot.appendChild(scrollTotalTr);
    }

    // Assemble both tables
    fixedTable.appendChild(fixedTbody);
    if (fixedTfoot) {  // Prüfen ob tfoot existiert
      fixedTable.appendChild(fixedTfoot);  // tfoot NACH tbody
    }
    fixedContainer.appendChild(fixedTable);
    
    scrollTable.appendChild(scrollTbody);
    if (scrollTfoot) {  // Prüfen ob tfoot existiert
      scrollTable.appendChild(scrollTfoot);  // tfoot NACH tbody
    }
    tableScrollWrapper.appendChild(scrollTable);
    scrollContainer.appendChild(tableScrollWrapper);
    
    wrapper.appendChild(fixedContainer);
    wrapper.appendChild(scrollContainer);
    this.container.appendChild(wrapper);

    console.log("[Season Table] Two-table layout rendered with gap");

    // Sort UI aktualisieren
    this.updateSortUI(fixedTable, scrollTable);
    
    // Event Listener für Sortierung - beide Tabellen
    const allSortableHeaders = [...fixedTable.querySelectorAll("th.sortable"), ...scrollTable.querySelectorAll("th.sortable")];
    
    allSortableHeaders.forEach(th => {
      const hasListener = th.hasAttribute('data-listener-attached');
      if (!hasListener) {
        th.setAttribute('data-listener-attached', 'true');
        th.addEventListener("click", () => {
          const idx = Number(th.dataset.colIndex);
          if (this.sortState.index === idx) {
            this.sortState.asc = !this.sortState.asc;
          } else {
            this.sortState.index = idx;
            this.sortState.asc = true;
          }
          this.render();
          
          // WICHTIG: Position Filter NACH dem Rendern wieder anwenden
          if (this.positionFilter) {
            this.filterByPosition(this.positionFilter);
          }
        });
      }
    });
    
    console.log("[Season Table] Rendering completed");
    
    // Event Listener für Position Filter
    const posFilter = document.getElementById('positionFilter');
    if (posFilter) {
      // Remove old listener first to prevent duplicates
      posFilter.replaceWith(posFilter.cloneNode(true));
      const newPosFilter = document.getElementById('positionFilter');
      newPosFilter.addEventListener('change', (e) => {
        this.filterByPosition(e.target.value);
      });
    }
    
    // Synchronized vertical scrolling between fixed and scrollable tables
    const fixedCol = document.querySelector('.fixed-columns');
    const scrollCol = document.querySelector('.scrollable-columns');
    
    if (fixedCol && scrollCol) {
      // Remove old listeners if they exist
      if (this.scrollListeners.fixed) {
        fixedCol.removeEventListener('scroll', this.scrollListeners.fixed);
      }
      if (this.scrollListeners.scroll) {
        scrollCol.removeEventListener('scroll', this.scrollListeners.scroll);
      }
      
      // Create new listeners with sync protection using instance property
      this.scrollListeners.scroll = () => {
        if (!this.isSyncing) {
          this.isSyncing = true;
          fixedCol.scrollTop = scrollCol.scrollTop;
          requestAnimationFrame(() => {
            this.isSyncing = false;
          });
        }
      };
      
      this.scrollListeners.fixed = () => {
        if (!this.isSyncing) {
          this.isSyncing = true;
          scrollCol.scrollTop = fixedCol.scrollTop;
          requestAnimationFrame(() => {
            this.isSyncing = false;
          });
        }
      };
      
      // Add new listeners
      scrollCol.addEventListener('scroll', this.scrollListeners.scroll);
      fixedCol.addEventListener('scroll', this.scrollListeners.fixed);
    }
    
    // setStickyOffsets() call removed - CSS vw units handle everything zoom-independently
    // setTimeout(() => {
    //   this.setStickyOffsets();
    // }, 50);
    
    // === GOALIE-TABELLE unter der Spieler-Tabelle ===
    this.renderGoalieTable(fixedContainer, tableScrollWrapper);
    
    // WICHTIG: Flag zurücksetzen
    this.isRendering = false;
  },

  // Rendert die Goalie-Saison-Tabelle in dieselben Container wie die Spieler-Tabelle.
  // fixedContainer: .fixed-columns (erhält die sticky Name-Spalte)
  // tableScrollWrapper: .table-scroll (erhält die scrollbaren Spalten)
  renderGoalieTable(fixedContainer, tableScrollWrapper) {
    const goalieSeasonData = App.data.goalieSeasonData || {};
    const goalieNames = Object.keys(goalieSeasonData);

    // --- Dezente Trennung (ohne "GOALIES"-Text) ---
    const fixedSep = document.createElement("div");
    fixedSep.className = "goalie-section-separator";
    fixedSep.style.cssText = "margin-top:8px;height:6px;";

    const scrollSep = document.createElement("div");
    scrollSep.className = "goalie-section-separator";
    scrollSep.style.cssText = "margin-top:8px;height:6px;";

    fixedContainer.appendChild(fixedSep);
    tableScrollWrapper.appendChild(scrollSep);

    // --- Goalie Fixed-Tabelle (Nr, Goalie, Pos.) ---
    const goalieFixedTable = document.createElement("table");
    goalieFixedTable.className = "season-table-fixed goalie-table-fixed";

    const gFixedThead = document.createElement("thead");
    const gFixedHeaderRow = document.createElement("tr");
    ["Nr", "Goalie", "Pos."].forEach((text, idx) => {
      const th = document.createElement("th");
      th.textContent = text;
      if (idx === 1) th.style.textAlign = "left";
      gFixedHeaderRow.appendChild(th);
    });
    gFixedThead.appendChild(gFixedHeaderRow);
    goalieFixedTable.appendChild(gFixedThead);

    // --- Goalie Scroll-Tabelle (GP, MIN, GA, SA, SV, Sv%, GAA, SO, Goal Value) ---
    const goalieScrollTable = document.createElement("table");
    goalieScrollTable.className = "season-table-scroll goalie-table-scroll";
    goalieScrollTable.style.width = "100%";

    const gScrollThead = document.createElement("thead");
    const gScrollHeaderRow = document.createElement("tr");
    ["Games", "MIN", "GA", "SA", "SV", "Sv%", "GAA", "SO", "Goal Value", "MVP", "MVP Points"].forEach(text => {
      const th = document.createElement("th");
      th.textContent = text;
      gScrollHeaderRow.appendChild(th);
    });
    gScrollThead.appendChild(gScrollHeaderRow);
    goalieScrollTable.appendChild(gScrollThead);

    const gFixedTbody = document.createElement("tbody");
    const gScrollTbody = document.createElement("tbody");

    // Hilfsfunktion: Goalie Goal Value live berechnen (invertierte Gegner-Gewichtung)
    // Spieler: starke Gegner -> höheres Gewicht.
    // Goalies: Gegentor gegen schwachen Gegner soll stärker bestrafen.
    const STAR_MIN = 0.5;
    const STAR_MAX = 5.0;
    const INV = STAR_MIN + STAR_MAX; // 5.5 => 0.5->5.0, 5.0->0.5
    const computeGoalieGV = (gsd) => {
      if (!App.goalValue) return 0;
      const bottom = App.goalValue.getBottom();
      const gvAgainst = gsd.gvAgainst || [];
      let gv = 0;
      for (let i = 0; i < bottom.length; i++) {
        const w = Number(bottom[i] || 0);
        if (w <= 0) continue;
        const invW = INV - w;
        gv += Number(gvAgainst[i] || 0) * invW;
      }
      return Math.round(gv * 100) / 100;
    };

    // Hilfsfunktion: Minuten formatieren (MM:SS)
    const formatMinutes = (decimalMinutes) => {
      if (!decimalMinutes) return "0:00";
      const totalSeconds = Math.round(decimalMinutes * 60);
      const mm = Math.floor(totalSeconds / 60);
      const ss = String(totalSeconds % 60).padStart(2, "0");
      return `${mm}:${ss}`;
    };

    // Goalie MVP-Bewertung (live berechnet, nicht persistiert):
    // - Fangquote ist der Kern-Qualitätsfaktor.
    // - Spielzeit wirkt zweifach: als Konfidenzfaktor (kleine Samples dämpfen)
    //   und als kleiner Einsatzbonus.
    // - Invertierte Goal Value bestraft Gegentore, besonders gegen schwache Gegner.
    const MVP_SV_BASELINE = 88;
    const MVP_W_SV = 2.0;
    const MVP_CONF_FULL_MIN = 200;
    const MVP_W_GV = 2.0;
    const MVP_W_MIN = 0.01;

    // Summen für Total-Zeile
    const totals = { games: 0, minutesDec: 0, ga: 0, sa: 0 };
    const goalieRows = [];

    goalieNames.forEach((name, rowIndex) => {
      const gsd = goalieSeasonData[name];
      const games = Number(gsd.games || 0);
      const minutesDec = Number(gsd.minutes || 0);
      const ga = Number(gsd.goalsAgainst || 0);
      const sa = Number(gsd.shotsAgainst || 0);
      const sv = sa - ga;
      const svPctValue = sa > 0 ? (sv / sa) * 100 : 0;
      const svPct = sa > 0 ? svPctValue.toFixed(1) + "%" : "–";
      const gaa = minutesDec > 0 ? (ga * 60 / minutesDec).toFixed(2) : "–";
      const shutouts = Number(gsd.shutouts || 0);
      const goalieGoalValue = computeGoalieGV(gsd);
      const gvPerGame = games > 0 ? goalieGoalValue / games : 0;
      const confidence = Math.min(1, minutesDec / MVP_CONF_FULL_MIN);
      const mvpPoints = ((svPctValue - MVP_SV_BASELINE) * MVP_W_SV * confidence)
        - (gvPerGame * MVP_W_GV)
        + (minutesDec * MVP_W_MIN);
      const mvpPointsRounded = Number(mvpPoints.toFixed(1));

      totals.games += games;
      totals.minutesDec += minutesDec;
      totals.ga += ga;
      totals.sa += sa;

      const rowClass = (rowIndex % 2 === 0) ? "even-row" : "odd-row";
      goalieRows.push({
        rowClass,
        num: gsd.num || "",
        name,
        games,
        minutes: formatMinutes(minutesDec),
        ga,
        sa,
        sv,
        svPct,
        gaa,
        shutouts,
        goalieGoalValue,
        mvpPointsRounded
      });
    });

    const sortedByMvp = goalieRows.slice().sort((a, b) => (b.mvpPointsRounded || 0) - (a.mvpPointsRounded || 0));
    const uniqueScores = [...new Set(sortedByMvp.map(r => r.mvpPointsRounded))];
    const scoreToRank = {};
    uniqueScores.forEach((s, idx) => { scoreToRank[s] = idx + 1; });

    goalieRows.forEach(row => {
      // Fixed: Nr + Name + Pos.
      const gFixedTr = document.createElement("tr");
      gFixedTr.className = row.rowClass;
      [row.num, row.name, "G"].forEach((txt, i) => {
        const td = document.createElement("td");
        td.textContent = txt;
        if (i === 1) { td.style.textAlign = "left"; td.style.fontWeight = "700"; }
        if (i === 2) td.classList.add("pos-cell");
        gFixedTr.appendChild(td);
      });
      gFixedTbody.appendChild(gFixedTr);

      // Scroll: Games, MIN, GA, SA, SV, Sv%, GAA, SO, Goal Value, MVP, MVP Points
      const gScrollTr = document.createElement("tr");
      gScrollTr.className = row.rowClass;
      [
        row.games,
        row.minutes,
        row.ga,
        row.sa,
        row.sv,
        row.svPct,
        row.gaa,
        row.shutouts,
        row.goalieGoalValue,
        scoreToRank[row.mvpPointsRounded] || "",
        row.mvpPointsRounded.toFixed(1)
      ].forEach(val => {
        const td = document.createElement("td");
        td.textContent = val;
        gScrollTr.appendChild(td);
      });
      gScrollTbody.appendChild(gScrollTr);
    });

    // Platzhalter-Zeile wenn keine Goalie-Daten vorhanden
    if (goalieNames.length === 0) {
      const emptyFixedTr = document.createElement("tr");
      const emptyTd = document.createElement("td");
      emptyTd.colSpan = 3;
      emptyTd.textContent = "–";
      emptyTd.style.textAlign = "center";
      emptyTd.style.opacity = "0.5";
      emptyFixedTr.appendChild(emptyTd);
      gFixedTbody.appendChild(emptyFixedTr);

      const emptyScrollTr = document.createElement("tr");
      const emptyScrollTd = document.createElement("td");
      emptyScrollTd.colSpan = 11;
      emptyScrollTd.textContent = "Keine Goalie-Saison-Daten";
      emptyScrollTd.style.textAlign = "center";
      emptyScrollTd.style.opacity = "0.5";
      emptyScrollTr.appendChild(emptyScrollTd);
      gScrollTbody.appendChild(emptyScrollTr);
    }

    goalieFixedTable.appendChild(gFixedTbody);
    goalieScrollTable.appendChild(gScrollTbody);

    // Total/Summen-Zeile
    if (goalieNames.length > 0) {
      const totalSA = totals.sa;
      const totalGA = totals.ga;
      const totalSV = totalSA - totalGA;
      const totalSvPct = totalSA > 0 ? `Ø ${((totalSV / totalSA) * 100).toFixed(1)}%` : "–";
      const totalGAA = totals.minutesDec > 0 ? `Ø ${(totalGA * 60 / totals.minutesDec).toFixed(2)}` : "–";

      const gFixedTfoot = document.createElement("tfoot");
      const gScrollTfoot = document.createElement("tfoot");

      const gFixedTotalTr = document.createElement("tr");
      gFixedTotalTr.className = "total-row";
      ["", "Total", ""].forEach((txt, i) => {
        const td = document.createElement("td");
        td.textContent = txt;
        if (i === 1) { td.style.textAlign = "left"; td.style.fontWeight = "700"; }
        gFixedTotalTr.appendChild(td);
      });
      gFixedTfoot.appendChild(gFixedTotalTr);

      const gScrollTotalTr = document.createElement("tr");
      gScrollTotalTr.className = "total-row";
      ["", formatMinutes(totals.minutesDec), totalGA, totalSA, totalSV, totalSvPct, totalGAA, "", "", "", ""].forEach(val => {
        const td = document.createElement("td");
        td.textContent = val;
        gScrollTotalTr.appendChild(td);
      });
      gScrollTfoot.appendChild(gScrollTotalTr);

      goalieFixedTable.appendChild(gFixedTfoot);
      goalieScrollTable.appendChild(gScrollTfoot);
    }

    fixedContainer.appendChild(goalieFixedTable);
    tableScrollWrapper.appendChild(goalieScrollTable);
  },


  updateSortUI(fixedTable, scrollTable) {
    const fixedThs = fixedTable.querySelectorAll("th.sortable");
    const scrollThs = scrollTable.querySelectorAll("th.sortable");
    const allThs = [...fixedThs, ...scrollThs];
    
    allThs.forEach(th => {
      const arrow = th.querySelector(".sort-arrow");
      if (!arrow) return;
      const idx = Number(th.dataset.colIndex);
      if (this.sortState.index === idx) {
        arrow.textContent = this.sortState.asc ? "▴" : "▾";
      } else {
        arrow.textContent = "";
      }
    });
  },

  exportFromStats() {
    if (!App.data.selectedPlayers.length) {
      alert("No players selected.");
      return;
    }

    // Show Goal Value popup BEFORE exporting
    this.showGoalValuePopup((opponentIndex) => {
      // After Goal Value confirmation, show Goalie Minutes modal
      this.showGoalieMinutesModal(opponentIndex, () => {
        // After all modals confirmed, perform the normal export
        this.performExport();
      });
    });
  },
  
  showGoalValuePopup(onComplete) {
    const modal = document.getElementById("goalValueExportModal");
    const input = document.getElementById("opponentNameInput");
    const confirmBtn = document.getElementById("goalValueExportConfirm");
    const cancelBtn = document.getElementById("goalValueExportCancel");
    const starRatingContainer = document.getElementById("starRating");
    const starRatingValue = document.getElementById("starRatingValue");
    
    if (!modal || !input || !confirmBtn || !cancelBtn || !starRatingContainer || !starRatingValue) {
      console.error("[Season Table] Goal Value popup elements not found");
      // Fallback to direct export if modal not available
      this.performExport();
      return;
    }
    
    // Capture context for event handlers
    const self = this;
    
    // Initialize star rating
    let selectedStars = 0;
    starRatingContainer.innerHTML = '';
    
    // Create 10 stars
    for (let i = 1; i <= 10; i++) {
      const star = document.createElement('span');
      star.className = 'star';
      star.textContent = '☆';
      star.dataset.value = i;
      starRatingContainer.appendChild(star);
    }
    
    // Star rating interaction
    const stars = starRatingContainer.querySelectorAll('.star');
    
    // Helper function to update star display
    const updateStars = (count) => {
      stars.forEach((s, idx) => {
        if (idx < count) {
          s.classList.add('filled');
          s.classList.remove('hover');
          s.textContent = '★';
        } else {
          s.classList.remove('filled', 'hover');
          s.textContent = '☆';
        }
      });
    };
    
    // Store click handlers for cleanup
    const starClickHandlers = [];
    const starHoverHandlers = [];
    
    // Click handler
    stars.forEach(star => {
      const clickHandler = () => {
        selectedStars = parseInt(star.dataset.value);
        updateStars(selectedStars);
        starRatingValue.textContent = (selectedStars * 0.5).toFixed(1);
      };
      star.addEventListener('click', clickHandler);
      starClickHandlers.push({ star, handler: clickHandler });
    });
    
    // Hover handler
    stars.forEach(star => {
      const hoverHandler = () => {
        const hoverValue = parseInt(star.dataset.value);
        stars.forEach((s, idx) => {
          if (idx < hoverValue) {
            s.classList.add('hover');
            s.textContent = '★';
          } else {
            s.classList.remove('hover');
            if (idx >= selectedStars) {
              s.textContent = '☆';
            }
          }
        });
      };
      star.addEventListener('mouseenter', hoverHandler);
      starHoverHandlers.push({ star, handler: hoverHandler });
    });
    
    const containerLeaveHandler = () => {
      updateStars(selectedStars);
    };
    starRatingContainer.addEventListener('mouseleave', containerLeaveHandler);
    
    // Reset modal state
    input.value = "";
    selectedStars = 0;
    starRatingValue.textContent = "0";
    updateStars(0);
    
    // Show modal
    modal.style.display = "flex";
    
    // Focus input after modal is displayed
    requestAnimationFrame(() => {
      input.focus();
    });
    
    // Confirm handler
    const handleConfirm = () => {
      const opponentName = input.value.trim();
      const starValue = selectedStars * 0.5;
      
      if (!opponentName) {
        alert("Please enter opponent name");
        return;
      }
      
      if (selectedStars === 0) {
        alert("Please select difficulty (stars)");
        return;
      }
      
      // Update Goal Value data - use captured context
      const opponentIndex = self.handleGoalValueConfirm(opponentName, starValue);
      
      // Close modal
      modal.style.display = "none";
      
      // Clean up event listeners
      cleanup();
      
      // Proceed with export, passing opponentIndex for goalie use
      onComplete(opponentIndex);
    };
    
    // Cancel handler
    const handleCancel = () => {
      modal.style.display = "none";
      cleanup();
      // Don't call onComplete - user cancelled
    };
    
    // Close on clicking outside modal
    const handleOutsideClick = (e) => {
      if (e.target === modal) {
        handleCancel();
      }
    };
    
    // Enter key support
    const handleKeyDown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    };
    
    // Attach event listeners
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    modal.addEventListener('click', handleOutsideClick);
    input.addEventListener('keydown', handleKeyDown);
    
    // Cleanup function - now includes all event listeners
    function cleanup() {
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleOutsideClick);
      input.removeEventListener('keydown', handleKeyDown);
      starRatingContainer.removeEventListener('mouseleave', containerLeaveHandler);
      
      // Clean up star event listeners
      starClickHandlers.forEach(({ star, handler }) => {
        star.removeEventListener('click', handler);
      });
      starHoverHandlers.forEach(({ star, handler }) => {
        star.removeEventListener('mouseenter', handler);
      });
    }
  },
  
  handleGoalValueConfirm(opponentName, starValue) {
    console.log(`[Season Table] Goal Value Confirm: ${opponentName} = ${starValue}`);
    
    // 1. Get or update opponent list
    const opponents = App.goalValue.getOpponents();
    const existingIndex = opponents.findIndex(o => o.toLowerCase() === opponentName.toLowerCase());
    
    // 2. Transfer player goals to Goal Value data
    const data = App.goalValue.getData();
    const gameCounts = App.goalValue.getGameCounts();
    const bottom = App.goalValue.getBottom();
    
    let opponentIndex;
    
    if (existingIndex === -1) {
      // New opponent - add to BEGINNING of list
      opponents.unshift(opponentName);
      App.goalValue.setOpponents(opponents);
      
      // Insert 0 at BEGINNING of all player arrays
      Object.keys(data).forEach(playerName => {
        data[playerName].unshift(0);
      });
      
      // Insert 0 at BEGINNING of bottom and gameCounts
      bottom.unshift(0);
      gameCounts.unshift(0);
      
      // New opponent is now at index 0
      opponentIndex = 0;
    } else {
      // Existing opponent - use existing index
      opponentIndex = existingIndex;
    }
    
    // Ensure arrays are correct length
    while (gameCounts.length < opponents.length) {
      gameCounts.push(0);
    }
    while (bottom.length < opponents.length) {
      bottom.push(0);
    }
    
    // Transfer player goals
    App.data.selectedPlayers.forEach(player => {
      const goals = Number(App.data.statsData[player.name]?.Goals || 0);
      
      if (!data[player.name]) {
        data[player.name] = [];
      }
      
      // Ensure player data array has correct length
      while (data[player.name].length < opponents.length) {
        data[player.name].push(0);
      }
      
      if (existingIndex === -1) {
        // New opponent: set goals directly at index 0
        data[player.name][opponentIndex] = goals;
      } else {
        // Existing opponent: add goals
        data[player.name][opponentIndex] = (data[player.name][opponentIndex] || 0) + goals;
      }
    });
    
    // 3. Update star value in bottom row with averaging
    if (existingIndex === -1) {
      // New opponent: set value directly
      bottom[opponentIndex] = starValue;
      gameCounts[opponentIndex] = 1;
    } else {
      // Existing opponent: calculate average and round to 0.5
      const oldCount = gameCounts[opponentIndex] || 0;
      const oldValue = bottom[opponentIndex] || 0;
      const newCount = oldCount + 1;
      const rawAverage = ((oldValue * oldCount) + starValue) / newCount;
      // Auf 0.5 runden
      const roundedAverage = Math.round(rawAverage * 2) / 2;
      bottom[opponentIndex] = roundedAverage;
      gameCounts[opponentIndex] = newCount;
    }
    
    // Save all data
    App.goalValue.setData(data);
    App.goalValue.setBottom(bottom);
    App.goalValue.setGameCounts(gameCounts);
    
    // Index-Synchronisation: Wenn neuer Gegner via unshift eingefügt wurde,
    // müssen alle Goalie-gvAgainst-Arrays ebenfalls um eine 0 vorne erweitert werden,
    // damit gvAgainst[i] stets zum gleichen Gegner wie bottom[i] gehört.
    if (existingIndex === -1) {
      const goalieData = App.data.goalieSeasonData || {};
      Object.keys(goalieData).forEach(goalieName => {
        if (!Array.isArray(goalieData[goalieName].gvAgainst)) {
          goalieData[goalieName].gvAgainst = [];
        }
        goalieData[goalieName].gvAgainst.unshift(0);
      });
      App.storage.saveGoalieSeasonData();
    }
    
    console.log(`[Season Table] Goal Value updated for ${opponentName} (index ${opponentIndex})`);
    return opponentIndex;
  },

  // Zeigt das Goalie-Minuten-Modal für alle aktiven Goalies des aktuellen Spiels.
  // opponentIndex: der Index des Gegners aus handleGoalValueConfirm (für gvAgainst).
  // onComplete(): wird nach Bestätigung aufgerufen (führt dann performExport aus).
  showGoalieMinutesModal(opponentIndex, onComplete) {
    const modal = document.getElementById("goalieMinutesModal");
    const fieldsContainer = document.getElementById("goalieMinutesFields");
    const confirmBtn = document.getElementById("goalieMinutesConfirm");
    const cancelBtn = document.getElementById("goalieMinutesCancel");

    if (!modal || !fieldsContainer || !confirmBtn || !cancelBtn) {
      // Fallback: Modal-Elemente fehlen → direkt exportieren
      console.warn("[Season Table] Goalie minutes modal elements not found – skipping");
      onComplete();
      return;
    }

    // Aktive Goalies aus den für dieses Spiel ausgewählten Spielern ermitteln
    // (App.data.selectedPlayers enthält nur Spieler mit aktivierter Checkbox)
    const activeGoalies = App.data.selectedPlayers.filter(
      p => p.position === "G" && p.name && p.name.trim() !== ""
    );

    if (activeGoalies.length === 0) {
      // Keine Goalies → direkt exportieren
      onComplete();
      return;
    }

    // Felder dynamisch aufbauen (max. 2 Goalies)
    fieldsContainer.innerHTML = "";
    activeGoalies.slice(0, 2).forEach(goalie => {
      const row = document.createElement("div");
      row.className = "goalie-minutes-row";
      row.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:10px;";

      const label = document.createElement("label");
      label.textContent = goalie.name;
      label.style.cssText = "min-width:100px;font-weight:600;";

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "MM:SS";
      input.dataset.goalieName = goalie.name;
      input.dataset.goalieNum = goalie.num || goalie.number || "";
      input.className = "goalie-minutes-input";
      input.style.cssText = "width:90px;padding:6px;border:1px solid #aaa;border-radius:6px;font-size:1rem;background:var(--input-bg,#fff);color:var(--text,#111);";

      row.appendChild(label);
      row.appendChild(input);
      fieldsContainer.appendChild(row);
    });

    modal.style.display = "flex";

    // Fokus auf erstes Feld
    requestAnimationFrame(() => {
      const first = fieldsContainer.querySelector(".goalie-minutes-input");
      if (first) first.focus();
    });

    const self = this;

    const handleConfirm = () => {
      const inputs = fieldsContainer.querySelectorAll(".goalie-minutes-input");
      const entries = [];
      let valid = true;

      inputs.forEach(inp => {
        const name = inp.dataset.goalieName;
        const num = inp.dataset.goalieNum;
        const raw = inp.value.trim();
        const seconds = App.helpers.parseTimeToSeconds(raw);
        // 0 oder leer → hat nicht gespielt
        const minutes = seconds / 60; // interne Speicherung in Minuten (Dezimalzahl)
        entries.push({ name, num, seconds, minutes, played: seconds > 0 });
      });

      if (!valid) return;

      modal.style.display = "none";
      cleanup();

      // Goalie-Saisondaten verbuchen
      self.performGoalieExport(entries, opponentIndex);

      onComplete();
    };

    const handleCancel = () => {
      modal.style.display = "none";
      cleanup();
      // Nicht abbrechen – Goalie-Export überspringen, Feldspieler-Export trotzdem durchführen
      onComplete();
    };

    const handleOutsideClick = (e) => {
      if (e.target === modal) handleCancel();
    };

    const handleKeyDown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); handleConfirm(); }
      else if (e.key === "Escape") { e.preventDefault(); handleCancel(); }
    };

    confirmBtn.addEventListener("click", handleConfirm);
    cancelBtn.addEventListener("click", handleCancel);
    modal.addEventListener("click", handleOutsideClick);
    modal.addEventListener("keydown", handleKeyDown);

    function cleanup() {
      confirmBtn.removeEventListener("click", handleConfirm);
      cancelBtn.removeEventListener("click", handleCancel);
      modal.removeEventListener("click", handleOutsideClick);
      modal.removeEventListener("keydown", handleKeyDown);
    }
  },

  // Verbucht die Goalie-Saisondaten nach Bestätigung des Minuten-Modals.
  // entries: [{ name, num, seconds, minutes, played }]
  // opponentIndex: Gegner-Index aus handleGoalValueConfirm
  performGoalieExport(entries, opponentIndex) {
    const teamId = App.helpers.getCurrentTeamId();

    // goalMapData aus localStorage lesen (ist kumulativ und persistiert über Seiten-Reload)
    // App.data.goalMapData kann nach Reload leer sein → immer localStorage bevorzugen
    let goalMapData = {};
    try {
      const stored = AppStorage.getItem(`goalMapData_${teamId}`);
      goalMapData = stored ? JSON.parse(stored) : {};
      // RAM ebenfalls aktualisieren für Konsistenz
      App.data.goalMapData = goalMapData;
    } catch (e) {
      goalMapData = App.data.goalMapData || {};
    }

    const snapshot = App.data.goalieExportSnapshot || {};

    // Stell sicher dass goalieSeasonData existiert
    if (!App.data.goalieSeasonData) App.data.goalieSeasonData = {};

    const goalieSeasonData = App.data.goalieSeasonData;

    entries.forEach(entry => {
      if (!entry.played) return; // 0 / leer → hat nicht gespielt

      const goalieName = entry.name;

      // --- Delta aus goalMapData berechnen ---
      const events = goalMapData[goalieName] || [];
      // Kumulativer Zähler
      let cumGA = 0;
      let cumSaves = 0;
      events.forEach(ev => {
        if (ev.eventType === 'goal' && ev.workflowType === 'conceded') {
          cumGA++;
        } else if (ev.eventType === 'opponent-shot') {
          cumSaves++;
        }
      });

      // Snapshot-Werte (zuletzt exportierte kumulative Zähler)
      const snap = snapshot[goalieName] || { cumGA: 0, cumSaves: 0 };
      const dGA = Math.max(0, cumGA - snap.cumGA);
      const dSaves = Math.max(0, cumSaves - snap.cumSaves);
      const dSA = dGA + dSaves;

      // --- goalieSeasonData initialisieren falls nötig ---
      if (!goalieSeasonData[goalieName]) {
        goalieSeasonData[goalieName] = {
          num: entry.num || "",
          name: goalieName,
          games: 0,
          minutes: 0,
          goalsAgainst: 0,
          shotsAgainst: 0,
          shutouts: 0,
          gvAgainst: []
        };
      }

      const gsd = goalieSeasonData[goalieName];
      gsd.num = entry.num || gsd.num || "";

      // --- Werte aufsummieren ---
      gsd.games += 1;
      gsd.minutes += entry.minutes;
      gsd.goalsAgainst += dGA;
      gsd.shotsAgainst += dSA;
      if (dGA === 0) gsd.shutouts += 1;

      // --- gvAgainst: pro-Gegner-Gegentore (für Goalie Goal Value) ---
      // Sicherstellen, dass das Array lang genug ist (falls neuer Gegner bereits via unshift eingefügt)
      const opponentsLength = App.goalValue ? App.goalValue.getOpponents().length : 0;
      while (gsd.gvAgainst.length < opponentsLength) {
        gsd.gvAgainst.push(0);
      }
      if (opponentIndex >= 0 && opponentIndex < gsd.gvAgainst.length) {
        gsd.gvAgainst[opponentIndex] += dGA;
      }

      // --- Snapshot aktualisieren ---
      snapshot[goalieName] = { cumGA, cumSaves };
    });

    // Speichern
    App.data.goalieExportSnapshot = snapshot;
    App.storage.saveGoalieSeasonData();
    App.storage.saveGoalieExportSnapshot();

    console.log("[Season Table] Goalie season data updated", goalieSeasonData);
  },

  performExport() {
    if (!confirm("Export game to Season?")) return;

    const fieldPlayers = App.data.selectedPlayers.filter(p => p.position !== "G" && !p.isGoalie);
    fieldPlayers.forEach(p => {
      const name = p.name;
      const stats = App.data.statsData[name] || {};
      const timeSeconds = Number(App.data.playerTimes[name] || 0);

      if (!App.data.seasonData[name]) {
        App.data.seasonData[name] = {
          num: p.num || "",
          name: name,
          games: 0,
          goals: 0,
          assists: 0,
          plusMinus: 0,
          shots: 0,
          penaltys: 0,
          faceOffs: 0,
          faceOffsWon: 0,
          timeSeconds: 0,
          goalValue: 0,
          shotsForOnIce: 0,
          shotsAgainstOnIce: 0
        };
      }

      const sd = App.data.seasonData[name];
      const currentShotsForOnIce = Number(App.data.shotsForOnIce?.[name] || 0);
      const currentShotsAgainstOnIce = Number(App.data.shotsAgainstOnIce?.[name] || 0);
      sd.games += 1;
      sd.goals += Number(stats.Goals || 0);
      sd.assists += Number(stats.Assist || 0);
      sd.plusMinus += Number(stats["+/-"] || 0);
      sd.shots += Number(stats.Shot || 0);
      sd.penaltys += Number(stats.Penaltys || 0);
      sd.faceOffs += Number(stats.FaceOffs || 0);
      sd.faceOffsWon += Number(stats["FaceOffs Won"] || 0);
      sd.timeSeconds += timeSeconds;
      sd.shotsForOnIce += currentShotsForOnIce;
      sd.shotsAgainstOnIce += currentShotsAgainstOnIce;
      sd.num = p.num || sd.num || "";

      try {
        if (App.goalValue && typeof App.goalValue.computeValueForPlayer === "function") {
          sd.goalValue = App.goalValue.computeValueForPlayer(name) ?? (sd.goalValue || 0);
        } else {
          sd.goalValue = sd.goalValue || 0;
        }
      } catch (e) {
        sd.goalValue = sd.goalValue || 0;
      }
    });

    App.storage.saveSeasonData();
    
    // WICHTIG: ensureDataForSeason NUR HIER aufrufen, nicht beim Rendering
    if (App.goalValue && typeof App.goalValue.ensureDataForSeason === "function") {
      App.goalValue.ensureDataForSeason();
    }

    const keep = confirm("Game exported to Season. Keep data in Game? (OK = Yes)");
    if (!keep) {
      App.data.selectedPlayers.forEach(p => {
        const name = p.name;
        if (!App.data.statsData[name]) App.data.statsData[name] = {};
        App.data.categories.forEach(c => {
          App.data.statsData[name][c] = 0;
        });
        App.data.playerTimes[name] = 0;
      });
      if (App.storage && typeof App.storage.clearOnIceShotCounts === "function") {
        App.storage.clearOnIceShotCounts();
      }
      App.storage.saveStatsData();
      App.storage.savePlayerTimes();
      if (App.statsTable && typeof App.statsTable.render === "function") {
        App.statsTable.render();
      }
    }

    if (typeof App.showPage === "function") {
      App.showPage("season");
    }
    this.render();
  },

  exportCSV() {
    try {
      const names = Object.keys(App.data.seasonData || {});
      if (!names.length) {
        alert("Keine Season-Daten vorhanden.");
        return;
      }

      const header = [
        "Nr","Player","Pos.","Games",
        "Goals","Assists","Points","+/-","Ø +/-",
        "Shots","Shots/Game","Shots %","Goals/Game","Points/Game",
        "Penalty","Goal Value","FaceOffs","FaceOffs Won","FaceOffs %",
        "SF/min","SA/min","Shot Share %","Time",
        "MVP","MVP Points"
      ];
      const rows = [header];
      const tempRows = [];
      const sums = {
        games: 0, goals: 0, assists: 0, points: 0, plusMinus: 0,
        shots: 0, penalty: 0, faceOffs: 0, faceOffsWon: 0, timeSeconds: 0,
        shotsForOnIce: 0, shotsAgainstOnIce: 0
      };

      names.forEach(name => {
        const d = App.data.seasonData[name] || {};
        
        const games = Number(d.games || 0);
        const goals = Number(d.goals || 0);
        const assists = Number(d.assists || 0);
        const points = goals + assists;
        const plusMinus = Number(d.plusMinus || 0);
        const shots = Number(d.shots || 0);
        const penalty = Number(d.penaltys || 0);
        const faceOffs = Number(d.faceOffs || 0);
        const faceOffsWon = Number(d.faceOffsWon || 0);
        const faceOffsPercent = faceOffs ? Math.round((faceOffsWon / faceOffs) * 100) : 0;
        const timeSeconds = Number(d.timeSeconds || 0);
        const possessionStats = App.helpers.getSeasonPossessionStats(d);

        const avgPlusMinus = games ? (plusMinus / games) : 0;
        const shotsPerGame = games ? (shots / games) : 0;
        const goalsPerGame = games ? (goals / games) : 0;
        const pointsPerGame = games ? (points / games) : 0;
        const shotsPercent = shots ? Math.round((goals / shots) * 100) : 0;

        let goalValue = Number(d.goalValue || 0);
        try {
          if (App.goalValue && typeof App.goalValue.computeValueForPlayer === "function") {
            goalValue = Number(App.goalValue.computeValueForPlayer(name) ?? Number(d.goalValue || 0));
          }
        } catch {
          goalValue = Number(d.goalValue || 0);
        }

        const mvpPointsNum = App.helpers.calculateSeasonMVPPoints(name, d);
        const mvpPointsRounded = Number(mvpPointsNum.toFixed(1));

        const row = [
          d.num || "",
          name,
          this.getPlayerPosition(name),
          games,
          goals,
          assists,
          points,
          plusMinus,
          avgPlusMinus.toFixed(1),
          shots,
          shotsPerGame.toFixed(1),
          String(shotsPercent) + "%",
          goalsPerGame.toFixed(1),
          pointsPerGame.toFixed(1),
          penalty,
          goalValue,
          faceOffs,
          faceOffsWon,
          String(faceOffsPercent) + "%",
          possessionStats.sfPerMinDisplay,
          possessionStats.saPerMinDisplay,
          possessionStats.shotShareDisplay,
          App.helpers.formatTimeMMSS(timeSeconds),
          "",
          mvpPointsRounded
        ];
        tempRows.push(row);

        sums.games += games;
        sums.goals += goals;
        sums.assists += assists;
        sums.points += points;
        sums.plusMinus += plusMinus;
        sums.shots += shots;
        sums.penalty += penalty;
        sums.faceOffs += faceOffs;
        sums.faceOffsWon += faceOffsWon;
        sums.timeSeconds += timeSeconds;
        sums.shotsForOnIce += possessionStats.shotsForOnIce;
        sums.shotsAgainstOnIce += possessionStats.shotsAgainstOnIce;
      });

      const MVP_POINTS_IDX = header.indexOf("MVP Points");
      const MVP_IDX = header.indexOf("MVP");
      const allPoints = tempRows.map(r => Number(r[MVP_POINTS_IDX]) || 0);
      const sortedDescUnique = [...new Set(allPoints.slice().sort((a,b) => b - a))];

      function rankFor(val) {
        const i = sortedDescUnique.indexOf(val);
        return i === -1 ? "" : (i + 1);
      }

      tempRows.forEach(r => {
        r[MVP_IDX] = rankFor(Number(r[MVP_POINTS_IDX]) || 0);
      });

      rows.push(...tempRows);

      const count = tempRows.length;
      if (count) {
        const avgShotsPercent = sums.shots ? Math.round((sums.goals / sums.shots) * 100) : 0;
        const avgFacePercent = sums.faceOffs ? Math.round((sums.faceOffsWon / sums.faceOffs) * 100) : 0;
        const avgTime = Math.round(sums.timeSeconds / count);
        const totalPossessionStats = App.helpers.getSeasonPossessionStats({
          shotsForOnIce: sums.shotsForOnIce,
          shotsAgainstOnIce: sums.shotsAgainstOnIce,
          timeSeconds: sums.timeSeconds
        });

        const totalRow = [
          "", "Total Ø", "",
          (sums.games / count).toFixed(1),
          (sums.goals / count).toFixed(1),
          (sums.assists / count).toFixed(1),
          (sums.points / count).toFixed(1),
          (sums.plusMinus / count).toFixed(1),
          (sums.plusMinus / count).toFixed(1),
          (sums.shots / count).toFixed(1),
          ((sums.shots / count) / ((sums.games / count) || 1)).toFixed(1),
          String(avgShotsPercent) + "%",
          ((sums.goals / count) / ((sums.games / count) || 1)).toFixed(1),
          ((sums.points / count) / ((sums.games / count) || 1)).toFixed(1),
          (sums.penalty / count).toFixed(1),
          "",
          (sums.faceOffs / count).toFixed(1),
          (sums.faceOffsWon / count).toFixed(1),
          String(avgFacePercent) + "%",
          totalPossessionStats.sfPerMinDisplay,
          totalPossessionStats.saPerMinDisplay,
          totalPossessionStats.shotShareDisplay,
          App.helpers.formatTimeMMSS(avgTime),
          "",
          ""
        ];
        rows.push(totalRow);
      }

      const escCsv = v => { const s = String(v ?? ""); return /[,"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const csv = '\uFEFF' + 'sep=,\r\n' + rows.map(r => r.map(escCsv).join(",")).join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "season.csv";
      a.click();
      URL.revokeObjectURL(a.href);
      alert("Season CSV exported.");
    } catch (e) {
      console.error("Season CSV export failed:", e);
      alert("Season export error (see console).");
    }
  },

  reset() {
    if (!confirm("Delete Season data?")) return;

    App.data.seasonData = {};
    App.data.goalieSeasonData = {};
    App.data.goalieExportSnapshot = {};
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.removeItem(`seasonData_${teamId}`);
    AppStorage.removeItem(`goalieSeasonData_${teamId}`);
    AppStorage.removeItem(`goalieExportSnapshot_${teamId}`);
    this.render();
    alert("Season data deleted.");
  },
  
  // Add click handler for statistics cells
  attachStatClickHandlers(statCell, playerName, statKey) {
    // Cursor style for clickable cells
    statCell.style.cursor = 'pointer';
    
    // KRITISCH: Prüfe ob Handler bereits attached sind - wenn ja, entfernen für Re-Attach
    if (statCell.dataset.handlersAttached === 'true') {
      delete statCell.dataset.handlersAttached;
    }
    statCell.dataset.handlersAttached = 'true';
    
    // KRITISCH BUG 4 FIX: Handler-State zurücksetzen
    delete statCell.dataset.handlersAttached;
    statCell._tapState = null;
    
    statCell._tapState = {
      lastTapTime: 0,
      tapTimeout: null,
      startX: 0,
      startY: 0,
      moved: false
    };
    const state = statCell._tapState;
    statCell.dataset.handlersAttached = 'true';

    statCell.addEventListener('touchstart', (e) => {
      const touch = e.touches?.[0];
      state.startX = touch?.clientX ?? 0;
      state.startY = touch?.clientY ?? 0;
      state.moved = false;
    }, { passive: true });

    statCell.addEventListener('touchmove', (e) => {
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
    statCell.addEventListener('touchend', (e) => {
      if (state.moved) {
        state.moved = false;
        state.lastTapTime = 0;
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      
      const now = Date.now();
      
      // Double-Tap Detection
      if (state.lastTapTime > 0 && (now - state.lastTapTime < 300)) {
        clearTimeout(state.tapTimeout);
        state.tapTimeout = null;
        state.lastTapTime = 0;
        
        const currentValue = Number(App.data.seasonData[playerName]?.[statKey] || 0);
        let newValue;
        
        if (statKey === 'plusMinus') {
          // +/- kann negativ werden
          newValue = currentValue - 1;
        } else {
          // Andere Werte minimum 0
          newValue = Math.max(0, currentValue - 1);
        }
        
        // Wert speichern
        if (!App.data.seasonData[playerName]) {
          App.data.seasonData[playerName] = {};
        }
        App.data.seasonData[playerName][statKey] = newValue;
        
        // Speichern und UI aktualisieren
        App.storage.saveSeasonData();
        this.render();
        
        // Position Filter wiederherstellen
        if (this.positionFilter) {
          this.filterByPosition(this.positionFilter);
        }
        return;
      }
      
      state.lastTapTime = now;
      state.tapTimeout = setTimeout(() => {
        const currentValue = Number(App.data.seasonData[playerName]?.[statKey] || 0);
        const newValue = currentValue + 1;
        
        // Wert speichern
        if (!App.data.seasonData[playerName]) {
          App.data.seasonData[playerName] = {};
        }
        App.data.seasonData[playerName][statKey] = newValue;
        
        // Speichern und UI aktualisieren
        App.storage.saveSeasonData();
        this.render();
        
        // Position Filter wiederherstellen
        if (this.positionFilter) {
          this.filterByPosition(this.positionFilter);
        }
        
        state.tapTimeout = null;
        state.lastTapTime = 0;
      }, 300);
    }, { passive: false });

    statCell.addEventListener('touchcancel', () => {
      if (state.tapTimeout) {
        clearTimeout(state.tapTimeout);
        state.tapTimeout = null;
      }
      state.lastTapTime = 0;
      state.moved = false;
    }, { passive: true });
    
    // DESKTOP: click für +1
    statCell.addEventListener('click', (e) => {
      // Ignoriere wenn Touch-Handler gerade aktiv war
      if (state.lastTapTime > 0 && Date.now() - state.lastTapTime < 500) return;
      
      const clickTimer = this.clickTimers.get(statCell);
      if (clickTimer) return;
      
      const timer = setTimeout(() => {
        this.clickTimers.delete(statCell);
        
        // +1 zum Wert
        const currentValue = Number(App.data.seasonData[playerName]?.[statKey] || 0);
        const newValue = currentValue + 1;
        
        // Wert speichern
        if (!App.data.seasonData[playerName]) {
          App.data.seasonData[playerName] = {};
        }
        App.data.seasonData[playerName][statKey] = newValue;
        
        // Speichern und UI aktualisieren
        App.storage.saveSeasonData();
        this.render();
        
        // Position Filter wiederherstellen
        if (this.positionFilter) {
          this.filterByPosition(this.positionFilter);
        }
      }, 200);
      
      this.clickTimers.set(statCell, timer);
    });
    
    // DESKTOP: dblclick für -1
    statCell.addEventListener('dblclick', (e) => {
      e.preventDefault();
      
      // Clear any pending single click
      const clickTimer = this.clickTimers.get(statCell);
      if (clickTimer) {
        clearTimeout(clickTimer);
        this.clickTimers.delete(statCell);
      }
      
      // -1 vom Wert
      const currentValue = Number(App.data.seasonData[playerName]?.[statKey] || 0);
      let newValue;
      
      if (statKey === 'plusMinus') {
        // +/- kann negativ werden
        newValue = currentValue - 1;
      } else {
        // Andere Werte minimum 0
        newValue = Math.max(0, currentValue - 1);
      }
      
      // Wert speichern
      if (!App.data.seasonData[playerName]) {
        App.data.seasonData[playerName] = {};
      }
      App.data.seasonData[playerName][statKey] = newValue;
      
      // Speichern und UI aktualisieren
      App.storage.saveSeasonData();
      this.render();
      
      // Position Filter wiederherstellen
      if (this.positionFilter) {
        this.filterByPosition(this.positionFilter);
      }
    });
  },
  
  attachLongPressHandler(timeCell, playerName, currentTimeSeconds) {
    let pressTimer = null;
    let isLongPress = false;
    
    // Visual feedback for clickability
    timeCell.style.cursor = "pointer";
    
    // Mouse events
    timeCell.addEventListener("mousedown", (e) => {
      isLongPress = false;
      pressTimer = setTimeout(() => {
        isLongPress = true;
        this.openAddTimeDialog(playerName, currentTimeSeconds);
      }, 500); // 500ms for long press
    });
    
    timeCell.addEventListener("mouseup", () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    });
    
    timeCell.addEventListener("mouseleave", () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    });
    
    // Touch events for mobile
    timeCell.addEventListener("touchstart", (e) => {
      isLongPress = false;
      pressTimer = setTimeout(() => {
        isLongPress = true;
        this.openAddTimeDialog(playerName, currentTimeSeconds);
      }, 500); // 500ms for long press
    }, { passive: true });
    
    timeCell.addEventListener("touchend", () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    }, { passive: true });
    
    timeCell.addEventListener("touchcancel", () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    }, { passive: true });
  },
  
  openAddTimeDialog(playerName, currentTimeSeconds) {
    const modal = document.getElementById("addTimeModal");
    if (!modal) return;
    
    document.getElementById("addTimePlayerName").textContent = playerName;
    document.getElementById("addTimeCurrentTime").textContent = App.helpers.formatTimeMMSS(currentTimeSeconds);
    document.getElementById("addTimeInput").value = "";
    
    // Store current player name and time for later use
    modal.dataset.playerName = playerName;
    modal.dataset.currentTime = currentTimeSeconds;
    
    modal.style.display = "flex";
    
    // Focus on input field after modal is displayed
    requestAnimationFrame(() => {
      const input = document.getElementById("addTimeInput");
      if (input) {
        input.focus();
      }
    });
  },
  
  closeAddTimeDialog() {
    const modal = document.getElementById("addTimeModal");
    if (modal) {
      modal.style.display = "none";
      modal.dataset.playerName = "";
      modal.dataset.currentTime = "";
    }
  },
  
  handleAddTime() {
    const modal = document.getElementById("addTimeModal");
    const playerName = modal.dataset.playerName;
    const currentSeconds = parseInt(modal.dataset.currentTime) || 0;
    const input = document.getElementById("addTimeInput").value.trim();
    
    if (!input) {
      alert("Please enter a time (MM:SS)");
      return;
    }
    
    // Parse input time
    const additionalSeconds = App.helpers.parseTimeToSeconds(input);
    
    if (additionalSeconds <= 0) {
      alert("Please enter a valid time (e.g. 1:30 for 1 minute 30 seconds)");
      return;
    }
    
    const newTime = currentSeconds + additionalSeconds;
    
    // Update player's season time
    if (App.data.seasonData[playerName]) {
      App.data.seasonData[playerName].timeSeconds = newTime;
      
      // Save to storage
      App.storage.saveSeasonData();
      
      // Close modal
      this.closeAddTimeDialog();
      
      // Re-render table
      this.render();
      
      // Position Filter wiederherstellen
      if (this.positionFilter) {
        this.filterByPosition(this.positionFilter);
      }
      
      console.log(`Added ${additionalSeconds}s to ${playerName}. New time: ${newTime}s`);
    } else {
      alert("Player not found");
    }
  },
  
  getPlayerPosition(playerName) {
    const teamId = App.helpers.getCurrentTeamId();
    if (!teamId) return '';
    
    const savedPlayersKey = `playerSelectionData_${teamId}`;
    let players = [];
    try {
      players = JSON.parse(AppStorage.getItem(savedPlayersKey) || '[]');
    } catch (e) {
      return '';
    }
    
    // Find ALL entries matching this player name
    const matches = players.filter(p => p.name === playerName && p.name.trim() !== '');
    
    if (matches.length === 0) return '';
    
    // If the name exists as both goalie and field player, prefer the field player position
    const fieldPlayerMatch = matches.find(p => p.position !== "G" && p.position !== "");
    if (fieldPlayerMatch) return fieldPlayerMatch.position;
    
    // Otherwise return the first match's position (original behavior)
    return matches[0].position || '';
  },
  
  filterByPosition(position) {
    this.positionFilter = position;
    
    // Get rows from both tables
    const fixedRows = Array.from(document.querySelectorAll('.season-table-fixed tbody tr:not(.total-row)'));
    const scrollRows = Array.from(document.querySelectorAll('.season-table-scroll tbody tr:not(.total-row)'));
    
    // Collect visible player names for total recalculation
    const visiblePlayerNames = [];
    
    // Re-striping after filter
    const visiblePairs = [];
    fixedRows.forEach((row, idx) => {
      const posCell = row.querySelector('td:nth-child(3)');
      const playerCell = row.querySelector('td:nth-child(2)');
      const cellText = posCell ? posCell.textContent.trim() : '';
      const playerName = playerCell ? playerCell.textContent.trim() : '';
      const shouldShow = !position || cellText === position;

      row.style.display = shouldShow ? '' : 'none';
      if (scrollRows[idx]) {
        scrollRows[idx].style.display = shouldShow ? '' : 'none';
      }
      if (shouldShow) {
        visiblePairs.push({ fixed: row, scroll: scrollRows[idx] });
        if (playerName) {
          visiblePlayerNames.push(playerName);
        }
      }
    });

    // Reassign CSS classes for row colors
    visiblePairs.forEach((pair, i) => {
      const cls = (i % 2 === 0) ? 'even-row' : 'odd-row';
      
      [pair.fixed, pair.scroll].forEach(r => {
        if (!r) return;
        r.classList.remove('even-row', 'odd-row');
        r.classList.add(cls);
        
        // Reset inline background styles to use CSS classes
        r.style.backgroundColor = '';
        r.querySelectorAll('td').forEach(td => {
          td.style.backgroundColor = '';
        });
      });
    });
    
    // RECALCULATE TOTAL ROW based on visible players only
    this.recalculateTotalRow(visiblePlayerNames);
  },
  
  // NEW FUNCTION: Recalculate total row based on filtered players
  recalculateTotalRow(playerNames) {
    // If no players visible, hide total row
    const fixedTfoot = document.querySelector('.season-table-fixed tfoot');
    const scrollTfoot = document.querySelector('.season-table-scroll tfoot');
    
    if (!playerNames || playerNames.length === 0) {
      if (fixedTfoot) fixedTfoot.style.display = 'none';
      if (scrollTfoot) scrollTfoot.style.display = 'none';
      return;
    }
    
    // Show total rows
    if (fixedTfoot) fixedTfoot.style.display = '';
    if (scrollTfoot) scrollTfoot.style.display = '';
    
    // Calculate sums for visible players only
    const sums = {
      games: 0, goals: 0, assists: 0, points: 0, plusMinus: 0,
      shots: 0, penalty: 0, faceOffs: 0, faceOffsWon: 0, timeSeconds: 0
    };
    
    playerNames.forEach(name => {
      const d = App.data.seasonData[name];
      if (!d) return;
      
      const games = Number(d.games || 0);
      const goals = Number(d.goals || 0);
      const assists = Number(d.assists || 0);
      const plusMinus = Number(d.plusMinus || 0);
      const shots = Number(d.shots || 0);
      const penalty = Number(d.penaltys || 0);
      const faceOffs = Number(d.faceOffs || 0);
      const faceOffsWon = Number(d.faceOffsWon || 0);
      const timeSeconds = Number(d.timeSeconds || 0);
      
      sums.games += games;
      sums.goals += goals;
      sums.assists += assists;
      sums.points += goals + assists;
      sums.plusMinus += plusMinus;
      sums.shots += shots;
      sums.penalty += penalty;
      sums.faceOffs += faceOffs;
      sums.faceOffsWon += faceOffsWon;
      sums.timeSeconds += timeSeconds;
    });
    
    const count = playerNames.length;
    const avgShotsPercent = sums.shots ? Math.round((sums.goals / sums.shots) * 100) : 0;
    const avgFacePercent = sums.faceOffs ? Math.round((sums.faceOffsWon / sums.faceOffs) * 100) : 0;
    const avgTime = count > 0 ? Math.round(sums.timeSeconds / count) : 0;
    
    // Build new total values array (same order as in render())
    const totalValues = [
      "", // Nr
      "Total Ø", // Player
      "", // Pos
      (sums.games / count).toFixed(1),
      (sums.goals / count).toFixed(1),
      (sums.assists / count).toFixed(1),
      (sums.points / count).toFixed(1),
      (sums.plusMinus / count).toFixed(1),
      (sums.plusMinus / count).toFixed(1), // Ø +/-
      (sums.shots / count).toFixed(1),
      ((sums.shots / count) / ((sums.games / count) || 1)).toFixed(1),
      String(avgShotsPercent) + "%",
      ((sums.goals / count) / ((sums.games / count) || 1)).toFixed(1),
      ((sums.points / count) / ((sums.games / count) || 1)).toFixed(1),
      (sums.penalty / count).toFixed(1),
      "", // Goal Value
      (sums.faceOffs / count).toFixed(1),
      (sums.faceOffsWon / count).toFixed(1),
      String(avgFacePercent) + "%",
      App.helpers.formatTimeMMSS(avgTime),
      "", // MVP
      ""  // MVP Points
    ];
    
    // Update fixed table total row (first 3 columns)
    if (fixedTfoot) {
      const fixedTds = fixedTfoot.querySelectorAll('td');
      for (let i = 0; i < 3 && i < fixedTds.length; i++) {
        fixedTds[i].textContent = totalValues[i];
      }
    }
    
    // Update scroll table total row (columns 3+)
    if (scrollTfoot) {
      const scrollTds = scrollTfoot.querySelectorAll('td');
      for (let i = 0; i < scrollTds.length; i++) {
        scrollTds[i].textContent = totalValues[i + 3];
      }
    }
  },
  
  /**
   * Cleanup method to remove event listeners and prevent memory leaks
   * NOTE: Resize handler removed since CSS vw units handle everything zoom-independently
   */
  destroy() {
    // Resize handler removed - no cleanup needed
    // if (this._resizeHandler) {
    //   window.removeEventListener('resize', this._resizeHandler);
    //   this._resizeHandler = null;
    // }
  }
};
