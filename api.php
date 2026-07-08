<?php
session_start();
require_once 'db.php';

header('Content-Type: application/json');

$action = isset($_GET['action']) ? $_GET['action'] : '';

// Helper to check user session
function getLoggedInUser() {
    return isset($_SESSION['current_user']) ? $_SESSION['current_user'] : null;
}

// Helper to get local date string YYYY-MM-DD
function getLocalDateString() {
    return date('Y-m-d');
}

// Reset limits if date changed
function checkDailyReset($conn, $user) {
    $today = getLocalDateString();
    if ($user['last_task_reset_date'] !== $today) {
        $stmt = $conn->prepare("UPDATE users SET funlink_completed_today = 0, nhapma_completed_today = 0, last_task_reset_date = ? WHERE id = ?");
        $stmt->bind_param('si', $today, $user['id']);
        $stmt->execute();
        $user['funlink_completed_today'] = 0;
        $user['nhapma_completed_today'] = 0;
        $user['last_task_reset_date'] = $today;
    }
    return $user;
}

switch ($action) {
    
    // --- 1. GET CURRENT STATE ---
    case 'get_state':
        $username = getLoggedInUser();
        if (!$username) {
            echo json_encode(["status" => "error", "message" => "Chưa đăng nhập!"]);
            exit;
        }

        $stmt = $conn->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->bind_param('s', $username);
        $stmt->execute();
        $userResult = $stmt->get_result();
        $user = $userResult->fetch_assoc();

        if (!$user) {
            echo json_encode(["status" => "error", "message" => "Tài khoản không tồn tại!"]);
            exit;
        }

        $user = checkDailyReset($conn, $user);

        // Fetch task history (last 20)
        $historyStmt = $conn->prepare("SELECT provider, coins_earned, completed_at FROM task_history WHERE username = ? ORDER BY completed_at DESC LIMIT 20");
        $historyStmt->bind_param('s', $username);
        $historyStmt->execute();
        $historyResult = $historyStmt->get_result();
        $taskHistory = [];
        while($row = $historyResult->fetch_assoc()) {
            $taskHistory[] = [
                "timestamp" => strtotime($row['completed_at']) * 1000,
                "provider" => $row['provider'],
                "coinsEarned" => $row['coins_earned']
            ];
        }

        // Fetch redeem history
        $redeemStmt = $conn->prepare("SELECT item_name, cost, key_code, redeemed_at FROM redeem_history WHERE username = ? ORDER BY redeemed_at DESC LIMIT 20");
        $redeemStmt->bind_param('s', $username);
        $redeemStmt->execute();
        $redeemResult = $redeemStmt->get_result();
        $redeemHistory = [];
        while($row = $redeemResult->fetch_assoc()) {
            $redeemHistory[] = [
                "timestamp" => strtotime($row['redeemed_at']) * 1000,
                "itemName" => $row['item_name'],
                "cost" => $row['cost'],
                "key" => $row['key_code']
            ];
        }

        // Key stocks count
        $stocks = [];
        foreach (['1h', '2h', '4h'] as $type) {
            $stockStmt = $conn->prepare("SELECT COUNT(*) as count FROM keys_inventory WHERE key_type = ? AND is_redeemed = 0");
            $stockStmt->bind_param('s', $type);
            $stockStmt->execute();
            $stocks[$type] = $stockStmt->get_result()->fetch_assoc()['count'];
        }

        echo json_encode([
            "status" => "success",
            "user" => [
                "username" => $user['username'],
                "coins" => (int)$user['coins'],
                "funlinkCompletedToday" => (int)$user['funlink_completed_today'],
                "nhapmaCompletedToday" => (int)$user['nhapma_completed_today'],
                "isAdmin" => (int)$user['is_admin'] === 1,
                "activeTask" => $user['active_task_token'] ? [
                    "provider" => $user['active_task_provider'],
                    "token" => $user['active_task_token']
                ] : null
            ],
            "taskHistory" => $taskHistory,
            "redeemHistory" => $redeemHistory,
            "stocks" => $stocks
        ]);
        break;

    // --- 2. AUTHENTICATION (LOGIN / REGISTER) ---
    case 'auth':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data) {
            echo json_encode(["status" => "error", "message" => "Dữ liệu không hợp lệ!"]);
            exit;
        }

        $username = trim($data['username']);
        $password = $data['password'];
        $mode = isset($data['mode']) ? $data['mode'] : 'login';

        if (empty($username) || empty($password)) {
            echo json_encode(["status" => "error", "message" => "Vui lòng nhập đầy đủ tài khoản và mật khẩu!"]);
            exit;
        }

        if ($mode === 'register') {
            // Check username exists
            $stmt = $conn->prepare("SELECT id FROM users WHERE username = ?");
            $stmt->bind_param('s', $username);
            $stmt->execute();
            if ($stmt->get_result()->num_rows > 0) {
                echo json_encode(["status" => "error", "message" => "Tên đăng nhập đã tồn tại!"]);
                exit;
            }

            // Create new user
            $is_admin = (strtolower($username) === 'admin') ? 1 : 0;
            $today = getLocalDateString();
            
            $regStmt = $conn->prepare("INSERT INTO users (username, password, coins, is_admin, last_task_reset_date) VALUES (?, ?, 0, ?, ?)");
            $regStmt->bind_param('ssis', $username, $password, $is_admin, $today);
            if ($regStmt->execute()) {
                echo json_encode(["status" => "success", "message" => "Đăng ký tài khoản thành công!"]);
            } else {
                echo json_encode(["status" => "error", "message" => "Không thể đăng ký tài khoản. Vui lòng thử lại!"]);
            }
        } else {
            // Login
            $stmt = $conn->prepare("SELECT * FROM users WHERE username = ?");
            $stmt->bind_param('s', $username);
            $stmt->execute();
            $result = $stmt->get_result();
            $user = $result->fetch_assoc();

            if (!$user) {
                echo json_encode(["status" => "error", "message" => "Tên đăng nhập hoặc mật khẩu không đúng!"]);
                exit;
            }

            $isPasswordCorrect = (strtolower($username) === 'admin')
                ? ($password === 'ducduy2202@' || $password === 'ducduyshop' || $password === $user['password'])
                : ($password === $user['password']);

            if (!$isPasswordCorrect) {
                echo json_encode(["status" => "error", "message" => "Tên đăng nhập hoặc mật khẩu không đúng!"]);
                exit;
            }

            $_SESSION['current_user'] = $user['username'];
            echo json_encode(["status" => "success", "message" => "Đăng nhập thành công!", "username" => $user['username']]);
        }
        break;

    // --- 3. LOGOUT ---
    case 'logout':
        unset($_SESSION['current_user']);
        echo json_encode(["status" => "success", "message" => "Đã đăng xuất!"]);
        break;

    // --- 4. START TASK (GENERATES SHORTLINK SECURELY SERVER-SIDE) ---
    case 'start_task':
        $username = getLoggedInUser();
        if (!$username) {
            echo json_encode(["status" => "error", "message" => "Chưa đăng nhập!"]);
            exit;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        $provider = isset($data['provider']) ? $data['provider'] : '';

        if ($provider !== 'Funlink' && $provider !== 'Nhập mã') {
            echo json_encode(["status" => "error", "message" => "Nhà cung cấp không hợp lệ!"]);
            exit;
        }

        // Fetch user
        $stmt = $conn->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->bind_param('s', $username);
        $stmt->execute();
        $user = $stmt->get_result()->fetch_assoc();
        $user = checkDailyReset($conn, $user);

        if ($provider === 'Funlink' && $user['funlink_completed_today'] >= LIMIT_FUNLINK) {
            echo json_encode(["status" => "error", "message" => "Đạt giới hạn lượt vượt link Funlink hôm nay!"]);
            exit;
        }
        if ($provider === 'Nhập mã' && $user['nhapma_completed_today'] >= LIMIT_NHAPMA) {
            echo json_encode(["status" => "error", "message" => "Đạt giới hạn lượt vượt link Nhập mã hôm nay!"]);
            exit;
        }

        if ($user['active_task_token']) {
            echo json_encode(["status" => "error", "message" => "Bạn đang có một nhiệm vụ khác đang chạy!"]);
            exit;
        }

        // Generate token
        $taskToken = bin2hex(random_bytes(16));
        
        // Determine protocol and host to form absolute callback URL
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || $_SERVER['SERVER_PORT'] == 443) ? "https://" : "http://";
        $domain = $_SERVER['HTTP_HOST'];
        $script_name = $_SERVER['SCRIPT_NAME'];
        $current_dir = dirname($script_name);
        $current_dir = str_replace('\\', '/', $current_dir);
        if ($current_dir === '/') $current_dir = '';
        
        $callbackBase = $protocol . $domain . $current_dir;
        $destinationUrl = $callbackBase . "/index.html?reward_token=" . $taskToken . "&user=" . urlencode($username);

        $apiUrl = '';
        if ($provider === 'Funlink') {
            $apiUrl = FUNLINK_API_URL . "?apikey=" . FUNLINK_API_KEY . "&url=" . urlencode($destinationUrl);
        } else {
            $alias = "TM" . strtoupper(substr($taskToken, 0, 8));
            $apiUrl = NHAPMA_API_URL . "?token=" . NHAPMA_API_KEY . "&url=" . urlencode($destinationUrl) . "&alias=" . $alias;
        }

        // Perform server-to-server request securely inside PHP (No CORS and uses Whitelisted Host IP!)
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $apiUrl);
        curl_setopt_RETURNTRANSFER, 1;
        curl_setopt_TIMEOUT, 15;
        curl_setopt_SSL_VERIFYPEER, 0; // Disable SSL checks for local or DNS setup errors
        $response = curl_exec($ch);
        curl_close($ch);

        if (!$response) {
            echo json_encode(["status" => "error", "message" => "Không thể kết nối đến server đối tác để tạo link. Vui lòng thử lại!"]);
            exit;
        }

        $resData = json_decode($response, true);
        $shortlinkUrl = '';

        if ($provider === 'Funlink') {
            if ($resData && isset($resData['id'])) {
                $shortlinkUrl = "https://funlink.io/" . $resData['id'];
            } else {
                echo json_encode(["status" => "error", "message" => "Funlink API không trả về ID link hợp lệ!"]);
                exit;
            }
        } else {
            if ($resData && isset($resData['status']) && $resData['status'] === 'success' && isset($resData['shortenedUrl'])) {
                $shortlinkUrl = str_replace('\\', '', $resData['shortenedUrl']);
            } else {
                echo json_encode(["status" => "error", "message" => isset($resData['message']) ? $resData['message'] : "Nhập Mã API bị lỗi!"]);
                exit;
            }
        }

        // Save active task to DB
        $now = time();
        $saveStmt = $conn->prepare("UPDATE users SET active_task_token = ?, active_task_provider = ?, active_task_started_at = ? WHERE id = ?");
        $saveStmt->bind_param('ssii', $taskToken, $provider, $now, $user['id']);
        $saveStmt->execute();

        echo json_encode([
            "status" => "success",
            "message" => "Tạo link nhiệm vụ thành công!",
            "shortlinkUrl" => $shortlinkUrl
        ]);
        break;

    // --- 5. CANCEL TASK ---
    case 'cancel_task':
        $username = getLoggedInUser();
        if (!$username) {
            echo json_encode(["status" => "error", "message" => "Chưa đăng nhập!"]);
            exit;
        }

        $stmt = $conn->prepare("UPDATE users SET active_task_token = NULL, active_task_provider = NULL, active_task_started_at = NULL WHERE username = ?");
        $stmt->bind_param('s', $username);
        $stmt->execute();

        echo json_encode(["status" => "success", "message" => "Đã hủy nhiệm vụ hiện tại."]);
        break;

    // --- 6. CLAIM TASK REWARD (CALLBACK TARGET) ---
    case 'claim_reward':
        $rewardToken = isset($_GET['reward_token']) ? $_GET['reward_token'] : '';
        $userParam = isset($_GET['user']) ? $_GET['user'] : '';

        if (empty($rewardToken) || empty($userParam)) {
            echo json_encode(["status" => "error", "message" => "Thiếu mã xác nhận!"]);
            exit;
        }

        // Fetch user
        $stmt = $conn->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->bind_param('s', $userParam);
        $stmt->execute();
        $user = $stmt->get_result()->fetch_assoc();

        if (!$user) {
            echo json_encode(["status" => "error", "message" => "Người dùng không tồn tại!"]);
            exit;
        }

        if ($user['active_task_token'] !== $rewardToken) {
            echo json_encode(["status" => "error", "message" => "Mã xác minh nhiệm vụ không hợp lệ hoặc đã được nhận!"]);
            exit;
        }

        // Anti-cheat time check (15 minutes max)
        $timeElapsed = time() - $user['active_task_started_at'];
        if ($timeElapsed > 15 * 60) {
            // Expired
            $conn->query("UPDATE users SET active_task_token = NULL, active_task_provider = NULL, active_task_started_at = NULL WHERE id = " . $user['id']);
            echo json_encode(["status" => "error", "message" => "Yêu cầu nhiệm vụ đã quá thời hạn 15 phút và bị hủy!"]);
            exit;
        }

        $provider = $user['active_task_provider'];
        $earned = 100;

        if ($provider === 'Funlink') {
            $completedToday = $user['funlink_completed_today'] + 1;
            if ($completedToday === 1) $earned = 200;
            else $earned = 100;
            
            $updStmt = $conn->prepare("UPDATE users SET coins = coins + ?, funlink_completed_today = ?, active_task_token = NULL, active_task_provider = NULL, active_task_started_at = NULL WHERE id = ?");
            $updStmt->bind_param('iii', $earned, $completedToday, $user['id']);
            $updStmt->execute();
        } else {
            $completedToday = $user['nhapma_completed_today'] + 1;
            $earned = 100;

            $updStmt = $conn->prepare("UPDATE users SET coins = coins + ?, nhapma_completed_today = ?, active_task_token = NULL, active_task_provider = NULL, active_task_started_at = NULL WHERE id = ?");
            $updStmt->bind_param('iii', $earned, $completedToday, $user['id']);
            $updStmt->execute();
        }

        // Record history
        $histStmt = $conn->prepare("INSERT INTO task_history (username, provider, coins_earned) VALUES (?, ?, ?)");
        $histStmt->bind_param('ssi', $userParam, $provider, $earned);
        $histStmt->execute();

        // Log in the user in session
        $_SESSION['current_user'] = $user['username'];

        echo json_encode([
            "status" => "success",
            "message" => "Nhiệm vụ hoàn thành! +$earned Xu đã được cộng.",
            "earned" => $earned,
            "username" => $user['username']
        ]);
        break;

    // --- 7. PURCHASE KEY ---
    case 'purchase_key':
        $username = getLoggedInUser();
        if (!$username) {
            echo json_encode(["status" => "error", "message" => "Chưa đăng nhập!"]);
            exit;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        $keyType = isset($data['keyType']) ? $data['keyType'] : '';
        $price = isset($data['price']) ? (int)$data['price'] : 0;
        $label = isset($data['label']) ? $data['label'] : '';

        if (!in_array($keyType, ['1h', '2h', '4h'])) {
            echo json_encode(["status" => "error", "message" => "Gói key không hợp lệ!"]);
            exit;
        }

        // Fetch user
        $stmt = $conn->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->bind_param('s', $username);
        $stmt->execute();
        $user = $stmt->get_result()->fetch_assoc();

        if ($user['coins'] < $price) {
            echo json_encode(["status" => "error", "message" => "Bạn không đủ xu để mua key này!"]);
            exit;
        }

        // Begin transaction to prevent race conditions
        $conn->begin_transaction();

        // Pop oldest key of selected type
        $keyStmt = $conn->prepare("SELECT id, key_code FROM keys_inventory WHERE key_type = ? AND is_redeemed = 0 ORDER BY id ASC LIMIT 1 FOR UPDATE");
        $keyStmt->bind_param('s', $keyType);
        $keyStmt->execute();
        $keyResult = $keyStmt->get_result();

        if ($keyResult->num_rows === 0) {
            $conn->rollback();
            echo json_encode(["status" => "error", "message" => "Gói key này đã hết hàng! Vui lòng liên hệ Admin."]);
            exit;
        }

        $keyRow = $keyResult->fetch_assoc();
        $keyId = $keyRow['id'];
        $keyCode = $keyRow['key_code'];

        // Mark key as redeemed
        $redeemTime = date('Y-m-d H:i:s');
        $updKey = $conn->prepare("UPDATE keys_inventory SET is_redeemed = 1, redeemed_by = ?, redeemed_at = ? WHERE id = ?");
        $updKey->bind_param('ssi', $username, $redeemTime, $keyId);
        $updKey->execute();

        // Deduct coins
        $newCoins = $user['coins'] - $price;
        $updUser = $conn->prepare("UPDATE users SET coins = ? WHERE id = ?");
        $updUser->bind_param('ii', $newCoins, $user['id']);
        $updUser->execute();

        // Insert into redeem history
        $insRedeem = $conn->prepare("INSERT INTO redeem_history (username, item_name, cost, key_code) VALUES (?, ?, ?, ?)");
        $insRedeem->bind_param('ssis', $username, $label, $price, $keyCode);
        $insRedeem->execute();

        $conn->commit();

        echo json_encode([
            "status" => "success",
            "message" => "Đổi thưởng thành công!",
            "key" => $keyCode,
            "newCoins" => $newCoins
        ]);
        break;

    default:
        echo json_encode(["status" => "error", "message" => "Hành động không hợp lệ!"]);
        break;
}
?>
