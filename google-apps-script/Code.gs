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

/**
 * HÀM CẤP QUYỀN TRUY CẬP GOOGLE DRIVE (Chạy 1 lần trong Apps Script)
 * Hướng dẫn: Ở thanh menu bên trên ô soạn thảo, bấm vào ô chọn hàm (đang hiện doGet hoặc myFunction),
 * chọn hàm "authorizePermissions" rồi bấm nút "Chạy" (Run ▶️).
 * Khi Google hiện bảng "Cần có quyền truy cập", bấm:
 * "Xem lại quyền" -> Chọn tài khoản -> "Nâng cao" (Advanced) -> "Đi tới... (không an toàn)" -> "Cho phép" (Allow).
 */
function authorizePermissions() {
  // Kích hoạt toàn bộ quyền Tạo thư mục và Lưu file trên Google Drive (https://www.googleapis.com/auth/drive)
  let folder;
  const folders = DriveApp.getFoldersByName('PMQLV_Media');
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder('PMQLV_Media');
  }
  const testFile = folder.createFile('test_auth.txt', 'OK');
  testFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  testFile.setTrashed(true);
  SpreadsheetApp.getActiveSpreadsheet();
  Logger.log("✅ ĐÃ CẤP TOÀN BỘ QUYỀN GOOGLE DRIVE VÀ GOOGLE SHEET THÀNH CÔNG!");
}

const SHEET_NAMES = {
  SAN_PHAM: 'SanPham',
  HOA_DON: 'HoaDon',
  GIA_VANG: 'GiaVang',
  NGUOI_DUNG: 'NguoiDung',
  CAU_HINH: 'CauHinh',
  KHACH_HANG: 'KhachHang'
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
      const customers = getSheetData(SHEET_NAMES.KHACH_HANG);
      const storeConfig = getStoreConfigData();

      return jsonResponse({
        success: true,
        data: {
          products: products,
          goldPrices: goldPrices,
          users: users,
          orders: orders,
          customers: customers,
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
        'chiNhanh', 'anhSanPham', 'videoSanPham', 'nhaSanXuat', 'nhaCungCap'
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
          p.videoSanPham || '',
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
      checkAndAddCol('videoSanPham');
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
        videoSanPham: p.videoSanPham || '',
        nhaSanXuat: p.nhaSanXuat || '',
        nhaCungCap: p.nhaCungCap || ''
      };

      const rowValues = headers.map(h => {
        let val = fieldMap[h] !== undefined ? fieldMap[h] : '';
        // Phòng ngừa triệt để lỗi Google Sheet tối đa 50.000 ký tự trong một ô
        if (typeof val === 'string' && val.length > 48000) {
          try {
            let folder;
            const folders = DriveApp.getFoldersByName('PMQLV_Media');
            if (folders.hasNext()) folder = folders.next();
            else folder = DriveApp.createFolder('PMQLV_Media');

            let cleanBase64 = val;
            if (val.startsWith('["') || val.startsWith("['")) {
              try {
                const arr = JSON.parse(val);
                if (arr && arr[0]) cleanBase64 = arr[0];
              } catch(e) {}
            }
            if (cleanBase64.indexOf('base64,') > -1) {
              cleanBase64 = cleanBase64.split('base64,')[1];
            }
            const decoded = Utilities.base64Decode(cleanBase64);
            const blob = Utilities.newBlob(decoded, 'image/jpeg', 'img_' + (p.maHang || 'sp') + '_' + Date.now() + '.jpg');
            const file = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            val = 'https://drive.google.com/file/d/' + file.getId() + '/preview';
          } catch(err) {
            val = val.substring(0, 48000);
          }
        }
        return val;
      });

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
      
      const headers = ['maHD', 'ngayBan', 'tenKhach', 'sdt', 'items', 'tongTien', 'tongVon', 'nhanVien', 'ghiChu', 'trangThai', 'lyDoHuy', 'maHoanHang', 'maHDGoc', 'chiNhanh', 'nguoiBan'];
      orderSheet.appendRow(headers);
      formatHeaderRow(orderSheet, headers.length);

      if (orders.length > 0) {
        // Prepare 2D array for bulk insert
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
          order.maHDGoc || '',
          order.chiNhanh || '',
          order.nguoiBan || ''
        ]);
        
        orderSheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      }

      return jsonResponse({ success: true, message: `Đã đồng bộ ${orders.length} hóa đơn.` });
    }

    // 4. Tạo đơn bán hàng & Tự động đổi trạng thái sản phẩm sang 'Đã bán'
    if (action === 'createOrder') {
      const order = contents.order; // { maHD, ngayBan, tenKhach, sdt, tongTien, nhanVien, ghiChu, items: [], chiNhanh, nguoiBan }
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      
      // Ghi đơn vào sheet HoaDon
      let orderSheet = ss.getSheetByName(SHEET_NAMES.HOA_DON);
      if (!orderSheet) {
        orderSheet = ss.insertSheet(SHEET_NAMES.HOA_DON);
      }
      const data = orderSheet.getDataRange().getValues();
      let headers = data.length > 0 ? data[0].map(h => String(h).trim()) : [];

      if (headers.length === 0) {
        headers = ['maHD', 'ngayBan', 'tenKhach', 'sdt', 'cccd', 'items', 'tongTien', 'tongVon', 'nhanVien', 'ghiChu', 'trangThai', 'lyDoHuy', 'maHoanHang', 'maHDGoc', 'chiNhanh', 'nguoiBan'];
        orderSheet.appendRow(headers);
        formatHeaderRow(orderSheet, headers.length);
      } else {
        // Tự động thêm cột cccd, chiNhanh và nguoiBan nếu sheet HoaDon chưa có
        if (headers.indexOf('cccd') === -1) {
          headers.push('cccd');
          orderSheet.getRange(1, headers.length).setValue('cccd');
          formatHeaderRow(orderSheet, headers.length);
        }
        if (headers.indexOf('chiNhanh') === -1) {
          headers.push('chiNhanh');
          orderSheet.getRange(1, headers.length).setValue('chiNhanh');
          formatHeaderRow(orderSheet, headers.length);
        }
        if (headers.indexOf('nguoiBan') === -1) {
          headers.push('nguoiBan');
          orderSheet.getRange(1, headers.length).setValue('nguoiBan');
          formatHeaderRow(orderSheet, headers.length);
        }
      }

      const fieldMap = {
        maHD: order.maHD || '',
        ngayBan: order.ngayBan || Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd HH:mm:ss'),
        tenKhach: order.tenKhach || 'Khách lẻ',
        sdt: order.sdt || '',
        cccd: order.cccd || '',
        items: JSON.stringify(order.items || []),
        tongTien: Number(order.tongTien) || 0,
        tongVon: Number(order.tongVon) || 0,
        nhanVien: order.nhanVien || '',
        ghiChu: order.ghiChu || '',
        trangThai: order.trangThai || 'Đã bán',
        lyDoHuy: order.lyDoHuy || '',
        maHoanHang: order.maHoanHang || '',
        maHDGoc: order.maHDGoc || '',
        chiNhanh: order.chiNhanh || '',
        nguoiBan: order.nguoiBan || ''
      };

      const orderRow = headers.map(h => fieldMap[h] !== undefined ? fieldMap[h] : '');
      orderSheet.appendRow(orderRow);

      // Tự động lưu / cập nhật thông tin khách hàng vào sheet KhachHang
      if (order.tenKhach && order.tenKhach !== 'Khách lẻ' && (order.sdt || order.cccd)) {
        try {
          let custSheet = ss.getSheetByName(SHEET_NAMES.KHACH_HANG);
          if (!custSheet) {
            custSheet = ss.insertSheet(SHEET_NAMES.KHACH_HANG);
            custSheet.appendRow(['tenKhach', 'sdt', 'cccd', 'soLanMua', 'tongChiTieu', 'lanCuoiMua', 'ghiChu']);
            formatHeaderRow(custSheet, 7);
          }
          const custData = custSheet.getDataRange().getValues();
          const custHeaders = custData[0].map(h => String(h).trim());
          const sdtIdx = custHeaders.indexOf('sdt');
          const cccdIdx = custHeaders.indexOf('cccd');
          const nameIdx = custHeaders.indexOf('tenKhach');
          const countIdx = custHeaders.indexOf('soLanMua');
          const totalIdx = custHeaders.indexOf('tongChiTieu');
          const lastDateIdx = custHeaders.indexOf('lanCuoiMua');

          const cleanPhone = String(order.sdt || '').trim();
          const cleanCccd = String(order.cccd || '').trim();
          const cleanName = String(order.tenKhach || '').trim();

          let foundRow = -1;
          for (let i = 1; i < custData.length; i++) {
            const rowPhone = sdtIdx >= 0 ? String(custData[i][sdtIdx] || '').trim() : '';
            const rowCccd = cccdIdx >= 0 ? String(custData[i][cccdIdx] || '').trim() : '';
            if ((cleanPhone && rowPhone && cleanPhone === rowPhone) ||
                (cleanCccd && rowCccd && cleanCccd === rowCccd)) {
              foundRow = i + 1;
              break;
            }
          }

          const nowStr = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd HH:mm:ss');
          const orderTotal = Number(order.tongTien) || 0;

          if (foundRow > 0) {
            if (nameIdx >= 0 && cleanName) custSheet.getRange(foundRow, nameIdx + 1).setValue(cleanName);
            if (cleanCccd && cccdIdx >= 0) custSheet.getRange(foundRow, cccdIdx + 1).setValue(cleanCccd);
            if (cleanPhone && sdtIdx >= 0) custSheet.getRange(foundRow, sdtIdx + 1).setValue(cleanPhone);
            if (countIdx >= 0) {
              const currentCount = Number(custData[foundRow - 1][countIdx]) || 1;
              custSheet.getRange(foundRow, countIdx + 1).setValue(currentCount + 1);
            }
            if (totalIdx >= 0) {
              const currentTotal = Number(custData[foundRow - 1][totalIdx]) || 0;
              custSheet.getRange(foundRow, totalIdx + 1).setValue(currentTotal + orderTotal);
            }
            if (lastDateIdx >= 0) {
              custSheet.getRange(foundRow, lastDateIdx + 1).setValue(nowStr);
            }
          } else {
            custSheet.appendRow([
              cleanName,
              cleanPhone,
              cleanCccd,
              1,
              orderTotal,
              nowStr,
              order.ghiChu || ''
            ]);
          }
        } catch(custErr) {
          Logger.log('Lỗi cập nhật sheet KhachHang: ' + custErr.toString());
        }
      }

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

    // 6.2 Quản lý khách hàng
    if (action === 'saveCustomer') {
      const c = contents.customer;
      if (!c || (!c.tenKhach && !c.sdt && !c.cccd)) {
        return jsonResponse({ success: false, message: 'Dữ liệu khách hàng trống!' });
      }
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName(SHEET_NAMES.KHACH_HANG);
      if (!sheet) {
        initSheetsIfNotExist();
        sheet = ss.getSheetByName(SHEET_NAMES.KHACH_HANG);
      }
      const data = sheet.getDataRange().getValues();
      let foundIndex = -1;
      const targetPhone = String(c.sdt || '').trim();
      const targetCccd = String(c.cccd || '').trim();

      for (let i = 1; i < data.length; i++) {
        const rowPhone = String(data[i][1] || '').trim();
        const rowCccd = String(data[i][2] || '').trim();
        if ((targetPhone && rowPhone && targetPhone === rowPhone) ||
            (targetCccd && rowCccd && targetCccd === rowCccd)) {
          foundIndex = i + 1;
          break;
        }
      }

      const nowStr = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd HH:mm:ss');
      const row = [
        c.tenKhach || '',
        c.sdt || '',
        c.cccd || '',
        Number(c.soLanMua) || 1,
        Number(c.tongChiTieu) || 0,
        c.lanCuoiMua || nowStr,
        c.ghiChu || ''
      ];

      if (foundIndex > 0) {
        sheet.getRange(foundIndex, 1, 1, row.length).setValues([row]);
      } else {
        sheet.appendRow(row);
      }
      return jsonResponse({ success: true, message: 'Lưu thông tin khách hàng thành công!' });
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

    // 8. Tải video / hình ảnh lên Google Drive (Quay trực tiếp từ điện thoại)
    if (action === 'uploadVideo' || action === 'uploadMedia') {
      try {
        const base64Data = contents.data;
        if (!base64Data) {
          return jsonResponse({ success: false, message: 'Dữ liệu video trống!' });
        }
        const maHang = contents.maHang || 'SP';
        const fileName = contents.fileName || ('video_' + maHang + '_' + Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMdd_HHmmss') + '.mp4');
        const mimeType = contents.mimeType || 'video/mp4';

        const cleanBase64 = base64Data.indexOf('base64,') > -1 ? base64Data.split('base64,')[1] : base64Data;
        const decoded = Utilities.base64Decode(cleanBase64);
        const blob = Utilities.newBlob(decoded, mimeType, fileName);

        let folder;
        const folders = DriveApp.getFoldersByName('PMQLV_Media');
        if (folders.hasNext()) {
          folder = folders.next();
        } else {
          folder = DriveApp.createFolder('PMQLV_Media');
        }

        const file = folder.createFile(blob);
        const fileId = file.getId();
        const isImage = (mimeType && mimeType.indexOf('image') > -1) || fileName.match(/\.(jpg|jpeg|png|webp|gif)$/i);
        const finalUrl = isImage ? ('https://lh3.googleusercontent.com/d/' + fileId + '=s1000') : ('https://drive.google.com/file/d/' + fileId + '/preview');

        return jsonResponse({
          success: true,
          fileId: fileId,
          url: finalUrl,
          message: (isImage ? 'Tải ảnh' : 'Tải video') + ' lên Google Drive thành công!'
        });
      } catch (uploadErr) {
        return jsonResponse({
          success: false,
          error: 'Lỗi tải lên Google Drive: ' + uploadErr.toString()
        });
      }
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
      'chiNhanh', 'anhSanPham', 'videoSanPham', 'nhaSanXuat', 'nhaCungCap'
    ];
    s.appendRow(headers);
    formatHeaderRow(s, headers.length);
  }

  // 2. HoaDon
  if (!ss.getSheetByName(SHEET_NAMES.HOA_DON)) {
    const s = ss.insertSheet(SHEET_NAMES.HOA_DON);
    const headers = ['maHD', 'ngayBan', 'tenKhach', 'sdt', 'items', 'tongTien', 'tongVon', 'nhanVien', 'ghiChu', 'trangThai', 'lyDoHuy', 'maHoanHang', 'maHDGoc', 'chiNhanh', 'nguoiBan'];
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

  // 6. KhachHang (Lưu danh bạ khách hàng quen, số CCCD và tích lũy chi tiêu)
  if (!ss.getSheetByName(SHEET_NAMES.KHACH_HANG)) {
    const s = ss.insertSheet(SHEET_NAMES.KHACH_HANG);
    const headers = ['tenKhach', 'sdt', 'cccd', 'soLanMua', 'tongChiTieu', 'lanCuoiMua', 'ghiChu'];
    s.appendRow(headers);
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
