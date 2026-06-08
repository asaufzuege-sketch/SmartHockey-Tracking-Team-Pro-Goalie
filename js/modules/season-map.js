// Season Map Modul – READ ONLY

// Shows only data exported from the Goal Map.
// NO new markers from clicks in Season Map.

App.seasonMap = {
  timeTrackingBox: null,
  playerFilter: null,
  timeTrackingInitialized: false, // Flag to prevent duplicate initialization
  // Vertical split threshold (Y-coordinate) that separates green zone (scored/upper) from red zone (conceded/lower)
  VERTICAL_SPLIT_THRESHOLD: 50,
  // Mobile breakpoint for responsive behavior
  MOBILE_BREAKPOINT: 768,
  // Heatmap configuration
  HEATMAP_RENDER_DELAY: 150, // ms delay after marker rendering to ensure proper positioning
  HEATMAP_RADIUS_FACTOR: 0.12, // Heatmap gradient radius as percentage of field width (consistent across all orientations)
  HEATMAP_MIN_OPACITY: 0.15, // Minimum opacity for low-density areas (raised for visible edge halos)
  HEATMAP_MAX_OPACITY: 0.98, // Maximum opacity for high-density areas
  HEATMAP_DENSITY_POWER: 1.65, // Power function exponent for density scaling (> 1 emphasizes dense centers)
  HEATMAP_DENSITY_SCALE: 2.8, // Scales accumulated alpha so overlapping markers become visibly darker than isolated points
  HEATMAP_MIN_DENSITY_SCALE: 0.1, // Lower bound so density scaling cannot collapse to a visually ineffective value
  HEATMAP_BLUR_FACTOR: 0.32, // Post-blur radius factor (blur px = heatmap radius * factor, min 3px)
  HEATMAP_MIN_BLUR_PX: 6, // Minimum blur radius in px to avoid harsh edges on very small radii
  HEATMAP_GRADIENT_CENTER_OPACITY: 0.18, // Base per-marker density deposited at the center before blur/compositing
  HEATMAP_GRADIENT_OUTER_OPACITY: 0.065, // Soft outer density contribution that helps neighboring zones merge
  HEATMAP_GRADIENT_EDGE_OPACITY: 0.022, // Very soft edge opacity to avoid harsh heatmap cutoffs
  HEATMAP_TARGET_S_BOOST: 1.0, // Target saturation at maximum density
  HEATMAP_TARGET_L_DROP: 0.18, // Lightness drop at maximum density (reduced to keep colours vivid, not muddy)
  HEATMAP_NEUTRAL_SATURATION_THRESHOLD: 0.08, // Treat very low-saturation colors as neutral greys for density tinting
  HEATMAP_NEUTRAL_MAX_SATURATION: 0.12, // Keep grey clusters mostly neutral even at maximum density
  HEATMAP_NEUTRAL_SATURATION_BOOST: 0.04, // Slight saturation lift prevents dense grey zones from looking flat
  HEATMAP_NEUTRAL_MIN_LIGHTNESS_FACTOR: 0.35, // Prevent dense neutral clusters from collapsing fully to black
  HEATMAP_COLORED_MIN_LIGHTNESS_FACTOR: 0.68, // High lightness floor keeps dense colored clusters vivid, not near-black
  HEATMAP_GRADIENT_MIDPOINT_OPACITY: 0.6, // Opacity multiplier at gradient midpoint for smoother transitions
  HEATMAP_MAX_DPR: 3, // Cap DPR to balance sharp rendering and processing cost
  
  // Get heatmap radius factor (single consistent value for all viewports/orientations)
  getHeatmapRadiusFactor() {
    return this.HEATMAP_RADIUS_FACTOR;
  },
  
  // Helper: Get players from playerSelectionData storage  
  getPlayersFromStorage() {
    const teamId = App.helpers.getCurrentTeamId();
    const savedPlayersKey = `playerSelectionData_${teamId}`;
    let allPlayers = [];
    try {
      allPlayers = JSON.parse(AppStorage.getItem(savedPlayersKey) || "[]");
    } catch (e) {
      allPlayers = [];
    }
    const activePlayers = allPlayers.filter(p => p.active && p.name && p.name.trim() !== "");
    
    if (activePlayers.length === 0 && App.data.selectedPlayers && App.data.selectedPlayers.length > 0) {
      return App.data.selectedPlayers.map(p => ({
        number: p.num || "",
        name: p.name,
        position: p.position || "",
        active: true
      }));
    }
    
    return activePlayers;
  },
  
  init() {
    this.timeTrackingBox = document.getElementById("seasonMapTimeTrackingBox");
    this.playerFilter = null;
    
    // Buttons
    document.getElementById("exportSeasonMapBtn")?.addEventListener("click", () => {
      this.exportFromGoalMap();
    });
    
    document.getElementById("exportSeasonMapPageBtn")?.addEventListener("click", () => {
      this.exportAsImage();
    });
    
    document.getElementById("resetSeasonMapBtn")?.addEventListener("click", () => {
      this.reset();
    });
    
    // Time Tracking read-only
    this.initTimeTracking();
    
    // Player Filter
    this.initPlayerFilter();
    
    // Add window resize listener to reposition markers (with cleanup)
    if (this.resizeListener) {
      window.removeEventListener("resize", this.resizeListener);
    }
    
    this.resizeListener = () => {
      // Debounce resize events
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => {
        if (App.markerHandler && typeof App.markerHandler.repositionMarkers === 'function') {
          App.markerHandler.repositionMarkers();
        }
        // Re-render heatmap when switching between mobile/desktop views
        this.renderHeatmap();
      }, 100);
    };
    window.addEventListener("resize", this.resizeListener);
  },
  
  // -----------------------------
  // Player Filter
  // -----------------------------
  initPlayerFilter() {
    const filterSelect = document.getElementById("seasonMapPlayerFilter");
    if (!filterSelect) return;
    
    // Collect all unique player names from historical data
    const historicalPlayers = new Set();
    const teamId = App.helpers.getCurrentTeamId();
    
    // 1. Collect from seasonMapMarkers
    const allMarkers = App.helpers.safeJSONParse(`seasonMapMarkers_${teamId}`, []);
    if (allMarkers) {
      allMarkers.forEach((markersForBox, boxIndex) => {
        if (Array.isArray(markersForBox)) {
          markersForBox.forEach(m => {
            if (m.player) {
              // Green Goal Box (index 1) - all field players who scored
              if (boxIndex === 1) {
                historicalPlayers.add(m.player);
              }
              // Field Box (index 0) - only top half (yPct < 50, green zone) for field players
              else if (boxIndex === 0 && m.yPct < 50) {
                historicalPlayers.add(m.player);
              }
              // Red Goal Box (index 2) - skip (contains goalies, not field players)
            }
          });
        }
      });
    }
    
    // 2. Collect from seasonMapTimeDataWithPlayers
    const timeDataRaw = AppStorage.getItem(`seasonMapTimeDataWithPlayers_${teamId}`);
    if (timeDataRaw) {
      try {
        const timeData = JSON.parse(timeDataRaw);
        // Keys are in format: pX_Y where X is period and Y is button index
        Object.keys(timeData).forEach(key => {
          // Extract button index (the number after the underscore)
          const parts = key.split('_');
          if (parts.length === 2) {
            const buttonIndex = parseInt(parts[1], 10);
            // Only consider buttons 0-3 (top row / green buttons)
            if (!isNaN(buttonIndex) && buttonIndex >= 0 && buttonIndex <= 3) {
              const playerData = timeData[key];
              if (typeof playerData === 'object' && playerData !== null) {
                Object.keys(playerData).forEach(playerName => {
                  historicalPlayers.add(playerName);
                });
              }
            }
          }
        });
      } catch (e) {
        console.warn("Failed to parse seasonMapTimeDataWithPlayers for player filter", e);
      }
    }
    
    // 3. Merge with active roster (non-goalies)
    const activePlayers = this.getPlayersFromStorage()
      .filter(player => player.position !== "G")
      .map(player => player.name);
    
    activePlayers.forEach(name => historicalPlayers.add(name));
    
    // 4. Sort and populate filter
    const allPlayerNames = Array.from(historicalPlayers).sort();
    
    filterSelect.innerHTML = '<option value="">All Players</option>';
    allPlayerNames.forEach(playerName => {
      const option = document.createElement("option");
      option.value = playerName;
      option.textContent = playerName;
      filterSelect.appendChild(option);
    });
    
    filterSelect.addEventListener("change", () => {
      this.playerFilter = filterSelect.value || null;
      this.applyPlayerFilter();
      
      if (this.playerFilter) {
        filterSelect.classList.add("active");
      } else {
        filterSelect.classList.remove("active");
      }
    });
    
    const savedFilter = AppStorage.getItem(`seasonMapPlayerFilter_${teamId}`);
    if (savedFilter) {
      filterSelect.value = savedFilter;
      this.playerFilter = savedFilter;
    }
    
    // Goalie Filter Dropdown - populate with ALL goalies ever entered for this team's season
    const goalieFilterSelect = document.getElementById("seasonMapGoalieFilter");
    if (goalieFilterSelect) {
      // Collect all unique goalies from season data (markers and time data)
      const allGoalies = new Set();
      
      // Get goalies from markers
      const teamId = App.helpers.getCurrentTeamId();
      const allMarkers = App.helpers.safeJSONParse(`seasonMapMarkers_${teamId}`, []);
      if (allMarkers) {
        allMarkers.forEach((markersForBox, boxIndex) => {
          if (Array.isArray(markersForBox)) {
            markersForBox.forEach(m => {
              if (m.player) {
                // Only consider a player a "goalie" if their marker is in:
                // - Red Goal Box (index 2), OR
                // - Field Box (index 0) with yPct >= 50 (bottom half)
                if (boxIndex === 2) {
                  // Red Goal Box - always a goalie
                  allGoalies.add(m.player);
                } else if (boxIndex === 0 && m.yPct >= 50) {
                  // Field Box, bottom half (red zone)
                  allGoalies.add(m.player);
                }
                // Ignore: Green Goal Box (index 1) and top-half field markers (index 0, yPct < 50)
              }
            });
          }
        });
      }
      
      // Get goalies from time data
      const timeDataRaw = AppStorage.getItem(`seasonMapTimeDataWithPlayers_${teamId}`);
      if (timeDataRaw) {
        try {
          const timeData = JSON.parse(timeDataRaw);
          // Keys are in format: pX_Y where X is period and Y is button index
          Object.keys(timeData).forEach(key => {
            // Extract button index (the number after the underscore)
            const parts = key.split('_');
            if (parts.length === 2) {
              const buttonIndex = parseInt(parts[1], 10);
              // Only consider buttons 4, 5, 6, 7 (bottom row / red buttons)
              if (!isNaN(buttonIndex) && buttonIndex >= 4 && buttonIndex <= 7) {
                const playerData = timeData[key];
                if (typeof playerData === 'object' && playerData !== null) {
                  Object.keys(playerData).forEach(playerName => {
                    allGoalies.add(playerName);
                  });
                }
              }
              // Ignore buttons 0-3 (top row / green buttons)
            }
          });
        } catch (e) {
          console.warn("Failed to parse seasonMapTimeDataWithPlayers for goalie filter", e);
        }
      }
      
      // Zeige ALLE Goalies die Season-Daten haben - unabhängig von aktueller Player Selection
      // Diese bleiben bis Reset erhalten, auch wenn der Goalie gelöscht/überschrieben wird
      let goaliesToShow = Array.from(allGoalies);
      
      // Fallback: Wenn keine Season-Daten existieren, zeige aktuelle aktive Goalies
      if (goaliesToShow.length === 0) {
        const currentGoalies = this.getPlayersFromStorage()
          .filter(p => p.position === "G")
          .map(g => g.name);
        goaliesToShow = currentGoalies;
      }
      
      goalieFilterSelect.innerHTML = '<option value="">All Goalies</option>';
      goaliesToShow.forEach(goalieName => {
        const option = document.createElement("option");
        option.value = goalieName;
        option.textContent = goalieName;
        goalieFilterSelect.appendChild(option);
      });
      
      goalieFilterSelect.addEventListener("change", () => {
        const selectedGoalie = goalieFilterSelect.value;
        const teamId = App.helpers.getCurrentTeamId();
        
        if (selectedGoalie && selectedGoalie !== "") {
          AppStorage.setItem(`seasonMapActiveGoalie_${teamId}`, selectedGoalie);
          goalieFilterSelect.classList.add("active");
          this.filterByGoalies([selectedGoalie]);
        } else {
          AppStorage.removeItem(`seasonMapActiveGoalie_${teamId}`);
          goalieFilterSelect.classList.remove("active");
          const allGoalies = this.getAllGoaliesFromData();
          this.filterByGoalies(allGoalies);
        }
      });
    }
  },
  
  // Helper: Refresh momentum graphic if available
  refreshMomentumGraphic() {
    if (typeof window.renderSeasonMomentumGraphic === 'function') {
      window.renderSeasonMomentumGraphic();
    }
  },
  
  // Helper: Check if marker is in GREEN zone
  isGreenZoneMarker(marker, box) {
    if (box.id === 'seasonGoalGreenBox') return true;
    if (box.id === 'seasonGoalRedBox') return false;
    
    if (marker.dataset.zone) {
      return marker.dataset.zone === 'green';
    }
    
    const color = marker.style.backgroundColor || '';
    const isGreenColor = color.includes('0, 255, 102') || color.includes('00ff66');
    if (isGreenColor) return true;
    
    const isGreyColor = color.includes('68, 68, 68') || color.includes('444444');
    if (isGreyColor) {
      const yPctImage = parseFloat(marker.dataset.yPctImage);
      if (!isNaN(yPctImage) && yPctImage > 0) {
        return yPctImage < this.VERTICAL_SPLIT_THRESHOLD;
      }
      const top = parseFloat((marker.style.top || '0').replace('%', '')) || 0;
      return top < this.VERTICAL_SPLIT_THRESHOLD;
    }
    
    return false;
  },
  
  // Helper: Check if marker is in RED zone
  isRedZoneMarker(marker, box) {
    if (box.id === 'seasonGoalRedBox') return true;
    if (box.id === 'seasonGoalGreenBox') return false;
    
    if (marker.dataset.zone) {
      return marker.dataset.zone === 'red';
    }
    
    const color = marker.style.backgroundColor || '';
    const isRedColor = color.includes('255, 0, 0') || color.includes('ff0000');
    if (isRedColor) return true;
    
    const isGreyColor = color.includes('68, 68, 68') || color.includes('444444');
    if (isGreyColor) {
      const yPctImage = parseFloat(marker.dataset.yPctImage);
      if (!isNaN(yPctImage) && yPctImage > 0) {
        return yPctImage >= this.VERTICAL_SPLIT_THRESHOLD;
      }
      const top = parseFloat((marker.style.top || '0').replace('%', '')) || 0;
      return top >= this.VERTICAL_SPLIT_THRESHOLD;
    }
    
    return false;
  },
  
  // Get all unique goalies from season data
  getAllGoaliesFromData() {
    const allGoalies = new Set();
    
    const teamId = App.helpers.getCurrentTeamId();
    const markersRaw = AppStorage.getItem(`seasonMapMarkers_${teamId}`);
    if (markersRaw) {
      try {
        const allMarkers = JSON.parse(markersRaw);
        allMarkers.forEach(markersForBox => {
          if (Array.isArray(markersForBox)) {
            markersForBox.forEach(m => {
              if (m.player && m.zone === 'red') {
                allGoalies.add(m.player);
              }
            });
          }
        });
      } catch (e) {}
    }
    
    return Array.from(allGoalies);
  },
  
  filterByGoalies(goalieNames, skipStatsRender = false) {
    const allGoalies = this.getAllGoaliesFromData();
    const isAllGoaliesFilter = (goalieNames.length === allGoalies.length && 
                                 goalieNames.every(name => allGoalies.includes(name)));
    
    const boxes = document.querySelectorAll(App.selectors.seasonMapBoxes);
    boxes.forEach(box => {
      const markers = box.querySelectorAll(".marker-dot");
      markers.forEach(marker => {
        const isRedMarker = this.isRedZoneMarker(marker, box);
        
        if (isRedMarker) {
          const playerName = marker.dataset.player;
          
          if (isAllGoaliesFilter) {
            marker.style.display = '';
          } else if (playerName && goalieNames.includes(playerName)) {
            marker.style.display = '';
          } else {
            marker.style.display = 'none';
          }
        }
      });
    });
    
    this.applyGoalieTimeTrackingFilter(goalieNames);
    
    // Update Momentum Graphic when goalie filter changes
    this.refreshMomentumGraphic();
    
    // Update heatmap after filter change
    this.renderHeatmap();
    
    // Update goalie statistics (skip during initial render to avoid counting before all filters applied)
    if (!skipStatsRender) {
      this.renderGoalAreaStats();
    }
  },
  
  applyGoalieTimeTrackingFilter(goalieNames) {
    if (!this.timeTrackingBox) return;
    
    const teamId = App.helpers.getCurrentTeamId();
    const timeDataWithPlayers = App.helpers.safeJSONParse(`seasonMapTimeDataWithPlayers_${teamId}`, {});
    
    this.timeTrackingBox.querySelectorAll(".period").forEach((period, pIdx) => {
      const periodNum = period.dataset.period || `sp${pIdx + 1}`;
      const buttons = period.querySelectorAll(".time-btn");
      
      buttons.forEach((btn, idx) => {
        // Map season period to goal map period for data lookup
        const goalMapPeriod = periodNum.replace('sp', 'p');
        const key = `${goalMapPeriod}_${idx}`;
        const playerData = timeDataWithPlayers[key] || {};
        
        let displayVal = 0;
        goalieNames.forEach(goalieName => {
          displayVal += Number(playerData[goalieName]) || 0;
        });
        
        btn.textContent = displayVal;
      });
    });
  },
  
  applyPlayerFilter(skipStatsRender = false) {
    const teamId = App.helpers.getCurrentTeamId();
    if (this.playerFilter) {
      AppStorage.setItem(`seasonMapPlayerFilter_${teamId}`, this.playerFilter);
    } else {
      AppStorage.removeItem(`seasonMapPlayerFilter_${teamId}`);
    }
    
    const boxes = document.querySelectorAll(App.selectors.seasonMapBoxes);
    boxes.forEach(box => {
      const markers = box.querySelectorAll(".marker-dot");
      markers.forEach(marker => {
        const isGreenMarker = this.isGreenZoneMarker(marker, box);
        
        if (isGreenMarker) {
          if (this.playerFilter) {
            marker.style.display = (marker.dataset.player === this.playerFilter) ? '' : 'none';
          } else {
            marker.style.display = '';
          }
        }
      });
    });
    
    this.applyTimeTrackingFilter();
    
    // Update Momentum Graphic when player filter changes
    this.refreshMomentumGraphic();
    
    // Update heatmap after filter change
    this.renderHeatmap();
    
    // Update goalie statistics (skip during initial render to avoid counting before all filters applied)
    if (!skipStatsRender) {
      this.renderGoalAreaStats();
    }
  },
  
  // Apply player filter to time tracking
  applyTimeTrackingFilter() {
    if (!this.timeTrackingBox) return;
    
    const teamId = App.helpers.getCurrentTeamId();
    const timeDataWithPlayers = App.helpers.safeJSONParse(`seasonMapTimeDataWithPlayers_${teamId}`, {});
    
    this.timeTrackingBox.querySelectorAll(".period").forEach((period, pIdx) => {
      const periodNum = period.dataset.period || `sp${pIdx + 1}`;
      const buttons = period.querySelectorAll(".time-btn");
      
      buttons.forEach((btn, idx) => {
        const goalMapPeriod = periodNum.replace('sp', 'p');
        const key = `${goalMapPeriod}_${idx}`;
        const playerData = timeDataWithPlayers[key] || {};
        
        let displayVal = 0;
        if (this.playerFilter) {
          displayVal = Number(playerData[this.playerFilter]) || 0;
        } else {
          displayVal = Object.values(playerData).reduce((sum, val) => sum + (Number(val) || 0), 0);
        }
        
        btn.textContent = displayVal;
      });
    });
  },
  
  // -----------------------------
  // Render: Marker aus Storage laden (READ ONLY)
  // -----------------------------
  render() {
    const boxes = Array.from(document.querySelectorAll(App.selectors.seasonMapBoxes));
    
    // CRITICAL: Remove ALL existing markers before creating new ones
    boxes.forEach(box => box.querySelectorAll(".marker-dot").forEach(d => d.remove()));
    
    // CSS steuert die Bildgröße - kein JavaScript-Override mehr nötig
    // Stelle sicher dass die Boxen relativ positioniert sind für Marker
    boxes.forEach(box => {
      box.style.position = 'relative';
    });
    
    // Marker laden (werden NICHT neu gesetzt, nur angezeigt)
    const teamId = App.helpers.getCurrentTeamId();
    const allMarkers = App.helpers.safeJSONParse(`seasonMapMarkers_${teamId}`, null);
    if (allMarkers) {
      allMarkers.forEach((markersForBox, idx) => {
        const box = boxes[idx];
        if (!box || !Array.isArray(markersForBox)) return;
          
          markersForBox.forEach(m => {
            // Skip markers with invalid coordinates (0, 0, undefined, null, or very small values)
            if (!m.xPct || !m.yPct || 
                m.xPct < 0.1 || m.yPct < 0.1 ||
                isNaN(m.xPct) || isNaN(m.yPct)) {
              console.warn('[Season Map] Skipping marker with invalid coordinates:', m);
              return;
            }
            
            App.markerHandler.createMarkerPercent(
              m.xPct,
              m.yPct,
              m.color || "#444444",
              box,
              false, // NICHT interaktiv (kein Entfernen per Klick)
              m.player || null
            );
            
            // Restore zone attribute
            const dots = box.querySelectorAll(".marker-dot");
            const lastDot = dots[dots.length - 1];
            if (lastDot && m.zone) {
              lastDot.dataset.zone = m.zone;
            }
          });
        });
    }
    
    // Apply filters after restoring
    this.applyPlayerFilter(true); // Skip stats render - will be called after both filters applied
    
    const savedGoalie = AppStorage.getItem(`seasonMapActiveGoalie_${teamId}`);
    if (savedGoalie) {
      this.filterByGoalies([savedGoalie], true); // Skip stats render - will be called after both filters applied
    } else {
      const allGoalies = this.getAllGoaliesFromData();
      this.filterByGoalies(allGoalies, true); // Skip stats render - will be called after both filters applied
    }
    
    // Reposition markers after rendering to ensure correct placement
    if (App.markerHandler && typeof App.markerHandler.repositionMarkers === 'function') {
      setTimeout(() => {
        App.markerHandler.repositionMarkers();
      }, 100);
    }
    
    // Render heatmap after markers are positioned
    setTimeout(() => {
      this.renderHeatmap();
      // Render goalie statistics (5 zones with percentages and counts)
      this.renderGoalAreaStats();
    }, this.HEATMAP_RENDER_DELAY);
  },
  
  // -----------------------------
  // Heatmap Rendering
  // -----------------------------
  renderHeatmap() {
    const fieldBox = document.getElementById('seasonFieldBox');
    if (!fieldBox) return;
    
    // Remove existing heatmap
    const existingCanvas = fieldBox.querySelector('.heatmap-canvas');
    if (existingCanvas) existingCanvas.remove();
    
    // Create canvas overlay
    const canvas = document.createElement('canvas');
    canvas.className = 'heatmap-canvas';
    
    const img = fieldBox.querySelector('img');
    if (!img) return;
    
    // Compute rendered image rectangle (accounting for object-fit: contain)
    const renderedImageRect = App.markerHandler.computeRenderedImageRect(img);
    if (!renderedImageRect || !renderedImageRect.valid) {
      console.warn('[Season Map] Cannot render heatmap: image rect not available');
      return;
    }
    
    const dpr = Math.max(1, Math.min(this.HEATMAP_MAX_DPR, window.devicePixelRatio || 1));
    
    // Set canvas size to match rendered image in physical pixels (HiDPI aware)
    canvas.width = Math.round(renderedImageRect.width * dpr);
    canvas.height = Math.round(renderedImageRect.height * dpr);
    
    // Validate canvas dimensions
    if (canvas.width === 0 || canvas.height === 0) {
      console.warn('[Season Map] Cannot render heatmap: image not loaded or has zero dimensions');
      return;
    }
    
    // Position canvas at top-left of container (image fills container)
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.position = 'absolute';
    canvas.style.width = `${renderedImageRect.width}px`;
    canvas.style.height = `${renderedImageRect.height}px`;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('[Season Map] Cannot render heatmap: canvas context unavailable');
      return;
    }
    ctx.scale(dpr, dpr);
    
    // Get all markers
    const markers = fieldBox.querySelectorAll('.marker-dot');
    
    // Separate markers by ACTUAL COLOR instead of zone
    const greenMarkers = []; // Green markers: Tore erzielt (scored goals)
    const greyMarkers = [];  // Grey markers: Schüsse daneben (missed shots)
    const redMarkers = [];   // Red markers: Gegentore (conceded goals)
    
    markers.forEach(marker => {
      // Skip hidden markers
      if (marker.style.display === 'none') return;
      
      const yPct = parseFloat(marker.dataset.yPctImage) || 0;
      const xPct = parseFloat(marker.dataset.xPctImage) || 0;
      
      // Skip markers with invalid coordinates (0,0 or out of bounds)
      if (xPct < 0.1 || yPct < 0.1 || xPct >= 100 || yPct >= 100) return;
      
      // Determine marker color from backgroundColor
      // Parse RGB values for robust comparison (handles rgb/rgba formats)
      const bgColor = marker.style.backgroundColor || '';
      
      // Parse color to RGB values
      let r = 0, g = 0, b = 0;
      const rgbMatch = bgColor.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (rgbMatch) {
        r = parseInt(rgbMatch[1], 10);
        g = parseInt(rgbMatch[2], 10);
        b = parseInt(rgbMatch[3], 10);
      }
      
      // Helper to check if color is grey (r ≈ g ≈ b within tolerance)
      const isGreyColor = (r, g, b) => {
        return r > 50 && r < 100 && 
               g > 50 && g < 100 && 
               b > 50 && b < 100 && 
               Math.abs(r - g) < 20 && 
               Math.abs(r - b) < 20;
      };
      
      // Categorize by color with tolerance for slight variations
      // Green: rgb(0, 255, 102) - scored goals
      if (r < 50 && g > 200 && b > 50 && b < 150) {
        greenMarkers.push({ x: xPct, y: yPct });
      }
      // Grey: rgb(68, 68, 68) - missed shots
      else if (isGreyColor(r, g, b)) {
        greyMarkers.push({ x: xPct, y: yPct });
      }
      // Red: rgb(255, 0, 0) - conceded goals
      else if (r > 200 && g < 50 && b < 50) {
        redMarkers.push({ x: xPct, y: yPct });
      }
    });
    
    // Draw heatmaps for each color type
    // Green markers (scored goals) → green glow
    this.drawHeatmapZone(ctx, greenMarkers, renderedImageRect.width, renderedImageRect.height, 'rgba(0, 255, 102, 0.6)', dpr);
    
    // Grey markers (missed shots) → grey glow
    this.drawHeatmapZone(ctx, greyMarkers, renderedImageRect.width, renderedImageRect.height, 'rgba(68, 68, 68, 0.6)', dpr);
    
    // Red markers (conceded goals) → red glow
    this.drawHeatmapZone(ctx, redMarkers, renderedImageRect.width, renderedImageRect.height, 'rgba(255, 0, 0, 0.6)', dpr);
    
    fieldBox.appendChild(canvas);
  },
  
  drawHeatmapZone(ctx, markers, width, height, color, dpr = 1) {
    if (markers.length === 0) return;
    
    // Calculate radius proportional to field width so circles scale consistently
    // across all orientations. The field image is portrait-oriented (width < height),
    // so width is always the smaller dimension and acts as the stable reference axis.
    const radiusFactor = this.getHeatmapRadiusFactor();
    const radius = width * radiusFactor;
    
    // Parse base color to extract RGB values
    const baseColorMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!baseColorMatch) {
      console.warn('[Season Map] Invalid color format for heatmap:', color);
      return;
    }
    
    const r = parseInt(baseColorMatch[1], 10);
    const g = parseInt(baseColorMatch[2], 10);
    const b = parseInt(baseColorMatch[3], 10);
    
    // Validate RGB values are in valid range
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
      console.warn('[Season Map] Invalid RGB values for heatmap:', { r, g, b });
      return;
    }
    
    // Stage 1: Accumulate additive density on offscreen canvas
    const off = document.createElement('canvas');
    const physicalWidth = Math.round(width * dpr);
    const physicalHeight = Math.round(height * dpr);
    off.width = physicalWidth;
    off.height = physicalHeight;
    const offCtx = off.getContext('2d');
    if (!offCtx) return;
    offCtx.scale(dpr, dpr);
    offCtx.globalCompositeOperation = 'lighter';
    const centerOpacity = Math.max(0, Math.min(1, this.HEATMAP_GRADIENT_CENTER_OPACITY));
    const midpointOpacity = Math.max(0, Math.min(1, this.HEATMAP_GRADIENT_MIDPOINT_OPACITY));
    const outerOpacity = Math.max(0, Math.min(1, this.HEATMAP_GRADIENT_OUTER_OPACITY));
    const edgeOpacity = Math.max(0, Math.min(1, this.HEATMAP_GRADIENT_EDGE_OPACITY));
    markers.forEach(marker => {
      const x = (marker.x / 100) * width;
      const y = (marker.y / 100) * height;
      
      const gradient = offCtx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0.0, `rgba(0, 0, 0, ${centerOpacity.toFixed(3)})`);
      gradient.addColorStop(0.35, `rgba(0, 0, 0, ${(centerOpacity * midpointOpacity).toFixed(3)})`);
      gradient.addColorStop(0.7, `rgba(0, 0, 0, ${outerOpacity.toFixed(3)})`);
      gradient.addColorStop(0.9, `rgba(0, 0, 0, ${edgeOpacity.toFixed(3)})`);
      gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
      
      offCtx.fillStyle = gradient;
      offCtx.beginPath();
      offCtx.arc(x, y, radius, 0, Math.PI * 2);
      offCtx.fill();
    });
    
    // Stage 2: Apply a soft post-blur to merge neighboring halos
    const blurPx = Math.max(this.HEATMAP_MIN_BLUR_PX, radius * this.HEATMAP_BLUR_FACTOR);
    let densityCanvas = off;
    let densityCtx = offCtx;
    const blurredOff = document.createElement('canvas');
    blurredOff.width = physicalWidth;
    blurredOff.height = physicalHeight;
    const blurredOffCtx = blurredOff.getContext('2d');
    if (blurredOffCtx) {
      blurredOffCtx.scale(dpr, dpr);
      blurredOffCtx.filter = `blur(${blurPx}px)`;
      blurredOffCtx.drawImage(off, 0, 0, width, height);
      blurredOffCtx.filter = 'none';
      densityCanvas = blurredOff;
      densityCtx = blurredOffCtx;
    }
    
    const rgbToHsl = (red, green, blue) => {
      const redNorm = red / 255;
      const greenNorm = green / 255;
      const blueNorm = blue / 255;
      const max = Math.max(redNorm, greenNorm, blueNorm);
      const min = Math.min(redNorm, greenNorm, blueNorm);
      const delta = max - min;
      let hue = 0;
      let saturation = 0;
      const lightness = (max + min) / 2;
      if (delta !== 0) {
        saturation = delta / (1 - Math.abs((2 * lightness) - 1));
        switch (max) {
          case redNorm:
            hue = ((greenNorm - blueNorm) / delta) % 6;
            break;
          case greenNorm:
            hue = ((blueNorm - redNorm) / delta) + 2;
            break;
          default:
            hue = ((redNorm - greenNorm) / delta) + 4;
            break;
        }
        hue = (hue * 60 + 360) % 360;
      }
      return [hue, saturation, lightness];
    };
    const hslToRgb = (hue, saturation, lightness) => {
      const chroma = (1 - Math.abs((2 * lightness) - 1)) * saturation;
      const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
      const m = lightness - (chroma / 2);
      let redPrime = 0;
      let greenPrime = 0;
      let bluePrime = 0;
      if (hue < 60) {
        redPrime = chroma; greenPrime = x;
      } else if (hue < 120) {
        redPrime = x; greenPrime = chroma;
      } else if (hue < 180) {
        greenPrime = chroma; bluePrime = x;
      } else if (hue < 240) {
        greenPrime = x; bluePrime = chroma;
      } else if (hue < 300) {
        redPrime = x; bluePrime = chroma;
      } else {
        redPrime = chroma; bluePrime = x;
      }
      return [
        Math.round((redPrime + m) * 255),
        Math.round((greenPrime + m) * 255),
        Math.round((bluePrime + m) * 255)
      ];
    };
    
    // Stage 3: Map density alpha and color using HSL saturation/lightness scaling
    // Read physical pixels so density scaling stays crisp on HiDPI backstores.
    const img = densityCtx.getImageData(0, 0, physicalWidth, physicalHeight);
    const data = img.data;
    let hasDensity = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) {
        hasDensity = true;
        break;
      }
    }
    if (!hasDensity) return;
    
    const minOp = this.HEATMAP_MIN_OPACITY;
    const maxOp = this.HEATMAP_MAX_OPACITY;
    const range = maxOp - minOp;
    const power = this.HEATMAP_DENSITY_POWER;
    const densityScale = Math.max(this.HEATMAP_MIN_DENSITY_SCALE, this.HEATMAP_DENSITY_SCALE || 1);
    const targetSaturation = Math.max(0, Math.min(1, this.HEATMAP_TARGET_S_BOOST));
    const baseHsl = rgbToHsl(r, g, b);
    const isNeutralColor = baseHsl[1] < this.HEATMAP_NEUTRAL_SATURATION_THRESHOLD;
    const maxTargetSaturation = isNeutralColor
      ? Math.min(this.HEATMAP_NEUTRAL_MAX_SATURATION, baseHsl[1] + this.HEATMAP_NEUTRAL_SATURATION_BOOST)
      : targetSaturation;
    const targetLightnessDrop = Math.max(0, Math.min(1, this.HEATMAP_TARGET_L_DROP));
    const minLightnessFactor = isNeutralColor
      ? this.HEATMAP_NEUTRAL_MIN_LIGHTNESS_FACTOR
      : this.HEATMAP_COLORED_MIN_LIGHTNESS_FACTOR;
    
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha === 0) continue;
      
      const ratio = Math.min(1, (alpha / 255) * densityScale);
      const enhanced = Math.pow(ratio, power);
      const opacity = minOp + (enhanced * range);
      const saturation = baseHsl[1] + ((maxTargetSaturation - baseHsl[1]) * enhanced);
      const minLightness = Math.max(0, baseHsl[2] * minLightnessFactor);
      const lightness = Math.max(minLightness, baseHsl[2] - (targetLightnessDrop * enhanced));
      const [rNew, gNew, bNew] = hslToRgb(baseHsl[0], Math.min(1, saturation), lightness);
      data[i + 3] = Math.round(Math.min(1, opacity) * 255);
      data[i] = rNew;
      data[i + 1] = gNew;
      data[i + 2] = bNew;
    }
    
    densityCtx.putImageData(img, 0, 0);
    
    const previousCompositeOperation = ctx.globalCompositeOperation;
    const previousImageSmoothingEnabled = ctx.imageSmoothingEnabled;
    const previousImageSmoothingQuality = ctx.imageSmoothingQuality;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(densityCanvas, 0, 0, width, height);
    ctx.imageSmoothingEnabled = previousImageSmoothingEnabled;
    ctx.imageSmoothingQuality = previousImageSmoothingQuality;
    ctx.globalCompositeOperation = previousCompositeOperation;
  },
  
  // -----------------------------
  // Export aus Goal Map → Season Map
  // -----------------------------
  exportFromGoalMap() {
    if (!confirm("In Season Map exportieren?")) return;
    
    // OVERWRITE mode: Read markers from Goal Map and replace Season Map data completely
    // This ensures no duplication and clean state for each export
    const boxes = Array.from(document.querySelectorAll(App.selectors.torbildBoxes));
    const allMarkers = boxes.map(box => {
      const markers = [];
      // Add null check for box
      if (!box) return markers;
      
      box.querySelectorAll(".marker-dot").forEach(dot => {
        // CRITICAL FIX: Read from dataset (image-relative coordinates) instead of style
        // This ensures we export the exact percentages that heatmap uses
        const xPct = parseFloat(dot.dataset.xPctImage) || 0;
        const yPct = parseFloat(dot.dataset.yPctImage) || 0;
        const bg = dot.style.backgroundColor || "";
        
        // Validate parsed coordinates - skip invalid markers (NaN, undefined, or very small values close to 0)
        // The < 0.1 check handles both zero and very small values that are likely invalid
        if (isNaN(xPct) || isNaN(yPct) || xPct < 0.1 || yPct < 0.1) {
          console.warn('[Season Map Export] Skipping marker with invalid coordinates:', { xPct, yPct });
          return;
        }
        
        const playerName = dot.dataset.player || null;
        
        // Determine zone based on box and position
        const zone = dot.dataset.zone || (yPct >= this.VERTICAL_SPLIT_THRESHOLD ? "red" : "green");
        
        markers.push({ xPct, yPct, color: bg, player: playerName, zone });
      });
      return markers;
    });
    
    // OVERWRITE: Replace existing data completely
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`seasonMapMarkers_${teamId}`, JSON.stringify(allMarkers));
    
    // Time data: OVERWRITE with current game data
    const newTimeData = App.helpers.safeJSONParse(`timeDataWithPlayers_${teamId}`, {});
    AppStorage.setItem(`seasonMapTimeDataWithPlayers_${teamId}`, JSON.stringify(newTimeData));
    
    // Flache Zeitdaten für Momentum-Graph
    // Format: { "p1": [button0, button1, ..., button7], "p2": [...], "p3": [...] }
    const momentumData = {};
    const periods = ['p1', 'p2', 'p3'];
    
    periods.forEach(periodNum => {
      const periodValues = [];
      // 8 Buttons pro Period (0-3 top-row/scored, 4-7 bottom-row/conceded)
      for (let btnIdx = 0; btnIdx < 8; btnIdx++) {
        const key = `${periodNum}_${btnIdx}`;
        const playerData = newTimeData[key] || {};
        const total = Object.values(playerData).reduce((sum, val) => sum + Number(val || 0), 0);
        periodValues.push(total);
      }
      momentumData[periodNum] = periodValues;
    });
    
    // Speichere für Momentum-Graph
    AppStorage.setItem(`seasonMapTimeData_${teamId}`, JSON.stringify(momentumData));
    
    const keep = confirm("Game exported to Season Map. Keep data in Goal Map? (OK = Yes)");
    if (!keep) {
      document.querySelectorAll("#torbildPage .marker-dot").forEach(d => d.remove());
      document.querySelectorAll("#torbildPage .time-btn").forEach(btn => btn.textContent = "0");
      AppStorage.removeItem(`timeData_${teamId}`);
      AppStorage.removeItem(`timeDataWithPlayers_${teamId}`);
    }
    
    // Show the season map page
    App.showPage("seasonMap");
    
    // Explicitly call render() to display the exported data immediately
    // This ensures markers are rendered even if showPage() doesn't trigger it
    // (e.g., if the page is already visible or markers exist in DOM from previous session)
    this.render();
    
    // Momentum-Grafik aktualisieren
    // Timeout benötigt, damit Page-Wechsel, Rendering und localStorage-Änderungen abgeschlossen sind
    if (typeof window.renderSeasonMomentumGraphic === 'function') {
      setTimeout(() => {
        window.renderSeasonMomentumGraphic();
      }, 100);
    }
  },
  
  // liest die Zeitdaten aus der Goal Map Box
  readTimeTrackingFromBox() {
    const result = {};
    const box = document.getElementById("timeTrackingBox");
    if (!box) return result;
    
    box.querySelectorAll(".period").forEach((period, pIdx) => {
      const key = period.dataset.period || (`p${pIdx}`);
      result[key] = [];
      period.querySelectorAll(".time-btn").forEach(btn => {
        result[key].push(Number(btn.textContent) || 0);
      });
    });
    return result;
  },
  
  // schreibt Zeitdaten in die SeasonMap-Zeitbox
  writeTimeTrackingToBox(timeDataWithPlayers) {
    if (!this.timeTrackingBox || !timeDataWithPlayers) return;
    
    const periods = Array.from(this.timeTrackingBox.querySelectorAll(".period"));
    periods.forEach((period, pIdx) => {
      const periodKey = period.dataset.period || `sp${pIdx}`;
      period.querySelectorAll(".time-btn").forEach((btn, btnIdx) => {
        const buttonId = `${periodKey}_${btnIdx}`;
        const playerData = timeDataWithPlayers[buttonId] || {};
        
        let count = 0;
        if (this.playerFilter) {
          count = playerData[this.playerFilter] || 0;
        } else {
          count = Object.values(playerData).reduce((sum, val) => sum + (Number(val) || 0), 0);
        }
        
        btn.textContent = count;
      });
    });
  },
  
  // Zeitbuttons deaktivieren (read-only)
  initTimeTracking() {
    if (!this.timeTrackingBox) return;
    
    // Allow re-initialization to fix event listener attachment after page refresh/navigation
    if (this.timeTrackingInitialized) {
      console.log("[Season Map] Re-initializing TimeTracking to refresh event listeners...");
      // Continue with re-initialization instead of returning
    } else {
      console.log("[Season Map] First-time TimeTracking initialization...");
    }
    this.timeTrackingInitialized = true;
    
    // Make bottom-row buttons (conceded goals) interactive for goalie assignment
    this.timeTrackingBox.querySelectorAll(".time-btn").forEach((btn, index) => {
      const period = btn.closest(".period");
      const isBottomRow = btn.closest(".period-buttons")?.classList.contains("bottom-row");
      
      if (isBottomRow) {
        // Bottom-row buttons (conceded goals) are interactive
        // Clone button to remove any existing event listeners (prevents duplicates on re-initialization)
        // Note: These buttons are only managed by this module, so removing all listeners is safe.
        const newBtn = btn.cloneNode(true);
        newBtn.disabled = false;
        newBtn.classList.remove("disabled-readonly");
        btn.parentNode.replaceChild(newBtn, btn);
        
        // Add click handler for goalie selection on the new button
        newBtn.addEventListener("click", () => {
          this.handleConcededGoalClick(newBtn, period);
        });
      } else {
        // Top-row buttons (scored goals) remain read-only
        btn.disabled = true;
        btn.classList.add("disabled-readonly");
      }
    });
  },
  
  // Handle click on conceded goal time button (red zone)
  handleConcededGoalClick(btn, period) {
    // Get current goalies from selectedPlayers
    const goalies = this.getPlayersFromStorage()
      .filter(p => p && p.position === "G")
      .map(g => g.name);
    
    if (goalies.length === 0) {
      alert("No goalies available. Please select goalies in Player Selection first.");
      return;
    }
    
    // Show goalie selection modal
    this.showGoalieSelectionModal(goalies, (selectedGoalie) => {
      if (selectedGoalie) {
        // Get the key for this button
        const periodNum = period.dataset.period;
        const buttons = Array.from(period.querySelectorAll(".time-btn"));
        const btnIndex = buttons.indexOf(btn);
        const key = `${periodNum}_${btnIndex}`;
        
        // Update time data with goalie assignment
        const teamId = App.helpers.getCurrentTeamId();
        let timeDataWithPlayers = App.helpers.safeJSONParse(`seasonMapTimeDataWithPlayers_${teamId}`, {});
        
        if (!timeDataWithPlayers[key]) {
          timeDataWithPlayers[key] = {};
        }
        
        // Increment the count for this goalie
        if (!timeDataWithPlayers[key][selectedGoalie]) {
          timeDataWithPlayers[key][selectedGoalie] = 0;
        }
        timeDataWithPlayers[key][selectedGoalie] += 1;
        
        // Save to localStorage
        AppStorage.setItem(`seasonMapTimeDataWithPlayers_${teamId}`, JSON.stringify(timeDataWithPlayers));
        
        // Update button display
        const total = Object.values(timeDataWithPlayers[key])
          .reduce((sum, val) => sum + Number(val), 0);
        btn.textContent = total;
        
        console.log(`Conceded goal assigned to ${selectedGoalie} at ${key}`);
      }
    });
  },
  
  // Show goalie selection modal
  showGoalieSelectionModal(goalies, callback) {
    const modal = document.getElementById("goalieSelectionModal");
    const list = document.getElementById("goalieSelectionList");
    const confirmBtn = document.getElementById("goalieSelectionConfirm");
    const cancelBtn = document.getElementById("goalieSelectionCancel");
    
    if (!modal || !list || !confirmBtn || !cancelBtn) {
      console.error("Goalie selection modal elements not found");
      return;
    }
    
    // Clear previous content
    list.innerHTML = "";
    
    // Use event delegation instead of adding listeners to each label
    const handleListClick = (e) => {
      const label = e.target.closest('.goalie-option');
      if (label) {
        const radio = label.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          confirmBtn.disabled = false;
        }
      }
    };
    
    // Populate with goalies
    goalies.forEach(goalieName => {
      const label = document.createElement("label");
      label.className = "goalie-option";
      
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "goalieSelect";
      radio.value = goalieName;
      
      const span = document.createElement("span");
      span.textContent = goalieName;
      
      label.appendChild(radio);
      label.appendChild(span);
      list.appendChild(label);
    });
    
    // Add event listener to list container
    list.addEventListener("click", handleListClick);
    
    // Disable confirm button initially
    confirmBtn.disabled = true;
    
    // Show modal
    modal.style.display = "flex";
    
    // Handle confirm
    const handleConfirm = () => {
      const selected = list.querySelector('input[name="goalieSelect"]:checked');
      if (selected) {
        callback(selected.value);
      }
      cleanup();
    };
    
    // Handle cancel
    const handleCancel = () => {
      callback(null);
      cleanup();
    };
    
    // Handle background click
    const handleModalClick = (e) => {
      if (e.target === modal) {
        handleCancel();
      }
    };
    
    // Cleanup function
    const cleanup = () => {
      modal.style.display = "none";
      confirmBtn.removeEventListener("click", handleConfirm);
      cancelBtn.removeEventListener("click", handleCancel);
      modal.removeEventListener("click", handleModalClick);
      list.removeEventListener("click", handleListClick);
    };
    
    // Attach event listeners
    confirmBtn.addEventListener("click", handleConfirm);
    cancelBtn.addEventListener("click", handleCancel);
    modal.addEventListener("click", handleModalClick);
  },
  
  // Goal-Area-Statistik (Zonen im Tor)
  renderGoalAreaStats() {
    const seasonMapRoot = document.getElementById("seasonMapPage");
    if (!seasonMapRoot) return;
    
    const goalBoxIds = ["seasonGoalGreenBox", "seasonGoalRedBox"];
    goalBoxIds.forEach(id => {
      const box = document.getElementById(id);
      if (!box) return;
      
      box.querySelectorAll(".goal-area-label").forEach(el => el.remove());
      
      // Filter markers based on box type
      const isRedGoal = (id === "seasonGoalRedBox");
      const markers = Array.from(box.querySelectorAll(".marker-dot")).filter(m => {
        // Skip hidden markers
        if (m.style.display === 'none') return false;
        
        // For red goal box (conceded), use goalie filter
        if (isRedGoal) {
          const teamId = App.helpers.getCurrentTeamId();
          const savedGoalie = AppStorage.getItem(`seasonMapActiveGoalie_${teamId}`);
          if (savedGoalie && savedGoalie !== "") {
            // Specific goalie selected - only show their markers
            return m.dataset.player === savedGoalie;
          }
          // "All Goalies" - show all markers
          return true;
        }
        
        // For green goal box (scored), use player filter
        if (this.playerFilter) {
          return m.dataset.player === this.playerFilter;
        }
        return true;
      });
      
      // Deduplicate markers before counting
      // Note: This deduplicates at the DOM level after rendering, using pixel coordinates
      // Different from export deduplication which operates on data before rendering
      const seen = new Set();
      const uniq = markers.filter(m => {
        const left = Math.round(parseFloat(m.style.left) || 0);
        const top  = Math.round(parseFloat(m.style.top)  || 0);
        // Use null character as separator to avoid conflicts with player names containing colons
        const key = `${left}\0${top}\0${m.dataset.player || ''}\0${box.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      
      const total = uniq.length;
      
      const counts = { tl: 0, tr: 0, bl: 0, bm: 0, br: 0 };
      uniq.forEach(m => {
        const left = parseFloat(m.style.left) || 0;
        const top = parseFloat(m.style.top) || 0;
        if (top < 50) {
          if (left < 50) counts.tl++;
          else counts.tr++;
        } else {
          if (left < 33.3333) counts.bl++;
          else if (left < 66.6667) counts.bm++;
          else counts.br++;
        }
      });
      
      const areas = [
        { key: "tl", x: 25, y: 22 },
        { key: "tr", x: 75, y: 22 },
        { key: "bl", x: 16, y: 75 },
        { key: "bm", x: 50, y: 75 },
        { key: "br", x: 84, y: 75 }
      ];
      
      areas.forEach(a => {
        const cnt = counts[a.key] || 0;
        const pct = total ? Math.round((cnt / total) * 100) : 0;
        const div = document.createElement("div");
        div.className = "goal-area-label";
        div.style.cssText = `
          position: absolute;
          left: ${a.x}%;
          top: ${a.y}%;
          transform: translate(-50%,-50%);
          pointer-events: none;
          font-weight: 800;
          opacity: 0.45;
          font-size: 36px;
          color: #000000;
          text-shadow: 0 1px 2px rgba(255,255,255,0.06);
          line-height: 1;
          user-select: none;
          white-space: nowrap;
        `;
        div.textContent = `${cnt} (${pct}%)`;
        box.appendChild(div);
      });
    });
  },
  
  // Reset NUR für Season Map Anzeige
  reset() {
    if (!confirm("⚠️ Season Map zurücksetzen (Marker + Timeboxen)?")) return;
    
    // Marker entfernen
    document.querySelectorAll("#seasonMapPage .marker-dot").forEach(d => d.remove());
    
    // Time Buttons zurücksetzen
    document.querySelectorAll("#seasonMapPage .time-btn").forEach(btn => btn.textContent = "0");
    
    // LocalStorage Daten löschen
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.removeItem(`seasonMapMarkers_${teamId}`);
    AppStorage.removeItem(`seasonMapTimeData_${teamId}`);
    AppStorage.removeItem(`seasonMapTimeDataWithPlayers_${teamId}`);
    
    // Reset initialization flag to allow re-initialization
    this.timeTrackingInitialized = false;
    
    // Momentum Container leeren (korrekter ID: seasonMapMomentum)
    const momentumContainer = document.getElementById("seasonMapMomentum");
    if (momentumContainer) {
      momentumContainer.innerHTML = "";
    }
    
    // Momentum-Grafik neu rendern mit leeren Daten
    // Timeout benötigt, damit localStorage-Änderungen vor dem Rendering propagiert werden
    if (typeof window.renderSeasonMomentumGraphic === 'function') {
      setTimeout(() => {
        window.renderSeasonMomentumGraphic();
      }, 50);
    }
    
    // Goal Area Labels zurücksetzen (falls vorhanden)
    document.querySelectorAll("#seasonMapPage .goal-area-label").forEach(label => {
      label.textContent = "0";
    });
    
    // Refresh filter dropdowns to clear old player names
    this.refreshPlayerFilters();
    
    console.log('[Season Map] Reset completed - Momentum container cleared and re-rendered');
    
    alert("Season Map reset.");
  },
  
  exportAsImage() {
    const seasonMapPage = document.getElementById("seasonMapPage");
    
    if (!seasonMapPage) {
      console.error("Season Map page not found");
      return;
    }
    
    if (typeof html2canvas === 'undefined') {
      console.error("html2canvas is not loaded");
      alert("Export library not loaded. Please refresh the page and try again.");
      return;
    }
    
    console.log("Generating Season Map image...");

    // --- Fixed export width (device/viewport independent) ---
    const EXPORT_WIDTH = 1200;

    // --- Image asset paths ---
    const FIELD_IMG_SRC = 'Spielfeld Overlay.png';
    const GOAL_GREEN_SRC = 'Tor Grün.png';
    const GOAL_RED_SRC   = 'Tor Rot.png';

    // === Header filter labels ===
    const playerFilter = this.playerFilter || "All Players";
    const goalieSelect = document.getElementById("seasonMapGoalieFilter");
    const goalieFilter = (goalieSelect && goalieSelect.value) ? goalieSelect.value : "All Goalies";

    // Pre-load all three images to get their natural (intrinsic) dimensions.
    // This lets us compute exact pixel sizes for each container so images
    // fill their boxes completely – eliminating "object-fit: contain" letterboxing
    // and keeping all percentage-based absolute positions (markers, labels) accurate.
    const preloadImage = (src) => new Promise((resolve) => {
      const img = new Image();
      const done = () => resolve(img);
      img.onload  = done;
      img.onerror = done; // resolve even on error; dimensions will be 0
      img.src = src;
      // If the browser already has the image cached it may be complete immediately
      if (img.complete && img.naturalWidth > 0) done();
    });

    Promise.all([
      preloadImage(FIELD_IMG_SRC),
      preloadImage(GOAL_GREEN_SRC),
      preloadImage(GOAL_RED_SRC)
    ]).then(([fieldImgEl, greenImgEl, redImgEl]) => {

      // --- Layout arithmetic ---
      // We want:
      //   fieldH  = greenGoalH + GOAL_GAP + redGoalH   (field as tall as goal column)
      //   fieldW  = fieldH  * fieldAspect
      //   greenGoalH = goalColW / greenAspect
      //   redGoalH   = goalColW / redAspect
      //   fieldW + COL_GAP + goalColW = INNER_WIDTH
      //
      // Solving for fieldW:
      //   K       = 1/greenAspect + 1/redAspect
      //   fieldW  = ((INNER_WIDTH - COL_GAP) * K + GOAL_GAP) / (K + 1/fieldAspect)

      const PADDING    = 16;
      const COL_GAP    = 20;  // horizontal gap between field column and goal column
      const GOAL_GAP   = 15;  // vertical gap between the two goal boxes
      const INNER_WIDTH = EXPORT_WIDTH - 2 * PADDING;

      // Fall back to the known intrinsic pixel dimensions of the bundled image
      // assets ('Spielfeld Overlay.png' 428×825, 'Tor Grün.png' 543×332,
      // 'Tor Rot.png' 543×333) if the images failed to load.
      const fieldNatW = fieldImgEl.naturalWidth  || 428;
      const fieldNatH = fieldImgEl.naturalHeight || 825;
      const greenNatW = greenImgEl.naturalWidth  || 543;
      const greenNatH = greenImgEl.naturalHeight || 332;
      const redNatW   = redImgEl.naturalWidth    || 543;
      const redNatH   = redImgEl.naturalHeight   || 333;

      const fieldAspect = fieldNatW / fieldNatH;   // ~0.519 (portrait)
      const greenAspect = greenNatW / greenNatH;   // ~1.636 (landscape)
      const redAspect   = redNatW   / redNatH;     // ~1.631 (landscape)

      const K        = 1 / greenAspect + 1 / redAspect;
      const fieldW   = Math.round(((INNER_WIDTH - COL_GAP) * K + GOAL_GAP) / (K + 1 / fieldAspect));
      const fieldH   = Math.round(fieldW / fieldAspect);
      const goalColW = INNER_WIDTH - COL_GAP - fieldW;
      const greenGoalH = Math.round(goalColW / greenAspect);
      const redGoalH   = Math.round(goalColW / redAspect);

      // Helper: clone a marker dot and reposition it using its image-relative
      // dataset coordinates (xPctImage / yPctImage).  This ensures the dot sits
      // at the correct spot over the image regardless of the current on-screen
      // container size.
      const cloneMarkerImageRelative = (dot) => {
        const dotCopy = dot.cloneNode(true);
        const xPct = parseFloat(dot.dataset.xPctImage);
        const yPct = parseFloat(dot.dataset.yPctImage);
        if (!isNaN(xPct) && !isNaN(yPct)) {
          dotCopy.style.left = `${xPct}%`;
          dotCopy.style.top  = `${yPct}%`;
        } else {
          console.warn('[Season Map export] Marker dot is missing xPctImage/yPctImage dataset attributes; its position may be inaccurate in the exported image.', dot);
        }
        return dotCopy;
      };

      // === 1. Outer export container ===
      const exportContainer = document.createElement('div');
      exportContainer.style.cssText = `
        position: absolute;
        left: -9999px;
        top: 0;
        width: ${EXPORT_WIDTH}px;
        background: #ffffff;
        padding: ${PADDING}px;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      `;

      // === 2. Header ===
      const header = document.createElement('div');
      header.style.cssText = `
        display: block;
        width: 100%;
        box-sizing: border-box;
        padding: 14px 16px;
        margin-bottom: 16px;
        text-align: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        font-size: 22px;
        font-weight: 700;
        color: #000000;
        background: #ffffff;
        border-bottom: 2px solid #333333;
        line-height: 1.3;
      `;
      header.textContent = `Player: ${playerFilter} | Goalie: ${goalieFilter}`;
      exportContainer.appendChild(header);

      // === 3. Field + Goals row ===
      // No fixed height – each column is sized to exactly match its image's
      // intrinsic aspect ratio so there is zero letterboxing.
      const fieldRow = document.createElement('div');
      fieldRow.style.cssText = `
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        justify-content: flex-start;
        gap: ${COL_GAP}px;
        width: 100%;
        box-sizing: border-box;
        margin-bottom: 16px;
      `;

      // --- 3a. Field column ---
      const fieldBoxOrig = document.getElementById('seasonFieldBox');
      const fieldColumn = document.createElement('div');
      fieldColumn.style.cssText = `
        flex: 0 0 ${fieldW}px;
        width: ${fieldW}px;
        height: ${fieldH}px;
        position: relative;
        overflow: hidden;
        border-radius: 10px;
        background: #ffffff;
      `;

      // Field image fills the container exactly (aspect ratio already enforced
      // by the explicit width/height above – no object-fit: contain needed)
      const fieldImg = document.createElement('img');
      fieldImg.src = FIELD_IMG_SRC;
      fieldImg.alt = 'Spielfeld Overlay';
      fieldImg.style.cssText = `
        display: block;
        width: 100%;
        height: 100%;
        border-radius: 8px;
      `;
      fieldColumn.appendChild(fieldImg);

      // Scale the heatmap canvas to the export field dimensions
      const originalCanvas = fieldBoxOrig ? fieldBoxOrig.querySelector('.heatmap-canvas') : null;
      if (originalCanvas) {
        const canvasCopy = document.createElement('canvas');
        canvasCopy.className = 'heatmap-canvas';
        canvasCopy.width  = fieldW;
        canvasCopy.height = fieldH;
        canvasCopy.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        `;
        const ctx = canvasCopy.getContext('2d');
        ctx.drawImage(originalCanvas, 0, 0, fieldW, fieldH);
        fieldColumn.appendChild(canvasCopy);
      }

      // Copy marker dots using image-relative coordinates
      if (fieldBoxOrig) {
        fieldBoxOrig.querySelectorAll('.marker-dot').forEach(dot => {
          fieldColumn.appendChild(cloneMarkerImageRelative(dot));
        });
      }

      fieldRow.appendChild(fieldColumn);

      // --- 3b. Goal column (two goal boxes, no timebox) ---
      const goalColumn = document.createElement('div');
      goalColumn.style.cssText = `
        flex: 0 0 ${goalColW}px;
        width: ${goalColW}px;
        display: flex;
        flex-direction: column;
        gap: ${GOAL_GAP}px;
        box-sizing: border-box;
      `;

      const goalSources = [
        { id: 'seasonGoalGreenBox', src: GOAL_GREEN_SRC, alt: 'Tor (Grün)', h: greenGoalH },
        { id: 'seasonGoalRedBox',   src: GOAL_RED_SRC,   alt: 'Tor (Rot)',  h: redGoalH  }
      ];

      goalSources.forEach(({ id, src, alt, h }) => {
        const origBox = document.getElementById(id);
        const goalBox = document.createElement('div');
        goalBox.style.cssText = `
          flex: 0 0 ${h}px;
          width: ${goalColW}px;
          height: ${h}px;
          position: relative;
          overflow: hidden;
          border-radius: 10px;
          background: #ffffff;
          box-sizing: border-box;
        `;

        const goalImg = document.createElement('img');
        goalImg.src = src;
        goalImg.alt = alt;
        goalImg.style.cssText = `
          display: block;
          width: 100%;
          height: 100%;
          border-radius: 8px;
        `;
        goalBox.appendChild(goalImg);

        // Copy overlays (goal-area-labels, etc.) – these already use image-relative
        // percentage positions set by renderGoalAreaStats(), so they remain correct.
        // Copy marker dots using image-relative coordinates.
        if (origBox) {
          origBox.querySelectorAll('.goal-area-label, .goal-overlay, .goal-label, .goal-cell').forEach(el => {
            goalBox.appendChild(el.cloneNode(true));
          });
          origBox.querySelectorAll('.marker-dot').forEach(dot => {
            goalBox.appendChild(cloneMarkerImageRelative(dot));
          });
        }

        goalColumn.appendChild(goalBox);
      });

      fieldRow.appendChild(goalColumn);
      exportContainer.appendChild(fieldRow);

      // === 4. Momentum container (placed BELOW the field row) ===
      const momentumContainer = seasonMapPage.querySelector('#seasonMapMomentum');
      if (momentumContainer) {
        const momentumClone = momentumContainer.cloneNode(true);
        momentumClone.style.cssText = `
          display: block;
          width: 100%;
          box-sizing: border-box;
          margin-top: 8px;
          padding: 2px 6px 6px 6px;
          background: transparent;
        `;
        // Ensure nested SVG fills the container width
        const svg = momentumClone.querySelector('svg');
        if (svg) {
          svg.style.width = '100%';
          svg.style.height = 'auto';
          svg.style.display = 'block';
        }
        exportContainer.appendChild(momentumClone);
      }

      document.body.appendChild(exportContainer);

      const cleanupTempContainer = () => {
        if (document.body.contains(exportContainer)) {
          document.body.removeChild(exportContainer);
        }
      };

      // Use requestAnimationFrame so the browser completes layout before measuring
      requestAnimationFrame(() => {
        const exportHeight = exportContainer.scrollHeight || exportContainer.offsetHeight;

        html2canvas(exportContainer, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: true,
          allowTaint: true,
          width: EXPORT_WIDTH,
          height: exportHeight
        }).then(canvas => {
          cleanupTempContainer();
          
          canvas.toBlob(blob => {
            if (!blob) {
              alert("Error: Failed to create image blob");
              return;
            }
            
            try {
              const date = App.helpers.getCurrentDateString();
              // Filename includes filter info - sanitize player name for filename
              const filterSuffix = playerFilter !== "All Players" 
                ? `_${playerFilter.replace(/[^a-zA-Z0-9]/g, '_')}` 
                : '';
              const filename = `season_map_${date}${filterSuffix}.png`;
              
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = filename;
              link.style.display = 'none';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(link.href);
              
              console.log("Season Map export completed:", filename);
            } catch (error) {
              console.error("Error creating download:", error);
              alert("Error creating download: " + error.message);
            }
          }, 'image/png');
        }).catch(error => {
          cleanupTempContainer();
          console.error("Error capturing season map:", error);
          alert("Error capturing season map: " + error.message);
        });
      });
    });
  }
};
