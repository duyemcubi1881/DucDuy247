<?php
require_once 'config.php';

// Enable error reporting for debugging database issues
mysqli_report(MYSQLI_REPORT_OFF);

$conn = @new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);

if ($conn->connect_error) {
    header('Content-Type: application/json');
    die(json_encode(["status" => "error", "message" => "Database connection failed! Vui lòng kiểm tra cấu hình trong config.php."]));
}

$conn->set_charset("utf8mb4");

// Auto create tables if they do not exist
$tables = [
    "CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        coins INT DEFAULT 0,
        funlink_completed_today INT DEFAULT 0,
        nhapma_completed_today INT DEFAULT 0,
        last_task_reset_date DATE,
        active_task_token VARCHAR(100),
        active_task_provider VARCHAR(50),
        active_task_started_at BIGINT,
        is_admin INT DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

    "CREATE TABLE IF NOT EXISTS keys_inventory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        key_code VARCHAR(100) UNIQUE NOT NULL,
        key_type VARCHAR(20) NOT NULL,
        is_redeemed INT DEFAULT 0,
        redeemed_by VARCHAR(50),
        redeemed_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

    "CREATE TABLE IF NOT EXISTS task_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        coins_earned INT NOT NULL,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

    "CREATE TABLE IF NOT EXISTS redeem_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        item_name VARCHAR(100) NOT NULL,
        cost INT NOT NULL,
        key_code VARCHAR(100) NOT NULL,
        redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
];

foreach ($tables as $sql) {
    $conn->query($sql);
}

// Auto seed default admin if missing
$check = $conn->query("SELECT id FROM users WHERE username = 'admin'");
if ($check && $check->num_rows === 0) {
    $stmt = $conn->prepare("INSERT INTO users (username, password, is_admin, coins, last_task_reset_date) VALUES ('admin', 'ducduy2202@', 1, 0, ?)");
    $today = date('Y-m-d');
    $stmt->bind_param('s', $today);
    $stmt->execute();
}
?>
