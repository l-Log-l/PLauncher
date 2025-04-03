document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // Remove active class from all tabs and contents
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        // Add active class to clicked tab and corresponding content
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
    });
});

// Add window control handlers with error checking
document.querySelectorAll(".control").forEach((control) => {
    control.addEventListener("click", (event) => {
        event.stopPropagation();
        const action = control.getAttribute("data-action");
        if (window.electronAPI && typeof window.electronAPI.wikiWindowAction === 'function') {
            window.electronAPI.wikiWindowAction(action);
        } else {
            console.error('Window control API not available');
        }
    });
});
