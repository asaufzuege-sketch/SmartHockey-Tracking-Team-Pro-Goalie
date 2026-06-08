// Enhance Goal Value table - DEAKTIVIERT
function enhanceGoalValueTable() {
  // KOMPLETT DEAKTIVIERT - goal-value.js übernimmt alles
  const container = document.getElementById('goalValueContainer');
  if (!container) return;
  const table = container.querySelector('table.gv-no-patch');
  if (!table) return;
  
  // Nur Dropdown-Ersetzung (wenn nötig)
  const tbody = table.tBodies[0];
  if (!tbody) return;
  const rows = Array.from(tbody.rows);
  if (rows.length === 0) return;
  
  const bottomRow = rows[rows.length - 1];
  const bottomCells = Array.from(bottomRow.cells);
  
  bottomCells.forEach((td, idx) => {
    if (idx === 0 || idx === bottomCells.length - 1) return;
    
    const span = td.querySelector('.gv-scale');
    if (!span || td.querySelector('select')) return;
    
    const curVal = span.textContent || '0';
    const select = document.createElement('select');
    select.className = 'gv-scale-dropdown';
    
    const goalValueOptions = [];
    for (let v = 0; v <= 10; v++) goalValueOptions.push((v*0.5).toFixed(1));
    
    goalValueOptions.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = opt;
      if (opt === String(curVal)) option.selected = true;
      select.appendChild(option);
    });
    
    td.innerHTML = '';
    td.appendChild(select);
    
    select.addEventListener('change', () => {
      if (App.goalValue && typeof App.goalValue.render === 'function') {
        const nv = Number(select.value);
        const bottom = App.goalValue.getBottom();
        bottom[idx - 1] = nv;
        App.goalValue.setBottom(bottom);
        App.goalValue.render();
      }
    });
  });
}
