// Wait for CSS to be fully loaded before initializing app
function waitForCSSLoad() {
  return new Promise((resolve) => {
    // Check if stylesheets are already loaded
    const stylesheets = document.querySelectorAll('link[rel="stylesheet"]');
    let loaded = 0;
    const total = stylesheets.length;
    
    if (total === 0) {
      resolve();
      return;
    }
    
    const checkAllLoaded = () => {
      loaded++;
      if (loaded >= total) {
        resolve();
      }
    };
    
    stylesheets.forEach(link => {
      if (link.sheet) {
        // Already loaded
        checkAllLoaded();
      } else {
        link.addEventListener('load', checkAllLoaded);
        link.addEventListener('error', checkAllLoaded);
      }
    });
    
    // Fallback timeout
    setTimeout(resolve, 1000);
  });
}

// Haupt-App Initialisierung
// Wait for both DOM content and CSS to be fully loaded to prevent timing issues
async function restoreFromIndexedDBIfNeeded() {
  const hasData = Object.keys(localStorage).some(k => k.startsWith('sPro_'));
  if (hasData) return;
  if (typeof IDBBackup === 'undefined') return;
  try {
    const data = await IDBBackup.loadFullBackup();
    if (data && Object.keys(data).length > 0) {
      Object.keys(data).forEach(key => {
        try { localStorage.setItem(key, data[key]); } catch(e) {}
      });
      console.log('[Backup] ✅ Restored from IndexedDB — reloading app');
      sessionStorage.setItem('smarthockey_restored', '1');
      window.location.reload();
    }
  } catch(e) {}
}

async function initializeApp() {
  console.log(`Player Statistics App v${App.version} loading...`);
  
  // 1. Theme & Styles initialisieren
  App.initTheme();
  App.injectTableStyles();
  
  // 2. Pages registrieren
  App.pages = {
    teamSelection: document.getElementById("teamSelectionPage"),
    selection: document.getElementById("playerSelectionPage"),
    stats: document.getElementById("statsPage"),
    torbild: document.getElementById("torbildPage"),
    goalValue: document.getElementById("goalValuePage"),
    season: document.getElementById("seasonPage"),
    seasonMap: document.getElementById("seasonMapPage"),
    lineUp: document.getElementById("lineUpPage")
  };
  
  // 3. Backup-System: If localStorage is empty, restore from IndexedDB backup
  await restoreFromIndexedDBIfNeeded();

  // 4. Team Selection initialisieren (MUSS VOR storage.load() sein!)
  App.teamSelection.init();
  
  // 5. Daten aus LocalStorage laden (benötigt teamSelection.getCurrentTeamInfo())
  App.storage.load();
  
  // KRITISCH BUG 6 FIX: Re-Render nach Storage-Load für korrekte Namen
  // Double nested requestAnimationFrame ensures CSS is fully loaded
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (App.statsTable && typeof App.statsTable.render === 'function') {
        App.statsTable.render();
      }
      if (App.seasonTable && typeof App.seasonTable.render === 'function') {
        App.seasonTable.render();
      }
    });
  });
  
  // 6. Alle anderen Module initialisieren
  App.timer.init();
  App.csvHandler.init();
  App.playerSelection.init();
  App.statsTable.init();
  App.seasonTable.init();
  App.goalMap.init();
  App.seasonMap.init();
  App.goalValue.init();
  App.lineUp.init();
  
  // 7. Page-specific info system initialisieren
  if (App.pageInfo) {
    App.pageInfo.init();
  }
  
  // 7b. Billing / Abo-System initialisieren
  if (App.billing) {
    App.billing.init();
  }

  // Start automatic IndexedDB backup (30s interval + visibility/unload hooks)
  AppStorage.startAutoBackup();

  // Check if this load follows a data restore
  if (sessionStorage.getItem('smarthockey_restored')) {
    sessionStorage.removeItem('smarthockey_restored');
    console.log('[Backup] ✅ Data successfully restored from backup');
  }

  // ── Manual Download Backup ──
  document.getElementById('downloadBackupBtn')?.addEventListener('click', () => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sPro_')) {
        data[key] = localStorage.getItem(key);
      }
    }
    const exportObj = {
      appName: 'SmartHockey-Tracking-Team-Pro',
      exportDate: new Date().toISOString(),
      data
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `SmartHockey_TeamPro_Backup_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // ── Manual Upload/Restore Backup ──
  document.getElementById('uploadBackupBtn')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const importObj = JSON.parse(event.target.result);
          if (!importObj.data || typeof importObj.data !== 'object') {
            alert('Invalid backup file.');
            return;
          }
          if (importObj.appName && importObj.appName !== 'SmartHockey-Tracking-Team-Pro') {
            alert('This backup is from a different app.');
            return;
          }
          const keyCount = Object.keys(importObj.data).length;
          if (!confirm(`Import backup? ${keyCount} entries will be restored.\nAll current data will be overwritten.`)) {
            return;
          }
          Object.keys(localStorage).filter(k => k.startsWith('sPro_')).forEach(k => localStorage.removeItem(k));
          Object.keys(importObj.data).forEach(key => {
            try { localStorage.setItem(key, importObj.data[key]); } catch(e) {}
          });
          if (typeof IDBBackup !== 'undefined') {
            IDBBackup.saveFullBackup().catch(() => {});
          }
          sessionStorage.setItem('smarthockey_restored', '1');
          window.location.reload();
        } catch (err) {
          alert('Error reading backup: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });

  // 8. Navigation Event Listeners
  document.getElementById("teamSelectionInfoBtn")?.addEventListener("click", () => {
    App.teamSelection?.showInfo();
  });
  
  document.getElementById("selectPlayersBtn")?.addEventListener("click", () => {
    App.showPage("selection");
  });
  
  document.getElementById("backToStatsBtn")?.addEventListener("click", () => {
    App.showPage("stats");
  });
  
  document.getElementById("backToStatsFromSeasonBtn")?.addEventListener("click", () => {
    App.showPage("stats");
  });
  
  document.getElementById("backToStatsFromSeasonMapBtn")?.addEventListener("click", () => {
    App.showPage("stats");
  });
  
  document.getElementById("backFromGoalValueBtn")?.addEventListener("click", () => {
    App.showPage("stats");
  });
  
  document.getElementById("backToTeamSelectionBtn")?.addEventListener("click", () => {
    App.showPage("teamSelection");
  });
  
  document.getElementById("torbildBtn")?.addEventListener("click", () => {
    App.showPage("torbild");
  });
  
  document.getElementById("goalValueBtn")?.addEventListener("click", () => {
    App.showPage("goalValue");
  });
  
  document.getElementById("seasonBtn")?.addEventListener("click", () => {
    App.showPage("season");
  });
  
  document.getElementById("seasonMapBtn")?.addEventListener("click", () => {
    App.showPage("seasonMap");
  });
  
  document.getElementById("lineupBtnFromStats")?.addEventListener("click", () => {
    App.showPage("lineUp");
  });
  
  // 9. Delegierte Back-Button Handler
  document.addEventListener("click", (e) => {
    try {
      const btn = e.target.closest("button");
      if (!btn) return;
      
      const backIds = new Set([
        "backToStatsBtn",
        "backToStatsFromSeasonBtn",
        "backToStatsFromSeasonMapBtn",
        "backFromGoalValueBtn"
      ]);
      
      if (backIds.has(btn.id)) {
        App.showPage("stats");
        e.preventDefault();
        e.stopPropagation();
      }
      
      if (btn.id === "backToTeamSelectionBtn") {
        App.showPage("teamSelection");
        e.preventDefault();
        e.stopPropagation();
      }
    } catch (err) {
      console.warn("Back button delegation failed:", err);
    }
  }, true);
  
  // 9. Initiale Seite anzeigen
  // NEU: benutze getCurrentTeamInfo() statt getCurrentTeam()
  const teamInfo = App.teamSelection.getCurrentTeamInfo();
  const currentTeam = teamInfo?.id; // z.B. "team1"
  const lastPage = App.storage.getCurrentPage();
  
  // Wenn kein Team ausgewählt ist, zur Teamauswahl
  let initialPage;
  if (!currentTeam) {
    initialPage = "teamSelection";
  } else if (lastPage === "selection" || !App.data.selectedPlayers.length) {
    initialPage = "selection";
  } else {
    initialPage = lastPage;
  }
  
  App.showPage(initialPage);
  
  // 10. Timer Persistenz - Laufende Timer aus LocalStorage wiederherstellen
  App.restoreActiveTimers();
  
  // 11. Daten vor Seitenabschluss speichern
  const saveAllAppData = () => {
    try {
      // Safety: Don't save empty app state if localStorage has real data
      const hasDataInStorage = Object.keys(localStorage).some(k => k.startsWith('sPro_'));
      if (hasDataInStorage && (!App.data.selectedPlayers || App.data.selectedPlayers.length === 0) && Object.keys(App.data.statsData || {}).length === 0) {
        console.warn('[App] Skipping save — app data is empty but localStorage has data');
        return;
      }
      App.storage.saveAll();
      // saveTeams ist optional – nur aufrufen, wenn vorhanden
      if (App.teamSelection.saveTeams) {
        App.teamSelection.saveTeams();
      }
      App.saveActiveTimersState(); // Timer State speichern
      AppStorage.setItem("timerSeconds", String(App.timer.seconds));
      if (App.goalValue) {
        const teamId = App.helpers.getCurrentTeamId();
        AppStorage.setItem(`goalValueOpponents_${teamId}`, JSON.stringify(App.goalValue.getOpponents()));
        AppStorage.setItem(`goalValueData_${teamId}`, JSON.stringify(App.goalValue.getData()));
        AppStorage.setItem(`goalValueBottom_${teamId}`, JSON.stringify(App.goalValue.getBottom()));
      }
    } catch (e) {
      console.warn("Save failed:", e);
    }
  };
  
  window.addEventListener("beforeunload", saveAllAppData);
  
  // pagehide event is more reliable on iOS/Safari for mobile devices
  window.addEventListener("pagehide", saveAllAppData);
  
  // 12. Page Visibility API - Save all data when app goes to background
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      saveAllAppData();
    } else {
      App.restoreActiveTimers();
    }
  });
  
  console.log("✅ App loaded successfully!");
}

// Initialize with robust CSS loading to prevent timing issues
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    await waitForCSSLoad();
    // Force layout recalculation to ensure CSS is fully applied
    document.body.offsetHeight;
    await initializeApp();
  });
} else {
  waitForCSSLoad().then(async () => {
    // Force layout recalculation to ensure CSS is fully applied
    document.body.offsetHeight;
    await initializeApp();
  });
}

// Timer Persistenz Funktionen
App.saveActiveTimersState = function() {
  try {
    const activeTimerNames = Object.keys(App.data.activeTimers);
    AppStorage.setItem("activeTimerPlayers", JSON.stringify(activeTimerNames));
    console.log("Active timers saved:", activeTimerNames);
  } catch (e) {
    console.warn("Failed to save timer state:", e);
  }
};

App.restoreActiveTimers = function() {
  try {
    const activeTimerNames = JSON.parse(AppStorage.getItem("activeTimerPlayers") || "[]");
    
    // Alle bestehenden Timer stoppen
    Object.values(App.data.activeTimers).forEach(timer => {
      if (timer) clearInterval(timer);
    });
    App.data.activeTimers = {};
    
    // Timer für gespeicherte Spieler wiederherstellen
    activeTimerNames.forEach(playerName => {
      if (App.data.selectedPlayers.find(p => p.name === playerName)) {
        App.startPlayerTimer(playerName);
        console.log("Restored timer for:", playerName);
      }
    });
  } catch (e) {
    console.warn("Failed to restore timer state:", e);
  }
};

App.startPlayerTimer = function(playerName) {
  if (App.data.activeTimers[playerName]) {
    clearInterval(App.data.activeTimers[playerName]);
  }
  
  App.data.activeTimers[playerName] = setInterval(() => {
    App.data.playerTimes[playerName] = (App.data.playerTimes[playerName] || 0) + 1;
    App.storage.savePlayerTimes();
    
    // Update Display wenn auf Stats Seite
    if (App.storage.getCurrentPage() === "stats") {
      const timeTd = document.querySelector(`.ice-time-cell[data-player="${playerName}"]`);
      if (timeTd) {
        const sec = App.data.playerTimes[playerName];
        timeTd.textContent = App.helpers.formatTimeMMSS(sec);
        App.statsTable.updateIceTimeColors();
      }
    }
  }, 1000);
  
  // Visual Update bei Seitenwechsel
  App.updateTimerVisuals();
};

App.updateTimerVisuals = function() {
  // Timer visuelle Updates nur wenn auf Stats Seite
  if (App.storage.getCurrentPage() !== "stats") return;
  
  Object.keys(App.data.activeTimers).forEach(playerName => {
    const row = document.querySelector(`tr[data-player="${playerName}"]`);
    const nameTd = row?.querySelector("td:nth-child(2)");
    
    if (row && nameTd) {
      row.style.background = "#005c2f";
      nameTd.style.background = "#005c2f";
    }
  });
};
