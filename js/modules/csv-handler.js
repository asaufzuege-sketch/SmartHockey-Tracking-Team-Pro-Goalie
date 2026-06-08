// CSV Export/Import Handler mit teamspezifischer Datenspeicherung
App.csvHandler = {
  fileInput: null,
  
  init() {
    this.createFileInput();
    // createImportButtons() removed - Import buttons no longer needed
    // this.createImportButtons();
  },
  
  createFileInput() {
    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = ".csv";
    this.fileInput.style.display = "none";
    document.body.appendChild(this.fileInput);
    
    this.fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const target = this.fileInput.dataset.target;
        if (target === "stats") {
          this.importStats(file);
        } else if (target === "season") {
          this.importSeason(file);
        }
      }
      this.fileInput.value = "";
    });
  },
  
  /* REMOVED - Import buttons no longer needed
  createImportButtons() {
    // Stats Import Button
    const exportBtn = document.getElementById("exportBtn");
    const resetBtn = document.getElementById("resetBtn");
    
    if (exportBtn && resetBtn && !document.getElementById("importCsvStatsBtn")) {
      const btn = document.createElement("button");
      btn.id = "importCsvStatsBtn";
      btn.type = "button";
      btn.textContent = "Import CSV";
      btn.className = "top-btn import-csv-btn";
      btn.addEventListener("click", () => {
        this.fileInput.dataset.target = "stats";
        this.fileInput.click();
      });
      resetBtn.parentNode?.insertBefore(btn, resetBtn);
    }
    
    // Season Import Button - prüfe ob Button im HTML existiert
    const existingImportBtn = document.getElementById("importCsvSeasonBtn");
    if (existingImportBtn) {
      // Button existiert bereits im HTML, nur Event Listener hinzufügen
      existingImportBtn.addEventListener("click", () => {
        this.fileInput.dataset.target = "season";
        this.fileInput.click();
      });
    }
  },
  */
  
  // Aktuelle Team-ID ermitteln
  getCurrentTeamId() {
    return App.data.currentTeam || "team1";
  },
  
  // Teamspezifische Storage Keys
  getTeamStorageKey(key) {
    return `${key}_${this.getCurrentTeamId()}`;
  },
  
  // Verbesserte Export-Funktion mit korrekter Tabellenformatierung
  exportStats() {
    const data = [];
    
    // Header exakt wie in der Season-Tabelle
    const headers = ["#", "Player", ...App.data.categories, "Time"];
    data.push(headers);
    
    // Filter out goalies from export
    const skaters = App.data.selectedPlayers.filter(p => p.position !== "G");
    
    // Spieler Daten - exakte Formatierung wie in der Tabelle
    skaters.forEach(player => {
      const row = [
        player.num || "",
        player.name,
        ...App.data.categories.map(cat => {
          const value = App.data.statsData[player.name]?.[cat] || 0;
          return value;
        }),
        App.helpers.formatTimeMMSS(App.data.playerTimes[player.name] || 0)
      ];
      data.push(row);
    });
    
    // Totals Row - exakt wie in der Tabelle berechnet
    const totals = ["", `Total (${skaters.length})`];
    
    App.data.categories.forEach(cat => {
      if (cat === "+/-") {
        // Durchschnitt berechnen
        const vals = skaters.map(p => Number(App.data.statsData[p.name]?.[cat] || 0));
        const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
        totals.push(`Ø ${avg}`);
      } else if (cat === "FaceOffs Won") {
        // FaceOff Prozentsatz
        const totalFace = skaters.reduce((sum, p) => sum + (App.data.statsData[p.name]?.["FaceOffs"] || 0), 0);
        const totalWon = skaters.reduce((sum, p) => sum + (App.data.statsData[p.name]?.["FaceOffs Won"] || 0), 0);
        const pct = totalFace ? Math.round((totalWon / totalFace) * 100) : 0;
        totals.push(`${totalWon} (${pct}%)`);
      } else if (cat === "Shot") {
        // Shot vs Opponent
        const own = skaters.reduce((sum, p) => sum + (App.data.statsData[p.name]?.["Shot"] || 0), 0);
        const opp = this.getOpponentShots();
        totals.push(`${own} vs ${opp}`);
      } else {
        // Standard Summe
        const total = skaters.reduce((sum, p) => sum + (App.data.statsData[p.name]?.[cat] || 0), 0);
        totals.push(total);
      }
    });
    
    // Time Total
    const totalTime = skaters.reduce((sum, p) => sum + (App.data.playerTimes[p.name] || 0), 0);
    totals.push(App.helpers.formatTimeMMSS(totalTime));
    
    data.push(totals);
    
    // Teamspezifischer Filename
    const teamId = this.getCurrentTeamId();
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const filename = `game_data_${teamId}_${timestamp}.csv`;
    
    this.downloadCSV(data, filename);
  },
  
  exportSeason() {
    const data = [];
    
    // Header exakt wie Season-Tabelle
    const headers = ["#", "Player", ...App.data.categories, "MVP Points"];
    data.push(headers);
    
    // Filter out goalies from export
    const skaters = App.data.selectedPlayers.filter(p => p.position !== "G");
    
    skaters.forEach(player => {
      const seasonStats = App.data.seasonData[player.name] || {};
      const mvpPoints = this.calculateMVPPoints(seasonStats);
      
      const row = [
        player.num || "",
        player.name,
        ...App.data.categories.map(cat => seasonStats[cat] || 0),
        mvpPoints
      ];
      data.push(row);
    });
    
    // Season Totals
    const totals = ["", `Total (${skaters.length})`];
    App.data.categories.forEach(cat => {
      const total = skaters.reduce((sum, p) => {
        return sum + ((App.data.seasonData[p.name] || {})[cat] || 0);
      }, 0);
      totals.push(total);
    });
    
    const totalMVP = skaters.reduce((sum, p) => {
      const seasonStats = App.data.seasonData[p.name] || {};
      return sum + this.calculateMVPPoints(seasonStats);
    }, 0);
    totals.push(totalMVP);
    
    data.push(totals);
    
    // Teamspezifischer Filename
    const teamId = this.getCurrentTeamId();
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const filename = `season_data_${teamId}_${timestamp}.csv`;
    
    this.downloadCSV(data, filename);
  },
  
  getOpponentShots() {
    const shotCell = document.querySelector('.total-cell[data-cat="Shot"]');
    return shotCell ? (Number(shotCell.dataset.opp) || 0) : 0;
  },
  
  calculateMVPPoints(stats) {
    return App.helpers.calculateSeasonMVPPoints(stats?.name || "", stats);
  },
  
  // Korrigierte CSV Download mit perfekter Excel-Kompatibilität
  downloadCSV(data, filename) {
    // BOM für UTF-8 Erkennung in Excel
    const BOM = '\uFEFF';
    
    // CSV Zeilen mit korrekter Formatierung
    const csvLines = data.map(row => {
      return row.map(cell => {
        let cellValue = String(cell || "");
        
        // Escape Anführungszeichen
        if (cellValue.includes('"')) {
          cellValue = cellValue.replace(/"/g, '""');
        }
        
        // Setze in Anführungszeichen wenn nötig
        if (cellValue.includes(',') || cellValue.includes('"') || 
            cellValue.includes('\n') || cellValue.includes('\r')) {
          cellValue = `"${cellValue}"`;
        }
        
        return cellValue;
      }).join(',');
    });
    
    // CSV Content erstellen
    const csvContent = BOM + 'sep=,\r\n' + csvLines.join('\r\n');
    
    // Blob erstellen und Download
    const blob = new Blob([csvContent], { 
      type: 'text/csv;charset=utf-8;' 
    });
    
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
    
    console.log('CSV Export completed:', filename);
  },
  
  importStats(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target.result;
        const lines = csv.split(/\r?\n/).filter(line => line.trim());
        
        if (lines.length < 2) {
          alert("CSV file is empty or invalid.");
          return;
        }
        
        const headers = this.parseCSVLine(lines[0]);
        const expectedHeaders = ["#", "Spieler", ...App.data.categories, "Time"];
        
        // Header Validation
        let isValidFormat = true;
        for (let i = 0; i < Math.min(headers.length, expectedHeaders.length); i++) {
          if (headers[i].trim() !== expectedHeaders[i]) {
            isValidFormat = false;
            break;
          }
        }
        
        if (!isValidFormat) {
          alert("CSV format is invalid. Expected columns: " + expectedHeaders.join(", "));
          return;
        }
        
        // Import Data - teamspezifisch
        const newStatsData = {};
        const newPlayerTimes = {};
        const newSelectedPlayers = [];
        
        for (let i = 1; i < lines.length; i++) {
          const row = this.parseCSVLine(lines[i]);
          if (row.length < headers.length) continue;
          
          const num = row[0] === "-" ? "" : row[0].trim();
          const name = row[1].trim();
          
          if (!name || name.toLowerCase().includes("total")) continue;
          
          newSelectedPlayers.push({ name, num });
          newStatsData[name] = {};
          
          App.data.categories.forEach((cat, idx) => {
            newStatsData[name][cat] = parseInt(row[idx + 2]) || 0;
          });
          
          const timeStr = row[row.length - 1];
          newPlayerTimes[name] = this.parseTimeToSeconds(timeStr);
        }
        
        // Teamspezifisch speichern
        App.data.selectedPlayers = newSelectedPlayers;
        App.data.statsData = newStatsData;
        App.data.playerTimes = newPlayerTimes;
        
        App.storage.saveAll();
        App.statsTable.render();
        
        alert(`Import successful! ${newSelectedPlayers.length} players imported.`);
        
      } catch (error) {
        console.error("Import Error:", error);
        alert("Import error: " + error.message);
      }
    };
    
    reader.readAsText(file);
  },
  
  importSeason(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target.result;
        const lines = csv.split(/\r?\n/).filter(line => line.trim());
        const headerLineIndex = lines[0]?.trim().toLowerCase().startsWith('sep=') ? 1 : 0;
        
        if (lines.length - headerLineIndex < 2) {
          alert("CSV file is empty or invalid.");
          return;
        }
        
        const headers = this.parseCSVLine(lines[headerLineIndex]);
        const newSeasonData = {};
        const columnIndex = (name) => headers.findIndex(h => h.trim() === name);
        const parseNumberValue = (value) => {
          if (value === null || value === undefined) return 0;
          const normalized = String(value).trim().replace(",", ".");
          const match = normalized.match(/-?\d+(?:\.\d+)?/);
          return match ? Number(match[0]) : 0;
        };
        const playerIdx = columnIndex("Player");
        const numberIdx = columnIndex("Nr") >= 0 ? columnIndex("Nr") : columnIndex("#");
        const timeIdx = columnIndex("Time");
        const sfPerMinIdx = columnIndex("SF/min");
        const saPerMinIdx = columnIndex("SA/min");
        const gamesIdx = columnIndex("Games");
        const goalsIdx = columnIndex("Goals");
        const assistsIdx = columnIndex("Assists");
        const plusMinusIdx = columnIndex("+/-");
        const shotsIdx = columnIndex("Shots");
        const penaltyIdx = columnIndex("Penalty");
        const goalValueIdx = columnIndex("Goal Value");
        const faceOffsIdx = columnIndex("FaceOffs");
        const faceOffsWonIdx = columnIndex("FaceOffs Won");
        
        for (let i = headerLineIndex + 1; i < lines.length; i++) {
          const row = this.parseCSVLine(lines[i]);
          if (row.length < headers.length) continue;
          
          const name = playerIdx >= 0 ? row[playerIdx].trim() : "";
          if (!name || name.toLowerCase().includes("total")) continue;

          const timeSeconds = timeIdx >= 0 ? this.parseTimeToSeconds(row[timeIdx]) : 0;
          const minutes = timeSeconds > 0 ? (timeSeconds / 60) : 0;
          const sfPerMin = sfPerMinIdx >= 0 ? parseNumberValue(row[sfPerMinIdx]) : 0;
          const saPerMin = saPerMinIdx >= 0 ? parseNumberValue(row[saPerMinIdx]) : 0;

          newSeasonData[name] = {
            num: numberIdx >= 0 ? row[numberIdx].trim() : "",
            name,
            games: gamesIdx >= 0 ? parseNumberValue(row[gamesIdx]) : 0,
            goals: goalsIdx >= 0 ? parseNumberValue(row[goalsIdx]) : 0,
            assists: assistsIdx >= 0 ? parseNumberValue(row[assistsIdx]) : 0,
            plusMinus: plusMinusIdx >= 0 ? parseNumberValue(row[plusMinusIdx]) : 0,
            shots: shotsIdx >= 0 ? parseNumberValue(row[shotsIdx]) : 0,
            penaltys: penaltyIdx >= 0 ? parseNumberValue(row[penaltyIdx]) : 0,
            faceOffs: faceOffsIdx >= 0 ? parseNumberValue(row[faceOffsIdx]) : 0,
            faceOffsWon: faceOffsWonIdx >= 0 ? parseNumberValue(row[faceOffsWonIdx]) : 0,
            timeSeconds,
            goalValue: goalValueIdx >= 0 ? parseNumberValue(row[goalValueIdx]) : 0,
            shotsForOnIce: minutes > 0 ? Math.round(sfPerMin * minutes) : 0,
            shotsAgainstOnIce: minutes > 0 ? Math.round(saPerMin * minutes) : 0
          };
        }
        
        // Teamspezifisch speichern
        App.data.seasonData = newSeasonData;
        App.storage.saveSeasonData();
        
        if (App.seasonTable) {
          App.seasonTable.render();
        }
        
        alert("Season import successful!");
        
      } catch (error) {
        console.error("Season Import Error:", error);
        alert("Season import error: " + error.message);
      }
    };
    
    reader.readAsText(file);
  },
  
  parseCSVLine(line, delimiter = null) {
    const result = [];
    let current = "";
    let inQuotes = false;
    let i = 0;
    
    // BOM entfernen
    if (line.charCodeAt(0) === 0xFEFF) {
      line = line.slice(1);
    }
    
    // Auto-detect delimiter if not provided (prefer semicolon, fallback to comma)
    if (!delimiter) {
      delimiter = line.includes(';') ? ';' : ',';
    }
    
    while (i < line.length) {
      const char = line[i];
      
      if (char === '"' && !inQuotes) {
        inQuotes = true;
      } else if (char === '"' && inQuotes) {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
      i++;
    }
    
    result.push(current);
    return result;
  },
  
  parseTimeToSeconds(timeStr) {
    if (!timeStr) return 0;
    
    const parts = timeStr.split(":");
    if (parts.length === 2) {
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseInt(parts[1]) || 0;
      return minutes * 60 + seconds;
    }
    
    return 0;
  }
};
