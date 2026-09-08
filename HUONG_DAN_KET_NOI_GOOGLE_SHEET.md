# 📖 HƯỚNG DẪN KẾT NỐI GOOGLE SHEETS CHO PHẦN MỀM PMQLV

Hệ thống **PMQLV** cho phép bạn lưu trữ toàn bộ dữ liệu (Kho sản phẩm, Hóa đơn bán hàng, Bảng giá vàng, Tài khoản) trên **Google Sheets**. Bạn có thể xem, chỉnh sửa trên điện thoại hoặc máy tính mọi lúc mọi nơi hoàn toàn **MIỄN PHÍ 100%**.

---

## ⚡ 3 BƯỚC THỰC HIỆN CỰC KỲ ĐƠN GIẢN (CHỈ MẤT 2 PHÚT)

### BƯỚC 1: TẠO BẢNG TÍNH GOOGLE SHEET MỚI
1. Mở trình duyệt web và truy cập: [sheets.new](https://sheets.new) (hoặc vào [Google Sheets](https://docs.google.com/spreadsheets/)).
2. Đặt tên bảng tính là: **`PMQLV_Database_TiệmVàng`** (hoặc tên bất kỳ bạn thích).

---

### BƯỚC 2: DÁN ĐOẠN CODE KẾT NỐI (APPS SCRIPT)
1. Trên thanh menu của Google Sheets, chọn:
   👉 **Tiện ích mở rộng** (Extensions) -> **Apps Script**.
2. Một cửa sổ lập trình sẽ mở ra. Bạn hãy:
   - Xóa toàn bộ đoạn code mặc định trong file `Mã.gs` (hoặc `Code.gs`).
   - Mở file **`google-apps-script/Code.gs`** trong thư mục phần mềm trên máy bạn (hoặc copy toàn bộ nội dung của nó).
   - Dán toàn bộ vào ô soạn thảo của Apps Script.
3. Bấm biểu tượng 💾 **Lưu dự án** (Save project).

---

### BƯỚC 3: TRIỂN KHAI DƯỚI DẠNG WEB APP & LẤY ĐƯỜNG LINK
1. Ở góc trên bên phải màn hình Apps Script, bấm nút màu xanh **"Triển khai" (Deploy)** -> Chọn **"Tùy chọn triển khai mới" (New deployment)**.
2. Tại mục *Chọn loại* (bấm vào hình bánh răng ⚙️): Chọn **"Ứng dụng web" (Web app)**.
3. Điền các thông số:
   - **Mô tả**: `PMQLV API`
   - **Thực thi dưới dạng (Execute as)**: Chọn **Tôi (email của bạn)**.
   - **Ai có quyền truy cập (Who has access)**: Chọn **Bất kỳ ai (Anyone)**. *(Lưu ý quan trọng: Phải chọn mục này để phần mềm có thể đồng bộ dữ liệu)*.
4. Bấm **Triển khai (Deploy)**.
   - *Nếu Google hiện bảng yêu cầu cấp quyền: Bấm "Ủy quyền truy cập" (Authorize access) -> Chọn tài khoản Google của bạn -> Bấm "Nâng cao" (Advanced) -> Bấm "Đi tới [Tên dự án] (không an toàn)" -> Bấm "Cho phép" (Allow).*
5. Sau khi triển khai xong, Google sẽ cung cấp cho bạn một đường dẫn dạng:
   `https://script.google.com/macros/s/AKfycbx.../exec`
6. Hãy bấm nút **Sao chép (Copy)** đường dẫn URL đó.

---

### BƯỚC 4: DÁN VÀO PHẦN MỀM PMQLV
1. Mở phần mềm `PMQLV` (mở file `index.html` trên trình duyệt).
2. Vào tab **Google Sheet & Cài Đặt** (biểu tượng bánh răng ⚙️).
3. Dán đường link URL vừa copy vào ô **"URL Ứng Dụng Web Google Apps Script"**.
4. Bấm **"⚡ Kiểm Tra Kết Nối"** -> Hệ thống sẽ báo *✅ Kết nối Google Sheet thành công!*
5. Bấm nút **"⬆️ Tải 1.174 Sản Phẩm Lên Sheet"**: Toàn bộ 1.174 sản phẩm từ file Excel của bạn sẽ được tự động tạo thành bảng đẹp mắt trên Google Sheets ngay lập tức!

---

## 🎯 CÁC TAB SẼ TỰ ĐỘNG SINH RA TRÊN GOOGLE SHEETS
Sau khi kết nối, bảng Google Sheets của bạn sẽ tự động có 4 trang tính:
1. **`SanPham`**: Danh sách 1.174 sản phẩm (Mã hàng, Tên hàng, Loại vàng, TL tổng, TL hột, TL vàng, Ni, Tiền công, Giá vốn...).
2. **`HoaDon`**: Tự động lưu mọi đơn hàng đã bán tại quầy cùng chi tiết món hàng, tên khách, ngày giờ, số tiền.
3. **`GiaVang`**: Bảng giá vàng cập nhật theo ngày.
4. **`NguoiDung`**: Danh sách tài khoản Admin & Nhân viên.
