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
            const products = data.products || [];
            if (products.length > 0 && (!selectedKeyType || !products.some(p => p.key_type === selectedKeyType))) {
                selectedKeyType = products[0].key_type;
                // Refetch to load correct keys list
                return refreshAdminState();
            }
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
    if (app) {
        app.classList.remove('visible');
        app.style.display = 'none';
    }
    if (auth) {
        auth.classList.remove('hidden');
        auth.style.display = 'flex';
    }
}

function hideLoginOverlay() {
    const auth = document.getElementById('adminAuthWrapper');
    const app = document.getElementById('adminAppContainer');
    if (auth) {
        auth.classList.add('hidden');
        auth.style.display = 'none';
    }
    if (app) {
        app.classList.add('visible');
        app.style.display = 'flex';
    }
}

// Update Admin Control stats and lists
function updateAdminDashboard(data) {
    const stats = data.stats;

    // Update statistics cards
    const totalUsersEl = document.getElementById('statTotalUsers');
    if (totalUsersEl) totalUsersEl.innerText = stats.totalUsers;

    const totalCoinsEl = document.getElementById('statTotalCoins');
    if (totalCoinsEl) totalCoinsEl.innerText = stats.totalCoins;

    // Render keys statistics grid dynamically
    renderKeysStatGrid(data.products, data.stocks);

    // Populate nạp key / xem key dropdowns dynamically
    populateKeyTypeDropdowns(data.products);

    // Render users list table
    renderUsersTable(data.users);

    // Render keys inventory table
    renderKeysTable(data.keysList);

    // Render products catalog dynamically
    renderAdminProducts(data.products);
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
                ${user.createdIp ? `<div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">IP: ${user.createdIp}</div>` : ''}
            </td>
            <td><code style="font-family: monospace; font-size: 13px; font-weight: 600; color: var(--text-main);">${user.password}</code></td>
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
    const navItems = document.querySelectorAll('.sidebar .nav-item');
    navItems.forEach(item => {
        if (item.getAttribute('data-tab') === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Content panels
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(panel => {
        if (panel.id === tabId) {
            panel.classList.add('active');
        } else {
            panel.classList.remove('active');
        }
    });

    // Update headers dynamically
    const headerTitle = document.getElementById('headerTitle');
    const headerSubtitle = document.getElementById('headerSubtitle');
    if (headerTitle && headerSubtitle) {
        if (tabId === 'tab-users') {
            headerTitle.textContent = 'Quản Lý Thành Viên';
            headerSubtitle.textContent = 'Xem danh sách, cộng xu, reset nhiệm vụ hoặc xóa tài khoản';
        } else if (tabId === 'tab-keys') {
            headerTitle.textContent = 'Quản Lý Kho Key';
            headerSubtitle.textContent = 'Nạp thêm key hoặc xóa key hiện có của từng sản phẩm';
        } else if (tabId === 'tab-products') {
            headerTitle.textContent = 'Quản Lý Sản Phẩm';
            headerSubtitle.textContent = 'Thêm, sửa, xóa sản phẩm và liên kết tải xuống các ứng dụng';
        }
    }
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

// Check duplicate IP accounts logic
async function checkDuplicateIps() {
    try {
        const res = await fetch('/api/admin/duplicate-ips', {
            headers: getAdminHeaders()
        });
        const data = await res.json();

        if (data.status === 'success') {
            const tbody = document.getElementById('dupIpTableBody');
            if (!tbody) return;
            tbody.innerHTML = '';

            const duplicates = data.duplicates;
            if (duplicates.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted); padding: 20px;">Không có tài khoản nào trùng IP.</td></tr>`;
            } else {
                duplicates.forEach(user => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${user.username}</strong></td>
                        <td><code style="font-family: monospace; font-size: 13px; font-weight: 700; color: #3b82f6;">${user.created_ip}</code></td>
                        <td>${user.coins} Xu</td>
                        <td>
                            ${user.username !== 'admin' ? `<button class="action-btn btn-delete" onclick="deleteUserAccountFromDup('${user.username}')" style="padding: 4px 10px; font-size: 11px;">❌ Xóa</button>` : ''}
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            // Show duplicate modal overlay
            const modal = document.getElementById('dupIpModal');
            if (modal) {
                modal.classList.add('show');
                modal.style.display = 'flex';
            }
        } else {
            showAdminToast(data.message, 'error');
        }
    } catch (err) {
        console.error(err);
        showAdminToast('Lỗi khi tải danh sách trùng IP!', 'error');
    }
}

function closeDupIpModal() {
    const modal = document.getElementById('dupIpModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

async function deleteUserAccountFromDup(username) {
    if (!confirm(`Bạn có chắc chắn muốn XÓA vĩnh viễn tài khoản [${username}] trùng IP?`)) return;

    try {
        const res = await fetch('/api/admin/delete-user', {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ username })
        });
        const data = await res.json();

        if (data.status === 'success') {
            showAdminToast(data.message, 'success');
            // Refresh parent state
            refreshAdminState();
            // Refresh duplicate modal list
            checkDuplicateIps();
        } else {
            showAdminToast(data.message, 'error');
        }
    } catch (err) {
        console.error(err);
        showAdminToast('Không thể xóa tài khoản trùng IP!', 'error');
    }
}

// --- PRODUCT MANAGEMENT EVENT HANDLERS & HELPERS ---

function populateKeyTypeDropdowns(products) {
    const restockSelect = document.getElementById('restockKeyType');
    const viewSelect = document.getElementById('viewKeyTypeSelect');
    
    if (restockSelect) {
        const currentVal = restockSelect.value;
        restockSelect.innerHTML = '';
        products.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.key_type;
            opt.textContent = `${p.name} (${p.price} Xu)`;
            restockSelect.appendChild(opt);
        });
        if (currentVal && Array.from(restockSelect.options).some(o => o.value === currentVal)) {
            restockSelect.value = currentVal;
        }
    }

    if (viewSelect) {
        const currentVal = viewSelect.value;
        viewSelect.innerHTML = '';
        products.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.key_type;
            opt.textContent = `Xem Gói ${p.name}`;
            viewSelect.appendChild(opt);
        });
        if (currentVal && Array.from(viewSelect.options).some(o => o.value === currentVal)) {
            viewSelect.value = currentVal;
        } else if (products.length > 0) {
            viewSelect.value = products[0].key_type;
            selectedKeyType = products[0].key_type;
        }
    }
}

function renderKeysStatGrid(products, stocks) {
    const grid = document.getElementById('keysStatGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.innerHTML = `
            <div class="stat-card-label">${p.name} (${p.price} &nbsp;xu)</div>
            <div class="stat-card-value">${stocks[p.key_type] || 0}</div>
        `;
        grid.appendChild(card);
    });
}

function renderAdminProducts(products) {
    const container = document.getElementById('adminProductsContainer');
    if (!container) return;
    container.innerHTML = '';

    // Cache products globally to avoid complex quote/newline issues in onclick inline attributes
    window.adminProducts = products;

    if (products.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-muted); font-weight: 700;">
                Chưa có sản phẩm nào được tạo.
            </div>
        `;
        return;
    }

    products.forEach(p => {
        const row = document.createElement('div');
        row.className = 'product-item-row';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.padding = '12px';
        row.style.border = '1px solid var(--border-color)';
        row.style.borderRadius = 'var(--border-radius-md)';
        row.style.background = 'var(--bg-input)';
        row.style.gap = '15px';
        row.style.marginBottom = '10px';

        row.innerHTML = `
            <img src="${p.image_url || 'menu_banner.png'}" style="width: 50px; height: 50px; object-fit: cover; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);" onerror="this.src='menu_banner.png';" />
            <div style="flex: 1; text-align: left;">
                <div style="font-weight: 700; color: var(--text-main); font-size: 14px;">${p.name}</div>
                <div style="font-size: 12px; color: var(--text-muted); font-weight: 600; margin-top: 3px;">
                    Mã: <code style="background: rgba(0,0,0,0.05); padding: 2px 4px; border-radius: 4px;">${p.key_type}</code> | Giá: <span style="color: #f59e0b; font-weight: 700;">${p.price} xu</span>
                </div>
                ${p.download_url ? `<div style="font-size: 11px; color: #10b981; font-weight: 600; margin-top: 3px;">📥 Có link tải: <a href="${p.download_url}" target="_blank" style="color:#2563eb; text-decoration:underline;">Tải thử</a></div>` : ''}
            </div>
            <div style="display: flex; gap: 6px;">
                <button class="action-btn btn-reset" onclick="editProduct(${p.id})" style="padding: 6px 12px; font-size: 12px;">Sửa</button>
                <button class="action-btn btn-delete" onclick="deleteProduct(${p.id})" style="padding: 6px 12px; font-size: 12px;">Xóa</button>
            </div>
        `;
        container.appendChild(row);
    });
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

async function saveProduct() {
    const id = document.getElementById('editProductId').value;
    const name = document.getElementById('prodName').value.trim();
    const keyType = document.getElementById('prodKeyType').value.trim();
    const price = parseInt(document.getElementById('prodPrice').value, 10);
    const imageUrl = document.getElementById('prodImage').value.trim();
    const downloadUrl = document.getElementById('prodDownload').value.trim();
    const description = document.getElementById('prodDesc').value.trim();

    if (!name || !keyType || isNaN(price)) {
        showAdminToast('Vui lòng điền Tên, Mã key_type và Giá sản phẩm!', 'error');
        return;
    }

    try {
        const payload = {
            keyType,
            name,
            description,
            price,
            imageUrl: imageUrl || 'menu_banner.png',
            downloadUrl
        };
        if (id) payload.id = parseInt(id, 10);

        const res = await fetch('/api/admin/products', {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.status === 'success') {
            showAdminToast(data.message, 'success');
            cancelProductEdit();
            refreshAdminState();
        } else {
            showAdminToast(data.message, 'error');
        }
    } catch (err) {
        console.error(err);
        showAdminToast('Lỗi hệ thống khi lưu sản phẩm!', 'error');
    }
}

function editProduct(id) {
    const products = window.adminProducts || [];
    const p = products.find(prod => prod.id === id);
    if (!p) return;

    document.getElementById('editProductId').value = p.id;
    document.getElementById('prodName').value = p.name;
    document.getElementById('prodKeyType').value = p.key_type;
    document.getElementById('prodPrice').value = p.price;
    document.getElementById('prodImage').value = p.image_url === 'menu_banner.png' ? '' : p.image_url;
    document.getElementById('prodDownload').value = p.download_url || '';
    document.getElementById('prodDesc').value = p.description || '';

    document.getElementById('productFormTitle').textContent = '🛍️ Sửa Sản Phẩm';
    document.getElementById('btnCancelEdit').style.display = 'block';
    document.getElementById('btnSaveProduct').textContent = 'Cập Nhật';
}

function cancelProductEdit() {
    document.getElementById('editProductId').value = '';
    document.getElementById('prodName').value = '';
    document.getElementById('prodKeyType').value = '';
    document.getElementById('prodPrice').value = '';
    document.getElementById('prodImage').value = '';
    document.getElementById('prodDownload').value = '';
    document.getElementById('prodDesc').value = '';

    document.getElementById('productFormTitle').textContent = '🛍️ Thêm Sản Phẩm Mới';
    document.getElementById('btnCancelEdit').style.display = 'none';
    document.getElementById('btnSaveProduct').textContent = 'Lưu Sản Phẩm';
}

async function deleteProduct(id) {
    const products = window.adminProducts || [];
    const p = products.find(prod => prod.id === id);
    if (!p) return;

    const keyType = p.key_type;
    if (!confirm(`Bạn có chắc chắn muốn xóa sản phẩm [${keyType.toUpperCase()}]? Các key tương ứng trong kho sẽ KHÔNG bị xóa nhưng không thể bán được nữa trừ khi bạn tạo lại sản phẩm trùng mã key_type.`)) return;

    try {
        const res = await fetch('/api/admin/delete-product', {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ id, keyType })
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
        showAdminToast('Lỗi khi xóa sản phẩm!', 'error');
    }
}

// Bind methods globally
window.checkDuplicateIps = checkDuplicateIps;
window.closeDupIpModal = closeDupIpModal;
window.deleteUserAccountFromDup = deleteUserAccountFromDup;
window.saveProduct = saveProduct;
window.editProduct = editProduct;
window.cancelProductEdit = cancelProductEdit;
window.deleteProduct = deleteProduct;
