<?php
// Configuration File for Key Shop System (PHP + MySQL)

// 1. MySQL Database Configuration (InfinityFree)
define('DB_HOST', 'sql211.infinityfree.com');
define('DB_USER', 'if0_42281959');
define('DB_PASS', 'hcUqM4qpOk4V');
define('DB_NAME', 'if0_42281959_Getkey');

// 2. FUNLINK & NHAPMA Configurations
define('FUNLINK_API_KEY', '65d4f6c0bb16481fbe5f6b69f9922bcb');
define('FUNLINK_API_URL', 'https://private.funlink.io/api/cong-khai/tao-lien-ket');

define('NHAPMA_API_KEY', '00481ff4-378e-4ef7-a996-209e35386123');
define('NHAPMA_API_URL', 'https://service.nhapma.com/api');

// Limits
define('LIMIT_FUNLINK', 2);
define('LIMIT_NHAPMA', 4);
?>
