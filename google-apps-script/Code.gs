/**
 * =========================================================================
 * PMQLV - GOOGLE APPS SCRIPT BACKEND API (TIỆM VÀNG BẠC ĐÁ QUÝ)
 * =========================================================================
 * Hướng dẫn triển khai:
 * 1. Mở một trang Google Sheet mới (hoặc trang có sẵn).
 * 2. Trên thanh menu, chọn: Tiện ích mở rộng (Extensions) -> Apps Script.
 * 3. Xóa hết code cũ trong file Code.gs, dán toàn bộ đoạn code này vào.
 * 4. Bấm biểu tượng Đĩa mềm (Save).
 * 5. Bấm nút "Triển khai" (Deploy) -> "Tùy chọn triển khai mới" (New deployment).
 * 6. Chọn loại: "Ứng dụng web" (Web App).
 *    - Mô tả: PMQLV API
 *    - Thực thi dưới dạng (Execute as): "Tôi" (Me)
 *    - Ai có quyền truy cập (Who has access): "Bất kỳ ai" (Anyone).
 * 7. Bấm "Triển khai" (Deploy) và cấp quyền truy cập khi được hỏi.
 * 8. Copy đường dẫn "URL ứng dụng web" dán vào mục Cài Đặt của phần mềm PMQLV.
 * =========================================================================
 */

const SHEET_NAMES = {
  SAN_PHAM: 'SanPham',
  HOA_DON: 'HoaDon',
  GIA_VANG: 'GiaVang',
  NGUOI_DUNG: 'NguoiDung',
  CAU_HINH: 'CauHinh'
};

function getStoreConfigData() {
  try {
    const configRows = getSheetData(SHEET_NAMES.CAU_HINH);
    if (configRows && configRows.length > 0) {
      const found = configRows.find(r => r.key === 'storeConfig');
      if (found && found.value) {
        return JSON.parse(found.value);
      }
    }
  } catch (e) {}
  return null;
}

function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) ? e.parameter.action : 'getData';
    
    if (action === 'ping') {
      return jsonResponse({ success: true, message: 'PMQLV Google Sheet API đang hoạt động bình thường!' });
    }

    if (action === 'getGoldPrices') {
      initSheetsIfNotExist();
      const goldPrices = getSheetData(SHEET_NAMES.GIA_VANG);
      const storeConfig = getStoreConfigData();
      return jsonResponse({
        success: true,
        data: {
          goldPrices: goldPrices,
          storeConfig: storeConfig
        }
      });
    }

    if (action === 'getData') {
      initSheetsIfNotExist();
      const products = getSheetData(SHEET_NAMES.SAN_PHAM);
      const goldPrices = getSheetData(SHEET_NAMES.GIA_VANG);
      const users = getSheetData(SHEET_NAMES.NGUOI_DUNG);
      const orders = getSheetData(SHEET_NAMES.HOA_DON);
      const storeConfig = getStoreConfigData();

      return jsonResponse({
        success: true,
        data: {
          products: products,
          goldPrices: goldPrices,
          users: users,
          orders: orders,
          storeConfig: storeConfig
        }
      });
    }

    return jsonResponse({ success: false, message: 'Hành động không hợp lệ: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    initSheetsIfNotExist();
    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;

    // 1. Đồng bộ hàng loạt 1.174 sản phẩm lên Google Sheet
    if (action === 'syncAllProducts') {
      const items = contents.products;
      if (!items || !items.length) {
        return jsonResponse({ success: false, message: 'Danh sách sản phẩm trống!' });
      }

      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName(SHEET_NAMES.SAN_PHAM);
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_NAMES.SAN_PHAM);
      }
      sheet.clearContents();

      const headers = [
        'maHang', 'tenHang', 'loaiHang', 'loaiVang', 'nhomHang', 'trangThai',
        'tlTong', 'tlHot', 'tlVang', 'ni', 'congBan', 'congVon', 'giaBanMon',
        'giaVon', 'cuaHang', 'quayLon', 'quayNho', 'ngayNhap',
        'chiNhanh', 'anhSanPham', 'nhaSanXuat', 'nhaCungCap'
      ];

      const rows = [headers];
      items.forEach(p => {
        rows.push([
          p.maHang || '',
          p.tenHang || '',
          p.loaiHang || '',
          p.loaiVang || '',
          p.nhomHang || '',
          p.trangThai || 'Còn tồn',
          Number(p.tlTong) || 0,
          Number(p.tlHot) || 0,
          Number(p.tlVang) || 0,
          p.ni || 0,
          Number(p.congBan) || 0,
          Number(p.congVon) || 0,
          Number(p.giaBanMon) || 0,
          Number(p.giaVon) || 0,
          p.cuaHang || '',
          p.quayLon || '',
          p.quayNho || '',
          p.ngayNhap || '',
          p.chiNhanh || '',
          p.anhSanPham || '',
          p.nhaSanXuat || '',
          p.nhaCungCap || ''
        ]);
      });

      sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
      formatHeaderRow(sheet, headers.length);

      return jsonResponse({ success: true, message: `Đã đồng bộ ${items.length} sản phẩm thành công lên Google Sheet!` });
    }

    // 2. Thêm hoặc cập nhật 1 sản phẩm
    if (action === 'saveProduct') {
      const p = contents.product;
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(SHEET_NAMES.SAN_PHAM);
      const data = sheet.getDataRange().getValues();
      let rowIndex = -1;

      // Tìm dòng chứa mã hàng (so sánh không phân biệt hoa thường và khoảng trắng)
      const targetCode = String(p.maHang || '').trim().toUpperCase();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim().toUpperCase() === targetCode) {
          rowIndex = i + 1;
          break;
        }
      }

      // Lấy danh sách cột thực tế của Sheet
      const headers = data[0].map(h => String(h).trim());
      
      // Tự động bổ sung các cột mới nếu Sheet chưa có
      const checkAndAddCol = (colName) => {
        if (headers.indexOf(colName) === -1) {
          headers.push(colName);
          sheet.getRange(1, headers.length).setValue(colName);
          formatHeaderRow(sheet, headers.length);
        }
      };
      checkAndAddCol('chiNhanh');
      checkAndAddCol('anhSanPham');
      checkAndAddCol('nhaSanXuat');
      checkAndAddCol('nhaCungCap');

      const fieldMap = {
        maHang: p.maHang || '',
        tenHang: p.tenHang || '',
        loaiHang: p.loaiHang || '',
        loaiVang: p.loaiVang || '',
        nhomHang: p.nhomHang || '',
        trangThai: p.trangThai || 'Còn tồn',
        tlTong: Number(p.tlTong) || 0,
        tlHot: Number(p.tlHot) || 0,
        tlVang: Number(p.tlVang) || 0,
        ni: p.ni || 0,
        congBan: Number(p.congBan) || 0,
        congVon: Number(p.congVon) || 0,
        giaBanMon: Number(p.giaBanMon) || 0,
        giaVon: Number(p.giaVon) || 0,
        cuaHang: p.cuaHang || '',
        quayLon: p.quayLon || '',
        quayNho: p.quayNho || '',
        ngayNhap: p.ngayNhap || '',
        chiNhanh: p.chiNhanh || '',
        anhSanPham: p.anhSanPham || '',
        nhaSanXuat: p.nhaSanXuat || '',
        nhaCungCap: p.nhaCungCap || ''
      };

      const rowValues = headers.map(h => fieldMap[h] !== undefined ? fieldMap[h] : '');

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
      }

      return jsonResponse({ success: true, message: 'Lưu sản phẩm thành công!' });
    }

    // 3. Xóa sản phẩm
    if (action === 'deleteProduct') {
      const maHang = contents.maHang;
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(SHEET_NAMES.SAN_PHAM);
      const data = sheet.getDataRange().getValues();

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(maHang)) {
          sheet.deleteRow(i + 1);
          return jsonResponse({ success: true, message: `Đã xóa sản phẩm ${maHang}` });
        }
      }
      return jsonResponse({ success: false, message: 'Không tìm thấy sản phẩm cần xóa' });
    }

    // Đồng bộ toàn bộ hóa đơn (để hỗ trợ việc hoàn/hủy hóa đơn trực tiếp)
    if (action === 'syncAllOrders') {
      const orders = contents.orders;
      if (!orders) return jsonResponse({ success: false, message: 'Danh sách hóa đơn trống!' });

      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let orderSheet = ss.getSheetByName(SHEET_NAMES.HOA_DON);
      if (!orderSheet) orderSheet = ss.insertSheet(SHEET_NAMES.HOA_DON);
      
      // Clear contents but keep headers if they exist, or just clear all and re-add headers
      orderSheet.clearContents();
      
      const headers = ['maHD', 'ngayBan', 'tenKhach', 'sdt', 'items', 'tongTien', 'tongVon', 'nhanVien', 'ghiChu', 'trangThai', 'lyDoHuy', 'maHoanHang', 'maHDGoc'];
      orderSheet.appendRow(headers);

      if (orders.length > 0) {
        // Prepare 2D array for bulk insert
        // The frontend orders array goes from newest (index 0) to oldest. 
        // We can just write them in the same order.
        const rows = orders.map(order => [
          order.maHD || '',
          order.ngayBan || '',
          order.tenKhach || '',
          order.sdt || '',
          JSON.stringify(order.items || []),
          Number(order.tongTien) || 0,
          Number(order.tongVon) || 0,
          order.nhanVien || '',
          order.ghiChu || '',
          order.trangThai || 'Đã bán',
          order.lyDoHuy || '',
          order.maHoanHang || '',
          order.maHDGoc || ''
        ]);
        
        orderSheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      }

      return jsonResponse({ success: true, message: `Đã đồng bộ ${orders.length} hóa đơn.` });
    }

    // 4. Tạo đơn bán hàng & Tự động đổi trạng thái sản phẩm sang 'Đã bán'
    if (action === 'createOrder') {
      const order = contents.order; // { maHD, ngayBan, tenKhach, sdt, tongTien, nhanVien, ghiChu, items: [] }
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      
      // Ghi đơn vào sheet HoaDon
      const orderSheet = ss.getSheetByName(SHEET_NAMES.HOA_DON);
      const orderRow = [
        order.maHD || '',
        order.ngayBan || Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd HH:mm:ss'),
        order.tenKhach || 'Khách lẻ',
        order.sdt || '',
        JSON.stringify(order.items || []),
        Number(order.tongTien) || 0,
        Number(order.tongVon) || 0, // NEW
        order.nhanVien || '',
        order.ghiChu || '',
        'Đã bán', // trangThai
        '',       // lyDoHuy
        '',       // maHoanHang
        ''        // maHDGoc
      ];
      orderSheet.appendRow(orderRow);

      // Cập nhật trạng thái 'Đã bán' cho các mã hàng trong sheet SanPham
      if (order.items && order.items.length) {
        const productSheet = ss.getSheetByName(SHEET_NAMES.SAN_PHAM);
        const pData = productSheet.getDataRange().getValues();
        const soldCodes = order.items.map(it => String(it.maHang));

        for (let i = 1; i < pData.length; i++) {
          if (soldCodes.indexOf(String(pData[i][0])) !== -1) {
            // Cột 6 (Index F) là 'trangThai'
            productSheet.getRange(i + 1, 6).setValue('Đã bán');
          }
        }
      }

      return jsonResponse({ success: true, message: 'Đã tạo hóa đơn và cập nhật tồn kho thành công!' });
    }

    // 5. Cập nhật Bảng Giá Vàng
    if (action === 'updateGoldPrices') {
      const prices = contents.goldPrices;
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName(SHEET_NAMES.GIA_VANG);
      sheet.clearContents();

      const headers = ['loaiVang', 'hamLuong', 'giaMua', 'giaBan', 'donVi'];
      const rows = [headers];
      prices.forEach(p => {
        rows.push([p.loaiVang, p.hamLuong, Number(p.giaMua), Number(p.giaBan), p.donVi]);
      });
      sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
      formatHeaderRow(sheet, headers.length);

      return jsonResponse({ success: true, message: 'Cập nhật bảng giá vàng thành công!' });
    }

    // 6. Quản lý người dùng
    if (action === 'saveUser') {
      const user = contents.user;
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(SHEET_NAMES.NGUOI_DUNG);
      const data = sheet.getDataRange().getValues();
      let foundIndex = -1;

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(user.username)) {
          foundIndex = i + 1;
          break;
        }
      }

      const row = [user.username, user.password, user.fullName, user.role || 'nhanvien', user.phone || ''];
      if (foundIndex > 0) {
        sheet.getRange(foundIndex, 1, 1, row.length).setValues([row]);
      } else {
        sheet.appendRow(row);
      }
      return jsonResponse({ success: true, message: 'Lưu thông tin người dùng thành công!' });
    }

    // 7. Quản lý cấu hình thông tin tiệm vàng & Bảng giá TV
    if (action === 'saveStoreConfig') {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName(SHEET_NAMES.CAU_HINH);
      if (!sheet) {
        initSheetsIfNotExist();
        sheet = ss.getSheetByName(SHEET_NAMES.CAU_HINH);
      }
      const newConfig = contents.storeConfig;
      if (!newConfig) {
        return jsonResponse({ success: false, message: 'Dữ liệu cấu hình trống!' });
      }
      const range = sheet.getDataRange();
      const values = range.getValues();
      let foundRow = -1;
      for (let i = 1; i < values.length; i++) {
        if (values[i][0] === 'storeConfig') {
          foundRow = i + 1;
          break;
        }
      }
      const valStr = JSON.stringify(newConfig);
      if (foundRow > 0) {
        sheet.getRange(foundRow, 2).setValue(valStr);
      } else {
        sheet.appendRow(['storeConfig', valStr]);
      }
      return jsonResponse({ success: true, message: 'Lưu thông tin tiệm vàng lên Google Sheet thành công!' });
    }

    return jsonResponse({ success: false, message: 'Hành động không hợp lệ: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// Khởi tạo các bảng nếu chưa có
function initSheetsIfNotExist() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. SanPham
  if (!ss.getSheetByName(SHEET_NAMES.SAN_PHAM)) {
    const s = ss.insertSheet(SHEET_NAMES.SAN_PHAM);
    const headers = [
      'maHang', 'tenHang', 'loaiHang', 'loaiVang', 'nhomHang', 'trangThai',
      'tlTong', 'tlHot', 'tlVang', 'ni', 'congBan', 'congVon', 'giaBanMon',
      'giaVon', 'cuaHang', 'quayLon', 'quayNho', 'ngayNhap',
      'chiNhanh', 'anhSanPham', 'nhaSanXuat', 'nhaCungCap'
    ];
    s.appendRow(headers);
    formatHeaderRow(s, headers.length);
  }

  // 2. HoaDon
  if (!ss.getSheetByName(SHEET_NAMES.HOA_DON)) {
    const s = ss.insertSheet(SHEET_NAMES.HOA_DON);
    const headers = ['maHD', 'ngayBan', 'tenKhach', 'sdt', 'items', 'tongTien', 'tongVon', 'nhanVien', 'ghiChu', 'trangThai', 'lyDoHuy', 'maHoanHang', 'maHDGoc'];
    s.appendRow(headers);
    formatHeaderRow(s, headers.length);
  }

  // 3. GiaVang
  if (!ss.getSheetByName(SHEET_NAMES.GIA_VANG)) {
    const s = ss.insertSheet(SHEET_NAMES.GIA_VANG);
    const headers = ['loaiVang', 'hamLuong', 'giaMua', 'giaBan', 'donVi'];
    s.appendRow(headers);
    const defaultPrices = [
      ['Vàng 24K', '99.99%', 7600, 7850, 'chỉ'],
      ['VANG23K', '95.8%', 7200, 7500, 'chỉ'],
      ['Vàng Ý 18K', '75.0%', 5400, 5750, 'chỉ'],
      ['Vàng Korea 18k', '75.0%', 5400, 5750, 'chỉ'],
      ['Vàng 14K', '58.5%', 4100, 4450, 'chỉ'],
      ['Vàng 10K', '41.6%', 2800, 3150, 'chỉ'],
      ['Vàng 10k Ý', '41.6%', 2850, 3200, 'chỉ'],
      ['Vàng Korea 10K', '41.6%', 2850, 3200, 'chỉ'],
      ['Bạc', '92.5%', 90, 140, 'chỉ'],
      ['Bạc Ý', '92.5%', 95, 150, 'chỉ'],
      ['Đá Phong Thuỷ', '100%', 0, 0, 'món']
    ];
    defaultPrices.forEach(r => s.appendRow(r));
    formatHeaderRow(s, headers.length);
  }

  // 4. NguoiDung
  if (!ss.getSheetByName(SHEET_NAMES.NGUOI_DUNG)) {
    const s = ss.insertSheet(SHEET_NAMES.NGUOI_DUNG);
    const headers = ['username', 'password', 'fullName', 'role', 'phone', 'chiNhanh'];
    s.appendRow(headers);
    s.appendRow(['admin', '123', 'Quản Lý Chung (Admin)', 'admin', '0988.888.888', 'ALL']);
    s.appendRow(['chinhanh1', '123', 'Quản Lý Chi Nhánh 1', 'chinhanh', '0911.111.111', 'Chi nhánh 1']);
    s.appendRow(['chinhanh2', '123', 'Quản Lý Chi Nhánh 2', 'chinhanh', '0922.222.222', 'Chi nhánh 2']);
    formatHeaderRow(s, headers.length);
  }

  // 5. CauHinh (Lưu thông tin tiệm vàng & Bảng giá TV)
  if (!ss.getSheetByName(SHEET_NAMES.CAU_HINH)) {
    const s = ss.insertSheet(SHEET_NAMES.CAU_HINH);
    const headers = ['key', 'value'];
    s.appendRow(headers);
    s.appendRow(['storeConfig', JSON.stringify({
      storeName: 'TIỆM VÀNG HOÀNG KIM',
      slogan: 'Uy Tín Trọn Niềm Tin - Vàng Chuẩn Tuổi',
      address: '123 Đường Kim Hoàn, Quận 1, TP. Hồ Chí Minh',
      phone: '0988.888.888',
      tickerText: '✨ Kính chúc Quý khách Vạn Sự Như Ý - Phát Tài Phát Lộc! | Giá vàng niêm yết tại thời điểm giao dịch thực tế tại quầy | Nhận thu đổi, làm mới, đánh bóng trọn đời sản phẩm.'
    })]);
    formatHeaderRow(s, headers.length);
  }
}

function getSheetData(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const range = sheet.getDataRange();
  const values = range.getValues();
  if (values.length <= 1) return [];

  const headers = values[0];
  const list = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row[0] && !row[1]) continue;
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      let val = row[j];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, 'GMT+7', 'yyyy-MM-dd HH:mm:ss');
      } else if (headers[j] === 'password' || headers[j] === 'username') {
        val = String(val);
      }
      obj[headers[j]] = val;
    }
    list.push(obj);
  }
  return list;
}

function formatHeaderRow(sheet, colCount) {
  const headerRange = sheet.getRange(1, 1, 1, colCount);
  headerRange.setBackground('#D4AF37')
             .setFontColor('#000000')
             .setFontWeight('bold')
             .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
