// Storage Prefix for this app
const STORAGE_PREFIX = 'sPro_';

// Storage Utility Functions
const AppStorage = {
  prefix: STORAGE_PREFIX,
  _autoBackupInterval: null,
  _autoBackupStarted: false,

  getItem(key) {
    return localStorage.getItem(this.prefix + key);
  },
  
  setItem(key, value) {
    localStorage.setItem(this.prefix + key, value);
  },
  
  removeItem(key) {
    localStorage.removeItem(this.prefix + key);
  },

  startAutoBackup() {
    if (this._autoBackupStarted) return;
    this._autoBackupStarted = true;

    const doBackup = () => {
      if (typeof IDBBackup !== 'undefined') {
        IDBBackup.saveFullBackup().catch((err) => console.warn('[AutoBackup] Failed:', err));
      }
    };

    this._autoBackupInterval = setInterval(doBackup, 30000);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) doBackup();
    });

    window.addEventListener('pagehide', doBackup);
    window.addEventListener('beforeunload', doBackup);
  }
};

// LocalStorage Verwaltung
App.storage = {
  load() {
    const teamId = App.helpers.getCurrentTeamId();
    
    // ALL data should be team-specific
    try {
      const selectedPlayersData = AppStorage.getItem(`selectedPlayers_${teamId}`);
      App.data.selectedPlayers = selectedPlayersData ? JSON.parse(selectedPlayersData) : [];
    } catch (e) {
      console.error('Error loading selectedPlayers:', e);
      App.data.selectedPlayers = [];
    }
    
    try {
      const statsDataStr = AppStorage.getItem(`statsData_${teamId}`);
      App.data.statsData = statsDataStr ? JSON.parse(statsDataStr) : {};
    } catch (e) {
      console.error('Error loading statsData:', e);
      App.data.statsData = {};
    }
    
    try {
      const playerTimesStr = AppStorage.getItem(`playerTimes_${teamId}`);
      App.data.playerTimes = playerTimesStr ? JSON.parse(playerTimesStr) : {};
    } catch (e) {
      console.error('Error loading playerTimes:', e);
      App.data.playerTimes = {};
    }
    
    try {
      const seasonDataStr = AppStorage.getItem(`seasonData_${teamId}`);
      App.data.seasonData = seasonDataStr ? JSON.parse(seasonDataStr) : {};
    } catch (e) {
      console.error('Error loading seasonData:', e);
      App.data.seasonData = {};
    }

    try {
      const goalieSeasonDataStr = AppStorage.getItem(`goalieSeasonData_${teamId}`);
      App.data.goalieSeasonData = goalieSeasonDataStr ? JSON.parse(goalieSeasonDataStr) : {};
    } catch (e) {
      console.error('Error loading goalieSeasonData:', e);
      App.data.goalieSeasonData = {};
    }

    try {
      const goalieExportSnapshotStr = AppStorage.getItem(`goalieExportSnapshot_${teamId}`);
      App.data.goalieExportSnapshot = goalieExportSnapshotStr ? JSON.parse(goalieExportSnapshotStr) : {};
    } catch (e) {
      console.error('Error loading goalieExportSnapshot:', e);
      App.data.goalieExportSnapshot = {};
    }

    try {
      const shotsForOnIceStr = AppStorage.getItem(`shotsForOnIce_${teamId}`);
      App.data.shotsForOnIce = shotsForOnIceStr ? JSON.parse(shotsForOnIceStr) : {};
    } catch (e) {
      console.error('Error loading shotsForOnIce:', e);
      App.data.shotsForOnIce = {};
    }

    try {
      const shotsAgainstOnIceStr = AppStorage.getItem(`shotsAgainstOnIce_${teamId}`);
      App.data.shotsAgainstOnIce = shotsAgainstOnIceStr ? JSON.parse(shotsAgainstOnIceStr) : {};
    } catch (e) {
      console.error('Error loading shotsAgainstOnIce:', e);
      App.data.shotsAgainstOnIce = {};
    }
  },
  
  saveSelectedPlayers() {
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`selectedPlayers_${teamId}`, JSON.stringify(App.data.selectedPlayers));
  },
  
  saveStatsData() {
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`statsData_${teamId}`, JSON.stringify(App.data.statsData));
  },
  
  savePlayerTimes() {
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`playerTimes_${teamId}`, JSON.stringify(App.data.playerTimes));
  },
  
  saveSeasonData() {
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`seasonData_${teamId}`, JSON.stringify(App.data.seasonData));
  },

  saveGoalieSeasonData() {
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`goalieSeasonData_${teamId}`, JSON.stringify(App.data.goalieSeasonData));
  },

  saveGoalieExportSnapshot() {
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`goalieExportSnapshot_${teamId}`, JSON.stringify(App.data.goalieExportSnapshot));
  },

  saveShotsForOnIce() {
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`shotsForOnIce_${teamId}`, JSON.stringify(App.data.shotsForOnIce || {}));
  },

  saveShotsAgainstOnIce() {
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`shotsAgainstOnIce_${teamId}`, JSON.stringify(App.data.shotsAgainstOnIce || {}));
  },

  saveOnIceShotCounts() {
    this.saveShotsForOnIce();
    this.saveShotsAgainstOnIce();
  },

  clearOnIceShotCounts() {
    const teamId = App.helpers.getCurrentTeamId();
    App.data.shotsForOnIce = {};
    App.data.shotsAgainstOnIce = {};
    AppStorage.removeItem(`shotsForOnIce_${teamId}`);
    AppStorage.removeItem(`shotsAgainstOnIce_${teamId}`);
  },
  
  saveSeasonMapData() {
    const teamId = App.helpers.getCurrentTeamId();
    // Defensively re-save season map data that already exists in localStorage
    // This ensures aggressive browser cleanup (Samsung) doesn't evict these keys
    const markers = AppStorage.getItem(`seasonMapMarkers_${teamId}`);
    if (markers) {
      AppStorage.setItem(`seasonMapMarkers_${teamId}`, markers);
    }
    const timeData = AppStorage.getItem(`seasonMapTimeData_${teamId}`);
    if (timeData) {
      AppStorage.setItem(`seasonMapTimeData_${teamId}`, timeData);
    }
    const timeDataWithPlayers = AppStorage.getItem(`seasonMapTimeDataWithPlayers_${teamId}`);
    if (timeDataWithPlayers) {
      AppStorage.setItem(`seasonMapTimeDataWithPlayers_${teamId}`, timeDataWithPlayers);
    }
  },

  saveAll() {
    this.saveSelectedPlayers();
    this.saveStatsData();
    this.savePlayerTimes();
    this.saveSeasonData();
    this.saveGoalieSeasonData();
    this.saveOnIceShotCounts();
    this.saveSeasonMapData(); // NEW: defensive re-save for Season Map data
  },
  
  getCurrentPage() {
    return AppStorage.getItem("currentPage") || "selection";
  },
  
  setCurrentPage(page) {
    AppStorage.setItem("currentPage", page);
  }
};
