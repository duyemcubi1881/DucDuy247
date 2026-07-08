// Force Light Mode by default
document.documentElement.setAttribute('data-theme', 'light');

// ADMIN PANEL CONTROLLER (Node.js + PostgreSQL Backend Integrated)

let adminToken = localStorage.getItem('adminToken') || '';
let selectedKeyType = '4h'; // Default key display type

document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    refreshAdminState();

    // Hook forms
    initAdminForms();
});

// Get admin request headers
function getAdminHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
    };
}

// Fetch stats and lists from backend
async function refreshAdminState() {
    if (!adminToken) {
        showLoginOverlay();
        return;
    }

    try {
        const res = await fetch(`/api/admin/state?key_type=${selectedKeyType}`, {
            headers: getAdminHeaders()
        });
        const data = await res.json();

        if (data.status === 'success') {
            hideLoginOverlay();
            updateAdminDashboard(data);
        } else {
            showAdminToast(data.message || 'Phiên làm việc hết hạn!', 'error');
            if (data.message && data.message.includes('database')) {
                // Do not force logout to let developer inspect DB error message
            } else {
                adminLogout();
            }
        }
    } catch (err) {
        console.error(err);
        showAdminToast(`Lỗi kết nối máy chủ admin: ${err.message}`, 'error');
    }
}

function showLoginOverlay() {
    const auth = document.getElementById('adminAuthWrapper');
    const app = document.getElementById('adminAppContainer');
    if (app) app.classList.remove('visible');
    if (auth) auth.classList.remove('hidden');
}

function hideLoginOverlay() {
    const auth = document.getElementById('adminAuthWrapper');
    const app = document.getElementById('adminAppContainer');
    if (auth) auth.classList.add('hidden');
    if (app) app.classList.add('visible');
}

// Update Admin Control stats and lists
function updateAdminDashboard(data) {
    const stats = data.stats;

    // Update statistics cards
    const totalUsersEl = document.getElementById('statTotalUsers');
    if (totalUsersEl) totalUsersEl.innerText = stats.totalUsers;

    const totalCoinsEl = document.getElementById('statTotalCoins');
    if (totalCoinsEl) totalCoinsEl.innerText = stats.totalCoins;

    const stock1hEl = document.getElementById('statKeys1h');
    if (stock1hEl) stock1hEl.innerText = stats.stock1h;

    const stock2hEl = document.getElementById('statKeys2h');
    if (stock2hEl) stock2hEl.innerText = stats.stock2h;

    const stock4hEl = document.getElementById('statKeys4h');
    if (stock4hEl) stock4hEl.innerText = stats.stock4h;

    // Render users list table
    renderUsersTable(data.users);

    // Render keys inventory table
    renderKeysTable(data.keysList);
}

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">Chưa có thành viên nào.</td></tr>`;
        return;
    }

    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <span class="user-cell-name">${user.username}</span>
                ${user.username === 'admin' ? '<span class="admin-badge" style="background:#10b981; color:#fff; font-size:10px; padding:2px 6px; border-radius:10px; margin-left:6px; font-weight:700;">ADMIN</span>' : ''}
            </td>
            <td><strong>${user.coins} Xu</strong></td>
            <td>
                <div style="font-size: 12px; color: var(--text-muted);">Nhập Mã: ${user.nhapmaCompletedToday}/4</div>
                <div style="font-size: 12px; color: var(--text-muted); margin-top:2px;">Funlink: ${user.funlinkCompletedToday}/2</div>
            </td>
            <td>
                <div class="admin-controls-group">
                    <button class="action-btn btn-coins" onclick="promptAdjustCoins('${user.username}')">🪙 Sửa Xu</button>
                    <button class="action-btn btn-reset" onclick="resetUserLimit('${user.username}')">🔄 Reset Lượt</button>
                    ${user.username !== 'admin' ? `<button class="action-btn btn-delete" onclick="deleteUserAccount('${user.username}')">❌ Xóa</button>` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderKeysTable(keysList) {
    const tbody = document.getElementById('keysTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (keysList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: var(--text-muted);">Không có key nào trong kho.</td></tr>`;
        return;
    }

    keysList.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td><code class="key-code-badge">${item.key}</code></td>
            <td>
                <button class="action-btn btn-delete" onclick="deleteSingleKey(${item.id})">Xóa</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Hook Admin Auth and restocking forms
function initAdminForms() {
    const loginForm = document.getElementById('adminLoginForm');
    if (!loginForm) return;

    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('adminUsername').value.trim();
        const password = document.getElementById('adminPassword').value;

        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (data.status === 'success') {
                adminToken = data.sessionToken;
                localStorage.setItem('adminToken', adminToken);
                
                // Clear input
                document.getElementById('adminUsername').value = '';
                document.getElementById('adminPassword').value = '';

                hideLoginOverlay();
                refreshAdminState();
                showAdminToast(data.message, 'success');
            } else {
                showAdminToast(data.message, 'error');
            }
        } catch (err) {
            console.error(err);
            showAdminToast('Lỗi máy chủ admin khi đăng nhập!', 'error');
        }
    };
}

// Adjust User Coins (Add / Subtract)
async function promptAdjustCoins(username) {
    const amountStr = prompt(`Nhập số xu muốn thay đổi cho tài khoản [${username}] (Dùng số âm để trừ xu, số dương để cộng xu):`, "100");
    if (amountStr === null) return;

    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount === 0) {
        showAdminToast('Số lượng xu không hợp lệ!', 'error');
        return;
    }

    try {
        const res = await fetch('/api/admin/add-coins', {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ username, amount })
        });
        const data = await res.json();

        if (data.status === 'success') {
            showAdminToast(data.message, 'success');
            refreshAdminState();
        } else {
            showAdminToast(data.message, 'error');
        }
    } catch (err) {
        console.error(err);
        showAdminToast('Không thể cập nhật xu!', 'error');
    }
}

// Reset User Limits
async function resetUserLimit(username) {
    if (!confirm(`Xác nhận reset giới hạn làm nhiệm vụ của [${username}] về 0?`)) return;

    try {
        const res = await fetch('/api/admin/reset-limit', {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ username })
        });
        const data = await res.json();

        if (data.status === 'success') {
            showAdminToast(data.message, 'success');
            refreshAdminState();
        } else {
            showAdminToast(data.message, 'error');
        }
    } catch (err) {
        console.error(err);
        showAdminToast('Không thể reset giới hạn!', 'error');
    }
}

// Delete User Account
async function deleteUserAccount(username) {
    if (!confirm(`CẢNH BÁO: Bạn có chắc muốn xóa vĩnh viễn tài khoản [${username}]? Hành động này không thể hoàn tác.`)) return;

    try {
        const res = await fetch('/api/admin/delete-user', {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ username })
        });
        const data = await res.json();

        if (data.status === 'success') {
            showAdminToast(data.message, 'success');
            refreshAdminState();
        } else {
            showAdminToast(data.message, 'error');
        }
    } catch (err) {
        console.error(err);
        showAdminToast('Không thể xóa tài khoản!', 'error');
    }
}

// Delete Single Key
async function deleteSingleKey(id) {
    if (!confirm('Xác nhận xóa key này khỏi kho?')) return;

    try {
        const res = await fetch('/api/admin/delete-key', {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ id })
        });
        const data = await res.json();

        if (data.status === 'success') {
            showAdminToast(data.message, 'success');
            refreshAdminState();
        } else {
            showAdminToast(data.message, 'error');
        }
    } catch (err) {
        console.error(err);
        showAdminToast('Không thể xóa key!', 'error');
    }
}

// Clear all keys in a type category
async function clearAllKeys(keyType) {
    if (!confirm(`XÁC NHẬN: Bạn muốn xóa sạch TOÀN BỘ key chưa bán của gói [Gói Key ${keyType}]?`)) return;

    try {
        const res = await fetch('/api/admin/clear-keys', {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ keyType })
        });
        const data = await res.json();

        if (data.status === 'success') {
            showAdminToast(data.message, 'success');
            refreshAdminState();
        } else {
            showAdminToast(data.message, 'error');
        }
    } catch (err) {
        console.error(err);
        showAdminToast('Không thể dọn kho key!', 'error');
    }
}

// Switch tabs and lists
function switchTab(tabId) {
    // Navigation items
    const navItems = document.querySelectorAll('.admin-sidebar .nav-item');
    navItems.forEach(item => {
        if (item.getAttribute('data-tab') === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Content cards
    const cards = document.querySelectorAll('.admin-card');
    cards.forEach(card => {
        if (card.id === tabId) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });
}

function filterKeysByType(keyType) {
    selectedKeyType = keyType;
    
    // Toggle active state of category buttons
    const filterBtns = document.querySelectorAll('.filter-tabs .filter-btn');
    filterBtns.forEach(btn => {
        if (btn.getAttribute('onclick').includes(keyType)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Reload keys list
    refreshAdminState();
}

function adminLogout() {
    fetch('/api/admin/logout', {
        method: 'POST',
        headers: getAdminHeaders()
    }).catch(err => console.warn(err));

    adminToken = '';
    localStorage.removeItem('adminToken');
    showLoginOverlay();
    showAdminToast('Đã đăng xuất khỏi Admin Control Panel.', 'success');
}

// Admin Toast Messaging
function showAdminToast(message, type = 'success') {
    const existing = document.querySelectorAll('.toast-notice');
    existing.forEach(t => t.remove());

    const toast = document.createElement('div');
    const typeClass = type === 'success' ? 'success-type' : 'error-type';
    toast.className = `toast-notice ${typeClass}`;
    toast.innerHTML = `
        <span class="toast-icon">${type === 'success' ? '✔' : '❌'}</span>
        <span class="toast-message">${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// Export functions to global scope
window.switchTab = switchTab;
window.filterKeysByType = filterKeysByType;
window.handleAdminLogout = adminLogout;

window.adminRestockKeys = async function() {
    const keyType = document.getElementById('restockKeyType').value;
    const rawKeys = document.getElementById('restockTextarea').value;

    if (!rawKeys.trim()) {
        showAdminToast('Vui lòng nhập danh sách key!', 'error');
        return;
    }

    const keys = rawKeys.split('\n').map(k => k.trim()).filter(k => k.length > 0);

    try {
        const res = await fetch('/api/admin/restock-keys', {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ keyType, keys })
        });
        const data = await res.json();

        if (data.status === 'success') {
            showAdminToast(data.message, 'success');
            document.getElementById('restockTextarea').value = '';
            refreshAdminState();
        } else {
            showAdminToast(data.message, 'error');
        }
    } catch (err) {
        console.error(err);
        showAdminToast('Không thể nạp key!', 'error');
    }
};

window.loadKeysList = function() {
    const keyType = document.getElementById('viewKeyTypeSelect').value;
    filterKeysByType(keyType);
};

window.clearAllKeysOfType = function() {
    const keyType = document.getElementById('viewKeyTypeSelect').value;
    clearAllKeys(keyType);
};
