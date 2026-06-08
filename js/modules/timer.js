// Timer Modul
App.timer = {
  seconds: 0,
  interval: null,
  btn: null,
  
  init() {
    this.seconds = Number(AppStorage.getItem("timerSeconds")) || 0;
    this.btn = document.getElementById("timerBtn");
    
    if (this.btn) {
      this.updateDisplay();
      this.attachEvents();
    }
  },
  
  updateDisplay() {
    if (this.btn) {
      this.btn.textContent = App.helpers.formatTimeMMSS(this.seconds);
    }
    AppStorage.setItem("timerSeconds", String(this.seconds));
  },
  
  start() {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.seconds++;
      this.updateDisplay();
    }, 1000);
    this.btn?.classList.remove("stopped", "reset");
    this.btn?.classList.add("running");
  },
  
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.btn?.classList.remove("running", "reset");
    this.btn?.classList.add("stopped");
  },
  
  reset() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.seconds = 0;
    this.updateDisplay();
    this.btn?.classList.remove("running", "stopped");
    this.btn?.classList.add("reset");
  },
  
  attachEvents() {
    if (!this.btn) return;
    
    let holdTimer = null;
    let longPress = false;
    const LONG_MS = 800;
    
    this.btn.addEventListener("mousedown", () => {
      longPress = false;
      holdTimer = setTimeout(() => {
        this.reset();
        longPress = true;
      }, LONG_MS);
    });
    
    this.btn.addEventListener("mouseup", () => {
      if (holdTimer) clearTimeout(holdTimer);
    });
    
    this.btn.addEventListener("mouseleave", () => {
      if (holdTimer) clearTimeout(holdTimer);
    });
    
    this.btn.addEventListener("touchstart", () => {
      longPress = false;
      holdTimer = setTimeout(() => {
        this.reset();
        longPress = true;
      }, LONG_MS);
    }, { passive: true });
    
    this.btn.addEventListener("touchend", () => {
      if (holdTimer) clearTimeout(holdTimer);
    }, { passive: true });
    
    this.btn.addEventListener("click", () => {
      if (longPress) {
        longPress = false;
        return;
      }
      if (this.interval) this.stop();
      else this.start();
    });
  }
};
