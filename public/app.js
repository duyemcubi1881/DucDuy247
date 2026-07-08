// CLIENT-SIDE ENGINE (Node.js + PostgreSQL Backend Integrated)

// State parameters
let sessionToken = localStorage.getItem('sessionToken') || '';
let currentUser = null; // Will store username
let userCoins = 0;
let isCreatingLink = false;

// UI Tabs list
const mainDashboard = document.getElementById('mainDashboard');
const authSection = document.getElementById('authSection');

// DOM Loader
document.addEventListener('DOMContentLoaded', () => {
    // Check URL parameters for callback rewards from shortlinks
    handleUrlCallback();

    // Init UI tabs navigation
    initNavigation();

    // Hook forms submission
    initAuthForms();

    // Render client state
    refreshState();
});

// Get authorization headers
function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`
    };
}

// Fetch user state and update UI
async function refreshState() {
    if (!sessionToken) {
        showLoginView();
        return;
    }

    try {
        const res = await fetch('/api/state', {
            headers: getHeaders()
        });
        const data = await res.json();

        if (data.status === 'success') {
            currentUser = data.user.username;
            userCoins = data.user.coins;
            showDashboardView();
            updateUI(data);
        } else {
            // Token expired or invalid
            logout();
        }
    } catch (err) {
        console.error("Lỗi khi tải dữ liệu từ máy chủ:", err);
        showToast("Lỗi kết nối đến máy chủ!", "error");
    }
}

function showLoginView() {
    mainDashboard.style.display = 'none';
    authSection.style.display = 'flex';
}

function showDashboardView() {
    authSection.style.display = 'none';
    mainDashboard.style.display = 'flex';
}

// Update DOM components
function updateUI(data) {
    const user = data.user;

    // Set headers text info
    document.getElementById('headerUsername').innerText = user.username;
    document.getElementById('headerCoins').innerText = user.coins;
    document.getElementById('sidebarCoins').innerText = user.coins;

    // Toggle Admin button strictly for admin users
    const adminTabBtn = document.getElementById('navAdminBtn');
    const adminTitle = document.getElementById('adminTitle');
    if (user.isAdmin) {
        if (adminTabBtn) adminTabBtn.style.display = 'flex';
        if (adminTitle) adminTitle.style.display = 'block';
    } else {
        if (adminTabBtn) adminTabBtn.style.display = 'none';
        if (adminTitle) adminTitle.style.display = 'none';
    }

    // Render task limits
    document.getElementById('funlinkCount').innerText = `${user.funlinkCompletedToday}/2`;
    document.getElementById('nhapmaCount').innerText = `${user.nhapmaCompletedToday}/4`;

    // Tasks cards statuses
    renderTaskCard('Funlink', user);
    renderTaskCard('Nhập mã', user);

    // Update shop stock badges
    const stocks = data.stocks;
    document.getElementById('stock-1h').innerText = `${stocks['1h']} key`;
    document.getElementById('stock-2h').innerText = `${stocks['2h']} key`;
    document.getElementById('stock-4h').innerText = `${stocks['4h']} key`;

    // Toggle shop buttons depending on stock and coins
    updateShopButtons(stocks);

    // Render lists
    renderHistoryLists(data.taskHistory, data.redeemHistory);
}

function renderTaskCard(provider, user) {
    const card = document.getElementById(provider === 'Funlink' ? 'taskFunlinkCard' : 'taskNhapmaCard');
    if (!card) return;

    const limit = (provider === 'Funlink') ? 2 : 4;
    const completed = (provider === 'Funlink') ? user.funlinkCompletedToday : user.nhapmaCompletedToday;
    const isCompleted = completed >= limit;

    const actionContainer = card.querySelector('.task-action-container');
    actionContainer.innerHTML = '';

    if (isCompleted) {
        actionContainer.innerHTML = `<span class="task-badge danger">🚫 Đạt giới hạn hôm nay</span>`;
        return;
    }

    const activeTask = user.activeTask;

    if (activeTask && activeTask.provider === provider) {
        // Task in progress
        actionContainer.innerHTML = `
            <div style="display: flex; gap: 10px; width: 100%;">
                <button class="btn btn-secondary" onclick="cancelActiveTask()" style="flex: 1;">Hủy</button>
                <button class="btn btn-primary" id="btnActiveRedirect" style="flex: 2; background: #10b981;">
                    🚀 Tiếp Tục Vượt Link
                </button>
            </div>
        `;
        // Setup direct click fallback
        document.getElementById('btnActiveRedirect').addEventListener('click', () => {
            showToast("Đang đưa bạn quay lại liên kết vượt...", "success");
            // API will handle getting the actual token redirection
            window.location.href = `/api/claim-reward?reward_token=${activeTask.token}&user=${encodeURIComponent(user.username)}`;
        });
    } else if (activeTask) {
        // Another task active
        actionContainer.innerHTML = `<span class="task-badge warning">⏳ Đang làm nhiệm vụ khác</span>`;
    } else {
        // Idle - Ready to start
        if (isCreatingLink) {
            actionContainer.innerHTML = `<button class="btn btn-primary btn-loading" disabled>Đang tạo link...</button>`;
        } else {
            actionContainer.innerHTML = `<button class="btn btn-primary" onclick="startNewTask('${provider}')">Nhận Nhiệm Vụ</button>`;
        }
    }
}

// Start a shortlink request
async function startNewTask(provider) {
    if (isCreatingLink) return;
    isCreatingLink = true;
    
    // Set UI to loading spinner state
    refreshState();

    try {
        const res = await fetch('/api/start-task', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ provider })
        });
        const data = await res.json();

        if (data.status === 'success') {
            showToast('Đang tự động chuyển hướng đến trang vượt link...', 'success');
            setTimeout(() => {
                window.location.href = data.shortlinkUrl;
            }, 800);
        } else {
            showToast(data.message, 'error');
            isCreatingLink = false;
            refreshState();
        }
    } catch (err) {
        console.error(err);
        showToast('Lỗi máy chủ! Không thể tạo nhiệm vụ.', 'error');
        isCreatingLink = false;
        refreshState();
    }
}

// Cancel the active task
async function cancelActiveTask() {
    if (!confirm('Bạn có chắc chắn muốn hủy nhiệm vụ hiện tại? Lượt làm này sẽ không được tính.')) return;

    try {
        const res = await fetch('/api/cancel-task', {
            method: 'POST',
            headers: getHeaders()
        });
        const data = await res.json();

        if (data.status === 'success') {
            showToast(data.message, 'success');
            refreshState();
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Không thể hủy nhiệm vụ lúc này!', 'error');
    }
}

// Handle URL reward tokens from redirection
function handleUrlCallback() {
    const params = new URLSearchParams(window.location.search);
    const rewardToken = params.get('reward_token');
    const userParam = params.get('user');
    const callbackSession = params.get('session_token');

    if (rewardToken && userParam && callbackSession) {
        // Save the new session token
        sessionToken = callbackSession;
        localStorage.setItem('sessionToken', sessionToken);

        // Fetch reward results from backend
        showToast('Đang nhận diện giải thưởng nhiệm vụ...', 'success');

        // Clear query parameters from URL cleanly
        window.history.replaceState({}, document.title, "/index.html");
        
        // Refresh client data to see the newly added coins
        refreshState();
    }
}

// Purchase keys
async function purchaseKey(keyType, price, label) {
    if (userCoins < price) {
        showToast(`Bạn cần tối thiểu ${price} xu để mua gói key này!`, 'error');
        return;
    }

    if (!confirm(`Xác nhận dùng ${price} xu đổi lấy [${label}]?`)) return;

    try {
        const res = await fetch('/api/purchase-key', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ keyType, price, label })
        });
        const data = await res.json();

        if (data.status === 'success') {
            // Render key success modal
            showKeyModal(label, data.key);
            refreshState();
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Lỗi máy chủ khi đổi key!', 'error');
    }
}

function updateShopButtons(stocks) {
    const items = [
        { type: '1h', price: 100, btnId: 'btnBuy1h' },
        { type: '2h', price: 150, btnId: 'btnBuy2h' },
        { type: '4h', price: 200, btnId: 'btnBuy4h' }
    ];

    items.forEach(item => {
        const btn = document.getElementById(item.btnId);
        if (!btn) return;

        const stock = stocks[item.type];
        const isOutOfStock = stock <= 0;
        const canAfford = userCoins >= item.price;

        if (isOutOfStock) {
            btn.className = 'btn btn-secondary';
            btn.innerText = 'Hết Hàng';
            btn.disabled = true;
        } else if (!canAfford) {
            btn.className = 'btn btn-secondary';
            btn.innerText = `Không Đủ Xu (Cần ${item.price} Xu)`;
            btn.disabled = true;
        } else {
            btn.className = 'btn btn-primary';
            btn.innerText = 'Đổi Ngay';
            btn.disabled = false;
        }
    });
}

function renderHistoryLists(taskHistory, redeemHistory) {
    const taskList = document.getElementById('taskList');
    const redeemList = document.getElementById('redeemList');

    if (taskList) {
        taskList.innerHTML = '';
        if (taskHistory.length === 0) {
            taskList.innerHTML = `<div class="empty-state">Chưa làm nhiệm vụ nào.</div>`;
        } else {
            taskHistory.forEach(item => {
                const date = new Date(item.timestamp).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' });
                const row = document.createElement('div');
                row.className = 'history-item';
                row.innerHTML = `
                    <div>
                        <span style="font-weight: 700; color: var(--text-main);">${item.provider}</span>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${date}</div>
                    </div>
                    <span style="font-weight: 700; color: #10b981;">+$${item.coinsEarned} Xu</span>
                `;
                taskList.appendChild(row);
            });
        }
    }

    if (redeemList) {
        redeemList.innerHTML = '';
        if (redeemHistory.length === 0) {
            redeemList.innerHTML = `<div class="empty-state">Chưa đổi thưởng lần nào.</div>`;
        } else {
            redeemHistory.forEach(item => {
                const date = new Date(item.timestamp).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' });
                const row = document.createElement('div');
                row.className = 'history-item';
                row.innerHTML = `
                    <div>
                        <span style="font-weight: 700; color: var(--text-main);">${item.itemName}</span>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${date}</div>
                        <div class="key-box-row" style="margin-top: 6px;">
                            <span class="key-display-text" id="displayKey-${item.timestamp}">${item.key}</span>
                            <button class="copy-key-btn" onclick="copyKeyText('${item.key}')">📋 Sao chép</button>
                        </div>
                    </div>
                    <span style="font-weight: 700; color: #ef4444;">-${item.cost} Xu</span>
                `;
                redeemList.appendChild(row);
            });
        }
    }
}

// Authentication forms handlers
function initAuthForms() {
    const authForm = document.getElementById('authForm');
    const authBtn = document.getElementById('authBtn');
    const toggleAuthLink = document.getElementById('toggleAuthLink');
    const toggleAuthText = document.getElementById('toggleAuthText');
    const authTitle = document.getElementById('authTitle');

    let currentMode = 'login'; // login or register

    toggleAuthLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentMode === 'login') {
            currentMode = 'register';
            authTitle.innerText = 'Đăng Ký Tài Khoản';
            authBtn.innerText = 'Đăng Ký';
            toggleAuthText.innerHTML = 'Đã có tài khoản? <a href="#" id="toggleAuthLink">Đăng nhập</a>';
        } else {
            currentMode = 'login';
            authTitle.innerText = 'Đăng Nhập';
            authBtn.innerText = 'Đăng Nhập';
            toggleAuthText.innerHTML = 'Chưa có tài khoản? <a href="#" id="toggleAuthLink">Đăng ký ngay</a>';
        }
        // Re-bind to fresh toggle link element
        initAuthForms();
    });

    authForm.onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('authUsername').value.trim();
        const password = document.getElementById('authPassword').value;

        if (!username || !password) {
            showToast('Vui lòng nhập tài khoản và mật khẩu!', 'error');
            return;
        }

        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, mode: currentMode })
            });
            const data = await res.json();

            if (data.status === 'success') {
                showToast(data.message, 'success');
                if (currentMode === 'register') {
                    // Switch to login
                    currentMode = 'login';
                    authTitle.innerText = 'Đăng Nhập';
                    authBtn.innerText = 'Đăng Nhập';
                    toggleAuthText.innerHTML = 'Chưa có tài khoản? <a href="#" id="toggleAuthLink">Đăng ký ngay</a>';
                    initAuthForms();
                    document.getElementById('authPassword').value = '';
                } else {
                    sessionToken = data.sessionToken;
                    currentUser = data.username;
                    localStorage.setItem('sessionToken', sessionToken);
                    document.getElementById('authUsername').value = '';
                    document.getElementById('authPassword').value = '';
                    refreshState();
                }
            } else {
                showToast(data.message, 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Lỗi máy chủ khi xác thực tài khoản!', 'error');
        }
    };
}

// Log out user
function logout() {
    fetch('/api/logout', {
        headers: getHeaders()
    }).catch(err => console.warn(err));

    sessionToken = '';
    currentUser = null;
    localStorage.removeItem('sessionToken');
    showLoginView();
    showToast('Đã đăng xuất khỏi tài khoản.', 'success');
}

// Sidebar Navigation
function initNavigation() {
    const navItems = document.querySelectorAll('.sidebar .nav-item');
    const tabs = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const targetTab = item.getAttribute('data-tab');
            if (!targetTab) return; // Allow admin panel redirect links

            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            tabs.forEach(tab => {
                if (tab.id === targetTab) {
                    tab.classList.add('active');
                } else {
                    tab.classList.remove('active');
                }
            });
        });
    });
}

// --- POPUPS & MODALS ---
function showKeyModal(packageName, key) {
    const modalHtml = `
        <div class="modal-backdrop" id="keyModalBackdrop">
            <div class="modal-card">
                <div class="modal-header">
                    <h3>🎉 Đổi Thưởng Thành Công!</h3>
                </div>
                <div class="modal-body">
                    <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">
                        Bạn đã đổi thành công gói <strong>${packageName}</strong>. Hãy copy key bên dưới:
                    </p>
                    <div style="background: var(--bg-body); border: 1px solid var(--border-color); border-radius: var(--border-radius-md); padding: 15px; text-align: center; margin-bottom: 20px; position: relative;">
                        <span style="font-family: monospace; font-size: 18px; font-weight: 700; color: #10b981; word-break: break-all;" id="modalKeyText">${key}</span>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="copyModalKey('${key}')" style="margin-right: 10px;">📋 Copy Key</button>
                    <button class="btn btn-secondary" onclick="closeKeyModal()">Đóng</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeKeyModal() {
    const modal = document.getElementById('keyModalBackdrop');
    if (modal) modal.remove();
}

function copyModalKey(key) {
    copyKeyText(key);
    closeKeyModal();
}

function copyKeyText(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Đã copy key vào khay nhớ tạm!', 'success');
    }).catch(err => {
        console.error(err);
        showToast('Không thể copy tự động!', 'error');
    });
}

// Global Custom Toast System
function showToast(message, type = 'success') {
    const existing = document.querySelectorAll('.toast');
    existing.forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${type === 'success' ? '✔' : '❌'}</span>
        <span class="toast-message">${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 10);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
