
// enhancements-wakelock.js
// Refactored to create a Theme Toggle button on the Game Center page (#statsPage)
// - Creates "Theme" button with gray gradient styling
// - Positioned first in the top-bar, before the timer
// - Only appears on #statsPage
// - Calls toggleTheme() function from theme-toggle.js
//
// Place <script src="enhancements-wakelock.js"></script> after app.js in index.html
(function () {
  const BTN_ID = 'themeToggleBtn';

  function log(...args) { console.debug('[theme-btn]', ...args); }

  function findTopBar() {
    // Only look for top-bar inside #statsPage
    return document.querySelector('#statsPage .top-bar');
  }

  function findTimerButton(topBar) {
    // Only look for timer button within the provided topBar
    if (!topBar) return null;
    return topBar.querySelector('#timerBtn');
  }

  function createButtonElement() {
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.className = 'top-btn';
    // Set initial icon based on current theme
    const currentTheme = AppStorage.getItem('theme') || 'light';
    btn.innerHTML = currentTheme === 'light' ? '☽' : '☀';
    btn.title = currentTheme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode';
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      try {
        // Call the toggleTheme function from theme-toggle.js
        if (typeof toggleTheme === 'function') {
          toggleTheme();
          log('Theme toggled');
        } else {
          console.warn('toggleTheme function not available');
        }
      } catch (err) {
        console.warn('Theme toggle failed:', err);
      }
    });
    return btn;
  }

  function insertButtonIntoTopBar() {
    const topBar = findTopBar();
    if (!topBar) {
      log('topBar not found yet');
      return false;
    }
    
    // Check if button already exists
    if (document.getElementById(BTN_ID)) {
      const existing = document.getElementById(BTN_ID);
      // Ensure it's in the correct position (first, before timer)
      const timerBtn = findTimerButton(topBar);
      if (timerBtn && existing.nextSibling !== timerBtn) {
        topBar.insertBefore(existing, timerBtn);
      }
      return true;
    }

    const btn = createButtonElement();
    const timerBtn = findTimerButton(topBar);

    try {
      // Insert before timer button (first position in top-bar)
      if (timerBtn) {
        topBar.insertBefore(btn, timerBtn);
        log('Inserted Theme button before Timer button');
      } else {
        // Fallback: insert as first child
        topBar.insertBefore(btn, topBar.firstChild);
        log('Inserted Theme button as first child');
      }
    } catch (e) {
      console.warn('Failed to insert button:', e);
      return false;
    }

    return true;
  }

  function ensureInsertedAndObserve() {
    // Only proceed if #statsPage exists and is visible
    const statsPage = document.getElementById('statsPage');
    if (!statsPage) {
      log('#statsPage not found, will retry');
      return false;
    }

    if (insertButtonIntoTopBar()) {
      observeTopBarChildren();
      // Update icon after insertion
      if (typeof updateThemeButtonIcon === 'function') {
        updateThemeButtonIcon();
      }
      return true;
    }

    // Set up mutation observer to wait for top-bar
    const mo = new MutationObserver((muts, observer) => {
      for (const m of muts) {
        if (m.type === 'childList') {
          const tb = findTopBar();
          if (tb) {
            observer.disconnect();
            setTimeout(() => {
              insertButtonIntoTopBar();
              observeTopBarChildren();
              // Update icon after insertion
              if (typeof updateThemeButtonIcon === 'function') {
                updateThemeButtonIcon();
              }
            }, 60);
            break;
          }
        }
      }
    });
    mo.observe(document.body || document.documentElement, { childList: true, subtree: true });

    // Also try with interval as fallback
    const intId = setInterval(() => {
      if (insertButtonIntoTopBar()) {
        clearInterval(intId);
        observeTopBarChildren();
        // Update icon after insertion
        if (typeof updateThemeButtonIcon === 'function') {
          updateThemeButtonIcon();
        }
      }
    }, 400);
    setTimeout(() => clearInterval(intId), 10000);

    return false;
  }

  function observeTopBarChildren() {
    const topBar = findTopBar();
    if (!topBar) return;
    const mo2 = new MutationObserver(() => {
      try {
        insertButtonIntoTopBar();
      } catch (e) { /* ignore */ }
    });
    mo2.observe(topBar, { childList: true, subtree: false });
  }

  function init() {
    try {
      ensureInsertedAndObserve();
      log('Theme toggle button initialization started');
    } catch (e) {
      console.error('Theme button init failed:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
