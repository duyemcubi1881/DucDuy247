# Shop Duc Duy - Vượt Link Nhận Key App

Hệ thống cửa hàng web shop giúp người dùng làm nhiệm vụ vượt link rút gọn để tích lũy xu và đổi key ứng dụng (1 giờ, 2 giờ, 4 giờ) hoàn toàn tự động.

## 🌟 Tính Năng Nổi Bật

1. **Giao Diện Đẹp Mắt**: Thiết kế hiện đại dạng Glassmorphism, hỗ trợ tự động đổi chủ đề sáng/tối (Dark/Light mode) và tương thích hoàn hảo trên các thiết bị di động (Responsive).
2. **Quy Luật Làm Nhiệm Vụ Tách Biệt**:
   - **Nhiệm vụ Funlink (Tối đa 2 lần/ngày)**: Lần 1 cộng **200 Xu**, lần 2 cộng **100 Xu**.
   - **Nhiệm vụ Nhập Mã (Tối đa 4 lần/ngày)**: Mỗi lần hoàn thành cộng **100 Xu**.
   - Tự động kiểm tra trạng thái nhiệm vụ từng loại riêng biệt.
3. **Cửa Hàng Đa Dạng & Quản Lý Kho Key**:
   - Đổi key với 3 sự lựa chọn:
     - **Key 1 Giờ**: Giá **100 Xu** (Khởi tạo sẵn 100 key).
     - **Key 2 Giờ**: Giá **150 Xu** (Khởi tạo sẵn 100 key).
     - **Key 4 Giờ**: Giá **200 Xu** (Khởi tạo sẵn 150 key).
   - Có tích hợp **Admin Panel** cho phép Admin theo dõi tài khoản người dùng, chọn loại key nạp và nhập key hàng loạt, reset lượt làm của người dùng, hoặc cộng xu thử nghiệm.
4. **Hệ Thống Đăng Ký & Đăng Nhập**: Bắt buộc người dùng phải đăng nhập tài khoản trước khi thực hiện các hoạt động kiếm xu hay đổi quà. Dữ liệu được lưu trữ trực tiếp dưới Client (LocalStorage) giúp tránh tối đa giật lag server key như cách thức get key tự động cũ.

---

## 🛠️ Hướng Dẫn Cài Đặt & Sử Dụng

### 1. Chạy trên máy cá nhân (Local)
1. Tải toàn bộ thư mục dự án về máy.
2. Mở trực tiếp file `index.html` trên bất kỳ trình duyệt web nào (Chrome, Edge, Firefox, Cốc Cốc...).
3. Đăng ký một tài khoản mới và đăng nhập để trải nghiệm.

### 2. Thiết lập tài khoản Admin
* Để truy cập vào giao diện quản trị (Quản lý kho key, xem danh sách user, cộng xu/reset lượt):
  - Hãy đăng ký tài khoản với tên đăng nhập chính xác là: **`admin`** (mật khẩu tùy chọn).
  - Hệ thống sẽ tự động cấp quyền Quản trị viên cho tài khoản này và hiển thị tab **Quản Lý Kho Key** ở sidebar.

### 3. Cách thức vượt link nhận xu (Tự động 100%)
1. Bấm nút **Nhận Nhiệm Vụ** (Funlink hoặc Nhập mã) tại giao diện chính.
2. Web sẽ tự động mã hóa và tạo đường link rút gọn có kèm tham số callback dẫn trở lại trang web.
3. Bạn hoàn thành vượt link ở tab mới. Sau khi vượt qua bước cuối cùng, trang web rút gọn sẽ tự động chuyển hướng bạn quay trở lại trang web chính.
4. Hệ thống sẽ tự động xác thực mã token, cộng xu tương ứng vào tài khoản của bạn và tải lại giao diện mà không cần bạn phải nhập mã thủ công.

---

## ⚙️ Cấu Hình API Trong Mã Nguồn

Nếu bạn muốn thay đổi Token hoặc giá cả của các vật phẩm, bạn có thể chỉnh sửa trực tiếp các hằng số ở đầu file [app.js](file:///C:/Users/ducdu/.gemini/antigravity/scratch/key-shop-web/app.js):

```javascript
// --- CONFIGURATION ---
const FUNLINK_TOKEN = '65d4f6c0bb16481fbe5f6b69f9922bcb'; // Token API Funlink của bạn
const NHAPMA_TOKEN = '00481ff4-378e-4ef7-a996-209e35386123';  // Token API Nhập mã của bạn
const LIMIT_FUNLINK = 2;                                    // Lượt Funlink tối đa/ngày
const LIMIT_NHAPMA = 4;                                     // Lượt Nhập mã tối đa/ngày
```

---

## 🚀 Hướng Dẫn Triển Khai Lên Internet (Deploy)

Dự án này là ứng dụng web tĩnh (Static Web App), do đó bạn có thể host hoàn toàn miễn phí trên các dịch vụ sau:
* **GitHub Pages** (Khuyên dùng)
* **Vercel**
* **Netlify**

### Các bước đẩy lên GitHub Pages:
1. Tạo một repository mới trên GitHub.
2. Đẩy các file: `index.html`, `style.css`, `app.js` và file ảnh banner `menu_banner.png` lên repository đó.
3. Vào phần **Settings** (Cài đặt) của repo -> Chọn mục **Pages**.
4. Ở phần **Build and deployment**, chọn source là **Deploy from a branch** và chọn nhánh `main` (hoặc `master`), chọn thư mục `/root` rồi bấm **Save**.
5. Đợi 1-2 phút, GitHub sẽ cung cấp cho bạn một đường link trang web hoạt động online (Ví dụ: `https://ten-tai-khoan.github.io/ten-repo/`).
