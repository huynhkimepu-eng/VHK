# 👑 HƯỚNG DẪN SỬ DỤNG PHẦN MỀM QUẢN LÝ VÀNG BẠC ĐÁ QUÝ (PMQLV)

Chào mừng bạn đến với **PMQLV** - Phần mềm chuyên biệt dành cho tiệm vàng bạc đá quý, tích hợp sẵn **1.174 sản phẩm**, hỗ trợ **quét mã vạch camera**, **in tem đuôi chuột** và **lưu trữ đám mây Google Sheets**.

---

## 🚀 1. CÁCH KHỞI ĐỘNG PHẦN MỀM

### TRÊN MÁY TÍNH (PC / LAPTOP QUẦY THU NGÂN):
- Bạn chỉ cần **click đúp vào file `index.html`** trong thư mục này (hoặc chuột phải chọn mở bằng trình duyệt Google Chrome, Microsoft Edge, Opera...).
- Phần mềm chạy **ngay lập tức**, không cần cài đặt rườm rà. Toàn bộ 1.174 sản phẩm đã được nạp sẵn vào hệ thống!

### TRÊN ĐIỆN THOẠI (IPHONE / ANDROID):
- **Cách 1 (Nhanh nhất trong mạng Wi-Fi tiệm)**: Mở thư mục này bằng 1 phần mềm Web Server nhỏ (ví dụ VS Code Live Server hoặc Python http server), sau đó lấy điện thoại gõ địa chỉ IP của máy tính là dùng được.
- **Cách 2 (Đưa lên đám mây miễn phí)**: Bạn có thể đưa thư mục này lên GitHub Pages, Vercel hoặc Netlify để có 1 đường link online riêng (ví dụ: `https://tiemvang.vercel.app`), mở trên bất kỳ điện thoại nào cũng được.

---

## 🔐 2. TÀI KHOẢN & PHÂN QUYỀN

Phần mềm tích hợp sẵn 2 cấp bậc phân quyền:

| Vai Trò | Tên Đăng Nhập | Mật Khẩu | Quyền Hạn |
| :--- | :--- | :--- | :--- |
| **Chủ Tiệm (Admin)** | `admin` | `123` | **Toàn quyền**: Xem giá vốn, tiền công thợ, lãi gộp, sửa/xóa kho, đổi giá vàng, quản lý Google Sheets. |
| **Nhân Viên Thu Ngân** | `nhanvien` | `123` | **Chỉ bán hàng**: Quét mã, tạo hóa đơn, in giấy đảm bảo, tra cứu tồn kho. **Tuyệt đối ẩn giá vốn và lợi nhuận**. |

> *Để đổi tài khoản: Bấm vào nút **"Đổi"** ở góc trên cùng bên phải màn hình.*

---

## 🛒 3. BÁN HÀNG TẠI QUẦY (POS)

1. **Thêm món vào đơn**:
   - Dùng **Camera điện thoại / Webcam**: Bấm nút **"📷 Quét Camera"**, đưa mã tem sản phẩm vào khung hình, máy sẽ tự tít và thêm vào đơn.
   - Dùng **Súng quét mã vạch USB**: Chỉ cần bắn thẳng vào tem hàng trên tay.
   - **Tìm kiếm**: Gõ mã tem (ví dụ: `I6600001`, `I9500057`) hoặc tên sản phẩm vào ô tìm kiếm.
2. **Cơ chế tính tiền tự động**:
   - Đối với vàng tính theo lượng/chỉ: Hệ thống tự lấy `(TL Vàng × Đơn Giá Vàng Bán Ra Hôm Nay) + Tiền Công Bán`.
   - Đối với đá phong thủy / bạc bán món: Hệ thống lấy theo giá niêm yết.
3. **Thanh toán & Xuất hóa đơn**:
   - Điền Tên và SĐT khách hàng (tùy chọn).
   - Bấm nút to **"💰 THANH TOÁN & IN HÓA ĐƠN"**.
   - Món hàng sẽ tự động chuyển trạng thái thành **"Đã bán"** và lưu vào lịch sử hóa đơn.
   - Trình duyệt sẽ mở bảng in **Giấy Đảm Bảo Vàng kiêm Hóa Đơn** (có logo tiệm, quy định thu đổi, chữ ký khách hàng).

---

## 🏷️ 4. IN TEM ĐUÔI CHUỘT (TEM TRANG SỨC)

Phần mềm được thiết kế chuẩn kích thước tem gập 2 cánh của ngành kim hoàn Việt Nam (**75mm x 11mm** hoặc **72mm x 10mm**):

- **Cánh bên trái**: Tên tiệm vàng (HOÀNG KIM), Mã vạch Barcode sắc nét chuẩn Code 128, Mã hàng, Ni tay.
- **Phần đuôi ở giữa**: Dải hẹp để luồn qua lòng nhẫn / sợi dây chuyền rồi gập dán lại.
- **Cánh bên phải**: Tên món hàng, Loại vàng (24K, 18K...), TL Tổng (TLT), TL Hột (TLH), TL Vàng (TLV), Tiền công bán.

### Cách in:
- **In lẻ 1 món**: Vào tab **Kho Hàng**, tại dòng sản phẩm muốn in, bấm nút **"🏷️ Tem"**.
- **In hàng loạt**: Tích chọn các ô vuông đầu dòng của các sản phẩm cần in -> Bấm nút **"🏷️ In Tem Đã Chọn"**.
- Cửa sổ in sẽ mở ra xem trước. Bạn chọn đúng máy in tem (Zebra, Bixolon, Godex, Xprinter, TSC...) và bấm **Print (In)**.

---

## 📦 5. QUẢN LÝ KHO HÀNG (1.174 SẢN PHẨM)

- **Bộ lọc thông minh**: Lọc nhanh theo Quầy (`2VANG24K`, `2VANG10K`, `2BAC`, `2PHONGTHUY`...), Loại vàng, hoặc Trạng thái (Còn tồn / Đã bán).
- **Thêm sản phẩm mới** *(Admin)*: Bấm nút **"+ Thêm Sản Phẩm Mới"**. Khi bạn nhập *TL Tổng* và *TL Hột*, hệ thống sẽ **tự động tính ra TL Vàng chuẩn xác**.
- **Xuất Excel**: Bấm nút **"📤 Xuất Excel"** để tải file Excel toàn bộ kho hàng về máy.

---

## 📈 6. BẢNG GIÁ VÀNG HÔM NAY

- Vào tab **"Bảng Giá Vàng"**.
- Mỗi buổi sáng, Admin chỉ cần nhập giá mua - giá bán của ngày hôm đó (Vàng 24K, 18K, 14K, 10K, Bạc...) và bấm **"💾 Lưu & Cập Nhật Giá Vàng"**.
- Giá vàng này sẽ **ngay lập tức tự động áp dụng** cho toàn bộ các giao dịch bán hàng tại quầy!

---

## ☁️ 7. KẾT NỐI GOOGLE SHEETS
Xem chi tiết hướng dẫn 3 bước trong tệp **`HUONG_DAN_KET_NOI_GOOGLE_SHEET.md`** để đồng bộ dữ liệu lên Google Drive hoàn toàn miễn phí.
