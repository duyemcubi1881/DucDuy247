# HƯỚNG DẪN DEPLOY TOÀN BỘ WEB LÊN RENDER + DATABASE

Dự án hiện đã được chuyển đổi toàn bộ sang **Node.js (Express) + PostgreSQL (Database lưu trữ tập trung)**. 
Với mô hình này:
- Mọi thành viên đăng ký, đăng nhập đều sẽ được lưu trữ chung vào Database.
- Khi Admin nạp key trên trang quản lý, khách hàng ở mọi thiết bị khác đều sẽ nhìn thấy và có thể mua bình thường.
- Lệnh gọi tạo link nhiệm vụ được thực hiện trực tiếp từ máy chủ Render, giúp bảo mật API Key, loại bỏ 100% lỗi CORS của trình duyệt, và tối ưu hóa kết nối đến Funlink/Nhập Mã.

Dưới đây là các bước hướng dẫn chi tiết để đưa trang web lên hoạt động chính thức:

---

## BƯỚC 1: TẠO DATABASE POSTGRESQL MIỄN PHÍ

Bạn cần một cơ sở dữ liệu PostgreSQL để lưu trữ tài khoản, xu và key. Cách đơn giản nhất là dùng **Neon.tech** (miễn phí và tạo chỉ mất 10 giây):

1. Truy cập trang web: [https://neon.tech](https://neon.tech) và đăng ký tài khoản (bằng Google hoặc GitHub).
2. Tạo một dự án mới (Create Project), đặt tên dự án tùy ý (ví dụ: `key-shop-db`).
3. Neon sẽ tự động cấp cho bạn một chuỗi kết nối **Connection String** có dạng như sau:
   ```text
   postgresql://neondb_owner:xxxxxxxx@ep-xxxxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
4. **Copy lại chuỗi kết nối này** để chuẩn bị cấu hình lên Render.

---

## BƯỚC 2: UPLOAD SOURCE CODE LÊN GITHUB

1. Tạo một Repository mới trên GitHub (để ở chế độ Riêng tư - Private nếu muốn bảo mật mã nguồn).
2. Đẩy toàn bộ các tệp trong thư mục `key-shop-web` lên Repository đó (bao gồm thư mục `public`, `server.js`, `package.json`).

---

## BƯỚC 3: DEPLOY LÊN RENDER.COM

1. Đăng nhập vào [https://render.com](https://render.com) (nên đăng nhập trực tiếp bằng tài khoản GitHub).
2. Nhấn nút **New** (màu xanh ở góc trên bên phải) -> Chọn **Web Service**.
3. Chọn Repository GitHub mà bạn vừa tải code lên ở Bước 2.
4. Cấu hình các thông số cơ bản:
   - **Name**: Nhập tên trang web của bạn (ví dụ: `shop-key-ducduy`).
   - **Region**: Chọn Singapore hoặc Oregon (nên chọn Singapore để truy cập từ VN nhanh nhất).
   - **Runtime**: Chọn `Node`.
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Cuộn xuống phần **Environment Variables** (Biến môi trường) -> Nhấn **Add Environment Variable** để thêm biến kết nối database:
   - **Key**: `DATABASE_URL`
   - **Value**: Dán chuỗi kết nối PostgreSQL bạn đã copy ở Bước 1 vào đây.
6. Nhấn nút **Create Web Service** ở cuối trang.
7. Đợi Render build code khoảng 1-2 phút. Khi xuất hiện chữ `Live` màu xanh là trang web của bạn đã chính thức hoạt động!

---

## BƯỚC 4: LẤY IP MÁY CHỦ GỬI ADMIN FUNLINK ĐỂ WHITELIST

Vì máy chủ Render cần được whitelist IP để gọi được API Funlink mà không bị chặn, bạn hãy làm như sau:

1. Truy cập đường dẫn sau trên trình duyệt (thay tên trang web của bạn vào):
   ```text
   https://[tên-app-của-bạn].onrender.com/api/test-ip
   ```
   *(Ví dụ: `https://shop-key-ducduy.onrender.com/api/test-ip`)*
2. Trang web sẽ hiện ra địa chỉ IP máy chủ của bạn (ví dụ: `35.240.231.25`).
3. **Copy IP này gửi cho Admin bên Funlink để họ whitelist.** Sau khi họ báo đã whitelist thành công, chức năng rút gọn link nhiệm vụ Funlink của shop sẽ hoạt động trơn tru 100%!

---

## BƯỚC 5: SỬ DỤNG TRANG ADMIN

1. Tài khoản Admin mặc định khi hệ thống tự động khởi tạo database là:
   - Tài khoản: `admin`
   - Mật khẩu: `ducduy2202@`
2. Để vào trang Admin, bạn truy cập đường dẫn:
   ```text
   https://[tên-app-của-bạn].onrender.com/admin.html
   ```
3. Tại đây bạn có thể nạp key, cộng/trừ xu cho thành viên, reset lượt vượt link của khách hàng một cách dễ dàng và đồng bộ trực tiếp với tất cả người dùng!
