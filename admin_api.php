<?php
session_start();
require_once 'db.php';

header('Content-Type: application/json');

$action = isset($_GET['action']) ? $_GET['action'] : '';

// Helper to check admin authentication
function isAdminSessionActive() {
    return isset($_SESSION['admin_authenticated']) && $_SESSION['admin_authenticated'] === true;
}

// Redirect if not authenticated as admin
if ($action !== 'login' && !isAdminSessionActive()) {
    echo json_encode(["status" => "error", "message" => "Từ chối truy cập! Vui lòng đăng nhập quyền Admin."]);
    exit;
}

switch ($action) {
    
    // --- 1. ADMIN LOGIN ---
    case 'login':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data) {
            echo json_encode(["status" => "error", "message" => "Dữ liệu không hợp lệ!"]);
            exit;
        }

        $username = trim($data['username']);
        $password = $data['password'];

        if (strtolower($username) !== 'admin') {
            echo json_encode(["status" => "error", "message" => "Tài khoản không có quyền truy cập Admin!"]);
            exit;
        }

        // Fetch admin account
        $stmt = $conn->prepare("SELECT * FROM users WHERE username = 'admin'");
        $stmt->execute();
        $user = $stmt->get_result()->fetch_assoc();

        $isPasswordCorrect = ($password === 'ducduy2202@' || $password === 'ducduyshop' || ($user && $password === $user['password']));

        if (!$isPasswordCorrect) {
            echo json_encode(["status" => "error", "message" => "Mật khẩu Admin không chính xác!"]);
            exit;
        }

        $_SESSION['admin_authenticated'] = true;
        echo json_encode(["status" => "success", "message" => "Đăng nhập quyền Admin thành công!"]);
        break;

    // --- 2. ADMIN LOGOUT ---
    case 'logout':
        unset($_SESSION['admin_authenticated']);
        echo json_encode(["status" => "success", "message" => "Đã đăng xuất khỏi Admin."]);
        break;

    // --- 3. GET STATE (USERS, KEY INVENTORIES, STATS) ---
    case 'get_state':
        // Total stats
        $totalUsersRes = $conn->query("SELECT COUNT(*) as count FROM users");
        $totalUsers = $totalUsersRes->fetch_assoc()['count'];

        $totalCoinsRes = $conn->query("SELECT SUM(coins) as sum FROM users");
        $totalCoins = $totalCoinsRes->fetch_assoc()['sum'];
        if (!$totalCoins) $totalCoins = 0;

        // Stocks counts
        $stockCounts = [];
        foreach (['1h', '2h', '4h'] as $type) {
            $stockStmt = $conn->prepare("SELECT COUNT(*) as count FROM keys_inventory WHERE key_type = ? AND is_redeemed = 0");
            $stockStmt->bind_param('s', $type);
            $stockStmt->execute();
            $stockCounts[$type] = $stockStmt->get_result()->fetch_assoc()['count'];
        }

        // Fetch users list
        $usersRes = $conn->query("SELECT username, password, coins, funlink_completed_today, nhapma_completed_today, last_task_reset_date FROM users ORDER BY id ASC");
        $users = [];
        while($row = $usersRes->fetch_assoc()) {
            $users[] = [
                "username" => $row['username'],
                "password" => $row['password'],
                "coins" => (int)$row['coins'],
                "funlinkCompletedToday" => (int)$row['funlink_completed_today'],
                "nhapmaCompletedToday" => (int)$row['nhapma_completed_today'],
                "lastTaskResetDate" => $row['last_task_reset_date']
            ];
        }

        // Fetch keys list (optional type parameter)
        $keyType = isset($_GET['key_type']) ? $_GET['key_type'] : '4h';
        $keysStmt = $conn->prepare("SELECT id, key_code FROM keys_inventory WHERE key_type = ? AND is_redeemed = 0 ORDER BY id ASC");
        $keysStmt->bind_param('s', $keyType);
        $keysStmt->execute();
        $keysResult = $keysStmt->get_result();
        $keysList = [];
        while($row = $keysResult->fetch_assoc()) {
            $keysList[] = [
                "id" => $row['id'],
                "key" => $row['key_code']
            ];
        }

        echo json_encode([
            "status" => "success",
            "stats" => [
                "totalUsers" => $totalUsers,
                "totalCoins" => $totalCoins,
                "stock1h" => $stockCounts['1h'],
                "stock2h" => $stockCounts['2h'],
                "stock4h" => $stockCounts['4h']
            ],
            "users" => $users,
            "keysList" => $keysList
        ]);
        break;

    // --- 4. ADJUST USER COINS ---
    case 'add_coins':
        $data = json_decode(file_get_contents('php://input'), true);
        $targetUser = isset($data['username']) ? trim($data['username']) : '';
        $amount = isset($data['amount']) ? (int)$data['amount'] : 0;

        $stmt = $conn->prepare("UPDATE users SET coins = GREATEST(0, coins + ?) WHERE username = ?");
        $stmt->bind_param('is', $amount, $targetUser);
        
        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "message" => "Đã điều chỉnh xu thành công!"]);
        } else {
            echo json_encode(["status" => "error", "message" => "Lỗi thực thi dữ liệu!"]);
        }
        break;

    // --- 5. RESET USER LIMITS ---
    case 'reset_limit':
        $data = json_decode(file_get_contents('php://input'), true);
        $targetUser = isset($data['username']) ? trim($data['username']) : '';

        $stmt = $conn->prepare("UPDATE users SET funlink_completed_today = 0, nhapma_completed_today = 0, active_task_token = NULL, active_task_provider = NULL, active_task_started_at = NULL WHERE username = ?");
        $stmt->bind_param('s', $targetUser);
        
        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "message" => "Đã reset giới hạn lượt vượt link thành công!"]);
        } else {
            echo json_encode(["status" => "error", "message" => "Lỗi thực thi dữ liệu!"]);
        }
        break;

    // --- 6. DELETE USER ---
    case 'delete_user':
        $data = json_decode(file_get_contents('php://input'), true);
        $targetUser = isset($data['username']) ? trim($data['username']) : '';

        if (strtolower($targetUser) === 'admin') {
            echo json_encode(["status" => "error", "message" => "Không thể xóa tài khoản Admin tối cao!"]);
            exit;
        }

        $stmt = $conn->prepare("DELETE FROM users WHERE username = ?");
        $stmt->bind_param('s', $targetUser);
        
        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "message" => "Đã xóa tài khoản $targetUser khỏi hệ thống!"]);
        } else {
            echo json_encode(["status" => "error", "message" => "Lỗi thực thi dữ liệu!"]);
        }
        break;

    // --- 7. RESTOCK KEYS ---
    case 'restock_keys':
        $data = json_decode(file_get_contents('php://input'), true);
        $keyType = isset($data['keyType']) ? $data['keyType'] : '';
        $keys = isset($data['keys']) ? $data['keys'] : [];

        if (!in_array($keyType, ['1h', '2h', '4h']) || empty($keys)) {
            echo json_encode(["status" => "error", "message" => "Dữ liệu nạp key không hợp lệ!"]);
            exit;
        }

        $insertedCount = 0;
        $stmt = $conn->prepare("INSERT IGNORE INTO keys_inventory (key_code, key_type) VALUES (?, ?)");
        
        foreach ($keys as $keyCode) {
            $keyCode = trim($keyCode);
            if (!empty($keyCode)) {
                $stmt->bind_param('ss', $keyCode, $keyType);
                if ($stmt->execute() && $stmt->affected_rows > 0) {
                    $insertedCount++;
                }
            }
        }

        echo json_encode(["status" => "success", "message" => "Nạp thành công $insertedCount key mới vào kho $keyType!"]);
        break;

    // --- 8. DELETE SINGLE KEY ---
    case 'delete_key':
        $data = json_decode(file_get_contents('php://input'), true);
        $keyId = isset($data['id']) ? (int)$data['id'] : 0;

        $stmt = $conn->prepare("DELETE FROM keys_inventory WHERE id = ?");
        $stmt->bind_param('i', $keyId);
        
        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "message" => "Đã xóa key thành công!"]);
        } else {
            echo json_encode(["status" => "error", "message" => "Không thể xóa key!"]);
        }
        break;

    // --- 9. CLEAR ALL KEYS OF TYPE ---
    case 'clear_keys':
        $data = json_decode(file_get_contents('php://input'), true);
        $keyType = isset($data['keyType']) ? $data['keyType'] : '';

        if (!in_array($keyType, ['1h', '2h', '4h'])) {
            echo json_encode(["status" => "error", "message" => "Gói key không hợp lệ!"]);
            exit;
        }

        $stmt = $conn->prepare("DELETE FROM keys_inventory WHERE key_type = ? AND is_redeemed = 0");
        $stmt->bind_param('s', $keyType);
        
        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "message" => "Đã dọn dẹp trống kho key gói $keyType!"]);
        } else {
            echo json_encode(["status" => "error", "message" => "Lỗi thực thi dữ liệu!"]);
        }
        break;

    default:
        echo json_encode(["status" => "error", "message" => "Hành động admin không hợp lệ!"]);
        break;
}
?>
