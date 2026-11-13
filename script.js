/* =========================================
   AUTH GATE / ROOM MODAL
   ========================================= */
.auth-gate-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
}

.auth-card {
    background: var(--bg-card);
    padding: 2.5rem;
    border-radius: var(--radius);
    width: 100%;
    max-width: 440px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
}

.auth-tabs {
    display: flex;
    gap: 0.5rem;
    background: #f1f5f9;
    padding: 0.25rem;
    border-radius: 8px;
}

.tab-btn {
    flex: 1;
    background: none;
    border: none;
    padding: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s;
}

.tab-btn.active {
    background: var(--bg-card);
    color: var(--primary);
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.auth-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}
