// theme-toggle.js

// Function to update the theme button icon based on current theme
function updateThemeButtonIcon() {
    const themeBtn = document.getElementById('themeToggleBtn');
    if (!themeBtn) return;
    
    const currentTheme = AppStorage.getItem('theme') || 'light';
    if (currentTheme === 'light') {
        // In Light Mode: Show moon icon (indicates switch to dark)
        themeBtn.innerHTML = '☽';
        themeBtn.title = 'Switch to Dark Mode';
    } else {
        // In Dark Mode: Show sun icon (indicates switch to light)
        themeBtn.innerHTML = '☀';
        themeBtn.title = 'Switch to Light Mode';
    }
}

// Function to set the theme
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    AppStorage.setItem('theme', theme);
    updateThemeButtonIcon();
    
    // Update stats table colors after theme change
    // Check if App and statsTable exist and we are on the stats page
    if (typeof App !== 'undefined' && App.statsTable) {
        // Update cell colors
        if (typeof App.statsTable.updateCellColorsForTheme === 'function') {
            App.statsTable.updateCellColorsForTheme();
        } else if (typeof App.statsTable.render === 'function') {
            // Fallback: Re-render table
            App.statsTable.render();
        }
    }
}

// Function to toggle between light and dark mode
function toggleTheme() {
    const currentTheme = AppStorage.getItem('theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

// Load the theme based on user preference
const userPreference = AppStorage.getItem('theme');
if (userPreference) {
    setTheme(userPreference);
} else {
    // Detect system preference and set theme accordingly
    const systemPreference = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(systemPreference);
}