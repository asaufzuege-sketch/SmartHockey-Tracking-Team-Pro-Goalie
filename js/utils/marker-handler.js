// Marker & Image Sampling – Version mit Spieler-Support
App.markerHandler = {
  LONG_MARK_MS: 600,
  samplerCache: new WeakMap(),
  
  clampPct(v) {
    return Math.max(0, Math.min(100, v));
  },
  
  createImageSampler(imgEl) {
    if (!imgEl) return null;
    if (this.samplerCache.has(imgEl)) return this.samplerCache.get(imgEl);
    
    const sampler = { valid: false, canvas: null, ctx: null };
    
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      sampler.canvas = canvas;
      sampler.ctx = ctx;
      
      const draw = () => {
        try {
          const w = imgEl.naturalWidth || imgEl.width || 1;
          const h = imgEl.naturalHeight || imgEl.height || 1;
          canvas.width = w;
          canvas.height = h;
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(imgEl, 0, 0, w, h);
          sampler.valid = true;
        } catch (e) {
          sampler.valid = false;
        }
      };
      
      if (imgEl.complete) draw();
      else {
        imgEl.addEventListener("load", draw);
        imgEl.addEventListener("error", () => { sampler.valid = false; });
      }
      
      const getPixel = (xPct, yPct) => {
        if (!sampler.valid) return null;
        const px = Math.round((xPct / 100) * (canvas.width - 1));
        const py = Math.round((yPct / 100) * (canvas.height - 1));
        try {
          const d = ctx.getImageData(px, py, 1, 1).data;
          return { r: d[0], g: d[1], b: d[2], a: d[3] };
        } catch (e) {
          sampler.valid = false;
          return null;
        }
      };
      
      sampler.isWhiteAt = (xPct, yPct, threshold = 220) => {
        const p = getPixel(xPct, yPct);
        if (!p || p.a === 0) return false;
        return p.r >= threshold && p.g >= threshold && p.b >= threshold;
      };
      
      sampler.isNeutralWhiteAt = (xPct, yPct, threshold = 245, maxChannelDiff = 8) => {
        const p = getPixel(xPct, yPct);
        if (!p || p.a === 0) return false;
        const maxC = Math.max(p.r, p.g, p.b);
        const minC = Math.min(p.r, p.g, p.b);
        return maxC >= threshold && (maxC - minC) <= maxChannelDiff;
      };
      
      sampler.isGreenAt = (xPct, yPct, gThreshold = 110, diff = 30) => {
        const p = getPixel(xPct, yPct);
        if (!p || p.a === 0) return false;
        return (p.g >= gThreshold) && ((p.g - p.r) >= diff) && ((p.g - p.b) >= diff);
      };
      
      sampler.isRedAt = (xPct, yPct, rThreshold = 95, diff = 22) => {
        const p = getPixel(xPct, yPct);
        if (!p || p.a === 0) return false;
        return (p.r >= rThreshold) && ((p.r - p.g) >= diff) && ((p.r - p.b) >= diff);
      };
      
      sampler.isGreenOrRedAt = (xPct, yPct) => {
        return sampler.isGreenAt(xPct, yPct) || sampler.isRedAt(xPct, yPct);
      };
      
      this.samplerCache.set(imgEl, sampler);
      return sampler;
    } catch (err) {
      const fallback = {
        valid: false,
        isWhiteAt: () => false,
        isNeutralWhiteAt: () => false,
        isGreenAt: () => false,
        isRedAt: () => false,
        isGreenOrRedAt: () => false
      };
      this.samplerCache.set(imgEl, fallback);
      return fallback;
    }
  },
  
  /**
   * Marker mit Prozent-Koordinaten erstellen.
   * Alle Styles kommen aus der CSS-Klasse .marker-dot
   * @param {number} xPct 0–100 (relative to image)
   * @param {number} yPct 0–100 (relative to image)
   * @param {string} color CSS-Farbe
   * @param {HTMLElement} container Box (field-box/goal-img-box)
   * @param {boolean} interactive Klick zum Entfernen? 
   * @param {string|null} playerName optionaler Spielername
   */
  createMarkerPercent(xPct, yPct, color, container, interactive = true, playerName = null) {
    xPct = this.clampPct(xPct);
    yPct = this.clampPct(yPct);
    
    const dot = document.createElement("div");
    dot.className = "marker-dot";
    
    // Store image-relative coordinates as data attributes
    dot.dataset.xPctImage = xPct;
    dot.dataset.yPctImage = yPct;
    
    // Transform image-relative percentages to container-relative percentages
    // This fixes the issue where markers were misaligned on desktop with object-fit: contain
    const img = container.querySelector('img');
    if (img) {
      const rendered = this.computeRenderedImageRect(img);
      const containerRect = container.getBoundingClientRect();
      
      if (rendered && rendered.valid && containerRect.width > 0 && containerRect.height > 0) {
        // Calculate absolute position based on image-relative percentage
        const absoluteX = rendered.x + (xPct / 100) * rendered.width;
        const absoluteY = rendered.y + (yPct / 100) * rendered.height;
        
        // Convert to container-relative percentage
        const containerXPct = ((absoluteX - containerRect.left) / containerRect.width) * 100;
        const containerYPct = ((absoluteY - containerRect.top) / containerRect.height) * 100;
        
        dot.style.left = `${containerXPct}%`;
        dot.style.top = `${containerYPct}%`;
      } else {
        // Fallback: use image percentages directly (for backwards compatibility)
        dot.style.left = `${xPct}%`;
        dot.style.top = `${yPct}%`;
      }
    } else {
      // No image found, use percentages directly
      dot.style.left = `${xPct}%`;
      dot.style.top = `${yPct}%`;
    }
    
    dot.style.backgroundColor = color;
    
    if (playerName) {
      dot.dataset.player = playerName;
    }
    
    if (interactive) {
      dot.addEventListener("click", (ev) => {
        ev.stopPropagation();
        dot.remove();
        // Save markers after removal
        if (App.goalMap && typeof App.goalMap.saveMarkers === 'function') {
          App.goalMap.saveMarkers();
        }
      });
    }
    
    container.style.position = container.style.position || "relative";
    container.appendChild(dot);
    
    return dot;
  },
  
  /**
   * Reposition all markers when window is resized
   */
  repositionMarkers() {
    // Transform image-relative percentages to container-relative percentages
    // This ensures markers align correctly with clicks even with object-fit: contain
    const boxes = document.querySelectorAll(`${App.selectors.torbildBoxes}, ${App.selectors.seasonMapBoxes}`);
    boxes.forEach(box => {
      const img = box.querySelector('img');
      if (!img) return;
      
      const rendered = this.computeRenderedImageRect(img);
      const containerRect = box.getBoundingClientRect();
      
      box.querySelectorAll(".marker-dot").forEach(dot => {
        const xPctImage = parseFloat(dot.dataset.xPctImage);
        const yPctImage = parseFloat(dot.dataset.yPctImage);
        
        // Skip if no image-relative coordinates stored
        if (isNaN(xPctImage) || isNaN(yPctImage)) return;
        
        // Transform image-relative to container-relative percentages
        if (rendered && rendered.valid && containerRect.width > 0 && containerRect.height > 0) {
          // Calculate absolute position based on image-relative percentage
          const absoluteX = rendered.x + (xPctImage / 100) * rendered.width;
          const absoluteY = rendered.y + (yPctImage / 100) * rendered.height;
          
          // Convert to container-relative percentage
          const containerXPct = ((absoluteX - containerRect.left) / containerRect.width) * 100;
          const containerYPct = ((absoluteY - containerRect.top) / containerRect.height) * 100;
          
          dot.style.left = `${containerXPct}%`;
          dot.style.top = `${containerYPct}%`;
        } else {
          // Fallback: use image percentages directly
          dot.style.left = `${xPctImage}%`;
          dot.style.top = `${yPctImage}%`;
        }
      });
    });
  },
  
  computeRenderedImageRect(img) {
    if (!img) return null;
    
    const imgRect = img.getBoundingClientRect();
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    
    // Warte bis Bild geladen
    if (!naturalWidth || !naturalHeight) return null;
    
    // Check object-fit style
    const objectFit = window.getComputedStyle(img).objectFit || 'fill';
    
    // For object-fit: fill, image fills entire container
    if (objectFit === 'fill') {
      return {
        x: imgRect.left,
        y: imgRect.top,
        width: imgRect.width,
        height: imgRect.height,
        valid: true
      };
    }
    
    // For object-fit: contain, calculate rendered size maintaining aspect ratio
    const naturalRatio = naturalWidth / naturalHeight;
    const containerRatio = imgRect.width / imgRect.height;
    
    let renderedWidth, renderedHeight, offsetX, offsetY;
    
    if (naturalRatio > containerRatio) {
      // Bild ist breiter als Container → schwarze Ränder oben/unten
      renderedWidth = imgRect.width;
      renderedHeight = imgRect.width / naturalRatio;
      offsetX = 0;
      offsetY = (imgRect.height - renderedHeight) / 2;
    } else {
      // Bild ist höher als Container → schwarze Ränder links/rechts
      renderedHeight = imgRect.height;
      renderedWidth = imgRect.height * naturalRatio;
      offsetX = (imgRect.width - renderedWidth) / 2;
      offsetY = 0;
    }
    
    return {
      x: imgRect.left + offsetX,
      y: imgRect.top + offsetY,
      width: renderedWidth,
      height: renderedHeight,
      valid: true
    };
  },
  
  clearAllMarkers() {
    document.querySelectorAll(".marker-dot").forEach(d => d.remove());
  }
};
