const API_URL = '/api';

// --- Auth & State ---
const token = localStorage.getItem('token');
const userStr = localStorage.getItem('user');
let currentUser = userStr ? JSON.parse(userStr) : null;
const isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/';

// Redirect logic
if (!token && !isLoginPage) {
    window.location.href = '/index.html';
} else if (token && isLoginPage) {
    window.location.href = '/dashboard.html';
}

// --- Login Page Logic ---
if (isLoginPage) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const resetForm = document.getElementById('reset-form');

    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');
    const registerSuccess = document.getElementById('register-success');
    const resetError = document.getElementById('reset-error');
    const resetSuccess = document.getElementById('reset-success');

    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const resetBtn = document.getElementById('reset-btn');

    // Toggles
    const showRegisterLink = document.getElementById('show-register');
    const showResetLink = document.getElementById('show-reset');
    const showLoginFromRegLink = document.getElementById('show-login-from-reg');
    const showLoginFromResetLink = document.getElementById('show-login-from-reset');

    const hideAllAuthForms = () => {
        loginForm.classList.add('hidden');
        registerForm.classList.add('hidden');
        resetForm.classList.add('hidden');
        // clear messages
        loginError.textContent = '';
        registerError.textContent = '';
        registerSuccess.textContent = '';
        resetError.textContent = '';
        resetSuccess.textContent = '';
    };

    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        hideAllAuthForms();
        registerForm.classList.remove('hidden');
    });

    showResetLink.addEventListener('click', (e) => {
        e.preventDefault();
        hideAllAuthForms();
        resetForm.classList.remove('hidden');
    });

    const showLogin = (e) => {
        if (e) e.preventDefault();
        hideAllAuthForms();
        loginForm.classList.remove('hidden');
    };

    showLoginFromRegLink.addEventListener('click', showLogin);
    showLoginFromResetLink.addEventListener('click', showLogin);

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        loginBtn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;margin:auto"></div>';
        loginBtn.disabled = true;

        try {
            const res = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Login failed');
            }

            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            window.location.href = '/dashboard.html';

        } catch (err) {
            loginError.textContent = err.message;
            loginBtn.innerHTML = '<span>Sign In</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
            loginBtn.disabled = false;
        }
    });

    // Register Submit
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const full_name = document.getElementById('reg-fullname').value;
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;

        registerBtn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;margin:auto"></div>';
        registerBtn.disabled = true;
        registerError.textContent = '';
        registerSuccess.textContent = '';

        try {
            const res = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_name, username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Registration failed');
            }

            registerSuccess.textContent = 'Account created successfully! You can now log in.';
            document.getElementById('reg-fullname').value = '';
            document.getElementById('reg-username').value = '';
            document.getElementById('reg-password').value = '';
            
            setTimeout(() => { showLogin(); }, 2000);

        } catch (err) {
            registerError.textContent = err.message;
        } finally {
            registerBtn.innerHTML = '<span>Register</span>';
            registerBtn.disabled = false;
        }
    });

    // Reset Password Submit
    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('reset-username').value;
        const new_password = document.getElementById('reset-password').value;

        resetBtn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;margin:auto"></div>';
        resetBtn.disabled = true;
        resetError.textContent = '';
        resetSuccess.textContent = '';

        try {
            const res = await fetch(`${API_URL}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, new_password })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Password reset failed');
            }

            resetSuccess.textContent = 'Password reset successfully! You can now log in.';
            document.getElementById('reset-username').value = '';
            document.getElementById('reset-password').value = '';

            setTimeout(() => { showLogin(); }, 2000);
            
        } catch (err) {
            resetError.textContent = err.message;
        } finally {
            resetBtn.innerHTML = '<span>Reset Password</span>';
            resetBtn.disabled = false;
        }
    });
}

// --- Dashboard Logic ---
if (!isLoginPage) {
    // DOM Elements
    const userDisplayName = document.getElementById('user-display-name');
    const logoutBtn = document.getElementById('logout-btn');
    const dateSelector = document.getElementById('date-selector');
    const tableBody = document.getElementById('status-table-body');
    const tableLoader = document.getElementById('table-loader');
    const tableError = document.getElementById('table-error');

    // Modal Elements
    const modalBtn = document.getElementById('open-modal-btn');
    const modal = document.getElementById('status-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    const cancelBtn = document.getElementById('cancel-modal-btn');
    const statusForm = document.getElementById('status-form');
    const modalDate = document.getElementById('modal-date');
    const statusType = document.getElementById('status-type');
    const statusDesc = document.getElementById('status-desc');
    const descGroup = document.getElementById('description-group');
    const submitError = document.getElementById('submit-error');

    // Init User
    userDisplayName.textContent = currentUser.full_name;

    // Init Date (Today)
    const today = new Date().toISOString().split('T')[0];
    dateSelector.value = today;
    modalDate.value = today;

    // Fetch Statuses
    const fetchStatuses = async (date) => {
        tableLoader.classList.remove('hidden');
        tableError.classList.add('hidden');
        tableBody.innerHTML = '';
        modalDate.value = date;

        try {
            const res = await fetch(`${API_URL}/status?date=${date}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                if (res.status === 401 || res.status === 403) logout();
                throw new Error('Failed to fetch data');
            }

            const statuses = await res.json();
            renderTable(statuses);

            // Check if current user already submitted a status today and update modal
            const myStatus = statuses.find(s => String(s.user_id) === String(currentUser.id));
            if (myStatus && myStatus.status_type !== 'Not Updated') {
                statusType.value = myStatus.status_type;
                statusDesc.value = myStatus.description;
                toggleDescField();
            }

        } catch (err) {
            console.error(err);
            tableError.classList.remove('hidden');
        } finally {
            tableLoader.classList.add('hidden');
        }
    };

    // Render Table logic
    const renderTable = (statuses) => {
        statuses.forEach(s => {
            const tr = document.createElement('tr');

            // Format badge styling matches the CSS
            const badgeClass = s.status_type.toLowerCase().replace(' ', '-');

            tr.innerHTML = `
                <td>
                    <div class="user-cell">
                        <div class="avatar">${s.full_name.charAt(0).toUpperCase()}</div>
                        <div class="user-info">
                            <span class="name">${s.full_name}</span>
                            <span class="role">@${s.username}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge ${badgeClass}">${s.status_type}</span>
                </td>
                <td class="desc-text">
                    ${s.description || '-'}
                </td>
            `;
            tableBody.appendChild(tr);
        });
    };

    // Date change listener
    dateSelector.addEventListener('change', (e) => {
        fetchStatuses(e.target.value);
    });

    // Logout
    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/index.html';
    };
    logoutBtn.addEventListener('click', logout);

    // Modal UI Handlers
    const openModal = () => {
        submitError.textContent = '';
        modal.classList.remove('hidden');
    };
    const closeModal = () => modal.classList.add('hidden');

    const toggleDescField = () => {
        if (statusType.value === 'Worked On' || statusType.value === 'WFO Exception') {
            descGroup.style.display = 'flex';
            statusDesc.required = true;
        } else {
            // "Leave" or "Not Updated" typically doesn't need huge descriptions
            descGroup.style.display = 'none';
            statusDesc.required = false;
        }
    };

    modalBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    statusType.addEventListener('change', toggleDescField);

    // Status Form Submit
    statusForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const date = modalDate.value;
        const type = statusType.value;
        const desc = statusDesc.value;

        const btn = document.getElementById('save-status-btn');
        btn.disabled = true;

        try {
            const res = await fetch(`${API_URL}/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    date: date,
                    status_type: type,
                    description: type === 'Leave' ? 'On Leave' : desc
                })
            });

            if (!res.ok) throw new Error('Failed to save status');

            closeModal();
            fetchStatuses(date); // Refresh list
        } catch (err) {
            submitError.textContent = err.message;
        } finally {
            btn.disabled = false;
        }
    });

    // Initial load
    toggleDescField();
    fetchStatuses(today);
}
