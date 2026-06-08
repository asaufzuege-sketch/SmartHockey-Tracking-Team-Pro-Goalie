
// season_map_momentum.js - Updated mit grauer Punkte und langer Klick für Tor
(function () {
  const SVG_W = 900;
  const SVG_H = 220;
  const MARGIN = { left: 32, right: 32, top: 20, bottom: 36 };
  const TOP_GUIDE_Y = 28;
  const MIDLINE_Y = 120;
  const BOTTOM_GUIDE_Y = 196;
  const MAX_DISPLAY = 6;
  
  const BUCKET_MINUTES = [0,5,10,15, 20,25,30,35, 40,45,50,60];
  
  // Period and button configuration
  const MAX_PERIODS = 3;
  const BUTTONS_PER_PERIOD = 4;
  
  // Zusätzliche Variablen für Goal Map
  let goalMarkers = [];
  let longPressTimer = null;
  let longPressTarget = null;
  
  function getSeasonMapRoot() { return document.getElementById('seasonMapPage') || document.body; }
  
  function getTimeBoxElement() {
    const candidates = ['seasonMapTimeTrackingBox','seasonTimeTrackingBox','timeTrackingBox'];
    for (const id of candidates) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }
  
  function hideTimeBox() { const tb = getTimeBoxElement(); if (tb) tb.style.display = 'none'; }
  
  // Goal Markers Management
  function saveGoalMarkers() {
    const teamId = App.helpers.getCurrentTeamId();
    AppStorage.setItem(`seasonMapMomentumMarkers_${teamId}`, JSON.stringify(goalMarkers));
  }
  
  function loadGoalMarkers() {
    try {
      const teamId = App.helpers.getCurrentTeamId();
      const saved = AppStorage.getItem(`seasonMapMomentumMarkers_${teamId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        
        // Only load if it's our internal format (flat array with fieldId)
        // Goal Map export format (array of arrays) is loaded by season-map.js, not here
        if (Array.isArray(parsed) && parsed.length > 0) {
          // If first element is an array, it's not our format
          if (Array.isArray(parsed[0])) {
            goalMarkers = [];
            return;
          }
          
          const firstMarker = parsed[0];
          
          // If marker has old format (x, y), clear it - can't convert reliably
          if ((firstMarker.x !== undefined || firstMarker.y !== undefined) && 
              firstMarker.xPct === undefined && firstMarker.yPct === undefined) {
            console.warn('[Season Map Momentum] Old marker format detected. Clearing incompatible markers.');
            goalMarkers = [];
            return;
          }
        }
        
        goalMarkers = parsed;
      }
    } catch (e) {
      console.warn('Failed to load goal markers:', e);
      goalMarkers = [];
    }
  }
  
  function addGoalMarker(xPct, yPct, fieldId = 'field') {
    const marker = { xPct, yPct, fieldId, id: Date.now() };
    goalMarkers.push(marker);
    saveGoalMarkers();
    renderGoalMarkers();
  }
  
  function removeGoalMarker(markerId) {
    goalMarkers = goalMarkers.filter(m => m.id !== markerId);
    saveGoalMarkers();
    renderGoalMarkers();
  }
  
  function renderGoalMarkers() {
    // Entferne alte Marker
    document.querySelectorAll('.goal-marker').forEach(marker => marker.remove());
    
    // Render neue Marker
    goalMarkers.forEach(marker => {
      const fieldElement = document.getElementById(marker.fieldId);
      if (!fieldElement) return;
      
      const dot = document.createElement('div');
      dot.className = 'goal-marker marker-dot';
      dot.style.position = 'absolute';
      dot.style.left = `${marker.xPct}%`;
      dot.style.top = `${marker.yPct}%`;
      dot.style.width = '14px';
      dot.style.height = '14px';
      dot.style.borderRadius = '50%';
      dot.style.backgroundColor = '#808080'; // GRAU statt weiß
      dot.style.border = '2px solid rgba(255, 255, 255, 0.3)';
      dot.style.transform = 'translate(-50%, -50%)';
      dot.style.cursor = 'pointer';
      dot.style.zIndex = '10';
      dot.dataset.markerId = marker.id;
      
      // Doppelklick zum Entfernen
      dot.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        removeGoalMarker(marker.id);
      });
      
      fieldElement.appendChild(dot);
    });
  }
  
  function setupFieldClickHandlers() {
    const fields = document.querySelectorAll('.field-box, #field');
    
    // Tolerance for edge click detection (in pixels)
    const CLICK_TOLERANCE = 2;
    
    fields.forEach(field => {
      let clickCount = 0;
      let clickTimer = null;
      
      // Helper function to get image-relative position
      const getImageRelativePos = (clientX, clientY, img) => {
        if (!img) return null;
        
        // Use computeRenderedImageRect if available (from marker-handler.js)
        if (App.markerHandler && typeof App.markerHandler.computeRenderedImageRect === 'function') {
          const rendered = App.markerHandler.computeRenderedImageRect(img);
          if (rendered && rendered.width > 0 && rendered.height > 0) {
            // Check if click is inside rendered image
            const insideImage = (
              clientX >= rendered.x - CLICK_TOLERANCE &&
              clientX <= rendered.x + rendered.width + CLICK_TOLERANCE && 
              clientY >= rendered.y - CLICK_TOLERANCE &&
              clientY <= rendered.y + rendered.height + CLICK_TOLERANCE
            );
            
            if (insideImage) {
              const xPct = Math.max(0, Math.min(100, ((clientX - rendered.x) / rendered.width) * 100));
              const yPct = Math.max(0, Math.min(100, ((clientY - rendered.y) / rendered.height) * 100));
              return { xPct, yPct };
            }
          }
        }
        
        return null; // Block clicks if image rect cannot be computed or click is outside
      };
      
      field.addEventListener('mousedown', (e) => {
        // Langer Klick für Tor (graue Punkte)
        longPressTarget = e.target;
        longPressTimer = setTimeout(() => {
          if (longPressTarget === e.target) {
            const img = field.querySelector('img');
            const pos = getImageRelativePos(e.clientX, e.clientY, img);
            
            if (pos) {
              addGoalMarker(pos.xPct, pos.yPct, field.id || 'field');
              
              // Vibrationseffekt falls verfügbar
              if (navigator.vibrate) {
                navigator.vibrate(100);
              }
            }
          }
          longPressTimer = null;
          longPressTarget = null;
        }, 500); // 500ms für langen Klick
      });
      
      field.addEventListener('mouseup', (e) => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
          longPressTarget = null;
        }
      });
      
      field.addEventListener('mouseleave', (e) => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
          longPressTarget = null;
        }
      });
      
      // Touch Events für Mobile
      field.addEventListener('touchstart', (e) => {
        longPressTarget = e.target;
        longPressTimer = setTimeout(() => {
          if (longPressTarget === e.target) {
            const img = field.querySelector('img');
            const touch = e.touches[0];
            const pos = getImageRelativePos(touch.clientX, touch.clientY, img);
            
            if (pos) {
              addGoalMarker(pos.xPct, pos.yPct, field.id || 'field');
              
              if (navigator.vibrate) {
                navigator.vibrate(100);
              }
            }
          }
          longPressTimer = null;
          longPressTarget = null;
        }, 500);
      });
      
      field.addEventListener('touchend', (e) => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
          longPressTarget = null;
        }
      });

      field.addEventListener('touchmove', (e) => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
          longPressTarget = null;
        }
      });

      field.addEventListener('touchcancel', (e) => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
          longPressTarget = null;
        }
      });
    });
  }

  // Rest der ursprünglichen Funktionen...
  function readFromLocalStorageFallback() {
    try {
      const teamId = App.helpers.getCurrentTeamId();
      const raw = AppStorage.getItem(`seasonMapTimeData_${teamId}`) || null;
      console.log('[Season Map] Geladene Momentum-Daten (raw):', raw);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      console.log('[Season Map] Geladene Momentum-Daten (parsed):', obj);
      if (!obj || typeof obj !== 'object') return null;
      const keys = Object.keys(obj).sort();
      const periods = [];
      for (let k = 0; k < keys.length && periods.length < 3; k++) {
        const val = obj[keys[k]];
        let scored = [], conceded = [];
        if (Array.isArray(val)) {
          const arr = val;
          if (arr.length >= 8) {
            scored = arr.slice(0,4).map(v => Number(v||0)||0);
            conceded = arr.slice(4,8).map(v => Number(v||0)||0);
          } else if (arr.length >= 4) {
            scored = arr.slice(0,4).map(v => Number(v||0)||0);
            conceded = [0,0,0,0];
          } else {
            scored = [0,0,0,0]; conceded = [0,0,0,0];
          }
        } else if (val && typeof val === 'object') {
          const flat = [];
          for (let i = 0; i < 8; i++) flat.push(Number(val[String(i)] || 0));
          scored = flat.slice(0,4);
          conceded = flat.slice(4,8);
        } else {
          scored = [0,0,0,0]; conceded = [0,0,0,0];
        }
        periods.push({ scored: scored.slice(), conceded: conceded.slice() });
      }
      while (periods.length < 3) periods.push({ scored: [0,0,0,0], conceded: [0,0,0,0] });
      return periods.slice(0,3);
    } catch (e) {
      console.warn('[momentum] readFromLocalStorageFallback parse error', e);
      return null;
    }
  }

  function readPeriodsFromDOM() {
    const box = getTimeBoxElement();
    if (!box) return null;
    const periodEls = Array.from(box.querySelectorAll('.period'));
    if (!periodEls.length) return null;
    const periods = [];
    for (let i = 0; i < periodEls.length && periods.length < 3; i++) {
      const pEl = periodEls[i];
      const topBtns = Array.from(pEl.querySelectorAll('.period-buttons.top-row .time-btn'));
      const bottomBtns = Array.from(pEl.querySelectorAll('.period-buttons.bottom-row .time-btn'));
      let scored = [], conceded = [];
      if (topBtns.length >= 4 && bottomBtns.length >= 4) {
        scored = topBtns.slice(0,4).map(b => Number(b.textContent || 0) || 0);
        conceded = bottomBtns.slice(0,4).map(b => Number(b.textContent || 0) || 0);
      } else {
        const allBtns = Array.from(pEl.querySelectorAll('.time-btn'));
        if (allBtns.length >= 8) {
          scored = allBtns.slice(0,4).map(b => Number(b.textContent || 0) || 0);
          conceded = allBtns.slice(4,8).map(b => Number(b.textContent || 0) || 0);
        } else if (allBtns.length >= 4) {
          scored = allBtns.slice(0,4).map(b => Number(b.textContent || 0) || 0);
          conceded = [0,0,0,0];
        } else {
          scored = [0,0,0,0]; conceded = [0,0,0,0];
        }
      }
      periods.push({ scored: scored.slice(), conceded: conceded.slice() });
    }
    while (periods.length < 3) periods.push({ scored: [0,0,0,0], conceded: [0,0,0,0] });
    return periods.slice(0,3);
  }

  function hasNonZero(periods) {
    try { return periods.some(p => (p.scored.concat(p.conceded)).some(v => Number(v) !== 0)); } catch(e) { return false; }
  }

  function readPeriods() {
    const ls = readFromLocalStorageFallback();
    if (ls && hasNonZero(ls)) { console.debug('[momentum] using localStorage periods'); return ls; }
    const dom = readPeriodsFromDOM();
    if (dom && hasNonZero(dom)) { console.debug('[momentum] using DOM periods'); return dom; }
    if (dom) { console.debug('[momentum] DOM present but zero; using DOM'); return dom; }
    if (ls) { console.debug('[momentum] localStorage present but DOM absent; using localStorage'); return ls; }
    console.debug('[momentum] no periods found; returning zeros');
    return [{ scored:[0,0,0,0], conceded:[0,0,0,0] },{ scored:[0,0,0,0], conceded:[0,0,0,0] },{ scored:[0,0,0,0], conceded:[0,0,0,0] }];
  }

  function build12Values(periods) {
    const vals = [];
    for (let p = 0; p < 3; p++) {
      const period = periods[p] || { scored:[0,0,0,0], conceded:[0,0,0,0] };
      for (let b = 0; b < 4; b++) {
        const s = Number(period.scored[b] || 0) || 0;
        const c = Number(period.conceded[b] || 0) || 0;
        vals.push(s - c);
      }
    }
    return vals;
  }

  /**
   * Helper function to extract 12 values from periods for a specific property
   * @param {Array} periods - Array of period objects
   * @param {string} property - Property name ('scored' or 'conceded')
   * @returns {Array} Array of 12 values
   */
  function build12ValuesForProperty(periods, property) {
    const vals = [];
    for (let p = 0; p < 3; p++) {
      const period = periods[p] || { scored:[0,0,0,0], conceded:[0,0,0,0] };
      for (let b = 0; b < 4; b++) {
        vals.push(Number(period[property][b] || 0) || 0);
      }
    }
    return vals;
  }

  function build12ValuesScored(periods) {
    return build12ValuesForProperty(periods, 'scored');
  }

  function build12ValuesConceded(periods) {
    return build12ValuesForProperty(periods, 'conceded');
  }

  function catmullRom2bezier(points) {
    if (!points || points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    if (points.length === 2) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
    const p = [];
    p.push(points[0]);
    for (let i=0;i<points.length;i++) p.push(points[i]);
    p.push(points[points.length-1]);
    let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let i=1;i<p.length-2;i++) {
      const p0 = p[i-1], p1 = p[i], p2 = p[i+1], p3 = p[i+2];
      const b1x = p1.x + (p2.x - p0.x)/6;
      const b1y = p1.y + (p2.y - p0.y)/6;
      const b2x = p2.x - (p3.x - p1.x)/6;
      const b2y = p2.y - (p3.y - p1.y)/6;
      d += ` C ${b1x.toFixed(2)} ${b1y.toFixed(2)}, ${b2x.toFixed(2)} ${b2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    return d;
  }

  function minuteToX(minute) {
    const usableW = SVG_W - MARGIN.left - MARGIN.right;
    const m = Math.max(0, Math.min(60, minute));
    return MARGIN.left + (m/60) * usableW;
  }
  
  function valueToY(v, maxScale) {
    const t = v / maxScale;
    const topSpace = MIDLINE_Y - TOP_GUIDE_Y;
    return MIDLINE_Y - t * topSpace;
  }

  /**
   * Calculate Y coordinate for conceded values (below midline)
   * @param {number} v - The value to position
   * @param {number} maxScale - Maximum scale for normalization
   * @returns {number} Y coordinate below midline
   */
  function valueToYConceded(v, maxScale) {
    const t = v / maxScale;
    const bottomSpace = BOTTOM_GUIDE_Y - MIDLINE_Y;
    return MIDLINE_Y + t * bottomSpace;
  }

  function renderSeasonMomentumGraphic() {
    const root = getSeasonMapRoot();
    if (!root) return;
    // Don't hide TimeBox - it should remain visible as part of the layout

    let container = root.querySelector('#seasonMapMomentum');
    if (!container) {
      container = document.createElement('div');
      container.id = 'seasonMapMomentum';
      container.style.marginTop = '12px';
      container.style.padding = '8px 12px';
      container.style.boxSizing = 'border-box';
      container.style.position = 'relative';
      root.appendChild(container);
    }
    container.innerHTML = '';

    // Get active filters
    const playerFilter = App.seasonMap?.playerFilter || null;
    const teamId = App.helpers.getCurrentTeamId();
    let goalieFilter = AppStorage.getItem(`seasonMapActiveGoalie_${teamId}`) || null;
    
    // Normalize empty string and "All Goalies" values to null for consistent filter logic
    goalieFilter = App.helpers.normalizeGoalieFilter(goalieFilter);
    
    // Load per-player data instead of aggregated totals
    const timeDataWithPlayers = App.helpers.safeJSONParse(`seasonMapTimeDataWithPlayers_${teamId}`, {});
    
    // Helper: Sum button value based on filter
    function sumButton(key, isBottomRow) {
      const playerData = timeDataWithPlayers[key] || {};
      
      if (isBottomRow) {
        // Bottom row (conceded/red) = Goalie Filter
        if (goalieFilter) {
          return Number(playerData[goalieFilter] || 0);
        }
        // No goalie filter = Sum all goalies
        return Object.values(playerData).reduce((sum, val) => sum + Number(val || 0), 0);
      } else {
        // Top row (scored/green) = Player Filter
        if (playerFilter) {
          return Number(playerData[playerFilter] || 0);
        }
        // No player filter = Sum all players
        return Object.values(playerData).reduce((sum, val) => sum + Number(val || 0), 0);
      }
    }
    
    // Build scored and conceded arrays from filtered data
    const scoredValues = [];
    const concededValues = [];
    
    for (let p = 0; p < MAX_PERIODS; p++) {
      const periodKey = `p${p + 1}`;
      for (let b = 0; b < BUTTONS_PER_PERIOD; b++) {
        const scoredKey = `${periodKey}_${b}`;
        const concededKey = `${periodKey}_${b + BUTTONS_PER_PERIOD}`;
        
        scoredValues.push(sumButton(scoredKey, false));
        concededValues.push(sumButton(concededKey, true));
      }
    }
    
    console.debug('[momentum] playerFilter:', playerFilter);
    console.debug('[momentum] goalieFilter:', goalieFilter);
    console.debug('[momentum] scored values (filtered):', scoredValues);
    console.debug('[momentum] conceded values (filtered):', concededValues);

    const maxScored = Math.max(1, ...scoredValues);
    const maxConceded = Math.max(1, ...concededValues);
    const maxScale = Math.max(maxScored, maxConceded, MAX_DISPLAY);

    const scoredPts = scoredValues.map((v,i) => {
      const minute = BUCKET_MINUTES[i];
      const x = minuteToX(minute);
      const y = valueToY(v, maxScale);
      return { idx: i, minute, x, y, v };
    });

    const concededPts = concededValues.map((v,i) => {
      const minute = BUCKET_MINUTES[i];
      const x = minuteToX(minute);
      const y = valueToYConceded(v, maxScale);
      return { idx: i, minute, x, y, v };
    });

    const scoredChron = scoredPts.slice().sort((a,b) => a.minute - b.minute);
    const concededChron = concededPts.slice().sort((a,b) => a.minute - b.minute);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS,'svg');
    svg.setAttribute('width','100%');
    svg.setAttribute('viewBox', `0 0 ${SVG_W} ${SVG_H}`);
    svg.setAttribute('preserveAspectRatio','xMidYMid meet');
    svg.style.display = 'block';

    // Top guide line und labels
    const topLineX1 = minuteToX(0);
    const topLineX2 = minuteToX(60);
    const topLine = document.createElementNS(svgNS,'line');
    topLine.setAttribute('x1', topLineX1);
    topLine.setAttribute('x2', topLineX2);
    topLine.setAttribute('y1', TOP_GUIDE_Y);
    topLine.setAttribute('y2', TOP_GUIDE_Y);
    topLine.setAttribute('stroke', '#ffffff');
    topLine.setAttribute('stroke-width', '3');
    svg.appendChild(topLine);

    const majorTickLen = 18;
    const minorTickLen = 8;
    const majorSet = new Set([0,20,40,60]);

    for (let t=0;t<=60;t+=5) {
      const x = minuteToX(t);
      const isMajor = majorSet.has(t);
      const topY = TOP_GUIDE_Y - (isMajor ? majorTickLen : minorTickLen);
      const botY = TOP_GUIDE_Y + (isMajor ? majorTickLen : minorTickLen);
      const tick = document.createElementNS(svgNS,'line');
      tick.setAttribute('x1', x); tick.setAttribute('x2', x);
      tick.setAttribute('y1', topY); tick.setAttribute('y2', botY);
      tick.setAttribute('stroke', '#cccccc'); tick.setAttribute('stroke-width', isMajor ? '1.6' : '1.0');
      svg.appendChild(tick);
      const txt = document.createElementNS(svgNS,'text');
      txt.setAttribute('x', x);
      txt.setAttribute('y', TOP_GUIDE_Y + (isMajor ? 22 : 14));
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('font-family', 'Segoe UI, Roboto, Arial');
      txt.setAttribute('font-size', isMajor ? '13' : '11');
      txt.setAttribute('fill', '#ffffff');
      txt.setAttribute('font-weight', isMajor ? '800' : '700');
      txt.textContent = String(t);
      svg.appendChild(txt);
    }

    // Baselines
    const midLine = document.createElementNS(svgNS,'line');
    midLine.setAttribute('x1', minuteToX(0)); midLine.setAttribute('x2', minuteToX(60));
    midLine.setAttribute('y1', MIDLINE_Y); midLine.setAttribute('y2', MIDLINE_Y);
    midLine.setAttribute('stroke', '#7a7a7a'); midLine.setAttribute('stroke-width', '3');
    svg.appendChild(midLine);

    const bottomLine = document.createElementNS(svgNS,'line');
    bottomLine.setAttribute('x1', minuteToX(0)); bottomLine.setAttribute('x2', minuteToX(60));
    bottomLine.setAttribute('y1', BOTTOM_GUIDE_Y); bottomLine.setAttribute('y2', BOTTOM_GUIDE_Y);
    bottomLine.setAttribute('stroke', '#d6d6d6'); bottomLine.setAttribute('stroke-width', '2');
    svg.appendChild(bottomLine);

    // Green area for scored (above midline)
    if (scoredValues.some(v => v > 0)) {
      const scoredD = catmullRom2bezier(scoredChron.map(p => ({ x: p.x, y: p.y })));
      const closedScored = scoredD + ` L ${scoredChron[scoredChron.length-1].x.toFixed(2)} ${MIDLINE_Y.toFixed(2)} L ${scoredChron[0].x.toFixed(2)} ${MIDLINE_Y.toFixed(2)} Z`;
      const pathScored = document.createElementNS(svgNS,'path');
      pathScored.setAttribute('d', closedScored);
      pathScored.setAttribute('fill', '#1fb256');
      pathScored.setAttribute('stroke', '#7a7a7a');
      pathScored.setAttribute('stroke-width', '0.9');
      pathScored.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(pathScored);
    }

    // Red area for conceded (below midline)
    if (concededValues.some(v => v > 0)) {
      const concededD = catmullRom2bezier(concededChron.map(p => ({ x: p.x, y: p.y })));
      const closedConceded = concededD + ` L ${concededChron[concededChron.length-1].x.toFixed(2)} ${MIDLINE_Y.toFixed(2)} L ${concededChron[0].x.toFixed(2)} ${MIDLINE_Y.toFixed(2)} Z`;
      const pathConceded = document.createElementNS(svgNS,'path');
      pathConceded.setAttribute('d', closedConceded);
      pathConceded.setAttribute('fill', '#f07d7d');
      pathConceded.setAttribute('stroke', '#7a7a7a');
      pathConceded.setAttribute('stroke-width', '0.9');
      pathConceded.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(pathConceded);
    }

    // Outline for scored (green line)
    if (scoredValues.some(v => v > 0)) {
      const outlineScored = catmullRom2bezier(scoredChron.map(p => ({ x: p.x, y: p.y })));
      const outlineScoredPath = document.createElementNS(svgNS,'path');
      outlineScoredPath.setAttribute('d', outlineScored);
      outlineScoredPath.setAttribute('fill', 'none');
      outlineScoredPath.setAttribute('stroke', '#0d7a36');
      outlineScoredPath.setAttribute('stroke-width', '2.2');
      outlineScoredPath.setAttribute('stroke-linejoin', 'round');
      outlineScoredPath.setAttribute('stroke-linecap', 'round');
      svg.appendChild(outlineScoredPath);
    }

    // Outline for conceded (red line)
    if (concededValues.some(v => v > 0)) {
      const outlineConceded = catmullRom2bezier(concededChron.map(p => ({ x: p.x, y: p.y })));
      const outlineConcededPath = document.createElementNS(svgNS,'path');
      outlineConcededPath.setAttribute('d', outlineConceded);
      outlineConcededPath.setAttribute('fill', 'none');
      outlineConcededPath.setAttribute('stroke', '#c04040');
      outlineConcededPath.setAttribute('stroke-width', '2.2');
      outlineConcededPath.setAttribute('stroke-linejoin', 'round');
      outlineConcededPath.setAttribute('stroke-linecap', 'round');
      svg.appendChild(outlineConcededPath);
    }

    // Green markers for scored
    scoredChron.forEach(p => {
      if (p.v > 0) {
        const c = document.createElementNS(svgNS,'circle');
        c.setAttribute('cx', p.x.toFixed(2));
        c.setAttribute('cy', p.y.toFixed(2));
        c.setAttribute('r', '3');
        c.setAttribute('fill', '#0d7a36');
        c.setAttribute('opacity', '0.95');
        svg.appendChild(c);
      }
    });

    // Red markers for conceded
    concededChron.forEach(p => {
      if (p.v > 0) {
        const c = document.createElementNS(svgNS,'circle');
        c.setAttribute('cx', p.x.toFixed(2));
        c.setAttribute('cy', p.y.toFixed(2));
        c.setAttribute('r', '3');
        c.setAttribute('fill', '#c04040');
        c.setAttribute('opacity', '0.95');
        svg.appendChild(c);
      }
    });

    container.appendChild(svg);
    console.info('[momentum] rendered chart with separate scored (green) and conceded (red) lines');
  }

  function setupAutoUpdate() {
    const clearLSOnReset = () => {
      try {
        const teamId = App.helpers.getCurrentTeamId();
        AppStorage.removeItem(`seasonMapTimeData_${teamId}`);
        AppStorage.removeItem(`seasonMapTimeDataWithPlayers_${teamId}`);
        AppStorage.removeItem(`seasonMapMomentumMarkers_${teamId}`); // Clear goal markers too
      } catch (e) {}
      goalMarkers = []; // Clear in-memory markers
      setTimeout(() => {
        renderSeasonMomentumGraphic();
        renderGoalMarkers();
      }, 140);
    };

    ['resetSeasonMapBtn'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', clearLSOnReset);
    });
    
    document.addEventListener('click', (e) => {
      const id = e?.target?.id;
      if (id === 'resetSeasonMapBtn') clearLSOnReset();
    }, true);

    window.addEventListener('storage', (e) => {
      if (!e) return;
      if (e.key && /seasonMapTimeData|timeData|seasonMapMarkers/i.test(e.key)) {
        setTimeout(() => renderSeasonMomentumGraphic(), 100);
      }
    });

    const tb = getTimeBoxElement();
    if (!tb) {
      const root = getSeasonMapRoot();
      const mo = new MutationObserver(() => {
        if (getTimeBoxElement()) {
          mo.disconnect();
          setupAutoUpdate();
          renderSeasonMomentumGraphic();
        }
      });
      mo.observe(root, { childList: true, subtree: true });
      return;
    }

    // Don't hide TimeBox - it should remain visible as part of the layout
    renderSeasonMomentumGraphic();
    
    // Setup field click handlers after a short delay to ensure DOM is ready
    setTimeout(() => {
      setupFieldClickHandlers();
      loadGoalMarkers();
      renderGoalMarkers();
    }, 100);

    const mo2 = new MutationObserver((muts) => {
      let changed = false;
      for (const m of muts) {
        if (m.type === 'characterData' || m.type === 'childList' || m.type === 'attributes') { changed = true; break; }
      }
      if (changed) {
        if (setupAutoUpdate._timer) clearTimeout(setupAutoUpdate._timer);
        setupAutoUpdate._timer = setTimeout(() => renderSeasonMomentumGraphic(), 120);
      }
    });
    mo2.observe(tb, { subtree: true, characterData: true, childList: true, attributes: true });

    tb.addEventListener('click', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('time-btn')) {
        setTimeout(() => renderSeasonMomentumGraphic(), 120);
      }
    }, true);
  }

  // Expose helper functions
  window.renderSeasonMomentumGraphic = renderSeasonMomentumGraphic;
  window.addGoalMarker = addGoalMarker;
  window.removeGoalMarker = removeGoalMarker;
  window._seasonMomentum_readPeriods = readPeriods;
  window._seasonMomentum_build12 = build12Values;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAutoUpdate);
  } else {
    setupAutoUpdate();
  }
})();
