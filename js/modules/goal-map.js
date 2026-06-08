// Goal Map Modul - Version 2025-12-24 - Deploy Fix
// Verhalten wie in Repo 912, erweitert um Goal/Shot-Workflow + Spieler-Filter

App.goalMap = {
  timeTrackingBox: null,
  playerFilter: null,
  timeTrackingInitialized: false, // Flag to prevent duplicate initialization
  VERTICAL_SPLIT_THRESHOLD: 50, // y-percent threshold for green (top) vs red (bottom) half
  WORKFLOW_STEP_FIELD: 0, // First step: click in field
  WORKFLOW_STEP_GOAL: 1, // Second step: click in goal
  WORKFLOW_STEP_TIME: 2, // Third step: click time button
  AUTO_NAVIGATION_DELAY_MS: 300, // Delay before auto-navigating after workflow completion
  MARKER_POSITION_TOLERANCE: 0.01, // Tolerance for marker position comparison (absolute percentage points)
  
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
    // Nur aktive Spieler mit Namen zurückgeben
    const activePlayers = allPlayers.filter(p => p.active && p.name && p.name.trim() !== "");
    
    // Fallback auf App.data.selectedPlayers wenn keine Daten
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
    this.timeTrackingBox = document.getElementById("timeTrackingBox");
    
    // Event Listener für Export (speichert Marker + Timeboxen + Spielerinfos)
    document.getElementById("exportGoalMapBtn")?.addEventListener("click", () => {
      this.exportGoalMap();
    });
    
    // Event Listener für Export Season Map (gleiche Funktion)
    document.getElementById("exportSeasonMapBtn")?.addEventListener("click", () => {
      this.exportGoalMap();
    });
    
    // Reset Button (nur Goal Map)
    document.getElementById("resetTorbildBtn")?.addEventListener("click", () => {
      this.reset();
    });
    
    // Marker Handler für Goal Map Boxen
    this.attachMarkerHandlers();
    
    // Time Tracking initialisieren (916‑Logik mit Spielerzuordnung)
    this.initTimeTracking();
    
    // Player Filter initialisieren
    this.initPlayerFilter();
    
    // Restore saved filter and goalie state
    this.restoreFilterState();
    
    // Restore markers from localStorage
    this.restoreMarkers();
    
    // Apply both filters independently at the end
    this.applyPlayerFilter();  // Filter green zone
    
    // Apply goalie filter for red zone
    const teamId = App.helpers.getCurrentTeamId();
    const savedGoalie = AppStorage.getItem(`goalMapActiveGoalie_${teamId}`);
    if (savedGoalie) {
      // Specific goalie is saved, filter red zone by that goalie
      this.filterByGoalies([savedGoalie]);
    } else {
      // "All Goalies" or no goalie saved - show all red zone markers
      const allGoalies = this.getPlayersFromStorage().filter(p => p.position === "G");
      const goalieNames = allGoalies.map(g => g.name);
      this.filterByGoalies(goalieNames);
    }
    
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
      }, 100);
    };
    window.addEventListener("resize", this.resizeListener);
    
    // Initial repositioning after markers are restored
    if (App.markerHandler && typeof App.markerHandler.repositionMarkers === 'function') {
      // Small delay to ensure images are loaded
      setTimeout(() => {
        App.markerHandler.repositionMarkers();
      }, 100);
    }
  },
  
  attachMarkerHandlers() {
    const boxes = document.querySelectorAll(App.selectors.torbildBoxes);
    
    boxes.forEach(box => {
      // KRITISCH: Prüfen ob Event-Listener bereits angehängt wurden
      if (box.dataset.handlersAttached === 'true') {
        return; // Überspringe diese Box
      }
      box.dataset.handlersAttached = 'true'; // Markiere als initialisiert
      
      const img = box.querySelector("img");
      if (!img) return;
      
      box.style.position = box.style.position || "relative";
      App.markerHandler.createImageSampler(img);
      
      let mouseHoldTimer = null;
      let isLong = false;
      let lastMouseUp = 0;
      let lastTouchEnd = 0;
      let lastTouchTime = 0;
      let lastMarkerPlacedTime = 0;  // NEU: Flag für letzten Marker
      
      const getPosFromEvent = (e) => {
        const boxRect = img.getBoundingClientRect();
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches?.[0]?.clientX);
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches?.[0]?.clientY);
        
        const rendered = App.markerHandler.computeRenderedImageRect(img);
        let insideImage = false;
        let xPctImage = 0;
        let yPctImage = 0;
        
        if (rendered) {
          // Strict boundary check - no tolerance to prevent clicks outside image (in black corners)
          insideImage = (
            clientX >= rendered.x &&
            clientX < rendered.x + rendered.width && 
            clientY >= rendered.y &&
            clientY < rendered.y + rendered.height
          );
          if (insideImage) {
            xPctImage = Math.max(0, Math.min(100, ((clientX - rendered.x) / (rendered.width || 1)) * 100));
            yPctImage = Math.max(0, Math.min(100, ((clientY - rendered.y) / (rendered.height || 1)) * 100));
          }
        }
        // If rendered image rect cannot be computed, insideImage remains false
        // which will block the click in placeMarker
        
        return { xPctImage, yPctImage, insideImage };
      };
      
      // Helper function to set zone attribute on last created marker
      const setMarkerZone = (box, zone) => {
        const markers = box.querySelectorAll(".marker-dot");
        const lastMarker = markers[markers.length - 1];
        if (lastMarker) {
          lastMarker.dataset.zone = zone;
        }
      };
      
      const placeMarker = (pos, long, forceGrey = false) => {
        let workflowActive = App.goalMapWorkflow?.active;
        let eventType = App.goalMapWorkflow?.eventType; // 'goal' | 'shot' | null
        let workflowType = App.goalMapWorkflow?.workflowType; // 'scored' | 'conceded' | null
        let isGoalWorkflow = workflowActive && eventType === 'goal';
        let isShotWorkflow = workflowActive && eventType === 'shot';
        let isScoredWorkflow = workflowType === 'scored';
        let isConcededWorkflow = workflowType === 'conceded';
        const neutralGrey = "#444444";
        let currentStep = App.goalMapWorkflow?.collectedPoints?.length || 0;
        
        let pointPlayer = workflowActive
          ? App.goalMapWorkflow.playerName
          : (this.playerFilter || null);
        
        const isGoalBox =
          box.classList.contains("goal-img-box") ||
          box.id === "goalGreenBox" ||
          box.id === "goalRedBox";
        
        if (!pos.insideImage) return;
        
        // ============================================================
        // KRITISCHER FIX: ROTE ZONE SOFORT BEI GOAL-WORKFLOW SPERREN
        // ============================================================
        // 
        // Wenn Goal-Workflow aktiv ist:
        // - workflowType ist noch null → Rote Zone sperren (User muss erst grün wählen)
        // - workflowType ist 'scored' → Rote Zone sperren (grüner Workflow)
        // - workflowType ist 'conceded' → Rote Zone erlaubt (roter Workflow)
        //
        const isRedZone = pos.yPctImage >= this.VERTICAL_SPLIT_THRESHOLD;
        
        if (isGoalWorkflow) {
          // Workflow-Typ noch nicht bestimmt ODER scored (grün) → Rot sperren
          if (!workflowType || workflowType === 'scored') {
            
            // Rote FELD-Zone sperren
            if (box.classList.contains("field-box") && isRedZone) {
              console.log('[Goal Map] RED ZONE BLOCKED - goal workflow active, waiting for green zone click');
              return; // BLOCKIEREN!
            }
            
            // Rotes TOR sperren
            if (box.id === "goalRedBox") {
              console.log('[Goal Map] RED GOAL BLOCKED - goal workflow active');
              return; // BLOCKIEREN!
            }
          }
          
          // ============================================================
          // CONCEDED WORKFLOW: GRÜNE BEREICHE SPERREN
          // ============================================================
          // Während CONCEDED Workflow: Grüne Zone sperren
          if (workflowType === 'conceded') {
            // Grüne FELD-Zone sperren
            if (box.classList.contains("field-box") && !isRedZone) {
              console.log('[Goal Map] GREEN ZONE BLOCKED - conceded workflow active');
              return;
            }
            
            // Grünes TOR sperren
            if (box.id === "goalGreenBox") {
              console.log('[Goal Map] GREEN GOAL BLOCKED - conceded workflow active');
              return;
            }
          }
        }
        // ============================================================
        // ENDE KRITISCHER FIX
        // ============================================================
        
        // Shot Workflow: Only allow clicks in field box (will be handled below)
        if (isShotWorkflow) {
          const isFieldBox = box.classList.contains("field-box");
          if (!isFieldBox) {
            console.log('[Shot Workflow] Please click in the field (green zone)');
            return;
          }
        }
        
        // Opponent-Shot Workflow: Only allow clicks in field box
        if (workflowActive && eventType === 'opponent-shot') {
          const isFieldBox = box.classList.contains("field-box");
          if (!isFieldBox) {
            console.log('[Opponent-Shot Workflow] Please click in the field (red zone)');
            return;
          }
        }
        
        // Im Goal-Workflow: Strenge Schritt-Kontrolle
        if (isGoalWorkflow) {
          const isFieldBox = box.classList.contains("field-box");
          const isGreenGoal = box.id === "goalGreenBox";
          const isRedGoal = box.id === "goalRedBox";
          
          // In conceded workflow, do NOT allow clicks in green zone
          if (isFieldBox && isConcededWorkflow && pos.yPctImage < this.VERTICAL_SPLIT_THRESHOLD) {
            console.log('[Goal Workflow] Green zone not allowed in conceded workflow - click in red zone');
            return;
          }
          
          // Schritt 0: NUR Spielfeld erlaubt
          if (currentStep === this.WORKFLOW_STEP_FIELD) {
            if (!isFieldBox) {
              console.log('[Goal Workflow] Step 1: Please click point in field first');
              return; // Blockiere alle anderen Bereiche
            }
            // Detect which half was clicked and set workflow type
            if (isFieldBox && !workflowType) {
              // Use VERTICAL_SPLIT_THRESHOLD: top half (y < 50%) = scored (green), bottom half (y >= 50%) = conceded (red)
              const isRedZone = pos.yPctImage >= this.VERTICAL_SPLIT_THRESHOLD;
              App.goalMapWorkflow.workflowType = isRedZone ? 'conceded' : 'scored';
              console.log(`[Goal Workflow] Detected ${App.goalMapWorkflow.workflowType} workflow at y=${pos.yPctImage}%`);
              
              // Update overlays
              if (App.goalMap && typeof App.goalMap.updatePlayerNameOverlay === 'function') {
                App.goalMap.updatePlayerNameOverlay();
              }
              
              // Goalie should already be set by startGoalMapWorkflow
              // No modal needed here, workflow was started with goalie pre-selected
            }
          }
          // Schritt 1: Nur entsprechendes Tor erlaubt
          else if (currentStep === this.WORKFLOW_STEP_GOAL) {
            if (isScoredWorkflow && !isGreenGoal) {
              console.log('[Goal Workflow] Step 2: Please click point in green goal');
              return;
            }
            if (isConcededWorkflow && !isRedGoal) {
              console.log('[Goal Workflow] Step 2: Please click point in red goal');
              return;
            }
          }
          // Schritt 2: Timebox (wird separat in initTimeTracking behandelt)
          else if (currentStep >= 2) {
            console.log('[Goal Workflow] Step 3: Please click time button');
            return; // Blockiere Spielfeld und Tor komplett
          }
        }
        
        // ROTES TOR: Nur mit Goalie
        if (box.id === "goalRedBox") {
          const activeGoalie = this.getActiveGoalie();
          if (!activeGoalie) {
            alert('Please select a goalie first');
            return;
          }
          // Ohne Workflow oder mit conceded workflow: erlaubt wenn Goalie ausgewählt
          // Im Workflow: Nur in Schritt 1 (nach Feldpunkt) und im conceded workflow erlaubt
          if (workflowActive && (!isConcededWorkflow || currentStep !== this.WORKFLOW_STEP_GOAL)) {
            return;
          }
        }
        
        // TOR-BOXEN: immer Graupunkt
        if (isGoalBox) {
          const sampler = App.markerHandler.createImageSampler(img);
          if (!sampler || !sampler.valid) return;
          
          if (box.id === "goalGreenBox") {
            if (!sampler.isWhiteAt(pos.xPctImage, pos.yPctImage, 180)) return;  // War: 220
          } else if (box.id === "goalRedBox") {
            if (!sampler.isNeutralWhiteAt(pos.xPctImage, pos.yPctImage, 200, 30)) return;  // War: 235, 12
          } else {
            if (!sampler.isWhiteAt(pos.xPctImage, pos.yPctImage, 180)) return;  // War: 220
          }
          
          const color = neutralGrey;
          
          App.markerHandler.createMarkerPercent(
            pos.xPctImage,
            pos.yPctImage,
            color,
            box,
            true,
            pointPlayer
          );
          
          // Set data-zone attribute for goal boxes
          setMarkerZone(box, box.id === 'goalRedBox' ? 'red' : 'green');
          
          this.saveMarkers();
          
          if (workflowActive) {
            App.addGoalMapPoint(
              "goal",
              pos.xPctImage,
              pos.yPctImage,
              color,
              box.id
            );
          }
          return;
        }
        
        // FELD-BOX: grün/rot oder grau je nach Kontext
        if (box.classList.contains("field-box")) {
          // Mobile/Tablet: Validate click is on green or red area (not black corners)
          const sampler = App.markerHandler.createImageSampler(img);
          if (sampler && sampler.valid) {
            const isValidArea = sampler.isGreenOrRedAt(pos.xPctImage, pos.yPctImage);
            if (!isValidArea) {
              console.log('[Field Box] Click blocked: not on green/red area (black corner/edge)');
              return; // Block clicks on black areas
            }
          }
          
          // ROTE ZONE - Ohne Workflow: Goalie-Check erforderlich
          if (!workflowActive && isRedZone) {
            const activeGoalie = this.getActiveGoalie();
            if (!activeGoalie) {
              alert('Please select a goalie first');
              return;
            }
            // Erlaubt wenn Goalie ausgewählt
            console.log('[Goal Map] Red zone allowed - goalie selected');
          }
          
          let color = null;

          // Im Goal-Workflow ist der Feldpunkt immer grau (neutral)
          if (isGoalWorkflow) {
            color = neutralGrey;
          }
          // ========== NEU: MANUELLER CONCEDED WORKFLOW ==========
          // Longpress in ROTER Zone (ohne aktiven Workflow) → Starte manuellen conceded Workflow
          else if (long && isRedZone && !workflowActive) {
            // Prüfe ob Goalie ausgewählt
            const activeGoalie = this.getActiveGoalie();
            if (!activeGoalie) {
              alert('Please select a goalie first');
              return;
            }
            
            color = neutralGrey;  // Grauer Punkt für Gegentor
            
            // Setze den Punkt ZUERST
            App.markerHandler.createMarkerPercent(
              pos.xPctImage,
              pos.yPctImage,
              color,
              box,
              true,
              activeGoalie.name  // Goalie als Spieler zuordnen
            );
            
            // Set data-zone attribute
            setMarkerZone(box, 'red');
            
            this.saveMarkers();
            
            // STARTE MANUELLEN CONCEDED WORKFLOW
            App.goalMapWorkflow = {
              active: true,
              eventType: 'goal',
              workflowType: 'conceded',  // Direkt als conceded setzen!
              playerName: activeGoalie.name,
              collectedPoints: [{
                type: 'field',
                xPct: pos.xPctImage,
                yPct: pos.yPctImage,
                color: color,
                boxId: box.id
              }],
              requiredPoints: 3  // Field, Goal, Time
            };
            
            // Update UI - Grün sperren
            this.updateWorkflowIndicator();
            
            console.log('[Goal Map] Started MANUAL conceded workflow');
            return;  // Wichtig: Return hier, Punkt wurde bereits gesetzt
          }
          // ========== ENDE NEU ==========
          
          // Longpress in ROTER Zone (mit Workflow aktiv) → Grauer Punkt
          else if (long && isRedZone) {
            color = neutralGrey;  // GRAU für Gegentor
          }
          // Longpress in GRÜNER Zone → Grauer Punkt
          else if (long && !isRedZone) {
            color = neutralGrey;
          }
          // Doppelklick (forceGrey) → Grauer Punkt
          else if (forceGrey) {
            color = neutralGrey;
          }
          // Normaler Klick: oben grün, unten rot
          else {
            color = pos.yPctImage > this.VERTICAL_SPLIT_THRESHOLD ? "#ff0000" : "#00ff66";
          }
          
          // SHOT WORKFLOW: Only allow green zone (top half)
          if (workflowActive && eventType === 'shot') {
            if (isRedZone) {
              console.log('[Shot Workflow] Please click in the green zone (top half)');
              return;
            }
            
            // Force green color for shot workflow
            color = "#00ff66";
            
            App.markerHandler.createMarkerPercent(
              pos.xPctImage,
              pos.yPctImage,
              color,
              box,
              true,
              pointPlayer
            );
            
            // Set data-zone attribute for shot workflow
            setMarkerZone(box, 'green');
            
            this.saveMarkers();
            
            // Set workflowType so completeGoalMapWorkflow increments the Shot counter
            App.goalMapWorkflow.workflowType = 'scored';
            
            // Complete shot workflow immediately
            App.addGoalMapPoint(
              "field",
              pos.xPctImage,
              pos.yPctImage,
              color,
              box.id
            );
            // Note: addGoalMapPoint will call completeGoalMapWorkflow which removes overlay
            
            // Auto-navigate back to Game Center after short delay
            setTimeout(() => {
              if (typeof App.showPage === 'function') {
                App.showPage('stats');
              }
            }, App.goalMap.AUTO_NAVIGATION_DELAY_MS);
            
            return;
          }
          
          // OPPONENT-SHOT WORKFLOW: Only allow red zone (bottom half)
          if (workflowActive && eventType === 'opponent-shot') {
            if (!isRedZone) {
              console.log('[Opponent-Shot Workflow] Please click in the red zone (bottom half)');
              return;
            }
            
            // Defense-in-depth: verify active goalie
            const activeGoalie = this.getActiveGoalie();
            if (!activeGoalie) {
              alert('Please select a goalie first');
              return;
            }
            
            // Red marker, stored under active goalie name
            const oppShotColor = "#ff4c4c";
            
            App.markerHandler.createMarkerPercent(
              pos.xPctImage,
              pos.yPctImage,
              oppShotColor,
              box,
              true,
              activeGoalie.name
            );
            
            // Set data-zone attribute for opponent-shot workflow
            setMarkerZone(box, 'red');
            
            this.saveMarkers();
            
            // Set workflowType before completing
            App.goalMapWorkflow.workflowType = 'opponent-shot';
            
            // Complete opponent-shot workflow
            App.addGoalMapPoint(
              "field",
              pos.xPctImage,
              pos.yPctImage,
              oppShotColor,
              box.id
            );
            
            // Auto-navigate back to Game Center after short delay
            setTimeout(() => {
              if (typeof App.showPage === 'function') {
                App.showPage('stats');
              }
            }, App.goalMap.AUTO_NAVIGATION_DELAY_MS);
            
            return;
          }
          
          // Für rote Zone ohne Workflow: Goalie-Name zuordnen
          let playerToAssign = pointPlayer;
          if (!playerToAssign && isRedZone) {
            const activeGoalie = this.getActiveGoalie();
            if (activeGoalie) {
              playerToAssign = activeGoalie.name;
            }
          }
          
          App.markerHandler.createMarkerPercent(
            pos.xPctImage,
            pos.yPctImage,
            color,
            box,
            true,
            playerToAssign
          );
          
          // Set data-zone attribute for normal field point
          setMarkerZone(box, isRedZone ? 'red' : 'green');
          
          this.saveMarkers();
          
          // Auto-Navigation entfernt - killt Workflow-Kontext
          
          if (workflowActive) {
            App.addGoalMapPoint(
              "field",
              pos.xPctImage,
              pos.yPctImage,
              color,
              box.id
            );
          }
        }
      };
      
      // Mouse Events
      img.addEventListener("mousedown", (ev) => {
        isLong = false;
        if (mouseHoldTimer) clearTimeout(mouseHoldTimer);
        mouseHoldTimer = setTimeout(() => {
          isLong = true;
          const pos = getPosFromEvent(ev);
          placeMarker(pos, true);
        }, App.markerHandler.LONG_MARK_MS);
      });
      
      img.addEventListener("mouseup", (ev) => {
        // Ignoriere synthetischen Click nach Touch (Mobile/Tablet)
        if (Date.now() - lastTouchTime < 500) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        
        // NEU: Blockiere wenn kürzlich ein Marker gesetzt wurde
        if (Date.now() - lastMarkerPlacedTime < 500) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        
        if (mouseHoldTimer) {
          clearTimeout(mouseHoldTimer);
          mouseHoldTimer = null;
        }
        const now = Date.now();
        const pos = getPosFromEvent(ev);
        
        if (now - lastMouseUp < 300) {
          lastMarkerPlacedTime = Date.now();  // NEU: Setze Flag VOR placeMarker
          placeMarker(pos, true, true);
          lastMouseUp = 0;
        } else {
          if (!isLong) {
            lastMarkerPlacedTime = Date.now();  // NEU: Setze Flag VOR placeMarker
            placeMarker(pos, false);
          }
          lastMouseUp = now;
        }
        isLong = false;
      });
      
      img.addEventListener("mouseleave", () => {
        if (mouseHoldTimer) {
          clearTimeout(mouseHoldTimer);
          mouseHoldTimer = null;
        }
        isLong = false;
      });
      
      // Touch Events
      img.addEventListener("touchstart", (ev) => {
        ev.preventDefault();      // Prevent default touch behavior (zoom, scroll)
        ev.stopPropagation();     // Stop event bubbling
        isLong = false;
        if (mouseHoldTimer) clearTimeout(mouseHoldTimer);
        mouseHoldTimer = setTimeout(() => {
          isLong = true;
          const touch = ev.touches[0];
          const pos = getPosFromEvent(touch);
          lastMarkerPlacedTime = Date.now();  // NEU: Setze Flag VOR placeMarker
          placeMarker(pos, true);
          if (navigator.vibrate) navigator.vibrate(50);
        }, App.markerHandler.LONG_MARK_MS);
      }, { passive: false });
      
      img.addEventListener("touchend", (ev) => {
        ev.preventDefault();      // Prevent default touch behavior and subsequent click events
        ev.stopPropagation();     // Stop event bubbling to prevent premature navigation
        lastTouchTime = Date.now();  // Store touch timestamp to block synthetic clicks
        
        // NEU: Blockiere wenn kürzlich ein Marker gesetzt wurde (verhindert Doppelmarker)
        if (Date.now() - lastMarkerPlacedTime < 500) {
          return;
        }
        
        if (mouseHoldTimer) {
          clearTimeout(mouseHoldTimer);
          mouseHoldTimer = null;
        }
        const now = Date.now();
        const touch = ev.changedTouches[0];
        const pos = getPosFromEvent(touch);
        
        if (now - lastTouchEnd < 300) {
          lastMarkerPlacedTime = Date.now();  // NEU: Setze Flag VOR placeMarker
          placeMarker(pos, true, true);
          lastTouchEnd = 0;
        } else {
          if (!isLong) {
            lastMarkerPlacedTime = Date.now();  // NEU: Setze Flag VOR placeMarker
            placeMarker(pos, false);
          }
          lastTouchEnd = now;
        }
        isLong = false;
      }, { passive: false });
      
      img.addEventListener("touchcancel", (ev) => {
        ev.preventDefault();      // Prevent default touch behavior
        ev.stopPropagation();     // Stop event bubbling
        if (mouseHoldTimer) {
          clearTimeout(mouseHoldTimer);
          mouseHoldTimer = null;
        }
        isLong = false;
      }, { passive: false });
    });
  },
  
  // Get currently active goalie - simple dropdown check only
  getActiveGoalie() {
    const goalieDropdown = document.getElementById('goalMapGoalieFilter');
    const value = goalieDropdown ? goalieDropdown.value : '';
    // Explicitly check for empty value or "All Goalies"
    if (value && value !== "" && value !== "All Goalies") {
      return { name: value, position: 'G' };
    }
    return null;
  },
  
  // Helper: Check if marker is in GREEN zone (top field half + green goal)
  isGreenZoneMarker(marker, box) {
    // Green goal box = always green zone
    if (box.id === 'goalGreenBox') return true;
    
    // Red goal box = never green zone
    if (box.id === 'goalRedBox') return false;
    
    // For field box: check data-zone attribute first (most reliable)
    if (marker.dataset.zone) {
      return marker.dataset.zone === 'green';
    }
    
    // FALLBACK for old markers without data-zone attribute:
    const color = marker.style.backgroundColor || '';
    
    // Green markers (#00ff66 / rgb(0, 255, 102)) = always green zone
    const isGreenColor = color.includes('0, 255, 102') || color.includes('00ff66') || color === 'rgb(0, 255, 102)';
    if (isGreenColor) {
      return true;
    }
    
    // Grey markers = check position (inverse of red zone check)
    const isGreyColor = color.includes('68, 68, 68') || color.includes('444444') || color === 'rgb(68, 68, 68)';
    if (isGreyColor) {
      const yPctImage = parseFloat(marker.dataset.yPctImage);
      if (!isNaN(yPctImage) && yPctImage > 0) {
        return yPctImage < this.VERTICAL_SPLIT_THRESHOLD;  // < 50% = green zone
      }
      
      const topStr = marker.style.top || '0';
      const top = parseFloat(topStr.replace('%', '')) || 0;
      return top < this.VERTICAL_SPLIT_THRESHOLD;
    }
    
    // Red markers = never green zone
    return false;
  },
  
  // Helper: Check if marker is in RED zone (bottom field half + red goal)
  isRedZoneMarker(marker, box) {
    // Red goal box = always red zone
    if (box.id === 'goalRedBox') return true;
    
    // Green goal box = never red zone
    if (box.id === 'goalGreenBox') return false;
    
    // For field box: check data-zone attribute first (most reliable)
    if (marker.dataset.zone) {
      return marker.dataset.zone === 'red';
    }
    
    // FALLBACK for old markers without data-zone attribute:
    // Check marker color to determine zone
    const color = marker.style.backgroundColor || '';
    
    // Red markers (#ff0000 / rgb(255, 0, 0)) = always red zone (shots)
    const isRedColor = color.includes('255, 0, 0') || color.includes('ff0000') || color === 'rgb(255, 0, 0)';
    if (isRedColor) {
      return true;
    }
    
    // Grey markers (#444444 / rgb(68, 68, 68)) = check position
    const isGreyColor = color.includes('68, 68, 68') || color.includes('444444') || color === 'rgb(68, 68, 68)';
    if (isGreyColor) {
      // Try to get image-relative Y position from data attribute
      const yPctImage = parseFloat(marker.dataset.yPctImage);
      if (!isNaN(yPctImage) && yPctImage > 0) {
        return yPctImage >= this.VERTICAL_SPLIT_THRESHOLD;  // >= 50% = red zone
      }
      
      // Last resort: use style.top (box-relative, less accurate but better than nothing)
      const topStr = marker.style.top || '0';
      const top = parseFloat(topStr.replace('%', '')) || 0;
      return top >= this.VERTICAL_SPLIT_THRESHOLD;
    }
    
    // Green markers = never red zone
    return false;
  },
  
  // Update goalie button title to show neon-pulse when active
  updateGoalieButtonTitle() {
    const goalieFilterSelect = document.getElementById("goalMapGoalieFilter");
    if (!goalieFilterSelect) return;
    
    // KRITISCH: Prüfe ob ein ECHTER Goalie ausgewählt ist (nicht "All Goalies")
    const selectedValue = goalieFilterSelect.value;
    const hasActiveGoalie = selectedValue && selectedValue !== "" && selectedValue !== "All Goalies";
    
    if (hasActiveGoalie) {
      goalieFilterSelect.classList.add("active");
    } else {
      goalieFilterSelect.classList.remove("active");
    }
  },
  
  // Show goalie name overlay - TRANSPARENT text only, no background
  showGoalieNameOverlay(goalieName) {
    // Remove old overlays
    document.querySelectorAll('.goalie-name-overlay, .goalie-name-goal').forEach(el => el.remove());
    
    if (!goalieName) return;
    
    // Extract last name
    const lastName = goalieName.split(' ').pop().toUpperCase();
    
    // Overlay in field (red half) - TRANSPARENT
    const fieldBox = document.getElementById('fieldBox');
    if (fieldBox) {
      const overlay = document.createElement('div');
      overlay.className = 'goalie-name-overlay';
      overlay.textContent = lastName;
      overlay.style.cssText = `
        position: absolute;
        bottom: 25%;
        left: 50%;
        transform: translateX(-50%);
        font-size: 3rem;
        font-weight: bold;
        color: rgba(255, 0, 0, 0.15);
        pointer-events: none;
        z-index: 5;
        text-transform: uppercase;
        letter-spacing: 0.2em;
      `;
      fieldBox.appendChild(overlay);
    }
    
    // Overlay in red goal - TRANSPARENT
    const goalRedBox = document.getElementById('goalRedBox');
    if (goalRedBox) {
      const overlay = document.createElement('div');
      overlay.className = 'goalie-name-goal';
      overlay.textContent = lastName;
      overlay.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 1.5rem;
        font-weight: bold;
        color: rgba(255, 0, 0, 0.2);
        pointer-events: none;
        z-index: 5;
        text-transform: uppercase;
      `;
      goalRedBox.appendChild(overlay);
    }
  },
  
  // Update goalie name overlay
  updateGoalieNameOverlay() {
    const goalie = this.getActiveGoalie();
    
    if (goalie && goalie.name) {
      // If goalie is set, show overlay
      this.showGoalieNameOverlay(goalie.name);
    } else {
      // If no goalie, remove overlays
      document.querySelectorAll('.goalie-name-overlay, .goalie-name-goal').forEach(el => el.remove());
    }
  },
  
  // Show player name overlay in GREEN field area during scored workflow
  showPlayerNameOverlay(playerName) {
    // Remove old player overlays
    document.querySelectorAll('.player-name-overlay').forEach(el => el.remove());
    
    if (!playerName) return;
    
    // Extract last name
    const lastName = playerName.split(' ').pop().toUpperCase();
    
    // Overlay in field (GREEN half - top) - TRANSPARENT
    const fieldBox = document.getElementById('fieldBox');
    if (fieldBox) {
      const overlay = document.createElement('div');
      overlay.className = 'player-name-overlay';
      overlay.textContent = lastName;
      overlay.style.cssText = `
        position: absolute;
        top: 25%;
        left: 50%;
        transform: translateX(-50%);
        font-size: 3rem;
        font-weight: bold;
        color: rgba(0, 255, 102, 0.15);
        pointer-events: none;
        z-index: 5;
        text-transform: uppercase;
        letter-spacing: 0.2em;
      `;
      fieldBox.appendChild(overlay);
    }
  },
  
  // Update player name overlay based on workflow state
  updatePlayerNameOverlay() {
    const workflow = App.goalMapWorkflow;
    
    if (workflow?.active && workflow?.playerName) {
      // Show player name for shot workflow OR scored goal workflow
      if (workflow.eventType === 'shot' || 
          (workflow.eventType === 'goal' && workflow.workflowType === 'scored')) {
        this.showPlayerNameOverlay(workflow.playerName);
      } else {
        // For other workflows (conceded), remove player overlays
        document.querySelectorAll('.player-name-overlay').forEach(el => el.remove());
      }
    } else {
      // If no workflow, remove overlays
      document.querySelectorAll('.player-name-overlay').forEach(el => el.remove());
    }
  },
  
  // Restore filter state from localStorage
  restoreFilterState() {
    const teamId = App.helpers.getCurrentTeamId();
    const savedFilter = AppStorage.getItem(`goalMapPlayerFilter_${teamId}`);
    if (savedFilter) {
      this.playerFilter = savedFilter;
      const filterSelect = document.getElementById("goalMapPlayerFilter");
      if (filterSelect) {
        filterSelect.value = savedFilter;
      }
      this.applyPlayerFilter();
    }
    
    const savedGoalie = AppStorage.getItem(`goalMapActiveGoalie_${teamId}`);
    if (savedGoalie) {
      const goalieFilterSelect = document.getElementById("goalMapGoalieFilter");
      if (goalieFilterSelect) {
        // Check if saved goalie still exists as option in dropdown
        const goalies = this.getPlayersFromStorage().filter(p => p.position === "G");
        const goalieNames = goalies.map(g => g.name);
        
        if (goalieNames.includes(savedGoalie)) {
          // Goalie exists, restore it
          goalieFilterSelect.value = savedGoalie;
          
          // KRITISCH: Verify the value was actually set (option must exist in DOM)
          if (goalieFilterSelect.value === savedGoalie) {
            goalieFilterSelect.classList.add("active");
            this.filterByGoalies([savedGoalie]);
          } else {
            // Value couldn't be set, clean up
            AppStorage.removeItem(`goalMapActiveGoalie_${teamId}`);
            goalieFilterSelect.value = ""; // Set to "All Goalies"
            goalieFilterSelect.classList.remove("active");
            // Remove overlays
            document.querySelectorAll('.goalie-name-overlay, .goalie-name-goal').forEach(el => el.remove());
          }
        } else {
          // Goalie doesn't exist anymore, clean up
          AppStorage.removeItem(`goalMapActiveGoalie_${teamId}`);
          goalieFilterSelect.value = ""; // Set to "All Goalies"
          goalieFilterSelect.classList.remove("active");
          // Remove overlays
          document.querySelectorAll('.goalie-name-overlay, .goalie-name-goal').forEach(el => el.remove());
        }
      }
    } else {
      // No saved goalie = no pulsing
      const goalieFilterSelect = document.getElementById("goalMapGoalieFilter");
      if (goalieFilterSelect) {
        goalieFilterSelect.classList.remove("active");
      }
    }
    
    this.updateGoalieButtonTitle();
    this.updateGoalieNameOverlay();
  },
  
  // Save all markers to localStorage
  saveMarkers() {
    const boxes = Array.from(document.querySelectorAll(App.selectors.torbildBoxes));
    const allMarkers = boxes.map(box => {
      const markers = [];
      box.querySelectorAll(".marker-dot").forEach(dot => {
        // Save image-relative coordinates (from data attributes)
        const xPctImage = parseFloat(dot.dataset.xPctImage) || 0;
        const yPctImage = parseFloat(dot.dataset.yPctImage) || 0;
        const bg = dot.style.backgroundColor || "";
        const playerName = dot.dataset.player || null;
        const zone = dot.dataset.zone || null;
        markers.push({ xPct: xPctImage, yPct: yPctImage, color: bg, player: playerName, zone: zone });
      });
      return markers;
    });
    
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`goalMapMarkers_${teamId}`, JSON.stringify(allMarkers));
  },
  
  // Restore markers from localStorage
  restoreMarkers() {
    const teamId = App.helpers.getCurrentTeamId();
    const allMarkers = App.helpers.safeJSONParse(`goalMapMarkers_${teamId}`, null);
    if (!allMarkers) return;
    const boxes = Array.from(document.querySelectorAll(App.selectors.torbildBoxes));
    
    // Clear existing markers first to avoid duplicates (idempotent operation)
    boxes.forEach(box => {
      box.querySelectorAll(".marker-dot").forEach(dot => dot.remove());
    });
    
    allMarkers.forEach((markers, boxIndex) => {
      if (boxIndex >= boxes.length) return;
      const box = boxes[boxIndex];
      
      markers.forEach(marker => {
        // Skip markers with invalid coordinates (0, 0, undefined, null, or very small values)
        if (!marker.xPct || !marker.yPct || 
            marker.xPct < 0.1 || marker.yPct < 0.1 ||
            isNaN(marker.xPct) || isNaN(marker.yPct)) {
          console.warn('[Goal Map] Skipping marker with invalid coordinates:', marker);
          return;
        }
        
        App.markerHandler.createMarkerPercent(
          marker.xPct,
          marker.yPct,
          marker.color,
          box,
          true,
          marker.player
        );
        
        // Get the marker we just created (it's the last one in the box)
        const dots = box.querySelectorAll(".marker-dot");
        const lastDot = dots[dots.length - 1];
        
        if (!lastDot) return; // Safety check
        
        // Restore zone attribute or migrate old markers
        if (marker.zone) {
          // Marker has zone attribute - restore it
          lastDot.dataset.zone = marker.zone;
        } else {
          // Migration: Calculate zone for old markers without zone attribute
          if (box.id === 'goalRedBox') {
            lastDot.dataset.zone = 'red';
          } else if (box.id === 'goalGreenBox') {
            lastDot.dataset.zone = 'green';
          } else if (box.classList.contains('field-box')) {
            // For field box: use saved yPct (image coordinates) if available
            if (marker.yPct && marker.yPct > 0) {
              lastDot.dataset.zone = marker.yPct >= this.VERTICAL_SPLIT_THRESHOLD ? 'red' : 'green';
            } else {
              // Fallback: calculate from rendered position
              const topStr = lastDot.style.top || '0';
              const top = parseFloat(topStr.replace('%', '')) || 0;
              lastDot.dataset.zone = top >= this.VERTICAL_SPLIT_THRESHOLD ? 'red' : 'green';
            }
          }
        }
      });
    });
    
    // Save markers to persist any migrated zone attributes
    this.saveMarkers();
    
    // Apply both filters independently to ensure correct marker visibility
    this.applyPlayerFilter(); // Green zone
    
    // Apply goalie filter for red zone
    const savedGoalie = AppStorage.getItem(`goalMapActiveGoalie_${teamId}`);
    if (savedGoalie) {
      const goalies = this.getPlayersFromStorage().filter(p => p.position === "G");
      const goalieNames = goalies.map(g => g.name);
      if (goalieNames.includes(savedGoalie)) {
        this.filterByGoalies([savedGoalie]);
      } else {
        // Goalie doesn't exist, show all red zone markers
        this.filterByGoalies(goalieNames);
      }
    } else {
      // No goalie filter, show all red zone markers
      const goalies = this.getPlayersFromStorage().filter(p => p.position === "G");
      const goalieNames = goalies.map(g => g.name);
      this.filterByGoalies(goalieNames);
    }
  },
  
  // Helper function to calculate display value excluding _anonymous when real players exist
  calculateDisplayValue(playerData) {
    if (!playerData) return 0;
    
    const entries = Object.entries(playerData);
    const hasRealPlayers = entries.some(([name, val]) => name !== '_anonymous' && Number(val) > 0);
    
    if (hasRealPlayers) {
      // Exclude _anonymous when real players exist
      return entries
        .filter(([name]) => name !== '_anonymous')
        .reduce((sum, [, val]) => sum + Number(val), 0);
    } else {
      // Only _anonymous exists, use that value
      return entries.reduce((sum, [, val]) => sum + Number(val), 0);
    }
  },
  
  // Time Tracking mit Spielerzuordnung
  initTimeTracking() {
    if (!this.timeTrackingBox) return;
    
    // Allow re-initialization to fix event listener attachment after page refresh/navigation
    // The flag is now used only to track if we've initialized once, but we allow re-runs
    if (this.timeTrackingInitialized) {
      console.log("[Goal Map] Re-initializing TimeTracking to refresh event listeners...");
      // Continue with re-initialization instead of returning
    } else {
      console.log("[Goal Map] First-time TimeTracking initialization...");
    }
    this.timeTrackingInitialized = true;
    
    const teamId = App.helpers.getCurrentTeamId();
    let timeData = App.helpers.safeJSONParse(`timeData_${teamId}`, {});
    let timeDataWithPlayers = App.helpers.safeJSONParse(`timeDataWithPlayers_${teamId}`, {});
    
    this.timeTrackingBox.querySelectorAll(".period").forEach((period, pIdx) => {
      const periodNum = period.dataset.period || `p${pIdx}`;
      const buttons = period.querySelectorAll(".time-btn");
      
      buttons.forEach((btn, idx) => {
        const key = `${periodNum}_${idx}`;
        
        // Determine if this is a bottom-row (red) button by checking button index
        // In each period: indices 0-3 are top row (green), indices 4-7 are bottom row (red)
        const isBottomRow = idx >= 4;
        
        // Display-Value berechnen based on button row
        let displayValue = 0;
        if (isBottomRow) {
          // Bottom row (red buttons): show goalie data
          const goalieFilterSelect = document.getElementById("goalMapGoalieFilter");
          const selectedGoalie = goalieFilterSelect ? goalieFilterSelect.value : '';
          
          if (selectedGoalie && selectedGoalie !== "") {
            // Specific goalie selected
            displayValue = (timeDataWithPlayers[key] && timeDataWithPlayers[key][selectedGoalie]) 
              ? Number(timeDataWithPlayers[key][selectedGoalie]) : 0;
          } else {
            // "All Goalies" - sum only selected goalies (getPlayersFromStorage returns only active players)
            const selectedGoalies = this.getPlayersFromStorage().filter(p => p.position === "G");
            selectedGoalies.forEach(goalie => {
              if (timeDataWithPlayers[key] && timeDataWithPlayers[key][goalie.name]) {
                displayValue += Number(timeDataWithPlayers[key][goalie.name]);
              }
            });
          }
        } else {
          // Top row (green buttons): show player data
          if (timeDataWithPlayers[key]) {
            displayValue = this.calculateDisplayValue(timeDataWithPlayers[key]);
          } else if (timeData[periodNum] && typeof timeData[periodNum][idx] !== "undefined") {
            displayValue = Number(timeData[periodNum][idx]);
          }
        }
        
        // CRITICAL: Replace button completely to remove ALL old event listeners
        // This prevents duplicate listeners when initTimeTracking() is called multiple times
        // (e.g., on page navigation). cloneNode(true) creates a fresh button without any listeners.
        // Note: These buttons are only managed by this module, so removing all listeners is safe.
        const newBtn = btn.cloneNode(true);
        newBtn.textContent = displayValue;
        
        // KRITISCH BUG 3 FIX: Handler-State komplett zurücksetzen VOR replaceChild
        delete newBtn.dataset.handlersAttached;
        newBtn._tapState = null;
        newBtn._clickState = null;
        
        btn.parentNode.replaceChild(newBtn, btn);
        
        // JETZT State initialisieren
        newBtn._tapState = {
          lastTapTime: 0,
          tapTimeout: null,
          lastClickTime: 0,
          clickTimeout: null
        };
        const state = newBtn._tapState;
        
        // Handler attached setzen NACH der Initialisierung
        newBtn.dataset.handlersAttached = 'true';
        
        const DOUBLE_CLICK_DELAY = 300;
        const DOUBLE_TAP_DELAY = 300;
        
        // Helper to check if button action is allowed based on workflow constraints
        const isButtonActionAllowed = () => {
          // Determine button row
          const isTopRow = newBtn.closest('.period-buttons')?.classList.contains('top-row');
          const isBottomRow = newBtn.closest('.period-buttons')?.classList.contains('bottom-row');
          
          // Shot-Workflow: KEINE Timebox-Buttons erlaubt
          if (App.goalMapWorkflow?.active && App.goalMapWorkflow?.eventType === 'shot') {
            console.log('[Shot Workflow] Timebox buttons not allowed during shot workflow');
            return false;
          }
          
          // Goal-Workflow: Rote Buttons sperren wenn Typ noch nicht bestimmt oder scored
          if (App.goalMapWorkflow?.active && App.goalMapWorkflow?.eventType === 'goal') {
            const currentStep = App.goalMapWorkflow.collectedPoints?.length || 0;
            const workflowType = App.goalMapWorkflow?.workflowType;
            
            // Nur im Schritt 2 (nach Feld + Tor) sind Timeboxen erlaubt
            if (currentStep !== App.goalMap.WORKFLOW_STEP_TIME) {
              console.log('[Goal Workflow] Timebox only after field and goal');
              return false;
            }
            
            // Workflow-Typ noch nicht bestimmt ODER scored → Rote Buttons sperren
            if (!workflowType || workflowType === 'scored') {
              if (isBottomRow) {
                console.log('[Goal Workflow] RED buttons BLOCKED - workflow type not determined or scored');
                return false;
              }
            }
            
            // Conceded workflow → Grüne Buttons sperren
            if (workflowType === 'conceded') {
              if (isTopRow) {
                console.log('[Goal Workflow] GREEN buttons blocked during conceded workflow');
                return false;
              }
            }
          }
          
          // ROTE BUTTONS ohne Workflow: Goalie muss ausgewählt sein
          if (!App.goalMapWorkflow?.active && isBottomRow) {
            const activeGoalie = App.goalMap.getActiveGoalie();
            if (!activeGoalie) {
              alert('Please select a goalie first');
              return false;
            }
          }
          
          return true;
        };
        
        // Helper function to check if workflow is complete and navigate
        const checkWorkflowCompletion = () => {
          if (App.goalMapWorkflow?.active && App.goalMapWorkflow?.eventType === 'goal') {
            const isComplete = App.goalMapWorkflow?.collectedPoints?.length >= App.goalMapWorkflow?.requiredPoints;
            if (isComplete) {
              setTimeout(() => {
                if (typeof App.showPage === 'function') {
                  App.showPage('stats');
                }
              }, App.goalMap.AUTO_NAVIGATION_DELAY_MS);
            }
          }
        };
        
        const updateValue = (delta) => {
          // CRITICAL: Read teamId and data dynamically at click time to ensure data persistence across team switches.
          // This prevents closure capture of stale team data when switching teams.
          const currentTeamId = App.helpers.getCurrentTeamId();
          let currentTimeDataWithPlayers = App.helpers.safeJSONParse(`timeDataWithPlayers_${currentTeamId}`, {});
          let currentTimeData = App.helpers.safeJSONParse(`timeData_${currentTeamId}`, {});
          
          // Determine if this is a bottom-row (red) button
          const isBottomRow = newBtn.closest('.period-buttons')?.classList.contains('bottom-row');
          
          // KRITISCH FIX BUG 1: Workflow-Spieler ZUERST speichern, BEVOR der Workflow enden könnte
          // Der Workflow könnte durch addGoalMapPoint() beendet werden
          const workflowPlayerName = App.goalMapWorkflow?.active ? App.goalMapWorkflow.playerName : null;
          const wasWorkflowActive = App.goalMapWorkflow?.active;
          
          let playerName;
          if (wasWorkflowActive && workflowPlayerName) {
            // Im Workflow: NUR den Workflow-Spieler verwenden, NIEMALS den Filter!
            playerName = workflowPlayerName;
            console.log('[Timebox] Using WORKFLOW player ONLY:', playerName);
          } else if (isBottomRow) {
            // Außerhalb Workflow, rote Buttons: Goalie
            const activeGoalie = this.getActiveGoalie();
            playerName = activeGoalie ? activeGoalie.name : '_anonymous';
          } else {
            // Außerhalb Workflow, grüne Buttons: Filter oder anonymous
            playerName = this.playerFilter || '_anonymous';
          }
          
          if (!currentTimeDataWithPlayers[key]) currentTimeDataWithPlayers[key] = {};
          
          // Im Workflow: Spieler startet IMMER bei 0
          if (typeof currentTimeDataWithPlayers[key][playerName] === 'undefined') {
            if (wasWorkflowActive) {
              // Im Workflow: Neuer Spieler startet IMMER bei 0
              currentTimeDataWithPlayers[key][playerName] = 0;
            } else {
              // Manueller Modus: Vom Button-Text übernehmen
              const currentDisplayValue = parseInt(newBtn.textContent, 10) || 0;
              currentTimeDataWithPlayers[key][playerName] = currentDisplayValue;
            }
          }
          
          const current = Number(currentTimeDataWithPlayers[key][playerName]);
          const newVal = Math.max(0, current + delta);
          currentTimeDataWithPlayers[key][playerName] = newVal;
          
          // Cleanup: Remove entries with value 0
          Object.keys(currentTimeDataWithPlayers[key]).forEach(name => {
            if (currentTimeDataWithPlayers[key][name] === 0) {
              delete currentTimeDataWithPlayers[key][name];
            }
          });
          
          // If the key object is now empty, remove it entirely
          if (Object.keys(currentTimeDataWithPlayers[key]).length === 0) {
            delete currentTimeDataWithPlayers[key];
          }
          
          AppStorage.setItem(`timeDataWithPlayers_${currentTeamId}`, JSON.stringify(currentTimeDataWithPlayers));
          
          // Calculate display value based on button row and filters
          let displayVal = 0;
          
          // KRITISCH BUG 1 FIX: Im Workflow IMMER den Workflow-Spieler-Wert anzeigen
          if (wasWorkflowActive && workflowPlayerName) {
            // Im Workflow: Zeige den Wert für den Workflow-Spieler
            displayVal = newVal;
          } else if (isBottomRow) {
            // Außerhalb Workflow, Bottom row: show goalie filter values
            const goalieFilterSelect = document.getElementById("goalMapGoalieFilter");
            const selectedGoalie = goalieFilterSelect ? goalieFilterSelect.value : '';
            
            if (selectedGoalie && selectedGoalie !== "") {
              // Specific goalie selected
              displayVal = (currentTimeDataWithPlayers[key] && currentTimeDataWithPlayers[key][selectedGoalie]) || 0;
            } else {
              // "All Goalies" - sum all goalies
              const allGoalies = this.getPlayersFromStorage().filter(p => p.position === "G");
              allGoalies.forEach(goalie => {
                displayVal += (currentTimeDataWithPlayers[key] && Number(currentTimeDataWithPlayers[key][goalie.name])) || 0;
              });
            }
          } else {
            // Außerhalb Workflow, Top row: show player filter values
            if (this.playerFilter) {
              displayVal = (currentTimeDataWithPlayers[key] && currentTimeDataWithPlayers[key][this.playerFilter]) || 0;
            } else {
              displayVal = App.goalMap.calculateDisplayValue(currentTimeDataWithPlayers[key]);
            }
          }
          newBtn.textContent = displayVal;
          
          if (!currentTimeData[periodNum]) currentTimeData[periodNum] = {};
          currentTimeData[periodNum][idx] = displayVal;
          AppStorage.setItem(`timeData_${currentTeamId}`, JSON.stringify(currentTimeData));
          
          // Symmetry: outside active workflow, bottom row (red/conceded-goal buttons) -1 means user removed one conceded-goal entry.
          // Keep opponent-shots total aligned by decrementing it as well.
          if (isBottomRow && !wasWorkflowActive && delta < 0) {
            const currentOpp = Number(AppStorage.getItem(`opponentShots_${currentTeamId}`) || 0);
            const newOpp = Math.max(0, currentOpp - 1);
            AppStorage.setItem(`opponentShots_${currentTeamId}`, String(newOpp));
            if (App.statsTable && typeof App.statsTable.updateTotals === 'function') {
              App.statsTable.updateTotals();
            }
          }
          
          if (delta > 0 && wasWorkflowActive) {
            const btnRect = newBtn.getBoundingClientRect();
            const boxRect = this.timeTrackingBox.getBoundingClientRect();
            const xPct = ((btnRect.left + btnRect.width / 2 - boxRect.left) / boxRect.width) * 100;
            const yPct = ((btnRect.top + btnRect.height / 2 - boxRect.top) / boxRect.height) * 100;
            
            App.addGoalMapPoint('time', xPct, yPct, '#444444', 'timeTrackingBox');
            
            // CRITICAL BUG 1 FIX: Cancel all pending timers in stats-table
            // These timers would otherwise trigger changeValue(+1) and start a new workflow
            if (App.statsTable && App.statsTable.container) {
              App.statsTable.container.querySelectorAll('td[data-player][data-cat]').forEach(td => {
                if (td._tapState) {
                  if (td._tapState.tapTimeout) {
                    clearTimeout(td._tapState.tapTimeout);
                    td._tapState.tapTimeout = null;
                  }
                  td._tapState.lastTapTime = 0;
                }
              });
            }
            
            // Auto-Navigation nach komplettem Workflow
            setTimeout(() => {
              if (typeof App.showPage === 'function') {
                App.showPage('stats');
              }
            }, App.goalMap.AUTO_NAVIGATION_DELAY_MS);
          }
        };
        
        newBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          const now = Date.now();
          
          // Ignoriere wenn Touch gerade aktiv war
          if (state.lastTapTime > 0 && now - state.lastTapTime < 500) return;
          
          if (now - state.lastClickTime < 50) return;
          state.lastClickTime = now;
          
          // Check if button action is allowed based on workflow constraints
          if (!isButtonActionAllowed()) {
            return;
          }
          
          // In Goal-Workflow: Immediate action without double-click detection
          if (App.goalMapWorkflow?.active && App.goalMapWorkflow?.eventType === 'goal') {
            // Record time button click
            updateValue(1);
            
            // KRITISCH: Prüfe ob Workflow komplett ist und navigiere zurück
            checkWorkflowCompletion();
            
            return; // Workflow-Klick verarbeitet, keine weitere Logik
          }
          
          // Normale Klick-Logik (außerhalb Workflow) - NEUE saubere Doppelklick-Logik
          // Wenn bereits ein Timeout läuft, ist dies ein Doppelklick
          if (state.clickTimeout) {
            clearTimeout(state.clickTimeout);
            state.clickTimeout = null;
            updateValue(-1);  // Doppelklick: -1
            return;
          }
          
          // Starte Timeout für Single-Click
          state.clickTimeout = setTimeout(() => {
            updateValue(+1);  // Single-Click: +1
            state.clickTimeout = null;
          }, DOUBLE_CLICK_DELAY);
        });
        
        // Touch handling for mobile: Single tap (+1) and double tap (-1)
        newBtn.addEventListener("touchend", (e) => {
          e.preventDefault(); // Prevent default to avoid triggering click event as well
          e.stopPropagation();
          
          const now = Date.now();
          
          // Check if button action is allowed based on workflow constraints
          if (!isButtonActionAllowed()) {
            return;
          }
          
          // In Goal-Workflow: Single tap only (immediate action)
          if (App.goalMapWorkflow?.active && App.goalMapWorkflow?.eventType === 'goal') {
            updateValue(1);
            
            // KRITISCH: Prüfe ob Workflow komplett ist und navigiere zurück
            checkWorkflowCompletion();
            
            return;
          }
          
          // Outside workflow: Support double-tap for -1
          // If this is within DOUBLE_TAP_DELAY of last touch, it's a double-tap
          if (state.lastTapTime > 0 && (now - state.lastTapTime < DOUBLE_TAP_DELAY)) {
            clearTimeout(state.tapTimeout);
            state.tapTimeout = null;
            state.lastTapTime = 0;
            updateValue(-1);  // Double-tap: -1
            return;
          }
          
          // Single tap: Wait for potential double-tap
          state.lastTapTime = now;
          state.tapTimeout = setTimeout(() => {
            updateValue(+1);  // Single-tap: +1
            state.tapTimeout = null;
            state.lastTapTime = 0;
          }, DOUBLE_TAP_DELAY);
        }, { passive: false });
      });
    });
    
    if (this.playerFilter) {
      this.applyTimeTrackingFilter();
    }
  },
  
  // Player Filter Dropdown
  initPlayerFilter() {
    const filterSelect = document.getElementById("goalMapPlayerFilter");
    if (!filterSelect) return;
    
    filterSelect.innerHTML = '<option value="">All Players</option>';
    // Nur Spieler ohne Goalie-Position (G) in die Liste aufnehmen
    this.getPlayersFromStorage()
      .filter(player => player.position !== "G" && !player.isGoalie)
      .forEach(player => {
        const option = document.createElement("option");
        option.value = player.name;
        option.textContent = player.name;
        filterSelect.appendChild(option);
      });
    
    filterSelect.addEventListener("change", () => {
      this.playerFilter = filterSelect.value || null;
      this.applyPlayerFilter();
      
      // NEU: Pulsieren aktivieren/deaktivieren
      if (this.playerFilter) {
        filterSelect.classList.add("active");
      } else {
        filterSelect.classList.remove("active");
      }
    });
    
    const teamId = App.helpers.getCurrentTeamId();
    const savedFilter = AppStorage.getItem(`goalMapPlayerFilter_${teamId}`);
    if (savedFilter) {
      filterSelect.value = savedFilter;
      this.playerFilter = savedFilter;
      this.applyPlayerFilter();
      filterSelect.classList.add("active");  // NEU: Pulsieren beim Laden
    }
    
    // Goalie Filter Dropdown - populate with currently selected goalies
    const goalieFilterSelect = document.getElementById("goalMapGoalieFilter");
    if (goalieFilterSelect) {
      goalieFilterSelect.innerHTML = '<option value="">All Goalies</option>';
      const goalies = this.getPlayersFromStorage().filter(p => p.position === "G");
      goalies.forEach(goalie => {
        const option = document.createElement("option");
        option.value = goalie.name;
        option.textContent = goalie.name;
        goalieFilterSelect.appendChild(option);
      });
      
      goalieFilterSelect.addEventListener("change", () => {
        const selectedGoalie = goalieFilterSelect.value;
        
        // Save to localStorage or remove if "All Goalies"
        if (selectedGoalie && selectedGoalie !== "") {
          AppStorage.setItem(`goalMapActiveGoalie_${teamId}`, selectedGoalie);
          goalieFilterSelect.classList.add("active"); // Pulsieren AN
        } else {
          // "All Goalies" selected - remove localStorage and overlays
          AppStorage.removeItem(`goalMapActiveGoalie_${teamId}`);
          goalieFilterSelect.classList.remove("active"); // Pulsieren AUS
          // Remove any existing goalie name overlays
          document.querySelectorAll('.goalie-name-overlay, .goalie-name-goal').forEach(el => el.remove());
        }
        
        // Update UI to show neon-pulse and overlay
        this.updateGoalieButtonTitle();
        this.updateGoalieNameOverlay();
        
        // Also filter display
        if (selectedGoalie) {
          // Filter by single goalie
          this.filterByGoalies([selectedGoalie]);
        } else {
          // Show all goalies
          const goalieNames = goalies.map(g => g.name);
          this.filterByGoalies(goalieNames);
        }
      });
      
      // KRITISCH: Restore saved goalie value after populating dropdown
      const savedGoalie = AppStorage.getItem(`goalMapActiveGoalie_${teamId}`);
      if (savedGoalie) {
        // Check if saved goalie still exists as option in dropdown
        const goalieNames = goalies.map(g => g.name);
        
        if (goalieNames.includes(savedGoalie)) {
          // Goalie exists, restore it
          goalieFilterSelect.value = savedGoalie;
          
          // Verify the value was actually set (option must exist in DOM)
          if (goalieFilterSelect.value === savedGoalie) {
            goalieFilterSelect.classList.add("active");
            this.updateGoalieButtonTitle();
            this.updateGoalieNameOverlay();
            this.filterByGoalies([savedGoalie]);
          } else {
            // Value couldn't be set, clean up
            AppStorage.removeItem(`goalMapActiveGoalie_${teamId}`);
            goalieFilterSelect.classList.remove("active");
          }
        } else {
          // Goalie doesn't exist anymore, clean up
          AppStorage.removeItem(`goalMapActiveGoalie_${teamId}`);
          goalieFilterSelect.value = ""; // Set to "All Goalies"
          goalieFilterSelect.classList.remove("active");
        }
      } else {
        // No saved goalie = no pulsing
        goalieFilterSelect.classList.remove("active");
      }
    }
  },
  
  filterByGoalies(goalieNames) {
    // Player and goalie filters operate independently on different zones
    
    // Detect if "All Goalies" is selected
    const selectedGoalies = this.getPlayersFromStorage().filter(p => p.position === "G");
    const selectedGoalieNames = selectedGoalies.map(g => g.name);
    const isAllGoaliesFilter = (goalieNames.length === selectedGoalieNames.length && 
                                 goalieNames.every(name => selectedGoalieNames.includes(name)));
    
    // Use selected goalie names for "All Goalies" filter (computed once for performance)
    const goalieNamesToShow = isAllGoaliesFilter ? selectedGoalieNames : null;
    
    const boxes = document.querySelectorAll(App.selectors.torbildBoxes);
    boxes.forEach(box => {
      const markers = box.querySelectorAll(".marker-dot");
      markers.forEach(marker => {
        // Only filter RED ZONE markers
        const isRedMarker = this.isRedZoneMarker(marker, box);
        
        if (isRedMarker) {
          const playerName = marker.dataset.player;
          
          if (isAllGoaliesFilter) {
            // Goal Map: Only show markers from currently selected goalies
            if (playerName && goalieNamesToShow.includes(playerName)) {
              marker.style.display = '';
            } else {
              marker.style.display = 'none';
            }
          } else if (playerName && goalieNames.includes(playerName)) {
            // Marker belongs to selected goalie - show
            marker.style.display = '';
          } else {
            // Marker doesn't belong to selected goalie - hide
            marker.style.display = 'none';
          }
        }
        // Green zone markers are not touched by this function
      });
    });
    
    // Update time tracking to show only goalie times
    this.applyGoalieTimeTrackingFilter(goalieNames);
  },
  
  applyGoalieTimeTrackingFilter(goalieNames) {
    if (!this.timeTrackingBox) return;
    
    const teamId = App.helpers.getCurrentTeamId();
    const timeDataWithPlayers = App.helpers.safeJSONParse(`timeDataWithPlayers_${teamId}`, {});
    
    // Filter to only currently selected goalies (getPlayersFromStorage returns only active players)
    const selectedGoalies = this.getPlayersFromStorage().filter(p => p.position === "G");
    const selectedGoalieNames = selectedGoalies.map(g => g.name);
    const filteredGoalieNames = goalieNames.filter(name => selectedGoalieNames.includes(name));
    
    this.timeTrackingBox.querySelectorAll(".period").forEach((period, pIdx) => {
      const periodNum = period.dataset.period || `p${pIdx}`;
      const buttons = period.querySelectorAll(".time-btn");
      
      buttons.forEach((btn, idx) => {
        // Only update bottom-row buttons (red zone, indices 4-7); skip top row
        if (idx < 4) return; // Skip indices 0-3 (top row)
        
        const key = `${periodNum}_${idx}`;
        const playerData = timeDataWithPlayers[key] || {};
        
        // Sum up time for filtered goalies only
        let displayVal = 0;
        filteredGoalieNames.forEach(goalieName => {
          displayVal += Number(playerData[goalieName]) || 0;
        });
        
        btn.textContent = displayVal;
      });
    });
  },
  
  applyPlayerFilter() {
    const teamId = App.helpers.getCurrentTeamId();
    if (this.playerFilter) {
      AppStorage.setItem(`goalMapPlayerFilter_${teamId}`, this.playerFilter);
    } else {
      AppStorage.removeItem(`goalMapPlayerFilter_${teamId}`);
    }
    
    // Get list of active player names once (optimization using Set for O(1) lookup)
    const activePlayerNames = this.playerFilter ? null : new Set(this.getPlayersFromStorage().map(p => p.name));
    
    const boxes = document.querySelectorAll(App.selectors.torbildBoxes);
    boxes.forEach(box => {
      const markers = box.querySelectorAll(".marker-dot");
      markers.forEach(marker => {
        // Only filter GREEN ZONE markers
        const isGreenMarker = this.isGreenZoneMarker(marker, box);
        
        if (isGreenMarker) {
          if (this.playerFilter) {
            marker.style.display = (marker.dataset.player === this.playerFilter) ? '' : 'none';
          } else {
            const markerPlayer = marker.dataset.player;
            
            // Hide markers from deleted/replaced players
            if (markerPlayer && !activePlayerNames.has(markerPlayer)) {
              marker.style.display = 'none';
            } else {
              // Show markers from active players or anonymous markers
              marker.style.display = '';
            }
          }
        }
        // Red zone markers are not touched by this function
      });
    });
    
    this.applyTimeTrackingFilter();
  },
  
  applyTimeTrackingFilter() {
    if (!this.timeTrackingBox) return;
    
    const teamId = App.helpers.getCurrentTeamId();
    const timeDataWithPlayers = App.helpers.safeJSONParse(`timeDataWithPlayers_${teamId}`, {});
    
    this.timeTrackingBox.querySelectorAll(".period").forEach((period, pIdx) => {
      const periodNum = period.dataset.period || `p${pIdx}`;
      const buttons = period.querySelectorAll(".time-btn");
      
      buttons.forEach((btn, idx) => {
        // Only update top-row buttons (green zone, indices 0-3); skip bottom row
        if (idx >= 4) return; // Skip indices 4-7 (bottom row)
        
        const key = `${periodNum}_${idx}`;
        const playerData = timeDataWithPlayers[key] || {};
        
        let displayVal = 0;
        if (this.playerFilter) {
          displayVal = Number(playerData[this.playerFilter]) || 0;
        } else {
          displayVal = this.calculateDisplayValue(playerData);
        }
        
        btn.textContent = displayVal;
      });
    });
  },
  
  updateWorkflowIndicator() {
    const indicator = document.getElementById("workflowStatusIndicator");
    const textEl = document.getElementById("workflowStatusText");
    if (!indicator || !textEl) return;
    
    // Body-Klassen für CSS-Styling
    document.body.classList.remove('workflow-goal', 'workflow-shot', 'workflow-scored', 'workflow-conceded');
    
    if (App.goalMapWorkflow?.active) {
      // NEUE Klasse: workflow-goal für generelle Goal-Workflow-Sperrung
      if (App.goalMapWorkflow.eventType === 'goal') {
        document.body.classList.add('workflow-goal');
      }
      if (App.goalMapWorkflow.eventType === 'shot') {
        document.body.classList.add('workflow-shot');
      }
      
      // Spezifische Klasse wenn Typ bestimmt ist
      if (App.goalMapWorkflow.workflowType) {
        document.body.classList.add('workflow-' + App.goalMapWorkflow.workflowType);
      }
    }
    
    if (App.goalMapWorkflow?.active) {
      const collected = App.goalMapWorkflow.collectedPoints.length;
      const required = App.goalMapWorkflow.requiredPoints;
      const eventType = App.goalMapWorkflow.eventType;
      const playerName = App.goalMapWorkflow.playerName;
      const workflowType = App.goalMapWorkflow.workflowType;
      
      let workflowDesc = '';
      if (workflowType === 'scored') {
        workflowDesc = '🟢 SCORED';
      } else if (workflowType === 'conceded') {
        workflowDesc = '🔴 CONCEDED';
      } else if (workflowType === 'opponent-shot') {
        workflowDesc = '🔴 OPP SHOT';
      }
      
      indicator.style.display = 'block';
      
      // Build text safely using textContent to prevent XSS
      textEl.textContent = '';
      
      const strong = document.createElement('strong');
      const eventTypeText = eventType ? eventType.toUpperCase() : '';
      const workflowText = workflowDesc ? ' - ' + workflowDesc : '';
      const playerText = playerName ? ' - ' + playerName : '';
      strong.textContent = eventTypeText + workflowText + playerText;
      
      textEl.appendChild(strong);
      textEl.appendChild(document.createTextNode(' • '));
      textEl.appendChild(document.createTextNode(`Punkte: ${collected}/${required}`));
      
      if (eventType === 'goal') {
        textEl.appendChild(document.createTextNode(' • 1. Field, 2. Goal, 3. Time'));
      } else {
        textEl.appendChild(document.createTextNode(' • 1. Click field'));
      }
    } else {
      indicator.style.display = 'none';
      textEl.textContent = "";
    }
    
    // Update player name overlay for scored workflow
    this.updatePlayerNameOverlay();
  },
  
  exportGoalMap() {
    if (!confirm("In Season Map exportieren?")) return;
    
    const teamId = App.helpers.getCurrentTeamId();
    const boxes = Array.from(document.querySelectorAll(App.selectors.torbildBoxes));
    const allMarkers = boxes.map(box => {
      const markers = [];
      box.querySelectorAll(".marker-dot").forEach(dot => {
        const left = dot.style.left || "";
        const top = dot.style.top || "";
        const bg = dot.style.backgroundColor || "";
        const xPct = parseFloat(left.replace("%", "")) || 0;
        const yPct = parseFloat(top.replace("%", "")) || 0;
        const playerName = dot.dataset.player || null;
        markers.push({ xPct, yPct, color: bg, player: playerName });
      });
      return markers;
    });
    
    AppStorage.setItem(`seasonMapMarkers_${teamId}`, JSON.stringify(allMarkers));
    
    // Player-bezogene Zeitdaten übernehmen
    const timeDataWithPlayers = App.helpers.safeJSONParse(`timeDataWithPlayers_${teamId}`, {});
    console.log('[Goal Map Export] timeDataWithPlayers:', timeDataWithPlayers);
    AppStorage.setItem(`seasonMapTimeDataWithPlayers_${teamId}`, JSON.stringify(timeDataWithPlayers));
    
    // Flache Zeitdaten für Momentum-Graph aus timeDataWithPlayers berechnen
    const momentumData = {};
    const periods = ['p1', 'p2', 'p3'];
    
    periods.forEach(periodNum => {
      const periodValues = [];
      for (let btnIdx = 0; btnIdx < 8; btnIdx++) {
        const key = `${periodNum}_${btnIdx}`;
        const playerData = timeDataWithPlayers[key] || {};
        const total = this.calculateDisplayValue(playerData);
        periodValues.push(total);
      }
      momentumData[periodNum] = periodValues;
    });
    
    console.log('[Goal Map Export] momentumData:', momentumData);
    AppStorage.setItem(`seasonMapTimeData_${teamId}`, JSON.stringify(momentumData));
    
    // Alte timeData ebenfalls aktualisieren
    const timeData = this.readTimeTrackingFromBox();
    AppStorage.setItem(`timeData_${teamId}`, JSON.stringify(timeData));
    
    const keep = confirm("Game exported to Season Map. Keep data in Goal Map? (OK = Yes)");
    if (!keep) {
      document.querySelectorAll("#torbildPage .marker-dot").forEach(d => d.remove());
      document.querySelectorAll("#torbildPage .time-btn").forEach(btn => btn.textContent = "0");
      AppStorage.removeItem(`timeData_${teamId}`);
      AppStorage.removeItem(`timeDataWithPlayers_${teamId}`);
      AppStorage.removeItem(`goalMapMarkers_${teamId}`);
      AppStorage.removeItem(`opponentShots_${teamId}`);
      if (App.statsTable && typeof App.statsTable.updateTotals === 'function') {
        App.statsTable.updateTotals();
      }
    }
    
    App.showPage("seasonMap");
    
    // Render Season Map
    if (App.seasonMap && typeof App.seasonMap.render === 'function') {
      App.seasonMap.render();
    }
    
    // Momentum-Grafik aktualisieren
    if (typeof window.renderSeasonMomentumGraphic === 'function') {
      setTimeout(() => {
        window.renderSeasonMomentumGraphic();
      }, 100);
    }
  },
  
  readTimeTrackingFromBox() {
    const result = {};
    if (!this.timeTrackingBox) return result;
    
    this.timeTrackingBox.querySelectorAll(".period").forEach((period, pIdx) => {
      const key = period.dataset.period || (`p${pIdx}`);
      result[key] = [];
      period.querySelectorAll(".time-btn").forEach(btn => {
        result[key].push(Number(btn.textContent) || 0);
      });
    });
    return result;
  },
  
  reset() {
    if (!confirm("⚠️ Goal Map zurücksetzen (Marker + Timeboxen)?")) return;
    
    document.querySelectorAll("#torbildPage .marker-dot").forEach(d => d.remove());
    document.querySelectorAll("#torbildPage .time-btn").forEach(b => b.textContent = "0");
    
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.removeItem(`timeData_${teamId}`);
    AppStorage.removeItem(`timeDataWithPlayers_${teamId}`);
    AppStorage.removeItem(`goalMapMarkers_${teamId}`);
    AppStorage.removeItem(`opponentShots_${teamId}`);
    if (App.statsTable && typeof App.statsTable.updateTotals === 'function') {
      App.statsTable.updateTotals();
    }
    
    // Reset initialization flag to allow re-initialization
    this.timeTrackingInitialized = false;
    
    // KRITISCH: Buttons neu initialisieren damit Closures neue leere Daten haben!
    this.initTimeTracking();
    
    alert("Goal Map reset.");
  }
};
