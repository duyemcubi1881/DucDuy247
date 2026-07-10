const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const http = require('https');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration limits and tokens
const FUNLINK_TOKEN = '65d4f6c0bb16481fbe5f6b69f9922bcb';
const FUNLINK_API_URL = 'https://private.funlink.io/api/cong-khai/tao-lien-ket';

const NHAPMA_TOKEN = '00481ff4-378e-4ef7-a996-209e35386123';
const NHAPMA_API_URL = 'https://service.nhapma.com/api';

const LIMIT_FUNLINK = 2;
const LIMIT_NHAPMA = 4;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Server Session Mock (Simple In-Memory Session for static clients)
// In production, you can use express-session with connect-pg-simple, but for simplicity
// we will track logged-in users via authorization headers or cookies.
// Here we will use simple express cookie-like session tokens or simple in-memory session mapping.
const sessions = {}; // token -> username
const adminSessions = {}; // token -> isAdmin

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

let connectionString = process.env.DATABASE_URL;
if (connectionString) {
    try {
        const parsedUrl = new URL(connectionString);
        parsedUrl.searchParams.delete('channel_binding');
        connectionString = parsedUrl.toString();
    } catch (e) {
        console.warn("Lỗi phân tích DATABASE_URL:", e);
    }
}

// Database pool connection
const pool = new Pool({
    connectionString: connectionString,
    ssl: connectionString ? { rejectUnauthorized: false } : false,
    max: 30, // Tăng giới hạn số kết nối song song trong pool lên 30 để phục vụ nhiều người dùng
    idleTimeoutMillis: 30000, // Đóng các kết nối nhàn rỗi sau 30 giây để giải phóng tài nguyên
    connectionTimeoutMillis: 5000 // Tự động ngắt kết nối nếu quá 5 giây không phản hồi (tránh treo request)
});

pool.on('error', (err) => {
    console.error('Lỗi Pool Database ngoài ý muốn:', err.message);
});

// Initialize database schema
async function initDb() {
    if (!process.env.DATABASE_URL) {
        console.error("CẢNH BÁO: Biến môi trường DATABASE_URL chưa được cấu hình!");
        return;
    }
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(100) NOT NULL,
                coins INT DEFAULT 0,
                funlink_completed_today INT DEFAULT 0,
                nhapma_completed_today INT DEFAULT 0,
                last_task_reset_date VARCHAR(15),
                active_task_token VARCHAR(100),
                active_task_provider VARCHAR(50),
                active_task_started_at BIGINT,
                active_task_url TEXT,
                is_admin INT DEFAULT 0,
                created_ip VARCHAR(100)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS keys_inventory (
                id SERIAL PRIMARY KEY,
                key_code VARCHAR(100) UNIQUE NOT NULL,
                key_type VARCHAR(20) NOT NULL,
                is_redeemed INT DEFAULT 0,
                redeemed_by VARCHAR(50),
                redeemed_at TIMESTAMP DEFAULT NULL
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS task_history (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                provider VARCHAR(50) NOT NULL,
                coins_earned INT NOT NULL,
                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS redeem_history (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                item_name VARCHAR(100) NOT NULL,
                cost INT NOT NULL,
                key_code VARCHAR(100) NOT NULL,
                redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                key_type VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                price INT NOT NULL,
                image_url TEXT,
                download_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Alter tables to add columns if they don't exist (safety migrate)
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS funlink_completed_today INT DEFAULT 0;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS nhapma_completed_today INT DEFAULT 0;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS last_task_reset_date VARCHAR(15);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS active_task_token VARCHAR(100);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS active_task_provider VARCHAR(50);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS active_task_started_at BIGINT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin INT DEFAULT 0;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS created_ip VARCHAR(100);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS active_task_url TEXT;
            ALTER TABLE keys_inventory ALTER COLUMN key_type TYPE VARCHAR(50);
        `);

        // Check if default admin account exists
        const adminRes = await pool.query("SELECT id FROM users WHERE username = 'admin'");
        if (adminRes.rowCount === 0) {
            const today = new Date().toISOString().slice(0, 10);
            await pool.query(
                "INSERT INTO users (username, password, is_admin, coins, last_task_reset_date) VALUES ($1, $2, 1, 0, $3)",
                ['admin', 'ducduy2202@', today]
            );
            console.log("Default admin seeded successfully.");
        }

        // Check if products table has any products, if not, seed with defaults
        const prodCountRes = await pool.query("SELECT COUNT(*) as count FROM products");
        if (parseInt(prodCountRes.rows[0].count, 10) === 0) {
            await pool.query(`
                INSERT INTO products (key_type, name, description, price, image_url, download_url) VALUES
                ('1h', 'Key Imgui Menu 1 Giờ', '✅ Fix văng game\n✅ Sửa Esp, Fix Nháy\n✅ Tăng khả năng Anti-Ban', 100, 'menu_banner.png', 'https://www.mediafire.com/file/v2gt95n5xb7ssrd/Imgui_1.1.rar/file'),
                ('2h', 'Key Imgui Menu 2 Giờ', '✅ Fix văng game\n✅ Sửa Esp, Fix Nháy\n✅ Tăng khả năng Anti-Ban', 150, 'menu_banner.png', 'https://www.mediafire.com/file/v2gt95n5xb7ssrd/Imgui_1.1.rar/file'),
                ('4h', 'Key Imgui Menu 4 Giờ', '✅ Fix văng game\n✅ Sửa Esp, Fix Nháy\n✅ Tăng khả năng Anti-Ban', 200, 'menu_banner.png', 'https://www.mediafire.com/file/v2gt95n5xb7ssrd/Imgui_1.1.rar/file')
            `);
            console.log("Seeded default products into database.");
        }
        console.log("Database initialized successfully.");
    } catch (err) {
        console.error("Error initializing database:", err);
    }
}

initDb();

// Helper to get local date string YYYY-MM-DD
function getLocalDateString() {
    return new Date().toISOString().slice(0, 10);
}

// Reset daily task limits if date changed
async function checkDailyReset(user) {
    const today = getLocalDateString();
    if (user.last_task_reset_date !== today) {
        await pool.query(
            "UPDATE users SET funlink_completed_today = 0, nhapma_completed_today = 0, last_task_reset_date = $1 WHERE id = $2",
            [today, user.id]
        );
        user.funlink_completed_today = 0;
        user.nhapma_completed_today = 0;
        user.last_task_reset_date = today;
    }
    return user;
}

// Helper to make HTTPS requests (Node curl equivalent)
function makeHttpRequest(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve(data); });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

// --- 0. TEST IP ENDPOINT (FOR ADMIN TO WHITELIST ON FUNLINK) ---
app.get('/api/test-ip', async (req, res) => {
    let ipv4 = 'Không thể lấy (hoặc không hỗ trợ)';
    let ipv6 = 'Không thể lấy (hoặc không hỗ trợ)';
    
    try {
        const v4Data = await makeHttpRequest('https://api.ipify.org?format=json');
        ipv4 = JSON.parse(v4Data).ip;
    } catch (e) {
        console.warn("Lỗi lấy IPv4:", e.message);
    }
    
    try {
        const v6Data = await makeHttpRequest('https://api6.ipify.org?format=json');
        ipv6 = JSON.parse(v6Data).ip;
    } catch (e) {
        console.warn("Lỗi lấy IPv6:", e.message);
    }

    res.send(`
        <div style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #0f172a; color: #fff; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <h1 style="color: #38bdf8; font-size: 32px; margin-bottom: 10px;">Render Outbound Server IP</h1>
            <p style="font-size: 18px; color: #94a3b8; max-width: 600px; margin-bottom: 30px;">Copy cả 2 địa chỉ IP bên dưới gửi cho Admin Funlink để Whitelist:</p>
            
            <div style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center; margin-bottom: 30px;">
                <div style="background: #1e293b; padding: 25px; border-radius: 12px; border: 1px solid #334155; width: 300px;">
                    <h3 style="color: #3b82f6; margin-top: 0;">IPv4 Address</h3>
                    <div style="font-size: 20px; font-family: monospace; color: #10b981; font-weight: bold; margin: 15px 0; word-break: break-all;">
                        ${ipv4}
                    </div>
                </div>
                <div style="background: #1e293b; padding: 25px; border-radius: 12px; border: 1px solid #334155; width: 300px;">
                    <h3 style="color: #a855f7; margin-top: 0;">IPv6 Address</h3>
                    <div style="font-size: 20px; font-family: monospace; color: #10b981; font-weight: bold; margin: 15px 0; word-break: break-all;">
                        ${ipv6}
                    </div>
                </div>
            </div>
            
            <p style="color: #64748b;">(Tên miền của bạn: ${req.headers.host})</p>
        </div>
    `);
});

// --- 1. AUTH MIDDLEWARE ---
function getSessionUser(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        return sessions[token] || null;
    }
    return null;
}

function getSessionAdmin(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        return adminSessions[token] || false;
    }
    return false;
}

// --- 2. GET CURRENT USER STATE ---
app.get('/api/state', async (req, res) => {
    if (!process.env.DATABASE_URL) {
        return res.status(500).json({ status: "error", message: "Database chưa được cấu hình! Vui lòng thiết lập biến DATABASE_URL trên Render." });
    }
    const username = getSessionUser(req);
    if (!username) {
        return res.status(401).json({ status: "error", message: "Chưa đăng nhập!" });
    }

    try {
        const userRes = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
        let user = userRes.rows[0];

        if (!user) {
            return res.status(404).json({ status: "error", message: "Tài khoản không tồn tại!" });
        }

        user = await checkDailyReset(user);

        // Fetch task history (last 20)
        const histRes = await pool.query(
            "SELECT provider, coins_earned, completed_at FROM task_history WHERE username = $1 ORDER BY completed_at DESC LIMIT 20",
            [username]
        );
        const taskHistory = histRes.rows.map(row => ({
            timestamp: new Date(row.completed_at).getTime(),
            provider: row.provider,
            coinsEarned: row.coins_earned
        }));

        // Fetch redeem history
        const redeemRes = await pool.query(
            "SELECT item_name, cost, key_code, redeemed_at FROM redeem_history WHERE username = $1 ORDER BY redeemed_at DESC LIMIT 20",
            [username]
        );
        const redeemHistory = redeemRes.rows.map(row => ({
            timestamp: new Date(row.redeemed_at).getTime(),
            itemName: row.item_name,
            cost: row.cost,
            key: row.key_code
        }));

        // Fetch all products
        const productsRes = await pool.query("SELECT * FROM products ORDER BY id ASC");
        const products = productsRes.rows;

        // Key stocks counts
        const stocks = {};
        const purchased = {};
        
        // Pre-initialize to 0
        products.forEach(p => {
            stocks[p.key_type] = 0;
            purchased[p.key_type] = 0;
        });

        const stocksRes = await pool.query("SELECT key_type, COUNT(*) as count FROM keys_inventory WHERE is_redeemed = 0 GROUP BY key_type");
        stocksRes.rows.forEach(row => {
            stocks[row.key_type] = parseInt(row.count, 10);
        });

        const purchasedRes = await pool.query("SELECT key_type, COUNT(*) as count FROM keys_inventory WHERE is_redeemed = 1 GROUP BY key_type");
        purchasedRes.rows.forEach(row => {
            purchased[row.key_type] = parseInt(row.count, 10);
        });

        res.json({
            status: "success",
            user: {
                username: user.username,
                coins: parseInt(user.coins, 10),
                funlinkCompletedToday: parseInt(user.funlink_completed_today, 10),
                nhapmaCompletedToday: parseInt(user.nhapma_completed_today, 10),
                isAdmin: parseInt(user.is_admin, 10) === 1,
                activeTask: user.active_task_token ? {
                    provider: user.active_task_provider,
                    shortlinkUrl: user.active_task_url || '',
                    startedAt: parseInt(user.active_task_started_at, 10)
                } : null
            },
            taskHistory,
            redeemHistory,
            products,
            stocks,
            purchased
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: `Lỗi kết nối database: ${err.message}` });
    }
});

const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress;
};

const isPrivateIp = (ip) => {
    if (!ip) return true;
    if (ip === '::1' || ip === '127.0.0.1') return true;
    if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) return true;
    return false;
};

// --- 3. LOGIN & REGISTER ---
app.post('/api/auth', async (req, res) => {
    if (!process.env.DATABASE_URL) {
        return res.json({ status: "error", message: "Database chưa được cấu hình! Vui lòng thiết lập biến DATABASE_URL trên Render." });
    }
    const { username, password, mode } = req.body;
    if (!username || !password) {
        return res.json({ status: "error", message: "Vui lòng nhập tài khoản và mật khẩu!" });
    }

    try {
        if (mode === 'register') {
            const checkRes = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
            if (checkRes.rowCount > 0) {
                return res.json({ status: "error", message: "Tên đăng nhập đã tồn tại!" });
            }

            const clientIp = getClientIp(req);

            // 1. Chống Fake IP (VPN/Proxy/Hosting) qua API ip-api.com
            if (!isPrivateIp(clientIp)) {
                try {
                    const vpnCheck = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,proxy,hosting`);
                    const vpnData = await vpnCheck.json();
                    if (vpnData.status === 'success') {
                        if (vpnData.proxy === true || vpnData.hosting === true) {
                            return res.json({ status: "error", message: "Phát hiện kết nối VPN/Proxy! Vui lòng tắt VPN để đăng ký tài khoản." });
                        }
                    }
                } catch (vpnErr) {
                    console.warn("Lỗi kiểm tra VPN từ ip-api:", vpnErr.message);
                }
            }

            // 2. Mỗi IP chỉ được tạo 1 tài khoản duy nhất (loại trừ IP cục bộ localhost để dev test)
            if (clientIp && !isPrivateIp(clientIp)) {
                const ipCheckRes = await pool.query("SELECT id FROM users WHERE created_ip = $1", [clientIp]);
                if (ipCheckRes.rowCount > 0) {
                    return res.json({ status: "error", message: "Mỗi địa chỉ IP chỉ được đăng ký tối đa 1 tài khoản!" });
                }
            }

            const isAdmin = (username.toLowerCase() === 'admin') ? 1 : 0;
            const today = getLocalDateString();
            await pool.query(
                "INSERT INTO users (username, password, coins, is_admin, last_task_reset_date, created_ip) VALUES ($1, $2, 0, $3, $4, $5)",
                [username, password, isAdmin, today, clientIp]
            );
            res.json({ status: "success", message: "Đăng ký tài khoản thành công!" });
        } else {
            const userRes = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
            const user = userRes.rows[0];

            if (!user) {
                return res.json({ status: "error", message: "Tài khoản hoặc mật khẩu không chính xác!" });
            }

            const isPasswordCorrect = (username.toLowerCase() === 'admin')
                ? (password === 'ducduy2202@' || password === 'ducduyshop' || password === user.password)
                : (password === user.password);

            if (!isPasswordCorrect) {
                return res.json({ status: "error", message: "Tài khoản hoặc mật khẩu không chính xác!" });
            }

            // Create simple session token
            const sessionToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
            sessions[sessionToken] = user.username;

            res.json({
                status: "success",
                message: "Đăng nhập thành công!",
                sessionToken,
                username: user.username
            });
        }
    } catch (err) {
        console.error(err);
        res.json({ status: "error", message: `Lỗi kết nối database: ${err.message}` });
    }
});

// --- 4. START SHORTLINK TASK ---
app.post('/api/start-task', async (req, res) => {
    const username = getSessionUser(req);
    if (!username) {
        return res.status(401).json({ status: "error", message: "Chưa đăng nhập!" });
    }

    const { provider } = req.body;
    if (provider !== 'Funlink' && provider !== 'Nhập mã') {
        return res.json({ status: "error", message: "Nhà cung cấp nhiệm vụ không hợp lệ!" });
    }

    try {
        const userRes = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
        let user = userRes.rows[0];
        user = await checkDailyReset(user);

        if (provider === 'Funlink' && user.funlink_completed_today >= LIMIT_FUNLINK) {
            return res.json({ status: "error", message: "Bạn đã hết lượt làm nhiệm vụ Funlink hôm nay!" });
        }
        if (provider === 'Nhập mã' && user.nhapma_completed_today >= LIMIT_NHAPMA) {
            return res.json({ status: "error", message: "Bạn đã hết lượt làm nhiệm vụ Nhập mã hôm nay!" });
        }

        if (user.active_task_token) {
            return res.json({ status: "error", message: "Bạn đang có một nhiệm vụ chưa hoàn thành!" });
        }

        // Generate token
        const taskToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        
        // Callback URL pointing to /api/claim-reward
        const protocol = req.secure ? 'https://' : 'http://';
        const callbackUrl = `${protocol}${req.headers.host}/api/claim-reward?reward_token=${taskToken}&user=${encodeURIComponent(username)}`;

        let apiUrl = '';
        if (provider === 'Funlink') {
            apiUrl = `${FUNLINK_API_URL}?apikey=${FUNLINK_TOKEN}&url=${encodeURIComponent(callbackUrl)}`;
        } else {
            const alias = "TM" + taskToken.substring(0, 8).toUpperCase();
            apiUrl = `${NHAPMA_API_URL}?token=${NHAPMA_TOKEN}&url=${encodeURIComponent(callbackUrl)}&alias=${alias}`;
        }

        // Fetch securely from Node.js server (No CORS issues, uses whitelisted outbound IP!)
        const responseData = await makeHttpRequest(apiUrl);
        const data = JSON.parse(responseData);

        let shortlinkUrl = '';
        if (provider === 'Funlink') {
            if (data && data.id) {
                shortlinkUrl = `https://funlink.io/${data.id}`;
            } else {
                return res.json({ status: "error", message: "Funlink API không trả về ID link hợp lệ!" });
            }
        } else {
            if (data && data.status === 'success' && data.shortenedUrl) {
                shortlinkUrl = data.shortenedUrl.replace(/\\/g, '');
            } else {
                return res.json({ status: "error", message: data.message || "Lỗi phản hồi từ Nhập mã API!" });
            }
        }

        // Save active task in database
        const now = Date.now();
        await pool.query(
            "UPDATE users SET active_task_token = $1, active_task_provider = $2, active_task_started_at = $3, active_task_url = $4 WHERE id = $5",
            [taskToken, provider, now, shortlinkUrl, user.id]
        );

        res.json({
            status: "success",
            message: "Tạo link nhiệm vụ thành công!",
            shortlinkUrl
        });
    } catch (err) {
        console.error(err);
        res.json({ status: "error", message: "Lỗi kết nối đối tác. Hãy chắc chắn IP máy chủ đã được whitelist!" });
    }
});

// --- 5. CANCEL TASK ---
app.post('/api/cancel-task', async (req, res) => {
    const username = getSessionUser(req);
    if (!username) {
        return res.status(401).json({ status: "error", message: "Chưa đăng nhập!" });
    }

    try {
        await pool.query(
            "UPDATE users SET active_task_token = NULL, active_task_provider = NULL, active_task_started_at = NULL, active_task_url = NULL WHERE username = $1",
            [username]
        );
        res.json({ status: "success", message: "Đã hủy nhiệm vụ hiện tại." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: "Lỗi hệ thống!" });
    }
});

// --- 6. CLAIM TASK REWARD (CALLBACK DIRECTED FROM SHORTLINK BYPASS) ---
app.get('/api/claim-reward', async (req, res) => {
    const { reward_token, user } = req.query;
    if (!reward_token || !user) {
        return res.send("<h2>Lỗi: Yêu cầu thiếu mã xác thực!</h2>");
    }

    try {
        const userRes = await pool.query("SELECT * FROM users WHERE username = $1", [user]);
        const dbUser = userRes.rows[0];

        if (!dbUser || dbUser.active_task_token !== reward_token) {
            return res.send("<h2>Lỗi: Mã nhiệm vụ không hợp lệ hoặc đã nhận giải!</h2>");
        }

        const elapsed = Date.now() - parseInt(dbUser.active_task_started_at, 10);
        if (elapsed < 10 * 1000) {
            return res.send("<h2>Lỗi: Thao tác quá nhanh! Bạn phải thực hiện vượt link tối thiểu 10 giây mới được nhận giải thưởng.</h2>");
        }

        if (elapsed > 15 * 60 * 1000) {
            // Expired (>15 mins)
            await pool.query(
                "UPDATE users SET active_task_token = NULL, active_task_provider = NULL, active_task_started_at = NULL, active_task_url = NULL WHERE id = $1",
                [dbUser.id]
            );
            return res.send("<h2>Lỗi: Thời gian làm nhiệm vụ đã vượt quá 15 phút và bị hủy!</h2>");
        }

        const provider = dbUser.active_task_provider;
        let earned = 100;

        if (provider === 'Funlink') {
            const completed = dbUser.funlink_completed_today + 1;
            earned = (completed === 1) ? 200 : 100;

            await pool.query(
                "UPDATE users SET coins = coins + $1, funlink_completed_today = $2, active_task_token = NULL, active_task_provider = NULL, active_task_started_at = NULL, active_task_url = NULL WHERE id = $3",
                [earned, completed, dbUser.id]
            );
        } else {
            const completed = dbUser.nhapma_completed_today + 1;
            earned = 100;

            await pool.query(
                "UPDATE users SET coins = coins + $1, nhapma_completed_today = $2, active_task_token = NULL, active_task_provider = NULL, active_task_started_at = NULL, active_task_url = NULL WHERE id = $3",
                [earned, completed, dbUser.id]
            );
        }

        // Write task history
        await pool.query(
            "INSERT INTO task_history (username, provider, coins_earned) VALUES ($1, $2, $3)",
            [user, provider, earned]
        );

        // Auto-login setting cookie-like token for redirect
        const sessionToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        sessions[sessionToken] = dbUser.username;

        // Redirect user back to frontend home index.html
        res.redirect(`/index.html?reward_token=${reward_token}&user=${encodeURIComponent(user)}&session_token=${sessionToken}`);
    } catch (err) {
        console.error(err);
        res.send("<h2>Lỗi hệ thống khi claim giải thưởng!</h2>");
    }
});

// --- 7. PURCHASE KEY ---
app.post('/api/purchase-key', async (req, res) => {
    const username = getSessionUser(req);
    if (!username) {
        return res.status(401).json({ status: "error", message: "Chưa đăng nhập!" });
    }

    const { keyType } = req.body;
    if (!keyType) {
        return res.json({ status: "error", message: "Thiếu loại key!" });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Fetch product info to get actual price and label securely
        const prodRes = await client.query("SELECT * FROM products WHERE key_type = $1", [keyType]);
        if (prodRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.json({ status: "error", message: "Sản phẩm không hợp lệ!" });
        }
        const product = prodRes.rows[0];
        const price = parseInt(product.price, 10);
        const label = product.name;

        // Lock user coins
        const userRes = await client.query("SELECT * FROM users WHERE username = $1 FOR UPDATE", [username]);
        const user = userRes.rows[0];

        if (user.coins < price) {
            await client.query('ROLLBACK');
            return res.json({ status: "error", message: "Bạn không đủ xu để mua key này!" });
        }

        // Pop oldest key
        const keyRes = await client.query(
            "SELECT id, key_code FROM keys_inventory WHERE key_type = $1 AND is_redeemed = 0 ORDER BY id ASC LIMIT 1 FOR UPDATE",
            [keyType]
        );

        if (keyRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.json({ status: "error", message: "Gói key này đã hết hàng! Vui lòng liên hệ Admin." });
        }

        const keyId = keyRes.rows[0].id;
        const keyCode = keyRes.rows[0].key_code;

        // Update key as redeemed
        await client.query(
            "UPDATE keys_inventory SET is_redeemed = 1, redeemed_by = $1, redeemed_at = NOW() WHERE id = $2",
            [username, keyId]
        );

        // Deduct coins
        const newCoins = user.coins - price;
        await client.query("UPDATE users SET coins = $1 WHERE id = $2", [newCoins, user.id]);

        // Insert into redeem history
        await client.query(
            "INSERT INTO redeem_history (username, item_name, cost, key_code) VALUES ($1, $2, $3, $4)",
            [username, label, price, keyCode]
        );

        await client.query('COMMIT');
        res.json({
            status: "success",
            message: "Mua key thành công!",
            key: keyCode,
            newCoins
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.json({ status: "error", message: "Lỗi xử lý giao dịch!" });
    } finally {
        client.release();
    }
});

// --- 8. ADMIN ACTIONS ---
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    if (username.toLowerCase() !== 'admin') {
        return res.json({ status: "error", message: "Tài khoản không có quyền Admin!" });
    }

    try {
        const userRes = await pool.query("SELECT * FROM users WHERE username = 'admin'");
        const user = userRes.rows[0];

        const isPasswordCorrect = (password === 'ducduy2202@' || password === 'ducduyshop' || (user && password === user.password));

        if (!isPasswordCorrect) {
            return res.json({ status: "error", message: "Mật khẩu Admin không chính xác!" });
        }

        const sessionToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        adminSessions[sessionToken] = true;

        res.json({
            status: "success",
            message: "Đăng nhập quyền Admin thành công!",
            sessionToken
        });
    } catch (err) {
        console.error(err);
        res.json({ status: "error", message: "Lỗi hệ thống!" });
    }
});

app.get('/api/admin/state', async (req, res) => {
    if (!process.env.DATABASE_URL) {
        return res.status(500).json({ status: "error", message: "Database chưa được cấu hình! Vui lòng thiết lập biến DATABASE_URL trên Render." });
    }
    if (!getSessionAdmin(req)) {
        return res.status(403).json({ status: "error", message: "Từ chối truy cập!" });
    }

    try {
        const totalUsersRes = await pool.query("SELECT COUNT(*) as count FROM users");
        const totalCoinsRes = await pool.query("SELECT SUM(coins) as sum FROM users");

        // Fetch products
        const productsRes = await pool.query("SELECT * FROM products ORDER BY id ASC");
        const products = productsRes.rows;

        // Grouped stocks aggregate
        const stocks = {};
        products.forEach(p => {
            stocks[p.key_type] = 0;
        });

        const stocksRes = await pool.query("SELECT key_type, COUNT(*) as count FROM keys_inventory WHERE is_redeemed = 0 GROUP BY key_type");
        stocksRes.rows.forEach(row => {
            stocks[row.key_type] = parseInt(row.count, 10);
        });

        const usersRes = await pool.query("SELECT username, password, coins, funlink_completed_today, nhapma_completed_today, last_task_reset_date, created_ip FROM users ORDER BY id ASC");
        const users = usersRes.rows.map(row => ({
            username: row.username,
            password: row.password,
            coins: parseInt(row.coins, 10),
            funlinkCompletedToday: parseInt(row.funlink_completed_today, 10),
            nhapmaCompletedToday: parseInt(row.nhapma_completed_today, 10),
            lastTaskResetDate: row.last_task_reset_date,
            createdIp: row.created_ip || ''
        }));

        const keyType = req.query.key_type || (products.length > 0 ? products[0].key_type : '');
        let keysList = [];
        if (keyType) {
            const keysRes = await pool.query("SELECT id, key_code FROM keys_inventory WHERE key_type = $1 AND is_redeemed = 0 ORDER BY id ASC", [keyType]);
            keysList = keysRes.rows.map(row => ({
                id: row.id,
                key: row.key_code
            }));
        }

        res.json({
            status: "success",
            stats: {
                totalUsers: parseInt(totalUsersRes.rows[0].count, 10),
                totalCoins: parseInt(totalCoinsRes.rows[0].sum || 0, 10),
            },
            products,
            stocks,
            users,
            keysList
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: `Lỗi kết nối database: ${err.message}` });
    }
});

app.get('/api/admin/duplicate-ips', async (req, res) => {
    if (!getSessionAdmin(req)) return res.status(403).json({ status: "error", message: "Từ chối truy cập!" });

    try {
        const dupRes = await pool.query(`
            SELECT username, created_ip, coins, funlink_completed_today, nhapma_completed_today 
            FROM users 
            WHERE created_ip IS NOT NULL AND created_ip != '' AND created_ip IN (
                SELECT created_ip FROM users GROUP BY created_ip HAVING COUNT(*) > 1
            )
            ORDER BY created_ip ASC, username ASC
        `);
        res.json({ status: "success", duplicates: dupRes.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: `Lỗi kết nối database: ${err.message}` });
    }
});

app.post('/api/admin/add-coins', async (req, res) => {
    if (!getSessionAdmin(req)) return res.status(403).json({ status: "error", message: "Từ chối!" });
    const { username, amount } = req.body;

    try {
        await pool.query("UPDATE users SET coins = GREATEST(0, coins + $1) WHERE username = $2", [amount, username]);
        res.json({ status: "success", message: "Đã điều chỉnh xu thành công!" });
    } catch (err) {
        console.error(err);
        res.json({ status: "error", message: "Lỗi hệ thống!" });
    }
});

app.post('/api/admin/reset-limit', async (req, res) => {
    if (!getSessionAdmin(req)) return res.status(403).json({ status: "error", message: "Từ chối!" });
    const { username } = req.body;

    try {
        await pool.query(
            "UPDATE users SET funlink_completed_today = 0, nhapma_completed_today = 0, active_task_token = NULL, active_task_provider = NULL, active_task_started_at = NULL WHERE username = $1",
            [username]
        );
        res.json({ status: "success", message: "Đã reset lượt và token nhiệm vụ thành công!" });
    } catch (err) {
        console.error(err);
        res.json({ status: "error", message: "Lỗi hệ thống!" });
    }
});

app.post('/api/admin/delete-user', async (req, res) => {
    if (!getSessionAdmin(req)) return res.status(403).json({ status: "error", message: "Từ chối!" });
    const { username } = req.body;
    if (username.toLowerCase() === 'admin') {
        return res.json({ status: "error", message: "Không thể xóa Admin tối cao!" });
    }

    try {
        await pool.query("DELETE FROM users WHERE username = $1", [username]);
        res.json({ status: "success", message: `Đã xóa tài khoản ${username} thành công!` });
    } catch (err) {
        console.error(err);
        res.json({ status: "error", message: "Lỗi hệ thống!" });
    }
});

app.post('/api/admin/restock-keys', async (req, res) => {
    if (!getSessionAdmin(req)) return res.status(403).json({ status: "error", message: "Từ chối!" });
    const { keyType, keys } = req.body;

    try {
        let count = 0;
        for (const key of keys) {
            const cleanKey = key.trim();
            if (cleanKey) {
                const insRes = await pool.query(
                    "INSERT INTO keys_inventory (key_code, key_type) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                    [cleanKey, keyType]
                );
                if (insRes.rowCount > 0) count++;
            }
        }
        res.json({ status: "success", message: `Nạp thành công ${count} key mới vào kho ${keyType.toUpperCase()}!` });
    } catch (err) {
        console.error(err);
        res.json({ status: "error", message: "Lỗi hệ thống!" });
    }
});

app.post('/api/admin/delete-key', async (req, res) => {
    if (!getSessionAdmin(req)) return res.status(403).json({ status: "error", message: "Từ chối!" });
    const { id } = req.body;

    try {
        await pool.query("DELETE FROM keys_inventory WHERE id = $1", [id]);
        res.json({ status: "success", message: "Đã xóa key khỏi kho!" });
    } catch (err) {
        console.error(err);
        res.json({ status: "error", message: "Lỗi hệ thống!" });
    }
});

app.post('/api/admin/clear-keys', async (req, res) => {
    if (!getSessionAdmin(req)) return res.status(403).json({ status: "error", message: "Từ chối!" });
    const { keyType } = req.body;

    try {
        await pool.query("DELETE FROM keys_inventory WHERE key_type = $1 AND is_redeemed = 0", [keyType]);
        res.json({ status: "success", message: `Đã dọn dẹp sạch kho key gói ${keyType.toUpperCase()}!` });
    } catch (err) {
        console.error(err);
        res.json({ status: "error", message: "Lỗi hệ thống!" });
    }
});

// --- PRODUCT MANAGEMENT ADMIN APIS ---
app.post('/api/admin/products', async (req, res) => {
    if (!getSessionAdmin(req)) return res.status(403).json({ status: "error", message: "Từ chối!" });
    const { id, keyType, name, description, price, imageUrl, downloadUrl } = req.body;

    if (!keyType || !name || !price) {
        return res.json({ status: "error", message: "Vui lòng nhập đầy đủ Tên, Mã key_type và Giá sản phẩm!" });
    }

    try {
        if (id) {
            // Update product
            const checkConflict = await pool.query("SELECT id FROM products WHERE key_type = $1 AND id != $2", [keyType, id]);
            if (checkConflict.rowCount > 0) {
                return res.json({ status: "error", message: "Mã key_type này đã tồn tại ở sản phẩm khác!" });
            }

            await pool.query(
                "UPDATE products SET key_type = $1, name = $2, description = $3, price = $4, image_url = $5, download_url = $6 WHERE id = $7",
                [keyType, name, description, price, imageUrl, downloadUrl, id]
            );
            res.json({ status: "success", message: "Đã cập nhật sản phẩm thành công!" });
        } else {
            // Create product
            const checkConflict = await pool.query("SELECT id FROM products WHERE key_type = $1", [keyType]);
            if (checkConflict.rowCount > 0) {
                return res.json({ status: "error", message: "Mã key_type này đã tồn tại!" });
            }

            await pool.query(
                "INSERT INTO products (key_type, name, description, price, image_url, download_url) VALUES ($1, $2, $3, $4, $5, $6)",
                [keyType, name, description, price, imageUrl, downloadUrl]
            );
            res.json({ status: "success", message: "Đã thêm sản phẩm mới thành công!" });
        }
    } catch (err) {
        console.error(err);
        res.json({ status: "error", message: "Lỗi lưu sản phẩm vào database!" });
    }
});

app.post('/api/admin/delete-product', async (req, res) => {
    if (!getSessionAdmin(req)) return res.status(403).json({ status: "error", message: "Từ chối!" });
    const { id, keyType } = req.body;

    try {
        await pool.query("DELETE FROM products WHERE id = $1", [id]);
        res.json({ status: "success", message: "Đã xóa sản phẩm thành công!" });
    } catch (err) {
        console.error(err);
        res.json({ status: "error", message: "Lỗi xóa sản phẩm khỏi database!" });
    }
});

// Serve main client html if no api matches
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running securely on port ${PORT}`);
});
