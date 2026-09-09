/**
 * PMQLV - Dịch vụ kết nối Google Sheets qua Google Apps Script Web App
 * Tối ưu xử lý CORS, phân tích lỗi chi tiết và kiểm tra URL chuẩn xác.
 */

const GoogleSheetService = {
  // BẠN HÃY DÁN ĐƯỜNG LINK GOOGLE SCRIPT CỦA BẠN VÀO GIỮA 2 DẤU NHÁY KÉP BÊN DƯỚI:
  // Ví dụ: "https://script.google.com/macros/s/AKfycbywC60xmXT0E0acGjJL4IkeHpgx6PcCaXsDYCMCO3_TM7n_.../exec"
  HARDCODED_URL: "https://script.google.com/macros/s/AKfycbycTY6oaVZlruQoCDJdxxOO744Bzghcom4ca67xz5_jgaDl9L5ex58kfbnUIPniJR9g/exec", 

  STORAGE_KEY: 'pmqlv_google_script_url',

  getUrl() {
    let customUrl = localStorage.getItem(this.STORAGE_KEY);
    if (customUrl && customUrl.trim() && this.validateUrl(customUrl).valid) {
      return customUrl.trim();
    }
    let url = this.HARDCODED_URL.trim();
    return url;
  },

  setUrl(url) {
    if (url) {
      url = url.trim();
    }
    localStorage.setItem(this.STORAGE_KEY, url);
  },

  // Kiểm tra định dạng URL
  validateUrl(url) {
    if (!url) {
      return { valid: false, message: 'Vui lòng nhập đường link URL của Google Apps Script.' };
    }
    url = url.trim();

    if (!url.startsWith('https://script.google.com/macros/s/')) {
      return { 
        valid: false, 
        message: 'URL không đúng định dạng. URL phải bắt đầu bằng: https://script.google.com/macros/s/...' 
      };
    }

    if (url.includes('/edit')) {
      return { 
        valid: false, 
        message: 'Bạn đang copy link chỉnh sửa (có đuôi /edit). Hãy vào nút "Triển khai" -> "Tùy chọn triển khai mới" để lấy link có đuôi "/exec"!' 
      };
    }

    if (!url.endsWith('/exec')) {
      return {
        valid: false,
        message: 'URL Web App phải kết thúc bằng chữ "/exec". Hãy kiểm tra lại link khi Triển khai.'
      };
    }

    return { valid: true };
  },

  isConfigured() {
    const url = this.getUrl();
    return this.validateUrl(url).valid;
  },

  // Kiểm tra kết nối đến Google Apps Script
  async testConnection() {
    const url = this.getUrl();
    const val = this.validateUrl(url);
    if (!val.valid) {
      return { success: false, message: val.message };
    }

    try {
      // Gọi GET ?action=ping
      const pingUrl = `${url}?action=ping&t=${Date.now()}`;
      const response = await fetch(pingUrl, {
        method: 'GET',
        mode: 'cors',
        redirect: 'follow'
      });

      const text = await response.text();
      let res;
      try {
        res = JSON.parse(text);
      } catch (e) {
        if (text.includes('accounts.google.com') || text.includes('ServiceLogin') || text.includes('Sign in')) {
          return {
            success: false,
            message: 'LỖI PHÂN QUYỀN: Google bắt đăng nhập tài khoản. Khi Triển khai Web App, tại mục "Ai có quyền truy cập" (Who has access), bạn BẮT BUỘC phải chọn là "Bất kỳ ai" (Anyone)!'
          };
        }
        return {
          success: false,
          message: 'Phản hồi từ Google không đúng: ' + text.slice(0, 160)
        };
      }

      if (res && res.success) {
        return { success: true, message: res.message || 'Kết nối thành công!' };
      } else {
        return { success: false, message: (res && (res.message || res.error)) || 'Không thể lấy phản hồi từ Apps Script.' };
      }
    } catch (err) {
      console.error('Lỗi kiểm tra kết nối Google Sheet:', err);
      return {
        success: false,
        message: 'Không thể kết nối (Lỗi mạng hoặc chặn CORS). Hãy đảm bảo bạn đã chọn quyền "Bất kỳ ai" (Anyone) khi Triển khai.'
      };
    }
  },

  async fetchAllData() {
    if (!this.isConfigured()) return null;

    try {
      const url = this.getUrl();
      const response = await fetch(`${url}?action=getData&t=${Date.now()}`, {
        method: 'GET',
        mode: 'cors',
        redirect: 'follow'
      });
      const text = await response.text();
      const res = JSON.parse(text);
      if (res && res.success && res.data) {
        if (res.data.orders && Array.isArray(res.data.orders)) {
          res.data.orders = res.data.orders.map(o => {
            if (typeof o.items === 'string') {
              try { o.items = JSON.parse(o.items); } catch(e) { o.items = []; }
            } else if (typeof o.chiTietSanPham === 'string') {
              try { o.items = JSON.parse(o.chiTietSanPham); } catch(e) { o.items = []; }
            }
            // Khôi phục chính xác chi nhánh cho đơn hàng nếu chưa có hoặc đang trống
            if (!o.chiNhanh || o.chiNhanh === 'undefined' || o.chiNhanh === 'null' || !String(o.chiNhanh).trim()) {
              if (Array.isArray(o.items) && o.items.length > 0) {
                const itBranch = o.items.find(it => it && it.chiNhanh);
                if (itBranch) o.chiNhanh = itBranch.chiNhanh;
              }
              if (!o.chiNhanh) {
                if (o.nguoiBan === 'chinhanh2' || (o.nhanVien && o.nhanVien.includes('Chi nhánh 2')) || (o.ghiChu && o.ghiChu.includes('Chi nhánh 2'))) {
                  o.chiNhanh = 'Chi nhánh 2';
                }
              }
            }
            return o;
          });
        }
        return res.data;
      }
      return null;
    } catch (err) {
      console.warn('Không thể tải dữ liệu từ Google Sheet:', err);
      return null;
    }
  },

  // Tải riêng Bảng Giá Vàng siêu tốc phục vụ hiển thị TV thời gian thực
  async fetchGoldPrices() {
    if (!this.isConfigured()) return null;

    try {
      const url = this.getUrl();
      const sep = url.includes('?') ? '&' : '?';
      // Gọi getGoldPrices (chỉ tải riêng giá vàng, phản hồi siêu nhanh 0.1s)
      const response = await fetch(`${url}${sep}action=getGoldPrices&_t=${Date.now()}`, {
        method: 'GET',
        mode: 'cors',
        redirect: 'follow',
        cache: 'no-store'
      });
      const text = await response.text();
      let res;
      try { res = JSON.parse(text); } catch(e) { res = null; }
      if (res && res.success && res.data) {
        if (res.data.storeConfig && typeof res.data.storeConfig === 'object') {
          try {
            localStorage.setItem('pmqlv_store_config', JSON.stringify(res.data.storeConfig));
          } catch(e) {}
        }
        if (Array.isArray(res.data.goldPrices) && res.data.goldPrices.length > 0) {
          return res.data.goldPrices;
        }
      }

      // Fallback nếu bản Google Script trên Google Sheet chưa được update action mới
      const all = await this.fetchAllData();
      return (all && all.goldPrices) ? all.goldPrices : null;
    } catch (err) {
      console.warn('Lỗi khi fetchGoldPrices:', err);
      try {
        const all = await this.fetchAllData();
        return (all && all.goldPrices) ? all.goldPrices : null;
      } catch (e) {
        return null;
      }
    }
  },

  // Đồng bộ toàn bộ sản phẩm lên Google Sheet (1.174 món)
  async syncAllProducts(products) {
    const url = this.getUrl();
    const val = this.validateUrl(url);
    if (!val.valid) {
      return { success: false, message: val.message };
    }

    if (!products || products.length === 0) {
      products = (window.DEFAULT_PRODUCTS && window.DEFAULT_PRODUCTS.length > 0) ? window.DEFAULT_PRODUCTS : [];
    }

    try {
      // Gửi POST tới Apps Script Web App
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
        body: JSON.stringify({
          action: 'syncAllProducts',
          products: products
        })
      });

      const text = await response.text();
      let res;
      try {
        res = JSON.parse(text);
      } catch (jsonErr) {
        if (text.includes('accounts.google.com') || text.includes('ServiceLogin')) {
          return {
            success: false,
            message: 'LỖI PHÂN QUYỀN: Bạn chưa mở quyền "Bất kỳ ai" (Anyone) khi Triển khai Web App trên Google Sheet!'
          };
        }
        return {
          success: false,
          message: 'Lỗi phản hồi từ Google Sheet: ' + text.slice(0, 180)
        };
      }

      return res;
    } catch (err) {
      console.error('Lỗi đồng bộ sản phẩm lên Google Sheet:', err);
      return {
        success: false,
        message: 'Lỗi kết nối mạng hoặc chặn CORS: ' + err.message + '. Hãy kiểm tra lại link Web App và quyền truy cập Anyone.'
      };
    }
  },

  async syncAllOrders(orders) {
    const url = this.getUrl();
    if (!this.validateUrl(url).valid) return { success: false, message: 'URL không hợp lệ' };
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
        body: JSON.stringify({
          action: 'syncAllOrders',
          orders: orders
        })
      });
      const text = await response.text();
      return JSON.parse(text);
    } catch (err) {
      return { success: false, error: err.toString() };
    }
  },
  async saveProduct(product) {
    if (!this.isConfigured()) return { success: false, notConfigured: true, message: 'Chưa cấu hình URL Google Sheet' };

    let lastErr = null;
    const url = this.getUrl();

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          redirect: 'follow',
          body: JSON.stringify({
            action: 'saveProduct',
            product: product
          })
        });
        const text = await response.text();
        let res;
        try {
          res = JSON.parse(text);
        } catch (jsonErr) {
          if (text.includes('accounts.google.com') || text.includes('ServiceLogin')) {
            return {
              success: false,
              message: 'LỖI PHÂN QUYỀN: Web App cần được chọn quyền "Bất kỳ ai" (Anyone) khi Triển khai!'
            };
          }
          if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
            return {
              success: false,
              message: 'Máy chủ Google báo bận hoặc dữ liệu ảnh/video gửi trực tiếp quá lớn. Vui lòng đảm bảo ảnh/video được tải lên Cloudinary trước khi lưu!'
            };
          }
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (attempt === 1) {
          // Nghỉ 1 giây rồi thử lại lần 2 nếu mạng di động bị nghẽn
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    return { 
      success: false, 
      message: 'Lỗi kết nối mạng: ' + (lastErr ? lastErr.message || lastErr.toString() : 'Không thể kết nối đến Google Sheet. Vui lòng kiểm tra lại mạng 4G/Wifi.') 
    };
  },

  async deleteProduct(maHang) {
    if (!this.isConfigured()) return { success: true, localOnly: true };

    try {
      const url = this.getUrl();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
        body: JSON.stringify({
          action: 'deleteProduct',
          maHang: maHang
        })
      });
      const text = await response.text();
      return JSON.parse(text);
    } catch (err) {
      return { success: false, message: err.toString() };
    }
  },

  async createOrder(order) {
    if (!this.isConfigured()) return { success: true, localOnly: true };

    try {
      const url = this.getUrl();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
        body: JSON.stringify({
          action: 'createOrder',
          order: order
        })
      });
      const text = await response.text();
      return JSON.parse(text);
    } catch (err) {
      return { success: false, message: err.toString() };
    }
  },

  async updateGoldPrices(goldPrices) {
    if (!this.isConfigured()) return { success: true, localOnly: true };

    try {
      const url = this.getUrl();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
        body: JSON.stringify({
          action: 'updateGoldPrices',
          goldPrices: goldPrices
        })
      });
      const text = await response.text();
      return JSON.parse(text);
    } catch (err) {
      return { success: false, message: err.toString() };
    }
  },

  async saveStoreConfig(storeConfig) {
    if (!this.isConfigured()) return { success: true, localOnly: true };

    try {
      const url = this.getUrl();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
        body: JSON.stringify({
          action: 'saveStoreConfig',
          storeConfig: storeConfig
        })
      });
      const text = await response.text();
      return JSON.parse(text);
    } catch (err) {
      console.warn('Lỗi lưu cấu hình lên Google Sheet:', err);
      return { success: false, message: err.toString() };
    }
  },

  async saveCustomer(customer) {
    if (!this.isConfigured()) return { success: true, localOnly: true };

    try {
      const url = this.getUrl();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
        body: JSON.stringify({
          action: 'saveCustomer',
          customer: customer
        })
      });
      const text = await response.text();
      return JSON.parse(text);
    } catch (err) {
      console.warn('Lỗi lưu khách hàng lên Google Sheet:', err);
      return { success: false, message: err.toString() };
    }
  }
};
