// CLIENT-SIDE ENGINE (Node.js + PostgreSQL Backend Integrated)

// State parameters
let sessionToken = localStorage.getItem('sessionToken') || '';
let currentUser = null; // Will store username
let userCoins = 0;
let isCreatingLink = false;

// UI Tabs list
const mainDashboard = document.getElementById('appContainer');
const authSection = document.getElementById('authWrapper');

// DOM Loader
document.addEventListener('DOMContentLoaded', () => {
    // Check URL parameters for callback rewards from shortlinks
    handleUrlCallback();

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
    mainDashboard.classList.remove('visible');
    authSection.classList.remove('hidden');
}

function showDashboardView() {
    authSection.classList.add('hidden');
    mainDashboard.classList.add('visible');
}

// Update DOM components
function updateUI(data) {
    const user = data.user;

    // Set headers text info
    const sidebarUser = document.getElementById('sidebarUsername');
    if (sidebarUser) sidebarUser.innerText = user.username;

    const avatarLetter = document.getElementById('avatarLetter');
    if (avatarLetter && user.username) {
        avatarLetter.innerText = user.username.charAt(0).toUpperCase();
    }

    const coinBalance = document.querySelector('.coin-balance-display');
    if (coinBalance) coinBalance.innerText = user.coins;

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

    // Render tasks dynamically
    renderTasks(user);

    // Render shop dynamically
    renderShop(data);

    // Render lists
    renderHistoryLists(data.taskHistory, data.redeemHistory);
}

function renderTasks(user) {
    const tasksContainer = document.getElementById('tasksContainer');
    if (!tasksContainer) return;

    tasksContainer.innerHTML = '';

    const tasks = [
        {
            provider: 'Funlink',
            title: 'Nhiệm Vụ 1: Rút Gọn Funlink',
            subtitle: 'Vượt link của nhà tài trợ Funlink để nhận xu thưởng.',
            completed: user.funlinkCompletedToday,
            limit: 2,
            rewardText: 'Lượt 1: +200 xu, Lượt 2: +100 xu',
            icon: '🔗'
        },
        {
            provider: 'Nhập mã',
            title: 'Nhiệm Vụ 2: Rút Gọn Nhập Mã',
            subtitle: 'Vượt link của nhà tài trợ Nhapma.com để nhận xu thưởng.',
            completed: user.nhapmaCompletedToday,
            limit: 4,
            rewardText: '+100 xu / lượt vượt thành công',
            icon: '🔑'
        }
    ];

    tasks.forEach(task => {
        const isCompleted = task.completed >= task.limit;
        const activeTask = user.activeTask;
        
        let actionHtml = '';
        if (isCompleted) {
            actionHtml = `<span class="task-badge danger" style="padding: 8px 16px; border-radius: 50px; font-weight: 700; font-size: 12px; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2);">🚫 Hết lượt hôm nay</span>`;
        } else if (activeTask && activeTask.provider === task.provider) {
            actionHtml = `
                <div style="display: flex; gap: 10px; width: 100%;">
                    <button class="btn btn-secondary" onclick="cancelActiveTask()" style="padding: 10px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-main); font-weight: 600; border-radius: var(--border-radius-md); cursor: pointer; flex: 1;">Hủy</button>
                    <button class="btn btn-primary" id="btnActiveRedirect" style="padding: 10px; background: #10b981; border: none; color: #fff; font-weight: 700; border-radius: var(--border-radius-md); cursor: pointer; flex: 2;">🚀 Bắt Đầu Vượt Link</button>
                </div>
            `;
        } else if (activeTask) {
            actionHtml = `<span class="task-badge warning" style="padding: 8px 16px; border-radius: 50px; font-weight: 700; font-size: 12px; background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.2);">⏳ Đang làm nhiệm vụ khác</span>`;
        } else {
            actionHtml = isCreatingLink 
                ? `<button class="btn btn-primary btn-loading" disabled style="width: 100%; padding: 12px; border-radius: var(--border-radius-md); font-weight: 700;">Đang tạo link...</button>`
                : `<button class="btn btn-primary" onclick="startNewTask('${task.provider}')" style="width: 100%; padding: 12px; border-radius: var(--border-radius-md); font-weight: 700; background: var(--primary); color: #fff; border: none; cursor: pointer;">Nhận Nhiệm Vụ</button>`;
        }

        const card = document.createElement('div');
        card.className = 'task-card';
        card.innerHTML = `
            <div class="task-header" style="display: flex; align-items: center;">
                <span class="task-icon" style="font-size: 32px; background: rgba(59, 130, 246, 0.05); padding: 10px; border-radius: var(--border-radius-md);">${task.icon}</span>
                <span class="task-badge info" style="margin-left: auto; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 50px; background: rgba(59, 130, 246, 0.1); color: var(--primary);">${task.completed}/${task.limit} Lượt</span>
            </div>
            <div class="task-body" style="margin-top: 15px;">
                <h3 class="task-title" style="font-size: 18px; font-weight: 700; color: var(--text-main);">${task.title}</h3>
                <p class="task-subtitle" style="font-size: 13px; color: var(--text-muted); margin-top: 6px; line-height: 1.5;">${task.subtitle}</p>
                <div class="task-reward-info" style="margin-top: 12px; font-size: 12px; font-weight: 600; color: #10b981;">🎁 Phần thưởng: ${task.rewardText}</div>
            </div>
            <div class="task-action-container" style="margin-top: 20px;">
                ${actionHtml}
            </div>
        `;

        tasksContainer.appendChild(card);
    });

    const redirectBtn = document.getElementById('btnActiveRedirect');
    if (redirectBtn && user.activeTask) {
        redirectBtn.onclick = () => {
            showToast("Đang đưa bạn đến liên kết vượt...", "success");
            window.location.href = `/api/claim-reward?reward_token=${user.activeTask.token}&user=${encodeURIComponent(user.username)}`;
        };
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

function renderShop(data) {
    const shopContainer = document.getElementById('shopContainer');
    if (!shopContainer) return;

    shopContainer.innerHTML = '';

    const user = data.user;
    const stocks = data.stocks;
    
    const boughtCounts = { '1h': 0, '2h': 0, '4h': 0 };
    data.redeemHistory.forEach(h => {
        if (h.itemName.includes('1 Giờ')) boughtCounts['1h']++;
        if (h.itemName.includes('2 Giờ')) boughtCounts['2h']++;
        if (h.itemName.includes('4 Giờ')) boughtCounts['4h']++;
    });

    const items = [
        { type: '1h', label: 'Key Imgui Menu 1 Giờ', price: 100, stock: stocks['1h'], bought: boughtCounts['1h'] },
        { type: '2h', label: 'Key Imgui Menu 2 Giờ', price: 150, stock: stocks['2h'], bought: boughtCounts['2h'] },
        { type: '4h', label: 'Key Imgui Menu 4 Giờ', price: 200, stock: stocks['4h'], bought: boughtCounts['4h'] }
    ];

    items.forEach(item => {
        const isOutOfStock = item.stock <= 0;
        const canAfford = user.coins >= item.price;
        
        let btnHtml = '';
        if (isOutOfStock) {
            btnHtml = `<button class="btn btn-secondary" disabled style="width: 100%; padding: 12px; border-radius: var(--border-radius-md); font-weight: 700; cursor: not-allowed; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-muted);">Hết Hàng</button>`;
        } else if (!canAfford) {
            btnHtml = `<button class="btn btn-secondary" disabled style="width: 100%; padding: 12px; border-radius: var(--border-radius-md); font-weight: 700; cursor: not-allowed; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-muted);">Không Đủ Xu (Cần ${item.price} Xu)</button>`;
        } else {
            btnHtml = `<button class="btn btn-primary" onclick="purchaseKey('${item.type}', ${item.price}, '${item.label}')" style="width: 100%; padding: 12px; border-radius: var(--border-radius-md); font-weight: 700; background: var(--primary); color: #fff; border: none; cursor: pointer;">Đổi Ngay</button>`;
        }

        const card = document.createElement('div');
        card.className = 'shop-card';
        card.innerHTML = `
            <div class="shop-banner" style="background-image: url('menu_banner.png');">
                <span class="shop-badge">Key VIP</span>
            </div>
            <div class="shop-body" style="padding: 24px; text-align: center;">
                <h3 class="shop-title" style="font-size: 20px; font-weight: 700; color: var(--text-main); margin-bottom: 8px;">${item.label}</h3>
                <div class="shop-price" style="font-size: 24px; font-weight: 800; color: var(--primary); margin-bottom: 15px;">
                    ${item.price} <span style="font-size: 14px; font-weight: 600; color: var(--text-muted);">Xu</span>
                </div>
                
                <div style="display: flex; justify-content: center; gap: 15px; margin-bottom: 20px; font-size: 13px; font-weight: 600; color: var(--text-muted);">
                    <span>📦 Kho: <strong style="color: var(--text-main);">${item.stock} key</strong></span>
                    <span>🛒 Đã mua: <strong style="color: var(--text-main);">${item.bought}</strong></span>
                </div>
                
                ${btnHtml}
            </div>
        `;

        shopContainer.appendChild(card);
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
let currentMode = 'login'; // Global authentication mode

window.handleAuthToggle = function(isRegister) {
    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');
    const authBtn = document.getElementById('authBtn');
    const authToggleText = document.getElementById('authToggleText');
    const authForm = document.getElementById('authForm');

    if (!authForm) return;

    if (isRegister) {
        currentMode = 'register';
        authTitle.innerText = 'Đăng Ký Tài Khoản';
        if (authSubtitle) authSubtitle.innerText = 'Đăng ký tài khoản mới để bắt đầu làm nhiệm vụ';
        authBtn.innerText = 'Đăng Ký';
        authForm.setAttribute('data-mode', 'register');
        authToggleText.innerHTML = 'Đã có tài khoản? <span class="auth-switch-link" onclick="handleAuthToggle(false)">Đăng nhập</span>';
    } else {
        currentMode = 'login';
        authTitle.innerText = '💎 Shop Duc Duy';
        if (authSubtitle) authSubtitle.innerText = 'Đăng nhập để vào cửa hàng và làm nhiệm vụ';
        authBtn.innerText = 'Đăng Nhập';
        authForm.setAttribute('data-mode', 'login');
        authToggleText.innerHTML = 'Chưa có tài khoản? <span class="auth-switch-link" onclick="handleAuthToggle(true)">Đăng ký ngay</span>';
    }
};

function initAuthForms() {
    const authForm = document.getElementById('authForm');
    if (!authForm) return;

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
                    // Switch back to login
                    window.handleAuthToggle(false);
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
window.handleLogout = logout;

// Sidebar Navigation
window.switchTab = function(tabId) {
    const navItems = document.querySelectorAll('.sidebar .nav-item');
    navItems.forEach(item => {
        if (item.getAttribute('data-tab') === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(panel => {
        if (panel.id === tabId) {
            panel.classList.add('active');
        } else {
            panel.classList.remove('active');
        }
    });
};

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
