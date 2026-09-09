/**
 * =========================================================================
 * PMQLV - LOGIC ỨNG DỤNG BÁN HÀNG & QUẢN LÝ KHO VÀNG BẠC ĐÁ QUÝ
 * =========================================================================
 */

class GoldApp {
  constructor() {
    this.products = [];
    this.goldPrices = [];
    this.users = [];
    this.currentUser = null;
    this.storeConfig = null;
    this.cart = [];
    this.orders = [];
    this.customers = [];
    this.currentCustomerMatches = [];
    this.tagQueue = [];

    this.branches = ['Chi nhánh 1', 'Chi nhánh 2'];
    this.currentBranch = 'Chi nhánh 1';

    // Bộ lọc kho
    this.filteredProducts = [];
    this.currentPage = 1;
    this.itemsPerPage = 40;
    this.selectedMaHangSet = new Set();

    // Mặt hàng vừa thêm mới hoặc vừa sửa (tiện in tem)
    this.recentModifiedItems = []; // [{ maHang: string, type: 'new' | 'edit', timestamp: number, timeFormatted: string, fullTime: string, user: string }]
    this.isFilteringRecentOnly = false;
    this.recentSubFilter = 'all'; // 'all' | 'new' | 'edit'

    // Camera Scanner
    this.html5QrCode = null;
    this.scannerMode = 'pos'; // 'pos' hoặc 'inv'

    this.init();
  }

  // Khởi động ứng dụng
  async init() {
    try {
      this.showGlobalLoading('Đang tải dữ liệu...');
      this.loadLocalData();
      this.updateRecentModifiedUI();
      this.applyStoreConfig();
      this.setupEventListeners();
      this.updateUserRoleUI();
      this.updateAuthGateUI();

      // Chỉ render dữ liệu nội bộ nếu đã đăng nhập hợp lệ
      if (this.currentUser) {
        try { this.renderGoldRatesTable(); } catch(e) { console.error('renderGoldRatesTable error:', e); }
        try { this.filterPosProducts(); } catch(e) { console.error('filterPosProducts error:', e); }
        try { this.filterInventory(); } catch(e) { console.error('filterInventory error:', e); }
        if (typeof this.renderTagQueue === 'function') try { this.renderTagQueue(); } catch(e) {}
        try { this.updateReportStats(); } catch(e) { console.error('updateReportStats error:', e); }
        if (typeof this.checkCloudSync === 'function') try { this.checkCloudSync(); } catch(e) {}
      }

      // Ẩn loading ngay để người dùng có thể dùng giao diện
      this.hideGlobalLoading();

      // Tự động tải dữ liệu từ cloud nền (không chặn UI)
      try {
        await this.fetchRealTimeData();
      } catch (e) {
        console.warn('Lỗi tải cloud:', e);
      }

      // Tự động kiểm tra và cập nhật giá vàng thời gian thực mỗi 4 giây (siêu nhanh, nhẹ, không lag)
      if (this.goldSyncInterval) clearInterval(this.goldSyncInterval);
      this.goldSyncInterval = setInterval(() => {
        if (this.currentUser) {
          this.fetchGoldPricesRealtime();
        }
      }, 4000);
    } catch(e) {
      console.error('INIT FAILED:', e);
      this.hideGlobalLoading();
      // Show error on screen
      const errDiv = document.createElement('div');
      errDiv.style.cssText = 'position:fixed;top:50px;left:50%;transform:translateX(-50%);background:#EF4444;color:white;padding:15px 20px;border-radius:8px;z-index:99999;max-width:600px;font-size:13px;';
      errDiv.innerHTML = '<b>Lỗi khởi động ứng dụng:</b><br>' + e.message + '<br><small>' + e.stack + '</small>';
      document.body.appendChild(errDiv);
    }
  }

  showGlobalLoading(msg = 'Đang xử lý...') {
    let loader = document.getElementById('globalLoader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'globalLoader';
      loader.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.9); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center;';
      document.body.appendChild(loader);
    }
    loader.innerHTML = `
      <div style="width:50px;height:50px;border:5px solid #E2E8F0;border-top:5px solid #1E3A8A;border-radius:50%;animation:spin 1s linear infinite;"></div>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
      <div style="margin-top:20px;font-size:16px;font-weight:bold;color:#1E3A8A;text-align:center;">${msg}</div>
      <div style="margin-top:8px;font-size:13px;color:#64748B;">Lấy dữ liệu trực tiếp từ Google Sheet...</div>
    `;
    loader.style.display = 'flex';
  }

  hideGlobalLoading() {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.style.display = 'none';
  }

  showToast(message, type = 'info') {
    let container = document.getElementById('appGlobalToast');
    if (!container) {
      container = document.createElement('div');
      container.id = 'appGlobalToast';
      container.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:999999;pointer-events:none;transition:all 0.3s ease;';
      document.body.appendChild(container);
    }
    const bg = type === 'success' ? '#059669' : (type === 'error' ? '#DC2626' : '#2563EB');
    container.innerHTML = `
      <div style="background:${bg};color:#FFF;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 4px 14px rgba(0,0,0,0.25);pointer-events:auto;display:flex;align-items:center;gap:8px;">
        <span>${message}</span>
      </div>
    `;
    container.style.opacity = '1';
    container.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
      if (container) {
        container.style.opacity = '0';
        container.style.transform = 'translateX(-50%) translateY(10px)';
      }
    }, 3000);
  }

  formatWeight(tl) {
    if (typeof BarcodeLabel !== 'undefined' && BarcodeLabel.formatWeight) {
      return BarcodeLabel.formatWeight(tl);
    }
    return (Number(tl) || 0).toFixed(3) + ' chỉ';
  }

  async fetchRealTimeData() {
    if (!GoogleSheetService.isConfigured()) return;
    try {
      const data = await GoogleSheetService.fetchAllData();
      if (data) {
        if (data.products && Array.isArray(data.products)) this.products = data.products;
        if (data.goldPrices && Array.isArray(data.goldPrices)) {
          if (data.goldPrices.length === 0) {
            this.goldPrices = (window.DEFAULT_GOLD_PRICES && window.DEFAULT_GOLD_PRICES.length > 0) ? window.DEFAULT_GOLD_PRICES : this.goldPrices;
          } else {
            this.goldPrices = data.goldPrices;
          }
        }
        if (data.users && Array.isArray(data.users) && data.users.length > 0) {
          const merged = [...data.users];
          (window.DEFAULT_USERS || []).forEach(def => {
            if (!merged.some(u => String(u.username || '').toLowerCase() === def.username.toLowerCase())) {
              merged.push(def);
            }
          });
          this.users = merged;
          localStorage.setItem('pmqlv_users', JSON.stringify(this.users));
        }
        if (data.orders && Array.isArray(data.orders)) {
          this.orders = data.orders;
          this.orders.forEach(o => {
            if (typeof o.items === 'string') {
              try { o.items = JSON.parse(o.items); } catch(e) { o.items = []; }
            } else if (typeof o.chiTietSanPham === 'string') {
              try { o.items = JSON.parse(o.chiTietSanPham); } catch(e) { o.items = []; }
            }
            o.chiNhanh = this.normalizeOrderBranch(o);
          });
        }
        if (data.customers && Array.isArray(data.customers)) {
          const merged = [...(this.customers || [])];
          data.customers.forEach(sc => {
            const scPhone = (sc.sdt || '').trim();
            const scCccd = (sc.cccd || '').trim();
            const found = merged.find(c => (scPhone && c.sdt && c.sdt.trim() === scPhone) || (scCccd && c.cccd && c.cccd.trim() === scCccd));
            if (!found) {
              merged.push(sc);
            } else {
              if (sc.tenKhach && (!found.tenKhach || found.tenKhach === 'Khách lẻ')) found.tenKhach = sc.tenKhach;
              if (sc.cccd && !found.cccd) found.cccd = sc.cccd;
              if (sc.sdt && !found.sdt) found.sdt = sc.sdt;
              if (sc.soLanMua) found.soLanMua = Math.max(Number(found.soLanMua) || 1, Number(sc.soLanMua));
              if (sc.tongChiTieu) found.tongChiTieu = Math.max(Number(found.tongChiTieu) || 0, Number(sc.tongChiTieu));
            }
          });
          this.customers = merged;
          this.saveCustomersToLocal();
        }
        if (data.storeConfig && typeof data.storeConfig === 'object') {
          this.storeConfig = Object.assign({}, this.storeConfig, data.storeConfig);
          localStorage.setItem('pmqlv_store_config', JSON.stringify(this.storeConfig));
          if (Array.isArray(data.storeConfig.recentModifiedItems)) {
            this.recentModifiedItems = data.storeConfig.recentModifiedItems;
            localStorage.setItem('pmqlv_recent_modified_items', JSON.stringify(this.recentModifiedItems));
            this.updateRecentModifiedUI();
          }
          this.applyStoreConfig();
        }
        this.saveProductsToLocal();
        this.saveOrdersToLocal();
        localStorage.setItem('pmqlv_gold_prices', JSON.stringify(this.goldPrices));

        this.filterPosProducts();
        this.filterInventory();
        this.updateReportStats();
        if (typeof this.renderGoldRatesTable === 'function') this.renderGoldRatesTable();
      }
    } catch (err) {
      console.warn('Lỗi tải dữ liệu real-time:', err);
    }
  }

  // Đồng bộ giá vàng thời gian thực siêu tốc từ Google Sheet (đặc biệt cho điện thoại / đa thiết bị)
  async fetchGoldPricesRealtime(forceRender = false) {
    if (this._isFetchingGoldPrices) return;
    if (typeof GoogleSheetService === 'undefined' || !GoogleSheetService.isConfigured()) return;

    this._isFetchingGoldPrices = true;
    try {
      const prices = await GoogleSheetService.fetchGoldPrices();
      if (prices && Array.isArray(prices) && prices.length > 0) {
        const currentStr = JSON.stringify(this.goldPrices || []);
        const newStr = JSON.stringify(prices);
        if (currentStr !== newStr) {
          console.log('⚡ Đồng bộ giá vàng mới từ Google Sheet thành công!');
          this.goldPrices = prices;
          localStorage.setItem('pmqlv_gold_prices', newStr);
          this.renderGoldRatesTable();
          this.filterPosProducts();
          if (typeof this.updateCartUI === 'function') {
            this.updateCartUI();
          }
        } else if (forceRender) {
          this.renderGoldRatesTable();
        }
      }
    } catch (err) {
      console.warn('Lỗi fetchGoldPricesRealtime:', err);
    } finally {
      this._isFetchingGoldPrices = false;
    }
  }

  // Tải dữ liệu từ LocalStorage hoặc dữ liệu mẫu ban đầu
  loadLocalData() {
    // 1. Cấu hình tiệm
    const savedConfig = localStorage.getItem('pmqlv_store_config');
    this.storeConfig = savedConfig ? JSON.parse(savedConfig) : (window.DEFAULT_STORE_CONFIG || {});
    window.storeConfig = this.storeConfig;

    // 2. Giá vàng
    const savedPrices = localStorage.getItem('pmqlv_gold_prices');
    let loadedPrices = [];
    if (savedPrices) {
      try { loadedPrices = JSON.parse(savedPrices); } catch (e) { loadedPrices = []; }
    }
    const defaultPrices = (window.DEFAULT_GOLD_PRICES && window.DEFAULT_GOLD_PRICES.length > 0) ? window.DEFAULT_GOLD_PRICES : [];
    if (!savedPrices || !loadedPrices || loadedPrices.length === 0) {
      loadedPrices = defaultPrices;
    }
    this.goldPrices = loadedPrices;
    localStorage.setItem('pmqlv_gold_prices', JSON.stringify(this.goldPrices));

    // 3. Danh sách sản phẩm (1.174 sản phẩm)
    const savedProducts = localStorage.getItem('pmqlv_products');
    let loadedProducts = [];
    if (savedProducts) {
      try {
        loadedProducts = JSON.parse(savedProducts);
      } catch (e) {
        loadedProducts = [];
      }
    }
    if (!loadedProducts || (loadedProducts.length === 0 && savedProducts === null)) {
      loadedProducts = (window.DEFAULT_PRODUCTS && window.DEFAULT_PRODUCTS.length > 0) ? window.DEFAULT_PRODUCTS : [];
    }
    this.products = loadedProducts;
    this.saveProductsToLocal();

    // 4. Người dùng & Phân quyền (3 tài khoản: admin, chinhanh1, chinhanh2)
    const savedUsers = localStorage.getItem('pmqlv_users');
    let loadedUsers = [];
    if (savedUsers) {
      try { loadedUsers = JSON.parse(savedUsers); } catch(e) { loadedUsers = []; }
    }
    const defaultUsers = window.DEFAULT_USERS || [];
    if (!Array.isArray(loadedUsers) || loadedUsers.length === 0) {
      loadedUsers = defaultUsers;
    } else {
      defaultUsers.forEach(def => {
        const existing = loadedUsers.find(u => String(u.username || '').toLowerCase() === def.username.toLowerCase());
        if (!existing) {
          loadedUsers.push(def);
        } else if (def.role === 'nhanvien' && existing.role !== 'nhanvien') {
          existing.role = 'nhanvien';
          existing.fullName = def.fullName;
        }
      });
    }
    this.users = loadedUsers;
    localStorage.setItem('pmqlv_users', JSON.stringify(this.users));

    // 5. Đăng nhập hiện tại (Chỉ đăng nhập nếu có phiên xác thực hợp lệ)
    const savedCurrentUser = localStorage.getItem('pmqlv_current_user') || sessionStorage.getItem('pmqlv_current_user');
    let authenticatedUser = null;
    if (savedCurrentUser) {
      try {
        const parsed = JSON.parse(savedCurrentUser);
        if (parsed && parsed.username) {
          const match = this.users.find(u => 
            String(u.username || '').trim().toLowerCase() === String(parsed.username || '').trim().toLowerCase() &&
            String(u.password || '').trim() === String(parsed.password || '').trim()
          );
          if (match) authenticatedUser = match;
        }
      } catch (e) {
        authenticatedUser = null;
      }
    }
    this.currentUser = authenticatedUser;

    // 6. Lịch sử đơn hàng
    const savedOrders = localStorage.getItem('pmqlv_orders');
    this.orders = savedOrders ? JSON.parse(savedOrders) : [];
    this.orders.forEach(o => {
      if (typeof o.items === 'string') {
        try { o.items = JSON.parse(o.items); } catch(e) { o.items = []; }
      } else if (typeof o.chiTietSanPham === 'string') {
        try { o.items = JSON.parse(o.chiTietSanPham); } catch(e) { o.items = []; }
      }
      o.chiNhanh = this.normalizeOrderBranch(o);
    });

    // 7. Mặt hàng vừa thêm mới hoặc vừa sửa (để tiện in tem, đồng bộ đa thiết bị)
    if (this.storeConfig && Array.isArray(this.storeConfig.recentModifiedItems)) {
      this.recentModifiedItems = this.storeConfig.recentModifiedItems;
    } else {
      const savedRecent = localStorage.getItem('pmqlv_recent_modified_items');
      if (savedRecent) {
        try {
          this.recentModifiedItems = JSON.parse(savedRecent) || [];
        } catch(e) {
          this.recentModifiedItems = [];
        }
      } else {
        this.recentModifiedItems = [];
      }
    }

    // 8. Danh sách khách hàng thân thiết & CCCD
    this.customers = this.loadCustomersFromLocal();
  }

  loadCustomersFromLocal() {
    let list = [];
    const saved = localStorage.getItem('pmqlv_customers');
    if (saved) {
      try { list = JSON.parse(saved) || []; } catch(e) { list = []; }
    }
    if ((!list || list.length === 0) && this.orders && this.orders.length > 0) {
      const map = new Map();
      this.orders.forEach(o => {
        const name = (o.tenKhach || '').trim();
        const phone = (o.sdt || '').trim();
        const cccd = (o.cccd || '').trim();
        if (name && name !== 'Khách lẻ' && (phone || cccd)) {
          const key = phone || cccd || name;
          if (!map.has(key)) {
            map.set(key, {
              tenKhach: name,
              sdt: phone,
              cccd: cccd,
              soLanMua: 1,
              tongChiTieu: Number(o.tongTien) || 0,
              lanCuoiMua: o.ngayBan || ''
            });
          } else {
            const existing = map.get(key);
            existing.soLanMua = (existing.soLanMua || 1) + 1;
            existing.tongChiTieu = (existing.tongChiTieu || 0) + (Number(o.tongTien) || 0);
            if (!existing.cccd && cccd) existing.cccd = cccd;
            if (!existing.sdt && phone) existing.sdt = phone;
          }
        }
      });
      list = Array.from(map.values());
      this.saveCustomersToLocal(list);
    }
    return list;
  }

  saveCustomersToLocal(list = null) {
    if (list) this.customers = list;
    try {
      localStorage.setItem('pmqlv_customers', JSON.stringify(this.customers || []));
    } catch(e) {}
  }

  onCustomerInput(field) {
    const nameVal = (document.getElementById('cartCustomerName')?.value || '').trim().toLowerCase();
    const phoneVal = (document.getElementById('cartCustomerPhone')?.value || '').trim();
    const cccdVal = (document.getElementById('cartCustomerCccd')?.value || '').trim();

    const sugBox = document.getElementById('customerSuggestions');
    const badgeEl = document.getElementById('custSavedBadge');

    const exactMatch = (this.customers || []).find(c => 
      (phoneVal && c.sdt && c.sdt.trim() === phoneVal) ||
      (cccdVal && c.cccd && c.cccd.trim() === cccdVal)
    );
    if (badgeEl) {
      badgeEl.style.display = exactMatch ? 'inline-block' : 'none';
    }

    if (!sugBox) return;

    const currentVal = (field === 'name' ? nameVal : (field === 'phone' ? phoneVal : cccdVal)).toLowerCase();
    if (!currentVal || currentVal.length < 1) {
      sugBox.style.display = 'none';
      return;
    }

    const matches = (this.customers || []).filter(c => {
      const matchName = c.tenKhach && c.tenKhach.toLowerCase().includes(currentVal);
      const matchPhone = c.sdt && c.sdt.includes(currentVal);
      const matchCccd = c.cccd && c.cccd.includes(currentVal);
      return matchName || matchPhone || matchCccd;
    }).slice(0, 5);

    if (matches.length === 0) {
      sugBox.style.display = 'none';
      return;
    }

    sugBox.innerHTML = matches.map((c, idx) => `
      <div class="customer-suggestion-item" onmousedown="app.selectCustomerSuggestion(${idx})">
        <div class="cust-item-main">
          <div class="cust-item-name">${c.tenKhach || 'Khách hàng'}</div>
          <div class="cust-item-details">
            ${c.sdt ? `<span>📞 ${c.sdt}</span>` : ''}
            ${c.cccd ? `<span>🪪 CCCD: <b>${c.cccd}</b></span>` : ''}
          </div>
        </div>
        <div class="cust-item-badge">
          ${c.soLanMua ? `${c.soLanMua} lần mua` : 'Khách cũ'}
        </div>
      </div>
    `).join('');

    this.currentCustomerMatches = matches;
    sugBox.style.display = 'block';
  }

  onCustomerFocus(field) {
    this.onCustomerInput(field);
  }

  onCustomerBlur(field) {
    setTimeout(() => {
      const sugBox = document.getElementById('customerSuggestions');
      if (sugBox) sugBox.style.display = 'none';

      const phoneVal = (document.getElementById('cartCustomerPhone')?.value || '').trim();
      const cccdVal = (document.getElementById('cartCustomerCccd')?.value || '').trim();
      const nameInput = document.getElementById('cartCustomerName');
      const phoneInput = document.getElementById('cartCustomerPhone');
      const cccdInput = document.getElementById('cartCustomerCccd');
      const badgeEl = document.getElementById('custSavedBadge');

      if ((field === 'phone' && phoneVal) || (field === 'cccd' && cccdVal)) {
        const found = (this.customers || []).find(c => 
          (field === 'phone' && c.sdt && c.sdt.trim() === phoneVal) ||
          (field === 'cccd' && c.cccd && c.cccd.trim() === cccdVal)
        );
        if (found) {
          if (nameInput && (!nameInput.value.trim() || nameInput.value.trim() === 'Khách lẻ')) {
            nameInput.value = found.tenKhach || '';
          }
          if (phoneInput && !phoneInput.value.trim() && found.sdt) {
            phoneInput.value = found.sdt;
          }
          if (cccdInput && !cccdInput.value.trim() && found.cccd) {
            cccdInput.value = found.cccd;
          }
          if (badgeEl) badgeEl.style.display = 'inline-block';
        }
      }
    }, 200);
  }

  selectCustomerSuggestion(idx) {
    if (!this.currentCustomerMatches || !this.currentCustomerMatches[idx]) return;
    const c = this.currentCustomerMatches[idx];

    const nameInput = document.getElementById('cartCustomerName');
    const phoneInput = document.getElementById('cartCustomerPhone');
    const cccdInput = document.getElementById('cartCustomerCccd');
    const badgeEl = document.getElementById('custSavedBadge');
    const sugBox = document.getElementById('customerSuggestions');

    if (nameInput) nameInput.value = c.tenKhach || '';
    if (phoneInput) phoneInput.value = c.sdt || '';
    if (cccdInput) cccdInput.value = c.cccd || '';
    if (badgeEl) badgeEl.style.display = 'inline-block';
    if (sugBox) sugBox.style.display = 'none';

    this.showToast(`✨ Đã điền thông tin khách: ${c.tenKhach || c.sdt}`, 'success');
  }

  saveOrUpdateCustomer(custName, custPhone, custCccd, orderTotal = 0) {
    const cleanName = (custName || 'Khách lẻ').trim();
    const cleanPhone = (custPhone || '').trim();
    const cleanCccd = (custCccd || '').trim();

    if (!cleanPhone && !cleanCccd && cleanName === 'Khách lẻ') return;

    if (!this.customers) this.customers = [];

    let found = this.customers.find(c => 
      (cleanPhone && c.sdt && c.sdt.trim() === cleanPhone) ||
      (cleanCccd && c.cccd && c.cccd.trim() === cleanCccd)
    );

    const nowStr = new Date().toLocaleString('vi-VN');

    if (found) {
      if (cleanName && cleanName !== 'Khách lẻ') found.tenKhach = cleanName;
      if (cleanPhone) found.sdt = cleanPhone;
      if (cleanCccd) found.cccd = cleanCccd;
      found.soLanMua = (Number(found.soLanMua) || 1) + 1;
      found.tongChiTieu = (Number(found.tongChiTieu) || 0) + Number(orderTotal);
      found.lanCuoiMua = nowStr;
    } else {
      found = {
        tenKhach: cleanName,
        sdt: cleanPhone,
        cccd: cleanCccd,
        soLanMua: 1,
        tongChiTieu: Number(orderTotal),
        lanCuoiMua: nowStr
      };
      this.customers.unshift(found);
    }

    this.saveCustomersToLocal();

    if (GoogleSheetService.isConfigured() && typeof GoogleSheetService.saveCustomer === 'function') {
      GoogleSheetService.saveCustomer(found).catch(e => console.warn('Lỗi lưu khách hàng lên Sheet:', e));
    }
  }

  saveProductsToLocal() {
    try {
      localStorage.setItem('pmqlv_products', JSON.stringify(this.products));
    } catch (e) {
      console.warn('LocalStorage limit exceeded, skipping full cache:', e);
    }
  }

  saveOrdersToLocal() {
    localStorage.setItem('pmqlv_orders', JSON.stringify(this.orders));
  }

  // Áp dụng cấu hình tiệm lên giao diện
  applyStoreConfig() {
    const cfg = this.storeConfig;
    if (!cfg) return;

    const elName = document.getElementById('headerStoreName');
    if (elName) elName.textContent = cfg.storeName || 'TIỆM VÀNG HOÀNG KIM';

    const elSlogan = document.getElementById('headerSlogan');
    if (elSlogan) elSlogan.textContent = cfg.slogan || 'Quản Lý Kho & Bán Hàng Vàng Bạc Đá Quý';

    const inpName = document.getElementById('cfgStoreName');
    if (inpName) inpName.value = cfg.storeName || '';

    const inpSlogan = document.getElementById('cfgStoreSlogan');
    if (inpSlogan) inpSlogan.value = cfg.slogan || '';

    const inpAddr = document.getElementById('cfgStoreAddress');
    if (inpAddr) inpAddr.value = cfg.address || '';

    const inpPhone = document.getElementById('cfgStorePhone');
    if (inpPhone) inpPhone.value = cfg.phone || '';

    const inpTicker = document.getElementById('cfgStoreTicker');
    if (inpTicker) {
      inpTicker.value = cfg.tickerText || '✨ Kính chúc Quý khách Vạn Sự Như Ý - Phát Tài Phát Lộc! | Giá vàng niêm yết tại thời điểm giao dịch thực tế tại quầy | Nhận thu đổi, làm mới, đánh bóng trọn đời sản phẩm.';
    }

    const footerEl = document.getElementById('cfgInvoiceFooter');
    if (footerEl) {
       footerEl.value = cfg.invoiceFooter !== undefined ? cfg.invoiceFooter : 
`- Quý khách vui lòng giữ Giấy đảm bảo này khi cần bán lại hoặc đổi món mới.
- Vàng 24K, 18K mua lại theo giá niêm yết tại thời điểm thu đổi.
- Tiệm nhận thu đổi, làm mới, đánh bóng trọn đời sản phẩm.`;
    }

    const lblLabor = document.getElementById('cfgPrintLabor');
    if (lblLabor) lblLabor.checked = cfg.printLabor !== false; // true by default

    const lblNi = document.getElementById('cfgPrintNi');
    if (lblNi) lblNi.checked = cfg.printNi !== false; // true by default

    const lblWeight = document.getElementById('cfgPrintWeight');
    if (lblWeight) lblWeight.checked = cfg.printWeight !== false; // true by default

    // Cloudinary inputs init
    const inpCloudName = document.getElementById('cfgCloudinaryCloudName');
    if (inpCloudName && typeof CloudinaryService !== 'undefined') {
      inpCloudName.value = CloudinaryService.getCloudName();
    }
    const inpCloudPreset = document.getElementById('cfgCloudinaryPreset');
    if (inpCloudPreset && typeof CloudinaryService !== 'undefined') {
      inpCloudPreset.value = CloudinaryService.getUploadPreset();
    }
    const inpCloudApiKey = document.getElementById('cfgCloudinaryApiKey');
    if (inpCloudApiKey && typeof CloudinaryService !== 'undefined') {
      inpCloudApiKey.value = CloudinaryService.getApiKey();
    }
    const inpCloudApiSecret = document.getElementById('cfgCloudinaryApiSecret');
    if (inpCloudApiSecret && typeof CloudinaryService !== 'undefined') {
      inpCloudApiSecret.value = CloudinaryService.getApiSecret();
    }

    // Tag configuration init
    const savedTagCfg = localStorage.getItem('pmqlv_tag_config');
    let activeTagCfg = null;
    if (savedTagCfg) {
      try { activeTagCfg = JSON.parse(savedTagCfg); } catch(e) {}
    }
    if (!activeTagCfg && cfg.printTagConfig) {
      activeTagCfg = cfg.printTagConfig;
    }
    if (activeTagCfg && typeof this.setTagConfigUI === 'function') {
      this.setTagConfigUI(activeTagCfg);
    }

    // Invoice print template
    const pName = document.getElementById('invPrintStoreName');
    if (pName) pName.textContent = cfg.storeName || 'TIỆM VÀNG HOÀNG KIM';

    const pSlogan = document.getElementById('invPrintSlogan');
    if (pSlogan) pSlogan.textContent = cfg.slogan || '';

    const pAddr = document.getElementById('invPrintAddress');
    if (pAddr) pAddr.textContent = 'Đ/c: ' + (cfg.address || '');

    const pPhone = document.getElementById('invPrintPhone');
    if (pPhone) pPhone.textContent = 'Hotline: ' + (cfg.phone || '');
  }

  // Phân quyền giao diện (Admin vs Quản lý Chi nhánh)
  updateUserRoleUI() {
    const u = this.currentUser || { username: 'admin', role: 'admin', fullName: 'Quản Lý Chung' };
    const isAdmin = (u.role === 'admin');
    const isBranch = (u.role === 'chinhanh');

    const roleText = document.getElementById('userRoleText');
    if (roleText) {
      if (isAdmin) roleText.textContent = 'Admin';
      else if (isBranch) roleText.textContent = u.chiNhanh ? u.chiNhanh.replace('Chi nhánh ', 'Kho ') : 'Chi Nhánh';
      else roleText.textContent = 'Nhân Viên';
    }

    const nameText = document.getElementById('userFullName');
    if (nameText) nameText.textContent = u.fullName || u.username;

    const isStaff = (u.role === 'nhanvien' || u.role === 'staff');
    document.body.classList.toggle('role-staff', isStaff);
    document.body.classList.toggle('role-admin', isAdmin);

    // Ẩn/Hiện các thành phần chỉ dành riêng cho Admin
    const adminElements = document.querySelectorAll('.admin-only');
    adminElements.forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });

    // Ẩn các thành phần không dành cho tài khoản Nhân viên
    const notForStaffElements = document.querySelectorAll('.not-for-staff');
    notForStaffElements.forEach(el => {
      if (isStaff) {
        el.style.display = 'none';
      } else if (!el.classList.contains('admin-only') || isAdmin) {
        el.style.display = '';
      }
    });

    if (isStaff) {
      this.isFilteringRecentOnly = false;
      const statusSelect = document.getElementById('invStatusFilter');
      if (statusSelect && statusSelect.value && statusSelect.value.startsWith('RECENT_')) {
        statusSelect.value = 'Còn tồn';
      }
      const banner = document.getElementById('recentModifiedBanner');
      if (banner) banner.style.display = 'none';
    }

    // Cập nhật Branch Selector
    const sel = document.getElementById('globalBranchSelector');
    const optAll = document.getElementById('optAllBranches');
    if (sel) {
      if (isAdmin) {
        sel.disabled = false;
        if (optAll) optAll.style.display = '';
        if (!this.currentBranch) this.currentBranch = sel.value || 'ALL';
      } else {
        const branchName = u.chiNhanh || (u.username === 'chinhanh2' ? 'Chi nhánh 2' : 'Chi nhánh 1');
        sel.value = branchName;
        sel.disabled = true; // Tài khoản chi nhánh chỉ quản lý chi nhánh của mình
        if (optAll) optAll.style.display = 'none';
        this.currentBranch = branchName;
      }
    }
  }

  // Chuyển đổi qua lại giữa các Tab
  changeBranch() {
    const sel = document.getElementById('globalBranchSelector');
    if (!sel) return;
    this.currentBranch = sel.value;
    
    // Refresh UI based on branch
    this.filterPosProducts();
    this.filterInventory();
    this.updateReportStats();
  }

  switchTab(tabId) {
    // Top tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    // Mobile bottom tabs
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    // Tab content panels
    document.querySelectorAll('.tab-content-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === tabId);
    });

    if (tabId === 'tab-reports') {
      this.updateReportStats();
    }
    if (tabId === 'tab-gold-rates') {
      this.renderGoldRatesTable();
      this.fetchGoldPricesRealtime(true);
    }
    if (tabId === 'tab-pos') {
      this.fetchGoldPricesRealtime();
    }
  }

  // ================= 1. NGHIỆP VỤ BÁN HÀNG (POS) =================

  isMatchingGoldType(productLoaiVang, filterLoaiVang) {
    if (!filterLoaiVang || filterLoaiVang === 'ALL') return true;
    if (!productLoaiVang) return false;

    const p = String(productLoaiVang).trim().toLowerCase();
    const f = String(filterLoaiVang).trim().toLowerCase();

    // 1. Khớp hoàn toàn
    if (p === f) return true;

    // 2. Một bên chứa bên kia (ví dụ: "Vàng 24K" và "24K")
    if (p.includes(f) || f.includes(p)) return true;

    // 3. Chuẩn hóa phân loại tuổi vàng (24K, 23K, 18K, 14K, 10K, Bạc, Đá)
    const getKaratCategory = (str) => {
      if (str.includes('24') || str.includes('9999') || str.includes('99.99') || str.includes('999')) return '24k';
      if (str.includes('23') || str.includes('95.8')) return '23k';
      if (str.includes('18') || str.includes('750') || str.includes('75.')) return '18k';
      if (str.includes('14') || str.includes('585') || str.includes('58.5')) return '14k';
      if (str.includes('10') || str.includes('416') || str.includes('41.6')) return '10k';
      if (str.includes('bạc') || str.includes('bac') || str.includes('925')) return 'bac';
      if (str.includes('đá') || str.includes('da')) return 'da';
      return null;
    };

    const pCat = getKaratCategory(p);
    const fCat = getKaratCategory(f);

    if (pCat && fCat && pCat === fCat) {
      if (pCat === '18k' || pCat === '10k') {
        const pHasKorea = p.includes('korea');
        const fHasKorea = f.includes('korea');
        if (fHasKorea !== pHasKorea) {
          const pHasY = p.includes('ý') || p.includes('y');
          const fHasY = f.includes('ý') || f.includes('y');
          if ((fHasKorea && pHasY) || (fHasY && pHasKorea)) return false;
        }
      }
      return true;
    }

    return false;
  }

  // Tính giá bán chuẩn ngành vàng của 1 sản phẩm
  calcProductPrice(product) {
    const multiplier = this.storeConfig.currencyUnitMultiplier || 1000;

    // Nếu có giá bán theo món niêm yết (vd đồ phong thủy, bạc theo món)
    if (product.giaBanMon && Number(product.giaBanMon) > 0) {
      return {
        unitPrice: 0,
        laborCost: 0,
        goldPricePart: 0,
        total: Number(product.giaBanMon) * multiplier,
        isFixedPrice: true
      };
    }

    const tlVang = Number(product.tlVang) || 0;
    const congBanVnd = (Number(product.congBan) || 0) * multiplier;

    // Tìm đơn giá vàng theo loại vàng của sản phẩm (hỗ trợ so khớp thông minh)
    let rateObj = this.goldPrices.find(g => this.isMatchingGoldType(product.loaiVang, g.loaiVang));

    const donGiaVangVnd = rateObj ? (Number(rateObj.giaBan) * multiplier) : (7850 * multiplier);
    const tienVangVnd = Math.round(tlVang * donGiaVangVnd);
    const total = tienVangVnd + congBanVnd;

    return {
      unitPrice: donGiaVangVnd,
      laborCost: congBanVnd,
      goldPricePart: tienVangVnd,
      total: total,
      isFixedPrice: false
    };
  }

  // Tương thích ngược nếu gọi getGoldRate
  getGoldRate(product) {
    return this.calcProductPrice(product);
  }

  // Lọc sản phẩm tại màn hình POS
  filterPosProducts(goldType = 'ALL') {
    if (goldType !== undefined && goldType !== null) {
      this.currentPosGoldFilter = goldType;
    }
    const filterType = this.currentPosGoldFilter || 'ALL';
    const keyword = (document.getElementById('posSearchInput')?.value || '').trim().toLowerCase();

    const grid = document.getElementById('posProductGrid');
    if (!grid) return;

    const isMobile = (window.innerWidth <= 768);

    // TRÊN MOBILE: Nếu chưa nhập tìm kiếm, không hiển thị sản phẩm để Đơn Bán Hàng nằm ngay bên dưới ô quét mã vạch
    if (isMobile && !keyword) {
      grid.innerHTML = '';
      return;
    }

    // Chi Nhánh hiện tại (mặc định nếu trống thì thuộc về Chi nhánh 1 để tương thích dữ liệu cũ)
    const activeBranch = this.currentBranch;
    const isAdmin = this.currentUser && this.currentUser.role === 'admin';

    const available = this.products.filter(p => {
      // 1. Check Trạng thái
      const isConTon = (!p.trangThai || p.trangThai === 'Còn tồn');
      
      // 2. Check Chi nhánh
      const branchMatch = (activeBranch === 'ALL' && isAdmin) || (p.chiNhanh === activeBranch) || (!p.chiNhanh && activeBranch === 'Chi nhánh 1');
      if (!isConTon || !branchMatch) return false;

      // Lọc theo loại vàng (hỗ trợ so khớp thông minh)
      if (filterType !== 'ALL') {
        if (!this.isMatchingGoldType(p.loaiVang, filterType)) return false;
      }

      // Lọc từ khóa
      if (keyword) {
        const ma = (p.maHang || '').toLowerCase();
        const ten = (p.tenHang || '').toLowerCase();
        const loai = (p.loaiVang || '').toLowerCase();
        return ma.includes(keyword) || ten.includes(keyword) || loai.includes(keyword);
      }
      return true;
    });

    // TRÊN MOBILE: Chỉ lấy tối đa 2 sản phẩm gần đúng nhất xếp hàng ngang. TRÊN DESKTOP: Hiển thị 80 món
    const displayList = isMobile ? available.slice(0, 2) : available.slice(0, 80);

    if (displayList.length === 0) {
      if (isMobile) {
        grid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 16px 12px; color: #64748B; background: #F8FAFC; border-radius: 8px; border: 1px dashed #CBD5E1; font-size: 12px; margin-bottom: 6px;">
            🔍 Không tìm thấy sản phẩm khớp với "<b>${keyword}</b>".
          </div>
        `;
        return;
      }
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: #94A3B8;">
          <div style="font-size: 32px; margin-bottom: 8px;">📦</div>
          <div style="font-size: 15px; font-weight: 600; color: #475569; margin-bottom: 6px;">Không tìm thấy sản phẩm nào trong ${activeBranch === 'ALL' ? 'kho' : activeBranch}!</div>
          <div style="font-size: 13px; color: #64748B; line-height: 1.6;">
            ${activeBranch === 'Chi nhánh 2' ? 'Hiện tại các món tồn kho ban đầu đang thuộc <b>Chi nhánh 1</b>.<br>Bạn có thể vào tab <b>Kho Hàng</b> chọn sản phẩm rồi bấm <b>🔄 Chuyển Kho</b> sang Chi nhánh 2.' : 'Vui lòng kiểm tra lại bộ lọc hoặc từ khóa tìm kiếm.'}
          </div>
        </div>
      `;
      return;
    }

    try {
      grid.innerHTML = displayList.map(p => {
        const priceCalc = this.calcProductPrice(p);
        const formattedTotal = priceCalc.total.toLocaleString('vi-VN') + ' đ';

        const pImages = this.parseProductImages(p.anhSanPham);
        const primaryImg = pImages.length > 0 ? pImages[0] : '';
        const extraImgs = pImages.length > 1 ? pImages.length - 1 : 0;
        const hasVideo = !!(p.videoSanPham && String(p.videoSanPham).trim());

        const fallbackHk = `<div class="pos-thumb-hk" title="Tiệm Vàng Hoàng Kim"><span class="hk-crown">👑</span><span class="hk-text">HK</span></div>`;
        const thumbHtml = (primaryImg && primaryImg.trim())
          ? `<div class="pos-thumb-wrap" style="position: relative;">
               <img src="${primaryImg.trim().replace(/"/g, '&quot;')}" alt="${(p.tenHang || '').replace(/"/g, '&quot;')}" class="pos-thumb-img" onerror="this.parentElement.innerHTML='<div class=\\\'pos-thumb-hk\\\'><span class=\\\'hk-crown\\\'>👑</span><span class=\\\'hk-text\\\'>HK</span></div>'" />
               ${extraImgs > 0 ? `<span style="position: absolute; bottom: 2px; right: 2px; background: rgba(0,0,0,0.75); color: #FFF; font-size: 9px; font-weight: 800; border-radius: 3px; padding: 0 3px;">+${extraImgs}</span>` : ''}
               ${hasVideo ? `<span style="position: absolute; top: 2px; right: 2px; font-size: 11px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));" title="Có video sản phẩm">🎬</span>` : ''}
             </div>`
          : `<div class="pos-thumb-wrap" style="position: relative;">
               ${fallbackHk}
               ${hasVideo ? `<span style="position: absolute; top: 2px; right: 2px; font-size: 11px;" title="Có video sản phẩm">🎬</span>` : ''}
             </div>`;

        return `
          <div class="product-card-pos" onclick="app.addToCart('${p.maHang}')">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
              <span class="tag-gold">${p.loaiVang || 'Vàng'}</span>
              <button type="button" onclick="event.stopPropagation(); app.previewProductShowcase('${p.maHang}')" style="background: rgba(16, 185, 129, 0.15); color: #047857; border: 1px solid #A7F3D0; border-radius: 4px; padding: 1px 6px; font-size: 10.5px; font-weight: 700; cursor: pointer;" title="Mở trang thông tin sản phẩm riêng cho khách xem">👁️ Khách</button>
            </div>
            <div class="code">Mã: ${p.maHang}</div>
            <div class="card-main-content">
              <div class="card-info">
                <div class="name" title="${p.tenHang || ''}">${p.tenHang || 'Sản phẩm'}</div>
                <div class="weight-info">
                  <span>TL Vàng: <b>${Number(p.tlVang || 0).toFixed(3)}c</b></span>
                  <span>Công: ${priceCalc.laborCost ? priceCalc.laborCost.toLocaleString('vi-VN') + 'đ' : '0đ'}</span>
                </div>
                <div class="price-tag">${formattedTotal}</div>
              </div>
              <div class="card-thumb-container">
                ${thumbHtml}
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch(renderErr) {
      grid.innerHTML = `<div style="grid-column:1/-1;padding:20px;color:red;background:#FEE;border-radius:8px;">
        <b>Lỗi hiển thị sản phẩm:</b> ${renderErr.message}<br>
        <small>${renderErr.stack}</small>
      </div>`;
    }
  }

  filterPosByGold(goldType, btnElement) {
    document.querySelectorAll('.pos-filter-btn').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    this.filterPosProducts(goldType);
  }

  // Thêm món vào giỏ hàng
  addToCart(maHang) {
    const product = this.products.find(p => p.maHang === maHang);
    if (!product) {
      alert('Không tìm thấy sản phẩm có mã: ' + maHang);
      return;
    }

    // Kiểm tra xem sản phẩm đã bán chưa
    if (product.trangThai === 'Đã bán') {
      alert(`Sản phẩm ${maHang} đã được bán trước đó!`);
      return;
    }

    // Kiểm tra xem sản phẩm đã có trong giỏ hàng chưa (tiệm vàng mỗi món là độc nhất 1 mã tem)
    const exists = this.cart.find(c => c.product.maHang === maHang);
    if (exists) {
      alert(`Sản phẩm ${maHang} đã có trong đơn hàng hiện tại!`);
      return;
    }

    const priceCalc = this.calcProductPrice(product);

    this.cart.push({
      product: product,
      tlVang: Number(product.tlVang) || 0,
      donGiaVang: priceCalc.unitPrice,
      congBan: priceCalc.laborCost,
      thanhTien: priceCalc.total,
      isFixedPrice: priceCalc.isFixedPrice
    });

    this.renderCart();

    // Trên điện thoại: Xóa ô tìm kiếm để danh sách 2 món thu gọn, người dùng thấy ngay Đơn Bán Hàng bên dưới
    if (window.innerWidth <= 768) {
      const searchInput = document.getElementById('posSearchInput');
      if (searchInput && searchInput.value) {
        searchInput.value = '';
        this.filterPosProducts();
      }
      this.showToast(`✅ Đã thêm ${product.tenHang || product.maHang} vào đơn hàng!`, 'success');
    }
  }

  // Xóa món khỏi giỏ hàng
  removeFromCart(index) {
    this.cart.splice(index, 1);
    this.renderCart();
  }

  clearCart() {
    if (this.cart.length === 0) return;
    if (confirm('Bạn có chắc muốn xóa toàn bộ đơn hàng hiện tại?')) {
      this.cart = [];
      this.renderCart();
    }
  }

  // Render giỏ hàng
  renderCart() {
    const listEl = document.getElementById('cartItemList');
    const countEl = document.getElementById('cartCount');
    const totalWeightEl = document.getElementById('cartTotalGoldWeight');
    const totalLaborEl = document.getElementById('cartTotalLaborCost');
    const grandTotalEl = document.getElementById('cartGrandTotal');

    if (!listEl) return;

    countEl.textContent = this.cart.length;

    if (this.cart.length === 0) {
      listEl.innerHTML = `
        <div class="cart-empty">
          <div style="font-size: 36px; margin-bottom: 8px;">🛒</div>
          Giỏ hàng trống.<br>Hãy bấm vào sản phẩm hoặc quét mã vạch để thêm vào đơn.
        </div>
      `;
      totalWeightEl.textContent = '0.000 chỉ';
      totalLaborEl.textContent = '0 đ';
      grandTotalEl.textContent = '0 đ';
      return;
    }

    let totalWeight = 0;
    let totalLabor = 0;
    let grandTotal = 0;

    listEl.innerHTML = this.cart.map((item, idx) => {
      const p = item.product;
      totalWeight += item.tlVang;
      totalLabor += item.congBan;
      grandTotal += item.thanhTien;

      let calcDesc = '';
      if (item.isFixedPrice) {
        calcDesc = `
          <div class="cart-item-calc" onclick="app.openCartItemPriceModal(${idx})" title="Bấm vào để tùy chỉnh giá bán món này">
            <span>🏷️ Bán món niêm yết: <b>${item.thanhTien.toLocaleString('vi-VN')} đ</b></span>
            <span class="cart-calc-edit-badge">✏️ Sửa</span>
          </div>
        `;
      } else {
        const rateK = (item.donGiaVang / 1000).toLocaleString('vi-VN');
        const laborVnd = item.congBan.toLocaleString('vi-VN');
        calcDesc = `
          <div class="cart-item-calc" onclick="app.openCartItemPriceModal(${idx})" title="Bấm vào đây để tùy chỉnh giá vàng hoặc tiền công của món này">
            <span>(${item.tlVang}c × <b>${rateK}k</b>) + Công <b>${laborVnd}đ</b></span>
            <span class="cart-calc-edit-badge">✏️ Sửa giá/công</span>
          </div>
        `;
      }

      const thumbHtml = p.anhSanPham ? `<img src="${p.anhSanPham}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; margin-right: 10px; border: 1px solid #E2E8F0;">` : '';

      return `
        <div class="cart-item">
          <div class="cart-item-header">
            <div style="display: flex; align-items: center;">
              ${thumbHtml}
              <span>${p.tenHang || 'Món hàng'} (${p.loaiVang || ''})</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <button type="button" class="cart-item-edit-btn" onclick="app.openCartItemPriceModal(${idx})" title="Chỉnh sửa giá vàng & tiền công">✏️</button>
              <button type="button" class="cart-item-remove" onclick="app.removeFromCart(${idx})" title="Xóa món">✖</button>
            </div>
          </div>
          <div class="cart-item-desc">Mã tem: <b>${p.maHang}</b> | TL: ${item.tlVang} chỉ | Ni: ${p.ni || '0'}</div>
          ${calcDesc}
          <div class="cart-item-footer">
            <span style="font-size: 11px; color: #64748B;">Thành tiền:</span>
            <span class="cart-item-price">${item.thanhTien.toLocaleString('vi-VN')} đ</span>
          </div>
        </div>
      `;
    }).join('');

    totalWeightEl.textContent = totalWeight.toFixed(3) + ' chỉ';
    totalLaborEl.textContent = totalLabor.toLocaleString('vi-VN') + ' đ';
    grandTotalEl.textContent = grandTotal.toLocaleString('vi-VN') + ' đ';
  }

  // ================= TÙY CHỈNH GIÁ VÀNG & TIỀN CÔNG MÓN HÀNG TRONG ĐƠN =================

  openCartItemPriceModal(idx) {
    const item = this.cart[idx];
    if (!item) return;

    this.editingCartIndex = idx;
    const p = item.product;

    const idxInp = document.getElementById('cartItemEditIndex');
    const titleEl = document.getElementById('cartItemEditTitle');
    const subEl = document.getElementById('cartItemEditSub');
    if (idxInp) idxInp.value = idx;
    if (titleEl) titleEl.textContent = `${p.tenHang || 'Món hàng'} (${p.loaiVang || ''})`;
    if (subEl) subEl.textContent = `Mã tem: ${p.maHang} | TL Vàng: ${item.tlVang} chỉ | Ni: ${p.ni || '0'}`;

    const goldSec = document.getElementById('cartItemEditGoldSection');
    const fixedSec = document.getElementById('cartItemEditFixedSection');

    if (item.isFixedPrice) {
      if (goldSec) goldSec.style.display = 'none';
      if (fixedSec) fixedSec.style.display = 'block';
      const fInp = document.getElementById('cartItemEditFixedPrice');
      if (fInp) fInp.value = item.thanhTien;
    } else {
      if (goldSec) goldSec.style.display = 'flex';
      if (fixedSec) fixedSec.style.display = 'none';
      const gInp = document.getElementById('cartItemEditGoldRate');
      const lInp = document.getElementById('cartItemEditLabor');
      if (gInp) gInp.value = Math.round(item.donGiaVang / 1000);
      if (lInp) lInp.value = item.congBan;

      const applyLabel = document.getElementById('cartItemEditApplyLabel');
      if (applyLabel) {
        applyLabel.textContent = `Áp dụng giá vàng này cho tất cả món "${p.loaiVang || 'cùng loại'}" trong đơn`;
      }
      const chk = document.getElementById('cartItemEditApplySameType');
      if (chk) chk.checked = false;
    }

    this.calcCartItemEditPreview();
    const modal = document.getElementById('cartItemPriceModal');
    if (modal) modal.classList.add('active');
  }

  closeCartItemPriceModal() {
    const modal = document.getElementById('cartItemPriceModal');
    if (modal) modal.classList.remove('active');
  }

  calcCartItemEditPreview() {
    const idx = this.editingCartIndex;
    if (idx === undefined || idx < 0 || !this.cart[idx]) return;
    const item = this.cart[idx];

    if (item.isFixedPrice) {
      const fixed = Number(document.getElementById('cartItemEditFixedPrice')?.value) || 0;
      const previewEl = document.getElementById('cartItemEditPreviewTotal');
      if (previewEl) previewEl.textContent = fixed.toLocaleString('vi-VN') + ' đ';
    } else {
      const rateK = Number(document.getElementById('cartItemEditGoldRate')?.value) || 0;
      const rateVnd = rateK * 1000;
      const labor = Number(document.getElementById('cartItemEditLabor')?.value) || 0;
      const total = Math.round((item.tlVang || 0) * rateVnd) + labor;

      const rateVndEl = document.getElementById('cartItemEditGoldRateVnd');
      if (rateVndEl) rateVndEl.textContent = rateVnd.toLocaleString('vi-VN');

      const laborVndEl = document.getElementById('cartItemEditLaborVnd');
      if (laborVndEl) laborVndEl.textContent = labor.toLocaleString('vi-VN');

      const previewEl = document.getElementById('cartItemEditPreviewTotal');
      if (previewEl) previewEl.textContent = total.toLocaleString('vi-VN') + ' đ';
    }
  }

  resetCartItemGoldRateToDefault() {
    const idx = this.editingCartIndex;
    if (idx === undefined || idx < 0 || !this.cart[idx]) return;
    const item = this.cart[idx];
    const rateObj = this.goldPrices.find(g => this.isMatchingGoldType(item.product.loaiVang, g.loaiVang));
    const defaultRateK = rateObj ? Number(rateObj.giaBan) : 7850;
    const gInp = document.getElementById('cartItemEditGoldRate');
    if (gInp) gInp.value = defaultRateK;
    this.calcCartItemEditPreview();
  }

  setCartItemEditLabor(val) {
    const inp = document.getElementById('cartItemEditLabor');
    if (inp) inp.value = val;
    this.calcCartItemEditPreview();
  }

  adjustCartItemEditLabor(delta) {
    const inp = document.getElementById('cartItemEditLabor');
    const current = Number(inp?.value) || 0;
    const nextVal = Math.max(0, current + delta);
    if (inp) inp.value = nextVal;
    this.calcCartItemEditPreview();
  }

  saveCartItemPrice() {
    const idx = this.editingCartIndex;
    if (idx === undefined || idx < 0 || !this.cart[idx]) return;
    const item = this.cart[idx];
    const p = item.product;

    if (item.isFixedPrice) {
      const fixed = Number(document.getElementById('cartItemEditFixedPrice')?.value) || 0;
      item.thanhTien = fixed;
    } else {
      const rateK = Number(document.getElementById('cartItemEditGoldRate')?.value) || 0;
      const rateVnd = rateK * 1000;
      const labor = Number(document.getElementById('cartItemEditLabor')?.value) || 0;

      item.donGiaVang = rateVnd;
      item.congBan = labor;
      item.thanhTien = Math.round(item.tlVang * rateVnd) + labor;

      const applyAll = document.getElementById('cartItemEditApplySameType')?.checked;
      if (applyAll) {
        this.cart.forEach(other => {
          if (!other.isFixedPrice && this.isMatchingGoldType(other.product.loaiVang, p.loaiVang)) {
            other.donGiaVang = rateVnd;
            other.thanhTien = Math.round(other.tlVang * rateVnd) + other.congBan;
          }
        });
      }
    }

    this.closeCartItemPriceModal();
    this.renderCart();
    this.showToast(`Đã cập nhật giá bán món "${p.tenHang}"!`, 'success');
  }

  // ================= QUY TRÌNH THANH TOÁN & IN HÓA ĐƠN =================

  // Khi nhấn nút "Thanh Toán" hoặc "In Hóa Đơn" từ giỏ hàng
  requestCheckout(isPrint = false) {
    if (this.cart.length === 0) {
      alert('Vui lòng chọn ít nhất 1 sản phẩm vào đơn hàng để thanh toán!');
      return;
    }

    this.pendingCheckoutIsPrint = !!isPrint;

    // Kiểm tra xem đơn hàng có món vàng tính theo chỉ không
    const hasGoldItems = this.cart.some(item => !item.isFixedPrice && (Number(item.tlVang) > 0));

    if (hasGoldItems) {
      // Mở hộp thoại hỏi và cho phép thay đổi giá vàng trước khi chốt thanh toán
      this.openCheckoutGoldRateModal();
    } else {
      // Chỉ có hàng bán theo món niêm yết -> Thanh toán trực tiếp
      this.executeCheckout(this.pendingCheckoutIsPrint);
    }
  }

  // Mở modal xác nhận / thay đổi giá vàng trước khi thanh toán
  openCheckoutGoldRateModal() {
    const listEl = document.getElementById('checkoutGoldRateList');
    const submitBtn = document.getElementById('checkoutModalSubmitBtn');
    if (!listEl) return;

    if (submitBtn) {
      if (this.pendingCheckoutIsPrint) {
        submitBtn.innerHTML = '<span>🖨️</span> <span>Xác Nhận & In Hóa Đơn</span>';
        submitBtn.className = 'btn btn-primary';
      } else {
        submitBtn.innerHTML = '<span>💳</span> <span>Xác Nhận & Thanh Toán</span>';
        submitBtn.className = 'btn btn-success';
      }
    }

    // Nhóm các món theo loại vàng
    const goldTypeMap = new Map();
    this.cart.forEach(item => {
      if (item.isFixedPrice || !(Number(item.tlVang) > 0)) return;
      const key = item.product.loaiVang || 'Vàng';
      if (!goldTypeMap.has(key)) {
        goldTypeMap.set(key, {
          loaiVang: key,
          count: 0,
          totalWeight: 0,
          rateK: Math.round(item.donGiaVang / 1000)
        });
      }
      const g = goldTypeMap.get(key);
      g.count += 1;
      g.totalWeight += item.tlVang;
    });

    listEl.innerHTML = Array.from(goldTypeMap.values()).map(g => `
      <div style="background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 8px; padding: 10px 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <b style="font-size: 13.5px; color: #0F172A;">💎 ${g.loaiVang}</b>
          <span style="font-size: 12px; color: #64748B;">${g.count} món | TL: <b>${g.totalWeight.toFixed(3)} chỉ</b></span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <label style="font-size: 12px; font-weight: 600; color: #334155; white-space: nowrap;">Giá bán ra:</label>
          <div style="position: relative; flex: 1;">
            <input type="number" class="form-control checkout-gold-rate-input" data-gold-type="${g.loaiVang}" value="${g.rateK}" style="font-size: 15px; font-weight: 700; color: #B45309; padding-right: 55px;" placeholder="Ví dụ: 7850" oninput="app.onCheckoutRateInput()">
            <span style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 11.5px; color: #64748B; pointer-events: none;">k/chỉ</span>
          </div>
        </div>
        <div class="checkout-rate-vnd-hint" data-gold-type="${g.loaiVang}" style="font-size: 11.5px; color: #0284C7; margin-top: 3px; text-align: right;">
          = ${(g.rateK * 1000).toLocaleString('vi-VN')} đ / chỉ
        </div>
      </div>
    `).join('');

    this.updateCheckoutModalTotals();
    const modal = document.getElementById('checkoutGoldRateModal');
    if (modal) modal.classList.add('active');
  }

  closeCheckoutGoldRateModal() {
    const modal = document.getElementById('checkoutGoldRateModal');
    if (modal) modal.classList.remove('active');
  }

  onCheckoutRateInput() {
    const inputs = document.querySelectorAll('.checkout-gold-rate-input');
    inputs.forEach(inp => {
      const type = inp.getAttribute('data-gold-type');
      const valK = Number(inp.value) || 0;
      const hint = document.querySelector(`.checkout-rate-vnd-hint[data-gold-type="${type}"]`);
      if (hint) {
        hint.textContent = `= ${(valK * 1000).toLocaleString('vi-VN')} đ / chỉ`;
      }
    });
    this.updateCheckoutModalTotals();
  }

  updateCheckoutModalTotals() {
    const rateMap = new Map();
    document.querySelectorAll('.checkout-gold-rate-input').forEach(inp => {
      const type = inp.getAttribute('data-gold-type');
      const valK = Number(inp.value) || 0;
      rateMap.set(type, valK * 1000);
    });

    let totalWeight = 0;
    let totalLabor = 0;
    let grandTotal = 0;

    this.cart.forEach(item => {
      totalWeight += item.tlVang;
      totalLabor += item.congBan;
      if (item.isFixedPrice) {
        grandTotal += item.thanhTien;
      } else {
        const key = item.product.loaiVang || 'Vàng';
        const rate = rateMap.has(key) ? rateMap.get(key) : item.donGiaVang;
        grandTotal += Math.round(item.tlVang * rate) + item.congBan;
      }
    });

    const wEl = document.getElementById('checkoutModalTotalWeight');
    const lEl = document.getElementById('checkoutModalTotalLabor');
    const gEl = document.getElementById('checkoutModalGrandTotal');
    if (wEl) wEl.textContent = totalWeight.toFixed(3) + ' chỉ';
    if (lEl) lEl.textContent = totalLabor.toLocaleString('vi-VN') + ' đ';
    if (gEl) gEl.textContent = grandTotal.toLocaleString('vi-VN') + ' đ';
  }

  // Áp dụng giá vàng đã nhập trong modal và thực hiện thanh toán
  applyRatesAndExecuteCheckout() {
    const rateMap = new Map();
    document.querySelectorAll('.checkout-gold-rate-input').forEach(inp => {
      const type = inp.getAttribute('data-gold-type');
      const valK = Number(inp.value) || 0;
      rateMap.set(type, valK * 1000);
    });

    // Cập nhật giá vàng mới vào giỏ hàng
    this.cart.forEach(item => {
      if (!item.isFixedPrice) {
        const key = item.product.loaiVang || 'Vàng';
        if (rateMap.has(key)) {
          const newRate = rateMap.get(key);
          item.donGiaVang = newRate;
          item.thanhTien = Math.round(item.tlVang * newRate) + item.congBan;
        }
      }
    });

    this.renderCart();
    this.closeCheckoutGoldRateModal();
    this.executeCheckout(this.pendingCheckoutIsPrint);
  }

  // Tương thích ngược nếu modal hoặc code cũ gọi checkoutOrder
  async checkoutOrder() {
    await this.requestCheckout(true);
  }

  // Thực hiện lưu đơn hàng, trừ tồn kho, in hóa đơn nếu được chọn
  async executeCheckout(isPrint = false) {
    if (this.cart.length === 0) {
      alert('Vui lòng chọn ít nhất 1 sản phẩm vào đơn hàng để thanh toán!');
      return;
    }

    const custName = (document.getElementById('cartCustomerName')?.value || '').trim() || 'Khách lẻ';
    const custPhone = (document.getElementById('cartCustomerPhone')?.value || '').trim();
    const custCccd = (document.getElementById('cartCustomerCccd')?.value || '').trim();

    let grandTotal = this.cart.reduce((sum, item) => sum + item.thanhTien, 0);
    const multiplier = this.storeConfig.currencyUnitMultiplier || 1000;
    let grandCost = this.cart.reduce((sum, item) => sum + ((Number(item.product.giaVon) || 0) * multiplier), 0);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const maHD = 'HD' + dateStr + '-' + Math.floor(1000 + Math.random() * 9000);

    const branchName = (this.currentBranch === 'Chi nhánh 2' ? 'Chi nhánh 2' : 'Chi nhánh 1');
    const staffName = (this.currentUser && this.currentUser.fullName) || (branchName === 'Chi nhánh 2' ? 'Quản Lý Chi Nhánh 2' : 'Admin');
    const sellerUsername = (this.currentUser && this.currentUser.username) || (branchName === 'Chi nhánh 2' ? 'chinhanh2' : 'admin');

    const orderData = {
      maHD: maHD,
      ngayBan: now.toLocaleString('vi-VN'),
      tenKhach: custName,
      sdt: custPhone,
      cccd: custCccd,
      items: this.cart.map(c => ({
        maHang: c.product.maHang,
        tenHang: c.product.tenHang,
        loaiVang: c.product.loaiVang,
        tlVang: c.tlVang,
        donGia: c.donGiaVang,
        congBan: c.congBan,
        thanhTien: c.thanhTien,
        giaVon: c.product.giaVon, // Thêm giá vốn vào chi tiết để dự phòng
        chiNhanh: c.product.chiNhanh || branchName
      })),
      tongTien: grandTotal,
      tongVon: grandCost,
      nhanVien: staffName,
      nguoiBan: sellerUsername,
      ghiChu: `[${branchName}]`,
      chiNhanh: branchName
    };

    this.showGlobalLoading('Đang thanh toán và lưu lên Google Sheet...');

    // 1. Gửi đồng bộ lên Google Sheet (chạy trực tiếp)
    if (GoogleSheetService.isConfigured()) {
      const res = await GoogleSheetService.createOrder(orderData);
      if (!res || !res.success) {
        this.hideGlobalLoading();
        alert('Lỗi lưu hóa đơn lên Google Sheet: ' + (res?.message || res?.error || 'Kiểm tra mạng!'));
        return; // Dừng nếu lỗi
      }
    }

    // 2. Cập nhật trạng thái sản phẩm trong bộ nhớ thành "Đã bán"
    const soldCodes = this.cart.map(c => c.product.maHang);
    this.products.forEach(p => {
      if (soldCodes.includes(p.maHang)) {
        p.trangThai = 'Đã bán';
      }
    });
    this.saveProductsToLocal();

    // 3. Lưu lịch sử đơn hàng & Cập nhật khách hàng
    this.orders.unshift(orderData);
    this.saveOrdersToLocal();
    this.saveOrUpdateCustomer(custName, custPhone, custCccd, grandTotal);

    // 4. Chuẩn bị mẫu in hóa đơn & Giấy đảm bảo vàng
    this.preparePrintableInvoice(orderData);

    // 5. Cập nhật lại giao diện
    this.cart = [];
    if (document.getElementById('cartCustomerName')) document.getElementById('cartCustomerName').value = '';
    if (document.getElementById('cartCustomerPhone')) document.getElementById('cartCustomerPhone').value = '';
    if (document.getElementById('cartCustomerCccd')) document.getElementById('cartCustomerCccd').value = '';
    if (document.getElementById('custSavedBadge')) document.getElementById('custSavedBadge').style.display = 'none';
    if (document.getElementById('customerSuggestions')) document.getElementById('customerSuggestions').style.display = 'none';
    this.renderCart();
    this.filterPosProducts();
    this.filterInventory();
    this.updateReportStats();

    this.hideGlobalLoading();

    // 6. Xử lý sau thanh toán
    if (isPrint) {
      this.showToast(`✅ Đã thanh toán và đang mở in hóa đơn ${maHD}!`, 'success');
      setTimeout(() => {
        window.print();
      }, 250);
    } else {
      this.showToast(`✅ Đã thanh toán đơn hàng ${maHD} (${grandTotal.toLocaleString('vi-VN')} đ) thành công!`, 'success');
    }
  }

  // Điền thông tin vào mẫu in Giấy Đảm Bảo Vàng
  preparePrintableInvoice(order) {
    document.getElementById('invPrintMaHD').textContent = order.maHD;
    document.getElementById('invPrintDate').textContent = order.ngayBan;
    document.getElementById('invPrintCustomer').textContent = order.tenKhach;
    document.getElementById('invPrintCustPhone').textContent = order.sdt || 'Không có';
    const cccdWrap = document.getElementById('invPrintCustCccdWrap');
    const cccdEl = document.getElementById('invPrintCustCccd');
    if (cccdEl && cccdWrap) {
      if (order.cccd) {
        cccdEl.textContent = order.cccd;
        cccdWrap.style.display = 'inline';
      } else {
        cccdWrap.style.display = 'none';
      }
    }
    document.getElementById('invPrintStaff').textContent = order.nhanVien;
    document.getElementById('invPrintTotal').textContent = order.tongTien.toLocaleString('vi-VN') + ' đ';

    const footerEl = document.getElementById('invPrintFooterContent');
    if (footerEl) {
       footerEl.textContent = this.storeConfig.invoiceFooter || 
`- Quý khách vui lòng giữ Giấy đảm bảo này khi cần bán lại hoặc đổi món mới.
- Vàng 24K, 18K mua lại theo giá niêm yết tại thời điểm thu đổi.
- Tiệm nhận thu đổi, làm mới, đánh bóng trọn đời sản phẩm.`;
    }

    const tbody = document.getElementById('invPrintTableBody');
    if (!tbody) return;

    tbody.innerHTML = order.items.map((it, idx) => `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td><b>${it.tenHang}</b><br><small style="color:#555;">Mã: ${it.maHang}</small></td>
        <td>${it.loaiVang}</td>
        <td style="text-align: right;">${it.tlVang} chỉ</td>
        <td style="text-align: right;">${it.donGia ? (it.donGia / 1000).toLocaleString('vi-VN') + 'k' : '--'}</td>
        <td style="text-align: right;">${it.congBan ? it.congBan.toLocaleString('vi-VN') + 'đ' : '0đ'}</td>
        <td style="text-align: right;"><b>${it.thanhTien.toLocaleString('vi-VN')} đ</b></td>
      </tr>
    `).join('');
  }

  // ================= 2. QUẢN LÝ KHO HÀNG (INVENTORY) =================

  // Quản lý danh sách mặt hàng vừa thêm mới hoặc vừa sửa (tiện in tem, đồng bộ đa thiết bị)
  saveRecentModifiedItems(syncCloud = true) {
    try {
      localStorage.setItem('pmqlv_recent_modified_items', JSON.stringify(this.recentModifiedItems || []));
      if (syncCloud && typeof GoogleSheetService !== 'undefined' && GoogleSheetService.isConfigured()) {
        if (!this.storeConfig) this.storeConfig = {};
        this.storeConfig.recentModifiedItems = this.recentModifiedItems || [];
        localStorage.setItem('pmqlv_store_config', JSON.stringify(this.storeConfig));
        // Gọi lưu ngầm lên Google Sheet không chặn giao diện để mọi máy tự động nhận
        GoogleSheetService.saveStoreConfig(this.storeConfig).catch(err => {
          console.warn('Lỗi đồng bộ danh sách vừa sửa lên Google Sheet:', err);
        });
      }
    } catch (e) {
      console.warn('Lỗi lưu pmqlv_recent_modified_items:', e);
    }
  }

  addRecentModifiedProduct(maHang, type = 'new', autoSave = true) {
    if (!maHang) return;
    if (!this.recentModifiedItems) this.recentModifiedItems = [];

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timeFormatted = `${pad(now.getHours())}:${pad(now.getMinutes())} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}`;
    const fullTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

    // Loại bỏ mục cũ nếu có để đưa lên đầu danh sách với timestamp mới nhất
    this.recentModifiedItems = this.recentModifiedItems.filter(item => (typeof item === 'object' ? item.maHang : item) !== maHang);
    this.recentModifiedItems.unshift({
      maHang: maHang,
      type: type, // 'new' | 'edit'
      timestamp: Date.now(),
      timeFormatted: timeFormatted,
      fullTime: fullTime,
      user: (this.currentUser && this.currentUser.username) || ''
    });

    if (autoSave) {
      this.saveRecentModifiedItems(true);
      this.updateRecentModifiedUI();
    }
  }

  removeRecentModifiedProduct(maHang) {
    if (!maHang || !this.recentModifiedItems) return;
    this.recentModifiedItems = this.recentModifiedItems.filter(item => (typeof item === 'object' ? item.maHang : item) !== maHang);
    this.saveRecentModifiedItems(true);
    this.updateRecentModifiedUI();
  }

  clearRecentModifiedList() {
    const count = this.recentModifiedItems ? this.recentModifiedItems.length : 0;
    if (count === 0) {
      alert('Danh sách hàng vừa thêm mới/sửa đang trống!');
      return;
    }
    if (confirm(`Bạn có chắc muốn đặt lại (làm trống) danh sách ${count} mặt hàng vừa thêm/sửa này trên tất cả các máy không?\n\n(Chức năng này dùng sau khi bạn đã in tem xong để chuẩn bị cho đợt hàng tiếp theo)`)) {
      this.recentModifiedItems = [];
      this.saveRecentModifiedItems(true);
      if (this.isFilteringRecentOnly) {
        this.isFilteringRecentOnly = false;
        const statusSelect = document.getElementById('invStatusFilter');
        if (statusSelect && statusSelect.value && statusSelect.value.startsWith('RECENT_')) {
          statusSelect.value = 'Còn tồn';
        }
      }
      this.updateRecentModifiedUI();
      this.filterInventory();
      this.showToast('✅ Đã làm trống danh sách in tem trên mọi thiết bị!', 'success');
    }
  }

  setRecentSubFilter(subFilter = 'all') {
    this.recentSubFilter = subFilter;
    this.isFilteringRecentOnly = true;

    // Cập nhật dropdown trạng thái đồng bộ
    const statusSelect = document.getElementById('invStatusFilter');
    if (statusSelect) {
      if (subFilter === 'new') statusSelect.value = 'RECENT_NEW';
      else if (subFilter === 'edit') statusSelect.value = 'RECENT_EDIT';
      else statusSelect.value = 'RECENT_ALL';
    }

    this.updateRecentModifiedUI();
    this.filterInventory();
  }

  onInvStatusFilterChanged() {
    const statusSelect = document.getElementById('invStatusFilter');
    const val = statusSelect ? statusSelect.value : 'Còn tồn';

    if (val === 'RECENT_ALL') {
      this.isFilteringRecentOnly = true;
      this.recentSubFilter = 'all';
    } else if (val === 'RECENT_NEW') {
      this.isFilteringRecentOnly = true;
      this.recentSubFilter = 'new';
    } else if (val === 'RECENT_EDIT') {
      this.isFilteringRecentOnly = true;
      this.recentSubFilter = 'edit';
    } else {
      this.isFilteringRecentOnly = false;
    }

    this.updateRecentModifiedUI();
    this.filterInventory();
  }

  toggleRecentFilter() {
    if (this.isFilteringRecentOnly) {
      this.isFilteringRecentOnly = false;
      const statusSelect = document.getElementById('invStatusFilter');
      if (statusSelect && statusSelect.value && statusSelect.value.startsWith('RECENT_')) {
        statusSelect.value = 'Còn tồn';
      }
    } else {
      this.isFilteringRecentOnly = true;
      this.recentSubFilter = 'all';
      const statusSelect = document.getElementById('invStatusFilter');
      if (statusSelect) statusSelect.value = 'RECENT_ALL';
    }
    this.updateRecentModifiedUI();
    this.filterInventory();
  }

  updateRecentModifiedUI() {
    const items = (this.recentModifiedItems && Array.isArray(this.recentModifiedItems)) ? this.recentModifiedItems : [];
    const countTotal = items.length;
    const countNew = items.filter(i => (typeof i === 'object' ? i.type === 'new' : true)).length;
    const countEdit = items.filter(i => (typeof i === 'object' && i.type === 'edit')).length;

    // Số lượng in tem theo phân loại hiện tại
    let countPrint = countTotal;
    if (this.recentSubFilter === 'new') countPrint = countNew;
    else if (this.recentSubFilter === 'edit') countPrint = countEdit;

    // 1. Nút trên thanh công cụ
    const countBadge = document.getElementById('recentCountBadge');
    if (countBadge) countBadge.textContent = countTotal;

    const isStaff = this.currentUser && (this.currentUser.role === 'nhanvien' || this.currentUser.role === 'staff');

    const btnTop = document.getElementById('btnToggleRecentFilter');
    if (btnTop) {
      if (isStaff) {
        btnTop.style.display = 'none';
      } else if (this.isFilteringRecentOnly) {
        btnTop.style.display = '';
        btnTop.innerHTML = `🔙 Xem Toàn Bộ Kho`;
        btnTop.style.background = '#2563EB';
        btnTop.style.color = '#FFF';
        btnTop.style.borderColor = '#1D4ED8';
      } else {
        btnTop.style.display = '';
        btnTop.innerHTML = `✨ Vừa Thêm/Sửa (<span id="recentCountBadge">${countTotal}</span>)`;
        btnTop.style.background = countTotal > 0 ? '#FEF3C7' : '#F1F5F9';
        btnTop.style.color = countTotal > 0 ? '#92400E' : '#64748B';
        btnTop.style.borderColor = countTotal > 0 ? '#F59E0B' : '#CBD5E1';
      }
    }

    // 2. Cập nhật các con số trong Banner
    const banner = document.getElementById('recentModifiedBanner');
    const totalCountEl = document.getElementById('bannerRecentTotalCount');
    const countAllEl = document.getElementById('countRecentAll');
    const countNewEl = document.getElementById('countRecentNew');
    const countEditEl = document.getElementById('countRecentEdit');
    const countPrintEl = document.getElementById('countRecentPrint');
    const btnPrintDynamic = document.getElementById('btnRecentPrintDynamic');

    if (totalCountEl) totalCountEl.textContent = countTotal;
    if (countAllEl) countAllEl.textContent = countTotal;
    if (countNewEl) countNewEl.textContent = countNew;
    if (countEditEl) countEditEl.textContent = countEdit;
    if (countPrintEl) countPrintEl.textContent = countPrint;

    if (btnPrintDynamic) {
      if (this.recentSubFilter === 'new') {
        btnPrintDynamic.innerHTML = `🖨️ In Tem Hàng Mới (<span id="countRecentPrint">${countNew}</span>)`;
      } else if (this.recentSubFilter === 'edit') {
        btnPrintDynamic.innerHTML = `🖨️ In Tem Hàng Vừa Sửa (<span id="countRecentPrint">${countEdit}</span>)`;
      } else {
        btnPrintDynamic.innerHTML = `🖨️ In Tem Tất Cả (<span id="countRecentPrint">${countTotal}</span>)`;
      }
    }

    // Cập nhật giao diện nút phân loại
    const btnAll = document.getElementById('btnFilterRecentAll');
    const btnNew = document.getElementById('btnFilterRecentNew');
    const btnEdit = document.getElementById('btnFilterRecentEdit');

    const setActiveStyle = (btn, isActive, activeBg, activeColor, activeBorder) => {
      if (!btn) return;
      if (isActive) {
        btn.style.background = activeBg;
        btn.style.color = activeColor;
        btn.style.border = `1.5px solid ${activeBorder}`;
        btn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.15)';
      } else {
        btn.style.background = '#F8FAFC';
        btn.style.color = '#475569';
        btn.style.border = '1px solid #CBD5E1';
        btn.style.boxShadow = 'none';
      }
    };

    if (btnAll) setActiveStyle(btnAll, this.recentSubFilter === 'all', '#2563EB', '#FFF', '#1D4ED8');
    if (btnNew) setActiveStyle(btnNew, this.recentSubFilter === 'new', '#059669', '#FFF', '#047857');
    if (btnEdit) setActiveStyle(btnEdit, this.recentSubFilter === 'edit', '#D97706', '#FFF', '#B45309');

    if (banner) {
      if (countTotal > 0 && !isStaff) {
        banner.style.display = 'flex';
      } else {
        banner.style.display = 'none';
      }
    }
  }

  printDynamicRecentTags() {
    const items = (this.recentModifiedItems && Array.isArray(this.recentModifiedItems)) ? this.recentModifiedItems : [];
    if (items.length === 0) {
      alert('Không có mặt hàng nào trong danh sách vừa thêm mới hoặc sửa để in tem!');
      return;
    }

    let targetItems = items;
    let labelType = 'tất cả';
    if (this.recentSubFilter === 'new') {
      targetItems = items.filter(i => (typeof i === 'object' ? i.type === 'new' : true));
      labelType = 'hàng mới thêm';
    } else if (this.recentSubFilter === 'edit') {
      targetItems = items.filter(i => (typeof i === 'object' && i.type === 'edit'));
      labelType = 'hàng vừa sửa';
    }

    if (targetItems.length === 0) {
      alert(`Không có món nào thuộc nhóm "${labelType}" để in tem!`);
      return;
    }

    // Lấy các sản phẩm có mã trong danh sách theo đúng thứ tự
    const matchedProducts = [];
    targetItems.forEach(item => {
      const code = typeof item === 'object' ? item.maHang : item;
      const p = this.products.find(prod => prod.maHang === code);
      if (p) matchedProducts.push(p);
    });

    if (matchedProducts.length === 0) {
      alert('Không tìm thấy thông tin sản phẩm tương ứng trong kho hàng!');
      return;
    }

    if (typeof BarcodeLabel !== 'undefined' && BarcodeLabel.printTags) {
      BarcodeLabel.printTags(matchedProducts, this.getTagConfig());
    } else {
      alert('Thư viện in tem BarcodeLabel chưa sẵn sàng!');
    }
  }

  printAllRecentTags() {
    this.printDynamicRecentTags();
  }

  filterInventory() {
    const keyword = (document.getElementById('invSearchInput')?.value || '').trim().toLowerCase();
    const counter = document.getElementById('invCounterFilter')?.value || 'ALL';
    const goldType = document.getElementById('invGoldTypeFilter')?.value || 'ALL';
    const status = document.getElementById('invStatusFilter')?.value || 'ALL';

    const activeBranch = this.currentBranch;
    const isAdmin = this.currentUser && this.currentUser.role === 'admin';

    const isFilteringRecent = (status === 'RECENT_MODIFIED' || status === 'RECENT_ALL' || status === 'RECENT_NEW' || status === 'RECENT_EDIT') || this.isFilteringRecentOnly;
    const subFilter = (status === 'RECENT_NEW') ? 'new' : (status === 'RECENT_EDIT' ? 'edit' : this.recentSubFilter || 'all');

    // Tạo map danh sách recent theo subFilter
    const recentMaMap = new Map();
    (this.recentModifiedItems || []).forEach(i => {
      const code = typeof i === 'object' ? i.maHang : i;
      const type = typeof i === 'object' ? (i.type || 'new') : 'new';
      if (subFilter === 'all' || subFilter === type) {
        recentMaMap.set(code, typeof i === 'object' ? i : { maHang: code, type });
      }
    });

    this.filteredProducts = this.products.filter(p => {
      // Nếu đang lọc theo danh sách vừa thêm mới/sửa
      if (isFilteringRecent) {
        if (!recentMaMap.has(p.maHang)) return false;
      } else {
        // Check branch
        const branchMatch = (activeBranch === 'ALL' && isAdmin) || (p.chiNhanh === activeBranch) || (!p.chiNhanh && activeBranch === 'Chi nhánh 1');
        if (!branchMatch) return false;

        // Lọc trạng thái
        if (status !== 'ALL' && p.trangThai !== status) return false;
      }

      // Lọc quầy
      if (counter !== 'ALL' && p.quayNho !== counter) return false;

      // Lọc loại vàng (so khớp thông minh tên loại vàng)
      if (goldType !== 'ALL') {
        if (!this.isMatchingGoldType(p.loaiVang, goldType)) return false;
      }

      // Lọc từ khóa
      if (keyword) {
        const ma = (p.maHang || '').toLowerCase();
        const ten = (p.tenHang || '').toLowerCase();
        const loai = (p.loaiVang || '').toLowerCase();
        return ma.includes(keyword) || ten.includes(keyword) || loai.includes(keyword);
      }

      return true;
    });

    // Nếu đang lọc theo danh sách vừa thêm/sửa, ưu tiên sắp xếp các món mới nhất lên trên
    if (isFilteringRecent) {
      this.filteredProducts.sort((a, b) => {
        const itemA = recentMaMap.get(a.maHang);
        const itemB = recentMaMap.get(b.maHang);
        return (itemB ? (itemB.timestamp || 0) : 0) - (itemA ? (itemA.timestamp || 0) : 0);
      });
    }

    this.currentPage = 1;
    this.renderInventoryTable();
  }

  renderInventoryTable() {
    const tbody = document.getElementById('inventoryTableBody');
    const badgeTotal = document.getElementById('totalInventoryBadge');
    const filteredCountEl = document.getElementById('invFilteredCount');
    const totalCountEl = document.getElementById('invTotalCount');
    const pagInfo = document.getElementById('paginationInfo');
    const pagTotal = document.getElementById('paginationTotal');
    const pageText = document.getElementById('currentPageText');

    if (!tbody) return;

    // Cập nhật thống kê trọng lượng vàng theo từng loại
    this.renderInventoryGoldStats();

    const totalCount = this.products.length;
    const filteredCount = this.filteredProducts.length;

    if (badgeTotal) badgeTotal.textContent = totalCount.toLocaleString('vi-VN');
    if (filteredCountEl) filteredCountEl.textContent = filteredCount.toLocaleString('vi-VN');
    if (totalCountEl) totalCountEl.textContent = totalCount.toLocaleString('vi-VN');
    if (pagTotal) pagTotal.textContent = filteredCount.toLocaleString('vi-VN');

    const totalPages = Math.ceil(filteredCount / this.itemsPerPage) || 1;
    if (this.currentPage > totalPages) this.currentPage = totalPages;
    if (this.currentPage < 1) this.currentPage = 1;

    if (pageText) pageText.textContent = `Trang ${this.currentPage} / ${totalPages}`;

    const startIdx = (this.currentPage - 1) * this.itemsPerPage;
    const endIdx = Math.min(startIdx + this.itemsPerPage, filteredCount);

    if (pagInfo) pagInfo.textContent = filteredCount > 0 ? `${startIdx + 1}-${endIdx}` : '0';

    const pageItems = this.filteredProducts.slice(startIdx, endIdx);

    const isAdmin = this.currentUser && this.currentUser.role === 'admin';
    const isStaff = this.currentUser && (this.currentUser.role === 'nhanvien' || this.currentUser.role === 'staff');
    const canEdit = isAdmin || (this.currentUser && this.currentUser.role === 'chinhanh') || isStaff;
    const canDelete = isAdmin;
    const multiplier = this.storeConfig.currencyUnitMultiplier || 1000;
    const recentMaMap = new Map((this.recentModifiedItems || []).map(i => [(typeof i === 'object' ? i.maHang : i), i]));

    if (pageItems.length === 0) {
      const activeBranch = this.currentBranch;
      tbody.innerHTML = `
        <tr>
          <td colspan="17" style="text-align: center; padding: 40px; color: #94A3B8;">
            <div style="font-size: 28px; margin-bottom: 8px;">📦</div>
            <div style="font-size: 14px; font-weight: 600; color: #475569; margin-bottom: 6px;">Không có sản phẩm nào trong ${activeBranch === 'ALL' ? 'kho' : activeBranch} phù hợp với bộ lọc.</div>
            <div style="font-size: 12px; color: #64748B;">
              ${activeBranch === 'Chi nhánh 2' ? '💡 Bạn có thể bấm <b>+ Thêm Sản Phẩm Mới</b> hoặc chọn các món ở <b>Chi nhánh 1</b> rồi bấm <b>🔄 Chuyển Kho</b> sang Chi nhánh 2.' : 'Thử đổi bộ lọc hoặc thêm sản phẩm mới.'}
            </div>
          </td>
        </tr>
      `;
      this.updateUserRoleUI();
      return;
    }

    tbody.innerHTML = pageItems.map(p => {
      const isSelected = this.selectedMaHangSet.has(p.maHang);
      const isSold = (p.trangThai === 'Đã bán');
      const statusClass = isSold ? 'badge-sold' : 'badge-instock';

      const recentInfo = recentMaMap.get(p.maHang);
      let recentBadge = '';
      if (recentInfo) {
        const rType = typeof recentInfo === 'object' ? (recentInfo.type || 'new') : 'new';
        const rTime = (typeof recentInfo === 'object' && recentInfo.timeFormatted) ? recentInfo.timeFormatted : '';
        const rFull = (typeof recentInfo === 'object' && recentInfo.fullTime) ? recentInfo.fullTime : '';
        const titleTime = rFull ? ` (${rFull})` : '';

        if (rType === 'new') {
          recentBadge = ` <span style="display:inline-block; font-size:9.5px; background:#ECFDF5; color:#065F46; border:1px solid #A7F3D0; border-radius:4px; padding:1px 5px; font-weight:700; vertical-align:middle;" title="Mới thêm vào kho${titleTime}">🆕 Mới${rTime ? ` (${rTime})` : ''}</span>`;
        } else {
          recentBadge = ` <span style="display:inline-block; font-size:9.5px; background:#FEF3C7; color:#92400E; border:1px solid #FDE68A; border-radius:4px; padding:1px 5px; font-weight:700; vertical-align:middle;" title="Vừa chỉnh sửa thông tin${titleTime}">✏️ Sửa${rTime ? ` (${rTime})` : ''}</span>`;
        }
      }

      return `
        <tr style="${isSold ? 'background-color: #FFF5F5;' : ''}">
          <td style="text-align: center;">
            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="app.toggleSelectProduct('${p.maHang}', this.checked)">
          </td>
          <td style="text-align: center;">
            ${(() => {
              const pImgs = this.parseProductImages(p.anhSanPham);
              const primImg = pImgs[0] || '';
              const extraCount = pImgs.length > 1 ? pImgs.length - 1 : 0;
              const hasVid = !!(p.videoSanPham && String(p.videoSanPham).trim());
              return primImg
                ? `<div style="position:relative; display:inline-block; width:32px; height:32px;">
                     <img src="${primImg}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 6px; border: 1px solid #E2E8F0;" alt="${p.maHang}">
                     ${extraCount > 0 ? `<span style="position:absolute; bottom:-2px; right:-2px; background:#D97706; color:#FFF; font-size:8.5px; border-radius:3px; padding:0 2px; font-weight:800; line-height:1;">+${extraCount}</span>` : ''}
                     ${hasVid ? `<span style="position:absolute; top:-3px; right:-3px; font-size:10px;" title="Có video">🎬</span>` : ''}
                   </div>`
                : `<div style="position:relative; display:inline-block; width:32px; height:32px;">
                     <div style="width:32px;height:32px;background:linear-gradient(135deg,#FFFDF0,#FEF3C7);border:1px solid #F59E0B;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#B45309;font-family:\'Cinzel\',serif;box-shadow:inset 0 1px 1px #FFF;" title="Tiệm Vàng Hoàng Kim">HK</div>
                     ${hasVid ? `<span style="position:absolute; top:-3px; right:-3px; font-size:10px;" title="Có video">🎬</span>` : ''}
                   </div>`;
            })()}
          </td>
          <td><span class="product-code-link" onclick="app.showProductMobileActions('${p.maHang}')" title="Thao tác: Sửa, Xóa, Copy Link"><b>${p.maHang}</b></span>${recentBadge}</td>
          <td>
            <div style="font-weight: 600;">${p.tenHang || '--'}</div>
            ${p.nhaCungCap ? `<span style="font-size: 10px; background: #DCFCE7; color: #166534; padding: 1px 6px; border-radius: 4px; font-weight: 700; display: inline-block; margin-top: 2px;" title="Nhà cung cấp">🏢 ${p.nhaCungCap}</span>` : ''}
          </td>
          <td><span class="badge" style="background:#FEF3C7; color:#92400E;">${p.loaiVang || ''}</span></td>
          <td>${p.quayNho || '--'}</td>
          <td>${p.chiNhanh || 'Chi nhánh 1'}</td>
          <td style="text-align: right;">${BarcodeLabel.formatWeight(p.tlTong)}</td>
          <td style="text-align: right;">${BarcodeLabel.formatWeight(p.tlHot)}</td>
          <td style="text-align: right; font-weight: bold; color: #B45309;">${BarcodeLabel.formatWeight(p.tlVang)}</td>
          <td style="text-align: center;">${p.ni ? p.ni : '-'}</td>
          <td style="text-align: right;">${p.congBan ? (Number(p.congBan) * multiplier).toLocaleString('vi-VN') + 'đ' : '-'}</td>
          <td style="text-align: right;" class="admin-only">${isAdmin && p.congVon ? (Number(p.congVon) * multiplier).toLocaleString('vi-VN') + 'đ' : '-'}</td>
          <td style="text-align: right;">${p.giaBanMon ? (Number(p.giaBanMon) * multiplier).toLocaleString('vi-VN') + 'đ' : '-'}</td>
          <td style="text-align: right;" class="admin-only">${isAdmin && p.giaVon ? (Number(p.giaVon) * multiplier).toLocaleString('vi-VN') + 'đ' : '-'}</td>
          <td style="text-align: center;">
            <span class="badge-status ${statusClass}">${p.trangThai || 'Còn tồn'}</span>
          </td>
          <td style="text-align: center; white-space: nowrap;">
            <button class="btn btn-sm btn-outline-info" onclick="app.previewProductShowcase('${p.maHang}')" title="Xem trang giới thiệu sản phẩm riêng cho khách">👁️</button>
            <button class="btn btn-sm btn-dark" onclick="app.printSingleTag('${p.maHang}')" title="In tem đuôi chuột">🏷️ Tem</button>
            ${canEdit ? `<button class="btn btn-sm btn-secondary" onclick="app.openEditProductModal('${p.maHang}')" title="${isStaff ? 'Sửa Tên, Ảnh, Video' : 'Sửa'}">✏️</button>` : ''}
            ${canDelete ? `<button class="btn btn-sm btn-danger" onclick="app.deleteProduct('${p.maHang}')" title="Xóa">🗑️</button>` : ''}
          </td>
        </tr>
      `;
    }).join('');

    this.updateUserRoleUI();
  }

  renderInventoryGoldStats() {
    const gridEl = document.getElementById('invGoldStatsCardGrid');
    const grandBadgeEl = document.getElementById('invGoldStatsGrandTotalBadge');
    const pagWeightEl = document.getElementById('invPaginationTotalGoldWeight');

    const parseWeight = (val) => {
      if (!val) return 0;
      const num = parseFloat(String(val).replace(',', '.').trim());
      return isNaN(num) ? 0 : num;
    };

    // 1. Tính tổng TL Vàng của danh sách hiện tại đang hiển thị trong bảng (this.filteredProducts)
    let totalFilteredWeight = 0;
    (this.filteredProducts || []).forEach(p => {
      totalFilteredWeight += parseWeight(p.tlVang);
    });

    if (pagWeightEl) {
      pagWeightEl.textContent = totalFilteredWeight.toFixed(3);
    }

    if (!gridEl) return;

    // 2. Lấy bộ lọc loại vàng hiện tại
    const currentGoldTypeFilter = document.getElementById('invGoldTypeFilter')?.value || 'ALL';

    // 3. Lọc danh sách sản phẩm theo Chi nhánh, Trạng thái, Quầy, Từ khóa (ngoại trừ invGoldTypeFilter)
    // để bảng thống kê luôn hiển thị đầy đủ tổng trọng lượng từng loại vàng trong phạm vi đang xem
    const activeBranch = this.currentBranch;
    const isAdmin = this.currentUser && this.currentUser.role === 'admin';
    const status = document.getElementById('invStatusFilter')?.value || 'ALL';
    const counter = document.getElementById('invCounterFilter')?.value || 'ALL';
    const keyword = (document.getElementById('invSearchInput')?.value || '').trim().toLowerCase();
    const isFilteringRecent = (status === 'RECENT_MODIFIED' || status === 'RECENT_ALL' || status === 'RECENT_NEW' || status === 'RECENT_EDIT') || this.isFilteringRecentOnly;
    const subFilter = (status === 'RECENT_NEW') ? 'new' : (status === 'RECENT_EDIT' ? 'edit' : this.recentSubFilter || 'all');

    const recentMaMap = new Map();
    (this.recentModifiedItems || []).forEach(i => {
      const code = typeof i === 'object' ? i.maHang : i;
      const type = typeof i === 'object' ? (i.type || 'new') : 'new';
      if (subFilter === 'all' || subFilter === type) {
        recentMaMap.set(code, typeof i === 'object' ? i : { maHang: code, type });
      }
    });

    const scopeProducts = this.products.filter(p => {
      if (isFilteringRecent) {
        if (!recentMaMap.has(p.maHang)) return false;
      } else {
        const branchMatch = (activeBranch === 'ALL' && isAdmin) || (p.chiNhanh === activeBranch) || (!p.chiNhanh && activeBranch === 'Chi nhánh 1');
        if (!branchMatch) return false;
        if (status !== 'ALL' && p.trangThai !== status) return false;
      }

      if (counter !== 'ALL' && p.quayNho !== counter) return false;

      if (keyword) {
        const ma = (p.maHang || '').toLowerCase();
        const ten = (p.tenHang || '').toLowerCase();
        const loai = (p.loaiVang || '').toLowerCase();
        if (!ma.includes(keyword) && !ten.includes(keyword) && !loai.includes(keyword)) return false;
      }

      return true;
    });

    // 4. Danh sách các loại vàng chuẩn để gom nhóm nhất quán với bộ lọc
    const definedTypes = [];
    (this.goldPrices || []).forEach(gp => {
      const name = (gp.loaiVang || '').trim();
      if (name && !definedTypes.includes(name)) definedTypes.push(name);
    });
    const selEl = document.getElementById('invGoldTypeFilter');
    if (selEl) {
      Array.from(selEl.options).forEach(opt => {
        const val = (opt.value || '').trim();
        if (val && val !== 'ALL' && !definedTypes.includes(val)) definedTypes.push(val);
      });
    }

    const getCanonicalGoldType = (rawType) => {
      if (!rawType || !String(rawType).trim()) return 'Khác';
      const cleanRaw = String(rawType).trim();

      // Khớp chính xác (không phân biệt hoa thường)
      const exact = definedTypes.find(dt => dt.toLowerCase() === cleanRaw.toLowerCase());
      if (exact) return exact;

      // Khớp thông minh theo isMatchingGoldType
      const smart = definedTypes.find(dt => this.isMatchingGoldType(cleanRaw, dt));
      if (smart) return smart;

      return cleanRaw;
    };

    // Nhóm sản phẩm theo loại vàng chuẩn hóa
    const goldGroupMap = new Map();
    let grandTotalWeight = 0;

    scopeProducts.forEach(p => {
      const typeName = getCanonicalGoldType(p.loaiVang);
      const w = parseWeight(p.tlVang);
      grandTotalWeight += w;

      if (!goldGroupMap.has(typeName)) {
        goldGroupMap.set(typeName, { name: typeName, count: 0, weight: 0 });
      }
      const g = goldGroupMap.get(typeName);
      g.count++;
      g.weight += w;
    });

    if (grandBadgeEl) {
      grandBadgeEl.textContent = grandTotalWeight.toFixed(3);
    }

    // Sắp xếp: Ưu tiên loại vàng có trọng lượng cao nhất lên đầu
    const groups = Array.from(goldGroupMap.values()).sort((a, b) => {
      if (Math.abs(b.weight - a.weight) > 0.0001) return b.weight - a.weight;
      return b.count - a.count;
    });

    if (groups.length === 0) {
      gridEl.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #94A3B8; font-size: 12px; padding: 10px;">Không có dữ liệu loại vàng trong kho hiện tại</div>`;
      return;
    }

    gridEl.innerHTML = groups.map(g => {
      const isCardActive = (currentGoldTypeFilter !== 'ALL' && (currentGoldTypeFilter === g.name || this.isMatchingGoldType(g.name, currentGoldTypeFilter)));
      // Nếu thẻ đang được kích hoạt lọc danh sách bên dưới -> đồng bộ 100% số lượng và trọng lượng với bảng phân trang
      const displayCount = isCardActive ? this.filteredProducts.length : g.count;
      const displayWeight = isCardActive ? totalFilteredWeight : g.weight;
      const escapedName = g.name.replace(/'/g, "\\'");
      return `
        <div class="inv-gold-stat-card ${isCardActive ? 'active' : ''}" onclick="app.quickFilterByGoldType('${escapedName}')" title="Bấm để lọc nhanh sản phẩm ${g.name}">
          <div class="card-gold-name">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 90px;">${g.name}</span>
            <span class="card-gold-count">${displayCount} SP</span>
          </div>
          <div class="card-gold-weight">
            <span class="card-gold-weight-val">${displayWeight.toFixed(3)}</span>
            <span style="font-size: 11px; color: #78350F; font-weight: 600;">chỉ</span>
          </div>
        </div>
      `;
    }).join('');
  }

  quickFilterByGoldType(loaiVang) {
    const sel = document.getElementById('invGoldTypeFilter');
    if (!sel) return;

    const currentVal = sel.value;
    const isCurrentlyActive = (currentVal !== 'ALL') && (currentVal === loaiVang || this.isMatchingGoldType(loaiVang, currentVal));

    if (isCurrentlyActive) {
      sel.value = 'ALL';
    } else {
      let matchedOptVal = null;
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === loaiVang) {
          matchedOptVal = sel.options[i].value;
          break;
        }
      }
      if (!matchedOptVal) {
        for (let i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value !== 'ALL' && this.isMatchingGoldType(loaiVang, sel.options[i].value)) {
            matchedOptVal = sel.options[i].value;
            break;
          }
        }
      }
      if (matchedOptVal) {
        sel.value = matchedOptVal;
      } else {
        const opt = document.createElement('option');
        opt.value = loaiVang;
        opt.textContent = loaiVang;
        sel.appendChild(opt);
        sel.value = loaiVang;
      }
    }

    this.filterInventory();
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.renderInventoryTable();
    }
  }

  nextPage() {
    const totalPages = Math.ceil(this.filteredProducts.length / this.itemsPerPage);
    if (this.currentPage < totalPages) {
      this.currentPage++;
      this.renderInventoryTable();
    }
  }

  toggleSelectProduct(maHang, isChecked) {
    if (isChecked) {
      this.selectedMaHangSet.add(maHang);
    } else {
      this.selectedMaHangSet.delete(maHang);
    }
    const countEl = document.getElementById('selectedTagsCount');
    if (countEl) countEl.textContent = this.selectedMaHangSet.size;
  }

  toggleSelectAll(checkbox) {
    const startIdx = (this.currentPage - 1) * this.itemsPerPage;
    const endIdx = Math.min(startIdx + this.itemsPerPage, this.filteredProducts.length);
    const pageItems = this.filteredProducts.slice(startIdx, endIdx);

    pageItems.forEach(p => {
      if (checkbox.checked) {
        this.selectedMaHangSet.add(p.maHang);
      } else {
        this.selectedMaHangSet.delete(p.maHang);
      }
    });

    this.renderInventoryTable();
    const countEl = document.getElementById('selectedTagsCount');
    if (countEl) countEl.textContent = this.selectedMaHangSet.size;
  }

  async transferSelectedProducts() {
    if (this.selectedMaHangSet.size === 0) {
      alert('Vui lòng tích chọn các ô vuông sản phẩm cần chuyển kho!');
      return;
    }

    const defaultTarget = this.currentBranch === 'Chi nhánh 1' ? 'Chi nhánh 2' : 'Chi nhánh 1';
    const targetBranch = prompt(`Bạn muốn chuyển ${this.selectedMaHangSet.size} sản phẩm đã chọn sang kho nào?\nNhập chính xác: Chi nhánh 1 hoặc Chi nhánh 2`, defaultTarget);
    if (!targetBranch) return;

    const cleanTarget = targetBranch.trim();
    if (cleanTarget !== 'Chi nhánh 1' && cleanTarget !== 'Chi nhánh 2') {
      alert('Tên chi nhánh không hợp lệ. Vui lòng nhập "Chi nhánh 1" hoặc "Chi nhánh 2"');
      return;
    }

    let count = 0;
    this.products.forEach(p => {
      if (this.selectedMaHangSet.has(p.maHang)) {
        p.chiNhanh = cleanTarget;
        count++;
      }
    });

    this.saveProductsToLocal();
    this.selectedMaHangSet.clear();
    const countEl = document.getElementById('selectedTagsCount');
    if (countEl) countEl.textContent = '0';
    const chkAll = document.getElementById('selectAllCheckbox');
    if (chkAll) chkAll.checked = false;

    this.filterInventory();
    this.filterPosProducts();
    this.updateReportStats();

    alert(`Đã chuyển thành công ${count} sản phẩm sang ${cleanTarget}!`);

    if (GoogleSheetService.isConfigured()) {
      if (confirm('Bạn có muốn đồng bộ ngay danh sách kho đã chuyển lên Google Sheet không?')) {
        await this.syncAllProductsToGoogleSheet();
      }
    }
  }

  // ================= 3. IN TEM ĐUÔI CHUỘT (BARCODE TAGS) =================

  printSingleTag(maHang) {
    const p = this.products.find(item => item.maHang === maHang);
    if (!p) return;
    BarcodeLabel.printTags([p], this.getTagConfig());
  }

  printSelectedTags() {
    if (this.selectedMaHangSet.size === 0) {
      alert('Vui lòng tích chọn các ô vuông sản phẩm cần in tem trong bảng!');
      return;
    }

    const selectedProducts = this.products.filter(p => this.selectedMaHangSet.has(p.maHang));
    BarcodeLabel.printTags(selectedProducts, this.getTagConfig());
  }

  addSelectedToTagQueue() {
    this.products.forEach(p => {
      if (this.selectedMaHangSet.has(p.maHang)) {
        if (!this.tagQueue.some(t => t.maHang === p.maHang)) {
          this.tagQueue.push(p);
        }
      }
    });
    this.renderTagQueue();
    this.switchTab('tab-tags');
  }

  renderTagQueue() {
    // Nếu hàng đợi tem trống, nạp thử 3 món đầu tiên để xem trước mẫu
    if (this.tagQueue.length === 0 && this.products.length > 0) {
      this.tagQueue = this.products.slice(0, 3);
    }

    const countEl = document.getElementById('tagQueueCount');
    if (countEl) countEl.textContent = this.tagQueue.length;

    const container = document.getElementById('tagPreviewContainer');
    if (!container) return;

    if (this.tagQueue.length === 0) {
      container.innerHTML = `<div style="color: #64748B; padding: 20px;">Hàng đợi tem trống. Hãy chọn sản phẩm ở Kho hàng để thêm vào!</div>`;
      return;
    }

    const config = this.getTagConfig();
    container.innerHTML = this.tagQueue.map(p => BarcodeLabel.renderSingleTag(p, config)).join('\n');
  }

  getTagConfig() {
    const parseDec = (val, fallback = 0) => {
      if (val === undefined || val === null || val === '') return fallback;
      const s = String(val).replace(',', '.').trim();
      const n = parseFloat(s);
      return isNaN(n) ? fallback : n;
    };
    const getVal = (id, fallback) => {
      const el = document.getElementById(id);
      return el ? el.value : fallback;
    };
    const getChecked = (id, fallback = true) => {
      const el = document.getElementById(id);
      return el ? el.checked : fallback;
    };

    return {
      storeName: getVal('tagCfgStoreName', 'HOÀNG KIM'),
      totalWidth: parseDec(getVal('tagCfgWidth', 72), 72),
      totalHeight: parseDec(getVal('tagCfgHeight', 10), 10),
      tailWidth: parseDec(getVal('tagCfgTailWidth', 30), 30),
      tailPos: getVal('tagCfgTailPos', 'right'),
      shiftX: parseDec(getVal('tagCfgShiftX', 0), 0),
      shiftY: parseDec(getVal('tagCfgShiftY', 0), 0),
      fontSize: parseDec(getVal('tagCfgFontSize', 6.5), 6.5),
      barcodeHeight: parseDec(getVal('tagCfgBarcodeHeight', 16), 16),
      showStore: getChecked('tagCfgShowStore', true),
      showBarcode: getChecked('tagCfgShowBarcode', true),
      showBarcodeText: getChecked('tagCfgShowBarcodeText', true),
      showNi: getChecked('tagCfgShowNi', true),
      showProductName: getChecked('tagCfgShowProductName', true),
      showGoldType: getChecked('tagCfgShowGoldType', true),
      showWeight: true,
      showTLT: getChecked('tagCfgShowTLT', true),
      showTLH: getChecked('tagCfgShowTLH', true),
      showTLV: getChecked('tagCfgShowTLV', true),
      showLaborCost: getChecked('tagCfgShowLabor', true),
      showManufacturer: getChecked('tagCfgShowManufacturer', true)
    };
  }

  setTagConfigUI(cfg) {
    if (!cfg) return;
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.value = val;
    };
    const setChecked = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.checked = Boolean(val);
    };

    setVal('tagCfgStoreName', cfg.storeName);
    setVal('tagCfgWidth', cfg.totalWidth);
    setVal('tagCfgHeight', cfg.totalHeight);
    setVal('tagCfgTailWidth', cfg.tailWidth);
    setVal('tagCfgTailPos', cfg.tailPos);
    setVal('tagCfgShiftX', cfg.shiftX !== undefined ? cfg.shiftX : 0);
    setVal('tagCfgShiftY', cfg.shiftY !== undefined ? cfg.shiftY : 0);
    setVal('tagCfgFontSize', cfg.fontSize);
    setVal('tagCfgBarcodeHeight', cfg.barcodeHeight);

    setChecked('tagCfgShowStore', cfg.showStore);
    setChecked('tagCfgShowBarcode', cfg.showBarcode);
    setChecked('tagCfgShowBarcodeText', cfg.showBarcodeText);
    setChecked('tagCfgShowNi', cfg.showNi);
    setChecked('tagCfgShowProductName', cfg.showProductName);
    setChecked('tagCfgShowGoldType', cfg.showGoldType);
    setChecked('tagCfgShowTLT', cfg.showTLT);
    setChecked('tagCfgShowTLH', cfg.showTLH);
    setChecked('tagCfgShowTLV', cfg.showTLV);
    setChecked('tagCfgShowLabor', cfg.showLaborCost);
    setChecked('tagCfgShowManufacturer', cfg.showManufacturer !== false);
  }

  saveTagConfig() {
    const cfg = this.getTagConfig();
    localStorage.setItem('pmqlv_tag_config', JSON.stringify(cfg));
    if (this.storeConfig) {
      this.storeConfig.printTagConfig = cfg;
      localStorage.setItem('pmqlv_store_config', JSON.stringify(this.storeConfig));
    }
    alert('✅ Đã lưu cấu hình tem thành công! Các lần in sau sẽ tự động áp dụng thông số này.');
    this.renderTagQueue();
  }

  resetTagConfigToDefault() {
    const defaultCfg = {
      storeName: this.storeConfig?.storeName || 'HOÀNG KIM',
      totalWidth: 72,
      totalHeight: 10,
      tailWidth: 30,
      tailPos: 'right',
      shiftX: 0,
      shiftY: 0,
      fontSize: 6.5,
      barcodeHeight: 16,
      showStore: true,
      showBarcode: true,
      showBarcodeText: true,
      showNi: true,
      showProductName: true,
      showGoldType: true,
      showWeight: true,
      showTLT: true,
      showTLH: true,
      showTLV: true,
      showLaborCost: true,
      showManufacturer: true
    };
    this.setTagConfigUI(defaultCfg);
    this.saveTagConfig();
  }

  updateTagConfig() {
    this.renderTagQueue();
  }

  printAllQueuedTags() {
    if (this.tagQueue.length === 0) {
      alert('Hàng đợi tem trống!');
      return;
    }
    BarcodeLabel.printTags(this.tagQueue, this.getTagConfig());
  }

  clearTagQueue() {
    this.tagQueue = [];
    this.renderTagQueue();
  }

  // ================= 4. BẢNG GIÁ VÀNG =================

  getTvVisibleTypes() {
    const saved = localStorage.getItem('pmqlv_tv_visible_types');
    if (saved) {
      try {
        let list = JSON.parse(saved);
        if (Array.isArray(list)) return list;
      } catch (e) { return []; }
    }
    if (this.storeConfig && Array.isArray(this.storeConfig.tvVisibleTypes)) {
      return this.storeConfig.tvVisibleTypes;
    }
    const defaults = this.goldPrices
      .filter(g => Number(g.giaBan) > 0 || g.loaiVang.includes('Vàng') || g.loaiVang.includes('VANG') || g.loaiVang.includes('Bạc'))
      .map(g => g.loaiVang);
    localStorage.setItem('pmqlv_tv_visible_types', JSON.stringify(defaults));
    return defaults;
  }

  toggleTvDisplay(loaiVang, isChecked) {
    let list = this.getTvVisibleTypes();
    if (isChecked) {
      if (!list.includes(loaiVang)) list.push(loaiVang);
    } else {
      list = list.filter(item => item !== loaiVang);
    }
    localStorage.setItem('pmqlv_tv_visible_types', JSON.stringify(list));
    if (!this.storeConfig) this.storeConfig = {};
    this.storeConfig.tvVisibleTypes = list;
    localStorage.setItem('pmqlv_store_config', JSON.stringify(this.storeConfig));
  }

  renderGoldRatesTable() {
    const tbody = document.getElementById('goldRatesTableBody');
    if (!tbody) return;

    const multiplier = this.storeConfig.currencyUnitMultiplier || 1000;
    const u = this.currentUser || {};
    const isAdmin = (u.role === 'admin');
    const isStaff = (u.role === 'nhanvien' || u.role === 'staff');

    tbody.innerHTML = this.goldPrices.map((g, idx) => {
      const banVnd = (Number(g.giaBan) * multiplier).toLocaleString('vi-VN') + ' đ';

      return `
        <tr>
          <td>
            ${isAdmin ? `
              <a href="javascript:void(0)" onclick="app.openQuickPriceModal(${idx})" class="gold-name-btn" title="Click để nhập nhanh Giá Mua / Giá Bán">
                <span><b>${g.loaiVang}</b></span>
                <span style="font-size: 11px; opacity: 0.85;">✏️</span>
              </a>
            ` : `
              <span style="font-weight: 700; color: #1E293B; font-size: 13.5px;">${g.loaiVang}</span>
            `}
          </td>
          ${!isStaff ? `<td>${g.hamLuong || '--'}</td>` : ''}
          <td style="text-align: right;">
            <input type="number" class="form-control" style="text-align: right; width: 130px; display: inline-block; ${!isAdmin ? 'background-color: #F8FAFC; cursor: default;' : ''}" 
              value="${g.giaMua}" ${isAdmin ? '' : 'readonly'} onchange="app.updateGoldPriceVal(${idx}, 'giaMua', this.value)">
          </td>
          <td style="text-align: right;">
            <input type="number" class="form-control" style="text-align: right; width: 130px; display: inline-block; font-weight: bold; color: #B45309; ${!isAdmin ? 'background-color: #F8FAFC; cursor: default;' : ''}" 
              value="${g.giaBan}" ${isAdmin ? '' : 'readonly'} onchange="app.updateGoldPriceVal(${idx}, 'giaBan', this.value)">
          </td>
          <td>${g.donVi || 'chỉ'}</td>
          <td style="text-align: right; font-weight: 800; color: #0284C7;">${banVnd}</td>
          ${isAdmin ? `
            <td style="text-align: center; white-space: nowrap;">
              <button type="button" class="btn btn-outline btn-xs admin-only" onclick="app.openGoldTypeModal(${idx})" title="Sửa tên loại vàng" style="padding: 4px 8px; font-size: 11.5px; margin-right: 4px; border-radius: 6px;">
                ✏️ Sửa Tên
              </button>
              <button type="button" class="btn btn-danger btn-xs admin-only" onclick="app.deleteGoldType(${idx})" title="Xóa loại vàng này" style="padding: 4px 8px; font-size: 11.5px; border-radius: 6px;">
                🗑️ Xóa
              </button>
            </td>
          ` : ''}
        </tr>
      `;
    }).join('');

    this.syncGoldTypeSelects();
    this.updateUserRoleUI();
  }

  openQuickPriceModal(index) {
    const g = this.goldPrices[index];
    if (!g) return;
    const modal = document.getElementById('goldQuickPriceModal');
    if (!modal) return;

    document.getElementById('goldQuickIndex').value = index;
    document.getElementById('goldQuickPriceTitle').textContent = `💰 Cập Nhật Giá: ${g.loaiVang}`;
    document.getElementById('goldQuickName').textContent = g.loaiVang;
    document.getElementById('goldQuickHamLuong').textContent = `Hàm lượng: ${g.hamLuong || '--'}`;
    const giaMuaInput = document.getElementById('goldQuickGiaMua');
    const giaBanInput = document.getElementById('goldQuickGiaBan');
    giaMuaInput.value = g.giaMua || '';
    giaBanInput.value = g.giaBan || '';

    const multiplier = this.storeConfig.currencyUnitMultiplier || 1000;
    const updatePreview = () => {
      const ban = Number(giaBanInput.value) || 0;
      document.getElementById('goldQuickBanPreview').textContent = (ban * multiplier).toLocaleString('vi-VN') + ' đ';
    };
    giaBanInput.oninput = updatePreview;
    updatePreview();

    modal.classList.add('active');
    giaMuaInput.focus();
  }

  closeQuickPriceModal() {
    const modal = document.getElementById('goldQuickPriceModal');
    if (modal) modal.classList.remove('active');
  }

  async saveQuickPrice() {
    const isStaff = this.currentUser && (this.currentUser.role === 'nhanvien' || this.currentUser.role === 'staff');
    if (isStaff) {
      alert('Tài khoản nhân viên không có quyền thay đổi giá vàng!');
      this.closeQuickPriceModal();
      return;
    }
    const idx = parseInt(document.getElementById('goldQuickIndex').value, 10);
    if (isNaN(idx) || !this.goldPrices[idx]) return;
    const giaMua = Number(document.getElementById('goldQuickGiaMua').value) || 0;
    const giaBan = Number(document.getElementById('goldQuickGiaBan').value) || 0;

    this.goldPrices[idx].giaMua = giaMua;
    this.goldPrices[idx].giaBan = giaBan;

    this.closeQuickPriceModal();
    await this.saveGoldPrices();
  }

  openGoldTypeModal(index = -1) {
    const isStaff = this.currentUser && (this.currentUser.role === 'nhanvien' || this.currentUser.role === 'staff');
    if (isStaff) {
      alert('Tài khoản nhân viên không có quyền thao tác quản lý loại vàng!');
      return;
    }
    const modal = document.getElementById('goldTypeModal');
    if (!modal) return;
    document.getElementById('goldTypeEditIndex').value = index;

    if (index >= 0 && this.goldPrices[index]) {
      const g = this.goldPrices[index];
      document.getElementById('goldTypeModalTitle').textContent = '✏️ Sửa Loại Vàng';
      document.getElementById('goldTypeNameInput').value = g.loaiVang || '';
      document.getElementById('goldTypeHamLuongInput').value = g.hamLuong || '';
      document.getElementById('goldTypeGiaMuaInput').value = g.giaMua || '';
      document.getElementById('goldTypeGiaBanInput').value = g.giaBan || '';
      document.getElementById('goldTypeDonViInput').value = g.donVi || 'chỉ';
    } else {
      document.getElementById('goldTypeModalTitle').textContent = '➕ Thêm Loại Vàng Mới';
      document.getElementById('goldTypeNameInput').value = '';
      document.getElementById('goldTypeHamLuongInput').value = '';
      document.getElementById('goldTypeGiaMuaInput').value = '';
      document.getElementById('goldTypeGiaBanInput').value = '';
      document.getElementById('goldTypeDonViInput').value = 'chỉ';
    }

    modal.classList.add('active');
    document.getElementById('goldTypeNameInput').focus();
  }

  closeGoldTypeModal() {
    const modal = document.getElementById('goldTypeModal');
    if (modal) modal.classList.remove('active');
  }

  async saveGoldType() {
    const isStaff = this.currentUser && (this.currentUser.role === 'nhanvien' || this.currentUser.role === 'staff');
    if (isStaff) {
      alert('Tài khoản nhân viên không có quyền lưu loại vàng!');
      return;
    }
    const idx = parseInt(document.getElementById('goldTypeEditIndex').value, 10);
    const loaiVang = (document.getElementById('goldTypeNameInput').value || '').trim();
    const hamLuong = (document.getElementById('goldTypeHamLuongInput').value || '').trim();
    const giaMua = Number(document.getElementById('goldTypeGiaMuaInput').value) || 0;
    const giaBan = Number(document.getElementById('goldTypeGiaBanInput').value) || 0;
    const donVi = document.getElementById('goldTypeDonViInput').value || 'chỉ';

    if (!loaiVang) {
      alert('Vui lòng nhập tên loại vàng!');
      return;
    }

    if (idx >= 0 && this.goldPrices[idx]) {
      const oldLoaiVang = this.goldPrices[idx].loaiVang;
      this.goldPrices[idx].loaiVang = loaiVang;
      this.goldPrices[idx].hamLuong = hamLuong;
      this.goldPrices[idx].giaMua = giaMua;
      this.goldPrices[idx].giaBan = giaBan;
      this.goldPrices[idx].donVi = donVi;

      // Cập nhật tên trong các sản phẩm đang có nếu được đổi tên
      if (oldLoaiVang !== loaiVang) {
        let changed = false;
        this.products.forEach(p => {
          if (p.loaiVang === oldLoaiVang || this.isMatchingGoldType(p.loaiVang, oldLoaiVang)) {
            p.loaiVang = loaiVang;
            changed = true;
          }
        });
        if (changed) {
          this.saveProductsToLocal();
        }
      }
    } else {
      // Kiểm tra trùng tên
      if (this.goldPrices.some(g => (g.loaiVang || '').toLowerCase() === loaiVang.toLowerCase())) {
        alert('Loại vàng này đã tồn tại trong danh sách!');
        return;
      }
      this.goldPrices.push({
        loaiVang,
        hamLuong,
        giaMua,
        giaBan,
        donVi
      });
    }

    this.closeGoldTypeModal();
    this.syncGoldTypeSelects();
    await this.saveGoldPrices();
  }

  async deleteGoldType(index) {
    const isStaff = this.currentUser && (this.currentUser.role === 'nhanvien' || this.currentUser.role === 'staff');
    if (isStaff) {
      alert('Tài khoản nhân viên không có quyền xóa loại vàng!');
      return;
    }
    const g = this.goldPrices[index];
    if (!g) return;

    if (!confirm(`Bạn có chắc chắn muốn xóa loại vàng "${g.loaiVang}" khỏi hệ thống không?`)) {
      return;
    }

    this.goldPrices.splice(index, 1);
    this.syncGoldTypeSelects();
    await this.saveGoldPrices();
  }

  syncGoldTypeSelects() {
    if (!this.goldPrices || !this.goldPrices.length) return;

    // 1. Dropdown modal Thêm / Sửa sản phẩm
    const modalSel = document.getElementById('modalLoaiVang');
    if (modalSel) {
      const currentVal = modalSel.value;
      modalSel.innerHTML = this.goldPrices.map(g => `<option value="${g.loaiVang}">${g.loaiVang}</option>`).join('');
      if (currentVal && this.goldPrices.some(g => g.loaiVang === currentVal)) {
        modalSel.value = currentVal;
      }
    }

    // 2. Dropdown lọc Loại vàng ở Kho hàng
    const invSel = document.getElementById('invGoldTypeFilter');
    if (invSel) {
      const currentVal = invSel.value;
      invSel.innerHTML = '<option value="ALL">Tất cả loại vàng</option>' + 
        this.goldPrices.map(g => `<option value="${g.loaiVang}">${g.loaiVang}</option>`).join('');
      if (currentVal && (currentVal === 'ALL' || this.goldPrices.some(g => g.loaiVang === currentVal))) {
        invSel.value = currentVal;
      }
    }
  }

  updateGoldPriceVal(index, field, value) {
    if (this.goldPrices[index]) {
      this.goldPrices[index][field] = Number(value) || 0;
    }
  }

  async saveGoldPrices() {
    const isStaff = this.currentUser && (this.currentUser.role === 'nhanvien' || this.currentUser.role === 'staff');
    if (isStaff) {
      alert('Tài khoản nhân viên không có quyền thay đổi bảng giá vàng!');
      return;
    }
    this.showGlobalLoading('Đang cập nhật giá vàng lên Google Sheet...');
    
    if (GoogleSheetService.isConfigured()) {
      const res = await GoogleSheetService.updateGoldPrices(this.goldPrices);
      if (!res || !res.success) {
        this.hideGlobalLoading();
        alert('Lỗi cập nhật giá vàng lên Google Sheet: ' + (res?.message || res?.error || 'Kiểm tra mạng!'));
        return; // Dừng
      }
    }

    localStorage.setItem('pmqlv_gold_prices', JSON.stringify(this.goldPrices));
    this.renderGoldRatesTable();
    this.filterPosProducts();
    if (typeof this.updateCartUI === 'function') this.updateCartUI();

    // Phát tín hiệu BroadcastChannel tức thì cho mọi tab & màn hình TV cùng máy
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('pmqlv_channel');
        bc.postMessage({ type: 'GOLD_PRICES_UPDATED', goldPrices: this.goldPrices, timestamp: Date.now() });
      }
    } catch(e) {}
    
    this.hideGlobalLoading();
    alert('Đã cập nhật bảng giá vàng thành công!');
  }

  // ================= 5. BÁO CÁO & THỐNG KÊ (ADMIN) =================

  // Chuẩn hóa và nhận diện chính xác chi nhánh của hóa đơn
  normalizeOrderBranch(o) {
    if (!o) return 'Chi nhánh 1';

    // 1. Kiểm tra trường chiNhanh có sẵn
    const raw = o.chiNhanh ? String(o.chiNhanh).trim() : '';
    if (raw === 'Chi nhánh 2') return 'Chi nhánh 2';

    // 2. Kiểm tra dấu hiệu Chi nhánh 2 (kể cả khi raw đang là 'Chi nhánh 1' do fallback cũ)
    // Kiểm tra theo tài khoản người bán hoặc tên nhân viên
    if (o.nguoiBan === 'chinhanh2' || (o.nhanVien && o.nhanVien.includes('Chi nhánh 2'))) {
      return 'Chi nhánh 2';
    }

    // Kiểm tra trong ghi chú (ví dụ: [Chi nhánh 2])
    if (o.ghiChu && o.ghiChu.includes('Chi nhánh 2')) {
      return 'Chi nhánh 2';
    }

    // Kiểm tra trong danh sách món hàng đã bán
    if (Array.isArray(o.items) && o.items.length > 0) {
      for (const it of o.items) {
        if (!it) continue;
        if (it.chiNhanh === 'Chi nhánh 2') return 'Chi nhánh 2';
        if (it.maHang && Array.isArray(this.products)) {
          const p = this.products.find(prod => prod && prod.maHang === it.maHang);
          if (p && p.chiNhanh === 'Chi nhánh 2') return 'Chi nhánh 2';
        }
      }
    }

    return raw === 'Chi nhánh 1' ? 'Chi nhánh 1' : 'Chi nhánh 1';
  }

  updateReportStats() {
    const totalItemsEl = document.getElementById('statTotalItems');
    const totalGoldEl = document.getElementById('statTotalGoldWeight');
    const totalCostEl = document.getElementById('statTotalInventoryCost');
    const revenueEl = document.getElementById('statTodayRevenue');
    const totalOrdersEl = document.getElementById('statTotalOrders');
    const profitEl = document.getElementById('statTotalProfit');

    const activeBranch = this.currentBranch;
    const isAdmin = this.currentUser && this.currentUser.role === 'admin';

    // Lọc sản phẩm tồn kho theo Chi Nhánh
    const inStock = this.products.filter(p => {
      const isConTon = p.trangThai === 'Còn tồn';
      const branchMatch = (activeBranch === 'ALL' && isAdmin) || (p.chiNhanh === activeBranch) || (!p.chiNhanh && activeBranch === 'Chi nhánh 1');
      return isConTon && branchMatch;
    });

    const multiplier = this.storeConfig.currencyUnitMultiplier || 1000;

    let totalWeight = 0;
    let totalCost = 0;

    inStock.forEach(p => {
      totalWeight += Number(p.tlVang) || 0;
      totalCost += (Number(p.giaVon) || 0) * multiplier;
    });


    // Lọc lịch sử hóa đơn theo ngày, trạng thái, và chi nhánh
    const fromInput = document.getElementById('reportDateFrom');
    const toInput = document.getElementById('reportDateTo');
    const fromDate = fromInput && fromInput.value ? new Date(fromInput.value + 'T00:00:00') : null;
    const toDate = toInput && toInput.value ? new Date(toInput.value + 'T23:59:59') : null;

    let filteredOrders = this.orders.filter(o => {
      // 1. Chi nhánh (chuẩn hóa tự động từ đơn hàng/mặt hàng/nhân viên)
      const orderBranch = this.normalizeOrderBranch(o);
      const branchMatch = (activeBranch === 'ALL' && isAdmin) || (orderBranch === activeBranch);
      if (!branchMatch) return false;

      // 2. Ngày
      if (!o.ngayBan) return true;
      let orderDate = null;
      try {
        if (o.ngayBan.match(/^\d{4}-\d{2}-\d{2}/)) {
          orderDate = new Date(o.ngayBan.replace(' ', 'T'));
        } else {
          const parts = o.ngayBan.split('/');
          if (parts.length >= 3) {
            orderDate = new Date(parts[2] + '-' + parts[1] + '-' + parts[0]);
          }
        }
      } catch (e) { return true; }
      if (!orderDate) return true;
      if (fromDate && orderDate < fromDate) return false;
      if (toDate && orderDate > toDate) return false;
      return true;
    });

    let totalRevenue = 0;
    let totalProfit = 0;
    filteredOrders.forEach(o => {
      const revenue = Number(o.tongTien) || 0;
      const cost = Number(o.tongVon) || 0;
      totalRevenue += revenue;
      totalProfit += (revenue - cost);
    });

    if (totalItemsEl) totalItemsEl.textContent = inStock.length.toLocaleString('vi-VN');
    if (totalGoldEl) totalGoldEl.textContent = totalWeight.toFixed(3) + ' chỉ';
    if (totalCostEl) {
      if (isAdmin || (this.currentUser && this.currentUser.role === 'chinhanh')) {
        totalCostEl.textContent = totalCost.toLocaleString('vi-VN') + ' đ';
      } else {
        totalCostEl.textContent = '***';
      }
    }
    if (revenueEl) revenueEl.textContent = totalRevenue.toLocaleString('vi-VN') + ' đ';
    if (totalOrdersEl) totalOrdersEl.textContent = filteredOrders.length.toLocaleString('vi-VN') + ' HĐ';
    if (profitEl) profitEl.textContent = totalProfit.toLocaleString('vi-VN') + ' đ';

    // Cập nhật nhãn chi nhánh trên báo cáo
    const branchBadge = document.getElementById('reportBranchBadge');
    if (branchBadge) {
      if (activeBranch === 'ALL' && isAdmin) {
        branchBadge.textContent = 'Toàn Hệ Thống (Tất Cả Chi Nhánh)';
        branchBadge.style.background = '#FEF3C7';
        branchBadge.style.color = '#92400E';
      } else {
        branchBadge.textContent = `Báo Cáo: ${activeBranch.toUpperCase()}`;
        branchBadge.style.background = '#DBEAFE';
        branchBadge.style.color = '#1E40AF';
      }
    }

    // Cập nhật nhãn thời gian
    const periodLabel = document.getElementById('reportPeriodLabel');
    if (periodLabel) {
      if (fromInput && fromInput.value && toInput && toInput.value) {
        const f = new Date(fromInput.value).toLocaleDateString('vi-VN');
        const t = new Date(toInput.value).toLocaleDateString('vi-VN');
        periodLabel.textContent = `Từ ${f} đến ${t}`;
      } else if (fromInput && fromInput.value) {
        periodLabel.textContent = `Từ ${new Date(fromInput.value).toLocaleDateString('vi-VN')}`;
      } else if (toInput && toInput.value) {
        periodLabel.textContent = `Đến ${new Date(toInput.value).toLocaleDateString('vi-VN')}`;
      } else {
        periodLabel.textContent = 'Tất cả thời gian';
      }
    }

    // Render Order history table
    const tbody = document.getElementById('orderHistoryTableBody');
    if (tbody) {
      const statusFilterEl = document.getElementById('orderStatusFilter');
      const selectedStatus = statusFilterEl ? statusFilterEl.value : 'all';

      let displayOrders = filteredOrders;
      if (selectedStatus !== 'all') {
        displayOrders = filteredOrders.filter(o => {
          const t = o.trangThai || 'Đã bán';
          return t === selectedStatus;
        });
      }

      if (displayOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #94A3B8; padding: 20px;">Không có hóa đơn nào phù hợp với bộ lọc.</td></tr>`;
      } else {
        tbody.innerHTML = displayOrders.slice().reverse().slice(0, 100).map(o => {
          const isCancelled = o.trangThai === 'Đã hủy';
          const isReturn = o.trangThai === 'Hoàn hàng';
          const rowStyle = isCancelled ? 'opacity:0.55; background:#FEF2F2;' : (isReturn ? 'background:#F0FDF4;' : '');
          const tongTienNum = Number(o.tongTien) || 0;
          const tongTienStr = tongTienNum < 0
            ? `<span style="color:#DC2626;">-${Math.abs(tongTienNum).toLocaleString('vi-VN')} đ</span>`
            : `<span style="font-weight:bold; color:#B45309;">${tongTienNum.toLocaleString('vi-VN')} đ</span>`;

          // Tính toán lại tổng vốn nếu hóa đơn cũ chưa có
          let tongVonNum = Number(o.tongVon) || 0;
          if (tongVonNum === 0 && o.items && o.items.length > 0 && !isReturn && !isCancelled) {
             const m = this.storeConfig.currencyUnitMultiplier || 1000;
             o.items.forEach(it => {
                if (it.giaVon) {
                   tongVonNum += Number(it.giaVon) * m;
                } else {
                   const matchedProduct = this.products.find(p => p.maHang === it.maHang);
                   if (matchedProduct && matchedProduct.giaVon) {
                      tongVonNum += Number(matchedProduct.giaVon) * m;
                   }
                }
             });
          }
          if (isReturn) {
             tongVonNum = -Math.abs(tongVonNum);
          }

          let statusBadge = '<span style="background:#DCFCE7;color:#166534;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;">✅ Đã bán</span>';
          if (isCancelled) statusBadge = '<span style="background:#FEE2E2;color:#991B1B;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;">🚫 Đã hủy</span>';
          if (isReturn) statusBadge = '<span style="background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;">🔄 Hoàn hàng</span>';

          const u = this.currentUser;
          const isAdm = u && u.role === 'admin';
          const isBr = u && u.role === 'chinhanh';

          const myBranchName = u ? (u.chiNhanh || (u.username === 'chinhanh2' ? 'Chi nhánh 2' : 'Chi nhánh 1')) : '';
          const orderBranch = this.normalizeOrderBranch(o);
          const isOrderOfMyBranch = (orderBranch === myBranchName);
          const isOrderSoldByMe = (o.nguoiBan && o.nguoiBan === u.username) ||
                                  (o.nhanVien && (o.nhanVien === u.fullName || o.nhanVien === u.username)) ||
                                  (isBr && isOrderOfMyBranch);

          const canCancelThisOrder = isAdm || (isBr && isOrderOfMyBranch && isOrderSoldByMe);

          const actionBtns = isReturn ? '' : (isCancelled
            ? `<button class="btn btn-sm" style="font-size:11px;background:#F1F5F9;color:#64748B;" disabled>🚫 Đã hủy</button>`
            : `<button class="btn btn-sm btn-secondary" onclick="app.reprintOrder('${o.maHD}')" style="font-size:11px;" title="In lại hóa đơn">🖨️ In</button>
               ${canCancelThisOrder 
                 ? `<button class="btn btn-sm" onclick="app.showCancelOrderModal('${o.maHD}')" style="font-size:11px;background:#FEE2E2;color:#DC2626;border-color:#FECACA;" title="Đổi trả / Hủy đơn hàng này">🔄 Hủy/Trả</button>` 
                 : ''}`);

          const profitNum = tongTienNum - tongVonNum;
          const showProfit = (tongVonNum !== 0);

          return `
            <tr style="${rowStyle}">
              <td><b>${o.maHD}</b>${o.maHDGoc ? `<br><small style="color:#64748B;">Hoàn: ${o.maHDGoc}</small>` : ''}</td>
              <td style="font-size:12px;">${o.ngayBan}</td>
              <td>${o.tenKhach || 'Khách lẻ'}</td>
              <td>${o.sdt || '--'}</td>
              <td><b>${orderBranch}</b></td>
              <td style="text-align:center;">${(o.items && o.items.length) || 0} món</td>
              <td style="text-align: right;">${tongTienStr}</td>
              <td style="text-align: right; color: #059669; font-size:12px;">${showProfit ? profitNum.toLocaleString('vi-VN') + ' đ' : '--'}</td>
              <td>${statusBadge}</td>
              <td>${o.nhanVien || 'Admin'}</td>
              <td style="text-align: center; white-space:nowrap; display:flex; gap:4px; justify-content:center; padding:6px;">
                ${actionBtns}
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  reprintOrder(maHD) {
    const order = this.orders.find(o => o.maHD === maHD);
    if (!order) return;
    this.preparePrintableInvoice(order);
    window.print();
  }

  setReportToday() {
    const today = new Date().toISOString().split('T')[0];
    const f = document.getElementById('reportDateFrom');
    const t = document.getElementById('reportDateTo');
    if (f) f.value = today;
    if (t) t.value = today;
    this.updateReportStats();
  }

  setReportThisMonth() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const f = document.getElementById('reportDateFrom');
    const t = document.getElementById('reportDateTo');
    if (f) f.value = firstDay;
    if (t) t.value = lastDay;
    this.updateReportStats();
  }

  clearReportFilter() {
    const f = document.getElementById('reportDateFrom');
    const t = document.getElementById('reportDateTo');
    if (f) f.value = '';
    if (t) t.value = '';
    this.updateReportStats();
  }

  // ================= HỦY / ĐỔI TRẢ HÓA ĐƠN =================

  showCancelOrderModal(maHD) {
    const order = this.orders.find(o => o.maHD === maHD);
    if (!order) { alert('Không tìm thấy hóa đơn: ' + maHD); return; }

    if (order.trangThai === 'Đã hủy') {
      alert('Hóa đơn này đã được hủy trước đó.\nMã hoàn hàng: ' + (order.maHoanHang || 'N/A'));
      return;
    }

    const u = this.currentUser;
    const isAdm = u && u.role === 'admin';
    const isBr = u && u.role === 'chinhanh';

    if (!isAdm) {
      const myBranchName = u ? (u.chiNhanh || (u.username === 'chinhanh2' ? 'Chi nhánh 2' : 'Chi nhánh 1')) : '';
      const orderBranch = this.normalizeOrderBranch(order);
      const isOrderOfMyBranch = (orderBranch === myBranchName);
      const isOrderSoldByMe = (order.nguoiBan && order.nguoiBan === u.username) ||
                              (order.nhanVien && (order.nhanVien === u.fullName || order.nhanVien === u.username)) ||
                              (isBr && isOrderOfMyBranch);

      if (!isOrderOfMyBranch || !isOrderSoldByMe) {
        alert(`Bạn không có quyền hủy hóa đơn này!\nTài khoản ${u.fullName || u.username} chỉ được phép hủy các hóa đơn thuộc ${myBranchName} do mình bán.`);
        return;
      }
    }

    // Tạo modal xác nhận đổi trả
    const existingModal = document.getElementById('cancelOrderModal');
    if (existingModal) existingModal.remove();

    const itemsHtml = (order.items || []).map(it => `
      <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #F1F5F9;">
        <span><b>${it.tenHang}</b> <small style="color:#64748B;">(${it.maHang})</small></span>
        <span style="font-weight:bold; color:#B45309;">${(it.thanhTien || 0).toLocaleString('vi-VN')} đ</span>
      </div>
    `).join('');

    const modal = document.createElement('div');
    modal.id = 'cancelOrderModal';
    modal.style.cssText = `
      position:fixed; top:0; left:0; width:100%; height:100%; 
      background:rgba(0,0,0,0.6); z-index:9999; 
      display:flex; align-items:center; justify-content:center; padding:16px;
    `;
    modal.innerHTML = `
      <div style="background:#fff; border-radius:14px; padding:24px; max-width:520px; width:100%; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
          <span style="font-size:26px;">🔄</span>
          <div>
            <div style="font-size:17px; font-weight:800; color:#1E3A5F;">Đổi Trả / Hủy Hóa Đơn</div>
            <div style="font-size:13px; color:#64748B;">Mã HĐ: <b>${order.maHD}</b> | Khách: <b>${order.tenKhach || 'Khách lẻ'}</b> | Ngày: ${order.ngayBan}</div>
          </div>
        </div>

        <div style="background:#FEF3C7; border-radius:8px; padding:12px; margin-bottom:14px; font-size:13px; color:#92400E;">
          ⚠️ Khi hủy hóa đơn, tất cả sản phẩm trong đơn sẽ được <b>hoàn về trạng thái "Còn tồn"</b> và có thể bán lại.
        </div>

        <div style="font-size:13px; font-weight:700; color:#374151; margin-bottom:8px;">📦 Sản phẩm trong đơn:</div>
        <div style="max-height:160px; overflow-y:auto; border:1px solid #E2E8F0; border-radius:8px; padding:4px 12px; margin-bottom:14px; font-size:13px;">
          ${itemsHtml}
          <div style="padding:8px 0; display:flex; justify-content:space-between; font-weight:800;">
            <span>Tổng tiền hoàn trả:</span>
            <span style="color:#DC2626; font-size:15px;">${(order.tongTien || 0).toLocaleString('vi-VN')} đ</span>
          </div>
        </div>

        <div style="margin-bottom:14px;">
          <label style="font-size:13px; font-weight:700; display:block; margin-bottom:6px;">📝 Lý do đổi trả / hủy: <span style="color:#DC2626;">*</span></label>
          <select id="cancelReasonSelect" class="form-control" style="margin-bottom:8px;" onchange="document.getElementById('cancelReasonOther').style.display=this.value==='Khác'?'block':'none'">
            <option value="">-- Chọn lý do --</option>
            <option>Khách đổi ý, không mua</option>
            <option>Sản phẩm lỗi / không đúng mô tả</option>
            <option>Khách trả hàng để lấy tiền</option>
            <option>Nhầm sản phẩm khi bán</option>
            <option>Khách đổi sang sản phẩm khác</option>
            <option>Khác</option>
          </select>
          <input type="text" id="cancelReasonOther" class="form-control" placeholder="Nhập lý do cụ thể..." style="display:none;">
        </div>

        <div style="margin-bottom:16px;">
          <label style="font-size:13px; font-weight:700; display:block; margin-bottom:6px;">👤 Người thực hiện hủy:</label>
          <input type="text" id="cancelStaffName" class="form-control" value="${(this.currentUser && this.currentUser.fullName) || 'Admin'}" readonly>
        </div>

        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button class="btn btn-secondary" onclick="document.getElementById('cancelOrderModal').remove()">❌ Thoát</button>
          <button class="btn btn-danger" onclick="app.confirmCancelOrder('${order.maHD}')" style="background:#DC2626; color:#fff; border-color:#DC2626;">🗑️ Xác Nhận Hủy & Hoàn Hàng</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    // Click ngoài để đóng
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  async confirmCancelOrder(maHD) {
    const reasonSel = document.getElementById('cancelReasonSelect');
    const reasonOther = document.getElementById('cancelReasonOther');
    const staffName = document.getElementById('cancelStaffName');

    let reason = (reasonSel && reasonSel.value) || '';
    if (reason === 'Khác') {
      reason = (reasonOther && reasonOther.value.trim()) || 'Khác';
    }

    if (!reason) {
      alert('Vui lòng chọn hoặc nhập lý do đổi trả / hủy hóa đơn!');
      return;
    }

    const orderIdx = this.orders.findIndex(o => o.maHD === maHD);
    if (orderIdx === -1) { alert('Không tìm thấy hóa đơn!'); return; }

    const order = this.orders[orderIdx];

    this.showGlobalLoading('Đang hủy hóa đơn trực tiếp trên Google Sheet...');

    // 1. Đánh dấu hóa đơn gốc là "Đã hủy"
    const now = new Date();
    const maHoanHang = 'HH' + now.toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
    this.orders[orderIdx].trangThai = 'Đã hủy';
    this.orders[orderIdx].lyDoHuy = reason;
    this.orders[orderIdx].ngayHuy = now.toLocaleString('vi-VN');
    this.orders[orderIdx].nguoiHuy = (staffName && staffName.value) || 'Admin';
    this.orders[orderIdx].maHoanHang = maHoanHang;

    // 2. Tạo phiếu hoàn hàng âm (để thống kê trừ doanh thu)
    const returnEntry = {
      maHD: maHoanHang,
      ngayBan: now.toLocaleString('vi-VN'),
      tenKhach: order.tenKhach || 'Khách lẻ',
      sdt: order.sdt || '',
      items: order.items || [],
      tongTien: -(order.tongTien || 0),   // âm để trừ doanh thu
      tongVon: -(order.tongVon || 0),
      nhanVien: (staffName && staffName.value) || 'Admin',
      ghiChu: `[HOÀN HÀNG] Hủy HĐ ${maHD} - Lý do: ${reason}`,
      trangThai: 'Hoàn hàng',
      maHDGoc: maHD,
      chiNhanh: this.normalizeOrderBranch(order)
    };
    this.orders.unshift(returnEntry);

    // 4. Đồng bộ Google Sheet nếu có kết nối
    if (GoogleSheetService.isConfigured()) {
      const res = await GoogleSheetService.syncAllOrders(this.orders);
      if (!res || !res.success) {
        this.hideGlobalLoading();
        alert('Lỗi hủy hóa đơn trên Google Sheet: ' + (res?.message || res?.error || 'Kiểm tra mạng!'));
        // Rollback local changes since it failed
        this.orders[orderIdx].trangThai = undefined;
        this.orders.shift();
        return; 
      }
    }

    this.saveOrdersToLocal();

    // 3. Hoàn trạng thái sản phẩm về "Còn tồn"
    const soldCodes = (order.items || []).map(it => it.maHang);
    let restoredCount = 0;
    this.products.forEach(p => {
      if (soldCodes.includes(p.maHang)) {
        p.trangThai = 'Còn tồn';
        restoredCount++;
      }
    });
    this.saveProductsToLocal();

    if (GoogleSheetService.isConfigured()) {
       // Cập nhật trạng thái sản phẩm lên sheet chạy ngầm
       soldCodes.forEach(maHang => {
         const product = this.products.find(p => p.maHang === maHang);
         if (product) GoogleSheetService.saveProduct(product);
       });
    }

    // 5. Cập nhật giao diện
    const modal = document.getElementById('cancelOrderModal');
    if (modal) modal.remove();

    this.filterPosProducts();
    this.filterInventory();
    this.updateReportStats();

    this.hideGlobalLoading();
    alert(`✅ Đã hủy hóa đơn ${maHD} thành công!\n\nMã phiếu hoàn hàng: ${maHoanHang}\nSản phẩm hoàn về kho: ${restoredCount} món\nLý do: ${reason}\n\nCác sản phẩm đã được trả về trạng thái "Còn tồn" và sẵn sàng bán lại.`);
  }


  async showSyncModal() {
    this.checkCloudSync();
    await this.fetchRealTimeData();
  }

  async checkCloudSync() {
    const dot = document.getElementById('syncDot');
    const text = document.getElementById('syncText');
    const urlInput = document.getElementById('cfgGoogleScriptUrl');

    if (urlInput) urlInput.value = GoogleSheetService.getUrl();

    if (!GoogleSheetService.isConfigured()) {
      if (dot) dot.className = 'status-dot offline';
      if (text) text.textContent = 'Chế độ Cục bộ (Chưa nối Google Sheet)';
      return;
    }

    if (text) text.textContent = 'Đang kết nối Google Sheet...';
    const ping = await GoogleSheetService.testConnection();

    if (ping && ping.success) {
      if (dot) dot.className = 'status-dot';
      if (text) text.textContent = 'Google Sheet Đã Kết Nối';
    } else {
      if (dot) dot.className = 'status-dot offline';
      if (text) text.textContent = 'Mất kết nối Google Sheet';
    }
  }

  saveGoogleUrl() {
    const val = document.getElementById('cfgGoogleScriptUrl')?.value || '';
    GoogleSheetService.setUrl(val);
    alert('Đã lưu URL Google Apps Script!');
    this.checkCloudSync();
  }

  async testGoogleConnection() {
    this.saveGoogleUrl();
    const resDiv = document.getElementById('googleTestResult');
    if (resDiv) {
      resDiv.style.display = 'block';
      resDiv.innerHTML = '⏳ Đang kiểm tra kết nối...';
    }

    const test = await GoogleSheetService.testConnection();
    if (resDiv) {
      if (test && test.success) {
        resDiv.innerHTML = `<span style="color:#059669; font-weight:bold;">✅ Kết nối Google Sheet thành công! ${test.message || ''}</span>`;
      } else {
        resDiv.innerHTML = `<span style="color:#DC2626; font-weight:bold;">❌ Thất bại: ${test.message || 'Kiểm tra lại URL hoặc quyền truy cập'}</span>`;
      }
    }
  }

  async syncAllProductsToGoogleSheet() {
    let itemsToSync = (this.products && this.products.length > 0) ? this.products : (window.DEFAULT_PRODUCTS || []);
    if (!itemsToSync || itemsToSync.length === 0) {
      alert('Lỗi: Không tìm thấy 1.174 sản phẩm trong hệ thống để đồng bộ!');
      return;
    }
    this.products = itemsToSync;
    this.saveProductsToLocal();

    const url = GoogleSheetService.getUrl();
    const val = GoogleSheetService.validateUrl(url);
    if (!val.valid) {
      alert(val.message);
      this.switchTab('tab-settings');
      return;
    }

    if (!confirm(`Bạn có chắc muốn đồng bộ toàn bộ ${itemsToSync.length} sản phẩm lên Google Sheet?\nQuá trình này chỉ mất khoảng 3-5 giây.`)) {
      return;
    }

    const btn = document.querySelector("button[onclick*='syncAllProductsToGoogleSheet']");
    const originalText = btn ? btn.textContent : '';
    if (btn) btn.textContent = '⏳ Đang tải lên Google Sheet...';

    const res = await GoogleSheetService.syncAllProducts(itemsToSync);
    if (btn) btn.textContent = originalText || '⬆️ Đồng Bộ Lên Google Sheet';

    if (res && res.success) {
      alert(res.message || 'Đồng bộ thành công 1.174 sản phẩm lên Google Sheet!');
      this.checkCloudSync();
    } else {
      const errMsg = (res && (res.message || res.error)) || 'Không rõ nguyên nhân';
      alert('LỖI ĐỒNG BỘ:\n' + errMsg);
    }
  }

  async downloadDataFromGoogleSheet() {
    const url = GoogleSheetService.getUrl();
    const val = GoogleSheetService.validateUrl(url);
    if (!val.valid) {
      alert("Chưa cấu hình Google Script URL!\n\nBạn cần nhập link Google Apps Script vào ô cấu hình rồi nhấn Lưu trước khi tải dữ liệu.");
      this.switchTab('tab-settings');
      return;
    }

    if (!confirm('Bạn có chắc muốn tải toàn bộ dữ liệu từ Google Sheet về máy hiện tại không?\nDữ liệu hiện tại trên máy này sẽ bị ghi đè!')) {
      return;
    }

    const btn = document.querySelector("button[onclick*='downloadDataFromGoogleSheet']");
    const originalText = btn ? btn.textContent : '';
    if (btn) btn.textContent = '⏳ Đang tải dữ liệu...';

    try {
      const data = await GoogleSheetService.fetchAllData();
      if (btn) btn.textContent = originalText || '⬇️ Tải Dữ Liệu Từ Sheet Về Máy';

      if (data) {
        if (data.products && Array.isArray(data.products)) {
          this.products = data.products;
          this.saveProductsToLocal();
        }
        if (data.goldPrices && Array.isArray(data.goldPrices)) {
          this.goldPrices = data.goldPrices;
          localStorage.setItem('pmqlv_gold_prices', JSON.stringify(this.goldPrices));
        }
        if (data.users && Array.isArray(data.users)) {
          const mergedUsers = [...data.users];
          (window.DEFAULT_USERS || []).forEach(def => {
            if (!mergedUsers.some(u => String(u.username || '').toLowerCase() === def.username.toLowerCase())) {
              mergedUsers.push(def);
            }
          });
          this.users = mergedUsers;
          localStorage.setItem('pmqlv_users', JSON.stringify(this.users));
        }
        if (data.orders && Array.isArray(data.orders)) {
          this.orders = data.orders;
          this.orders.forEach(o => {
            if (typeof o.items === 'string') {
              try { o.items = JSON.parse(o.items); } catch(e) { o.items = []; }
            } else if (typeof o.chiTietSanPham === 'string') {
              try { o.items = JSON.parse(o.chiTietSanPham); } catch(e) { o.items = []; }
            }
            o.chiNhanh = this.normalizeOrderBranch(o);
          });
          this.saveOrdersToLocal();
        }
        if (data.customers && Array.isArray(data.customers)) {
          const merged = [...(this.customers || [])];
          data.customers.forEach(sc => {
            const scPhone = (sc.sdt || '').trim();
            const scCccd = (sc.cccd || '').trim();
            const found = merged.find(c => (scPhone && c.sdt && c.sdt.trim() === scPhone) || (scCccd && c.cccd && c.cccd.trim() === scCccd));
            if (!found) {
              merged.push(sc);
            } else {
              if (sc.tenKhach && (!found.tenKhach || found.tenKhach === 'Khách lẻ')) found.tenKhach = sc.tenKhach;
              if (sc.cccd && !found.cccd) found.cccd = sc.cccd;
              if (sc.sdt && !found.sdt) found.sdt = sc.sdt;
              if (sc.soLanMua) found.soLanMua = Math.max(Number(found.soLanMua) || 1, Number(sc.soLanMua));
              if (sc.tongChiTieu) found.tongChiTieu = Math.max(Number(found.tongChiTieu) || 0, Number(sc.tongChiTieu));
            }
          });
          this.customers = merged;
          this.saveCustomersToLocal();
        }
        if (data.storeConfig && typeof data.storeConfig === 'object') {
          this.storeConfig = Object.assign({}, this.storeConfig, data.storeConfig);
          localStorage.setItem('pmqlv_store_config', JSON.stringify(this.storeConfig));
          this.applyStoreConfig();
        }
        
        this.filterPosProducts();
        this.filterInventory();
        this.updateReportStats();
        if (typeof this.renderGoldRatesTable === 'function') this.renderGoldRatesTable();
        alert('✅ Tải dữ liệu từ Google Sheet thành công!\nBạn đã có thể xem lịch sử hóa đơn và sản phẩm trên thiết bị này.');
      } else {
        alert('Lỗi: Không lấy được dữ liệu từ Google Sheet. Hãy kiểm tra kết nối mạng hoặc cấu hình URL.');
      }
    } catch (error) {
      if (btn) btn.textContent = originalText || '⬇️ Tải Dữ Liệu Từ Sheet Về Máy';
      alert('Lỗi trong quá trình tải: ' + error.message);
    }
  }

  resetDefaultProducts() {
    this.products = (window.DEFAULT_PRODUCTS && window.DEFAULT_PRODUCTS.length > 0) ? window.DEFAULT_PRODUCTS : [];
    this.saveProductsToLocal();
    this.filterInventory();
    this.filterPosProducts();
    this.updateReportStats();
    alert(`Đã khôi phục thành công ${this.products.length} sản phẩm gốc từ file Excel!`);
  }

  async saveStoreConfig() {
    const btn = document.querySelector('button[onclick="app.saveStoreConfig()"]');
    const origText = btn ? btn.textContent : '💾 Lưu Thông Tin Tiệm & In Ấn';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Đang lưu & đồng bộ Google Sheet...';
    }

    this.storeConfig.storeName = document.getElementById('cfgStoreName')?.value || 'TIỆM VÀNG HOÀNG KIM';
    this.storeConfig.slogan = document.getElementById('cfgStoreSlogan')?.value || '';
    this.storeConfig.address = document.getElementById('cfgStoreAddress')?.value || '';
    this.storeConfig.phone = document.getElementById('cfgStorePhone')?.value || '';

    const tickerEl = document.getElementById('cfgStoreTicker');
    if (tickerEl) this.storeConfig.tickerText = tickerEl.value;
    
    // New fields
    const footerEl = document.getElementById('cfgInvoiceFooter');
    if (footerEl) this.storeConfig.invoiceFooter = footerEl.value;

    const lblLabor = document.getElementById('cfgPrintLabor');
    if (lblLabor) this.storeConfig.printLabor = lblLabor.checked;

    const lblNi = document.getElementById('cfgPrintNi');
    if (lblNi) this.storeConfig.printNi = lblNi.checked;

    const lblWeight = document.getElementById('cfgPrintWeight');
    if (lblWeight) this.storeConfig.printWeight = lblWeight.checked;

    localStorage.setItem('pmqlv_store_config', JSON.stringify(this.storeConfig));
    this.applyStoreConfig();

    let cloudMsg = '';
    // Tự động lưu lên CSDL Google Sheet nếu có kết nối
    if (window.GoogleSheetService && GoogleSheetService.isConfigured()) {
      try {
        const res = await GoogleSheetService.saveStoreConfig(this.storeConfig);
        if (res && res.success) {
          cloudMsg = '\n☁️ Google Sheet: Đã cập nhật thành công lên trang tính CauHinh!';
          console.log('☁️ Đã đồng bộ cấu hình tiệm vàng lên CSDL Google Sheet');
        } else {
          cloudMsg = '\n⚠️ Google Sheet: ' + (res?.message || res?.error || 'Không đồng bộ được! Kiểm tra mạng.');
          console.warn('Lỗi đồng bộ cấu hình lên đám mây:', res);
        }
      } catch (err) {
        cloudMsg = '\n⚠️ Google Sheet: Lỗi kết nối (' + err.message + ')';
        console.error('Lỗi kết nối lưu cấu hình:', err);
      }
    } else {
      cloudMsg = '\nℹ️ Google Sheet: Chưa cấu hình kết nối đám mây (đã lưu trên máy này).';
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = origText;
    }

    alert('✅ Đã cập nhật cấu hình tiệm vàng & Bảng giá TV thành công!' + cloudMsg);
  }

  async saveCloudinaryConfig() {
    const cloudName = document.getElementById('cfgCloudinaryCloudName')?.value?.trim() || '';
    const preset = document.getElementById('cfgCloudinaryPreset')?.value?.trim() || '';
    const apiKey = document.getElementById('cfgCloudinaryApiKey')?.value?.trim() || '';
    const apiSecret = document.getElementById('cfgCloudinaryApiSecret')?.value?.trim() || '';

    if (typeof CloudinaryService !== 'undefined') {
      CloudinaryService.setConfig(cloudName, preset, apiKey, apiSecret);
    }

    if (!this.storeConfig) this.storeConfig = {};
    this.storeConfig.cloudinaryCloudName = cloudName;
    this.storeConfig.cloudinaryPreset = preset;
    this.storeConfig.cloudinaryApiKey = apiKey;
    this.storeConfig.cloudinaryApiSecret = apiSecret;
    localStorage.setItem('pmqlv_store_config', JSON.stringify(this.storeConfig));

    let cloudMsg = '';
    if (window.GoogleSheetService && GoogleSheetService.isConfigured()) {
      try {
        const res = await GoogleSheetService.saveStoreConfig(this.storeConfig);
        if (res && res.success) {
          cloudMsg = '\n☁️ Đã đồng bộ cấu hình Cloudinary lên Google Sheet (Áp dụng cho mọi máy)!';
        }
      } catch (err) {
        console.warn('Lỗi đồng bộ Cloudinary config:', err);
      }
    }

    alert(`✅ Đã lưu cấu hình Cloudinary thành công!${cloudMsg}\nTừ bây giờ, video & ảnh sẽ được quản lý và dọn dẹp trực tiếp qua Cloudinary.`);
  }

  async testCloudinaryConnection() {
    const statusDiv = document.getElementById('cloudinaryTestStatus');
    if (statusDiv) {
      statusDiv.style.display = 'block';
      statusDiv.style.background = '#EFF6FF';
      statusDiv.style.color = '#1D4ED8';
      statusDiv.style.border = '1px solid #BFDBFE';
      statusDiv.innerHTML = '⏳ Đang kiểm tra kết nối tới máy chủ Cloudinary...';
    }

    // Tự động lưu cấu hình trước khi test
    const cloudName = document.getElementById('cfgCloudinaryCloudName')?.value?.trim() || '';
    const preset = document.getElementById('cfgCloudinaryPreset')?.value?.trim() || '';
    const apiKey = document.getElementById('cfgCloudinaryApiKey')?.value?.trim() || '';
    const apiSecret = document.getElementById('cfgCloudinaryApiSecret')?.value?.trim() || '';
    if (typeof CloudinaryService !== 'undefined') {
      CloudinaryService.setConfig(cloudName, preset, apiKey, apiSecret);
    }

    if (!cloudName || !preset) {
      if (statusDiv) {
        statusDiv.style.background = '#FEF2F2';
        statusDiv.style.color = '#B91C1C';
        statusDiv.style.border = '1px solid #FECACA';
        statusDiv.innerHTML = '⚠️ Vui lòng nhập cả Cloud Name và Upload Preset trước khi kiểm tra!';
      }
      return;
    }

    const res = await CloudinaryService.testConnection();
    if (statusDiv) {
      if (res.success) {
        statusDiv.style.background = '#ECFDF5';
        statusDiv.style.color = '#047857';
        statusDiv.style.border = '1px solid #A7F3D0';
        statusDiv.innerHTML = `${res.message}`;
      } else {
        statusDiv.style.background = '#FEF2F2';
        statusDiv.style.color = '#B91C1C';
        statusDiv.style.border = '1px solid #FECACA';
        statusDiv.innerHTML = `${res.message}`;
      }
    }
  }

  async testCloudinaryAdminConnection() {
    const statusDiv = document.getElementById('cloudinaryTestStatus');
    if (statusDiv) {
      statusDiv.style.display = 'block';
      statusDiv.style.background = '#EFF6FF';
      statusDiv.style.color = '#1D4ED8';
      statusDiv.style.border = '1px solid #BFDBFE';
      statusDiv.innerHTML = '⏳ Đang kiểm tra xác thực quyền Quản trị (API Key & Secret)...';
    }

    const cloudName = document.getElementById('cfgCloudinaryCloudName')?.value?.trim() || '';
    const preset = document.getElementById('cfgCloudinaryPreset')?.value?.trim() || '';
    const apiKey = document.getElementById('cfgCloudinaryApiKey')?.value?.trim() || '';
    const apiSecret = document.getElementById('cfgCloudinaryApiSecret')?.value?.trim() || '';

    if (typeof CloudinaryService !== 'undefined') {
      CloudinaryService.setConfig(cloudName, preset, apiKey, apiSecret);
    }

    const res = await CloudinaryService.testAdminConnection();
    if (statusDiv) {
      if (res.success) {
        statusDiv.style.background = '#ECFDF5';
        statusDiv.style.color = '#047857';
        statusDiv.style.border = '1px solid #A7F3D0';
        statusDiv.innerHTML = res.message;
      } else {
        statusDiv.style.background = '#FEF2F2';
        statusDiv.style.color = '#B91C1C';
        statusDiv.style.border = '1px solid #FECACA';
        statusDiv.innerHTML = res.message;
      }
    }
  }

  // ================= DỌN DẸP ĐÁM MÂY CLOUDINARY =================

  onCleanupTimeFilterChanged() {
    const filter = document.getElementById('cleanupTimeFilter')?.value;
    const customGroup = document.getElementById('cleanupCustomDateGroup');
    if (customGroup) {
      customGroup.style.display = (filter === 'custom') ? 'flex' : 'none';
    }
  }

  getOrderDateForProduct(maHang) {
    if (!this.orders || !Array.isArray(this.orders)) return null;
    for (const o of this.orders) {
      if (!o.items) continue;
      let itemsArr = o.items;
      if (typeof itemsArr === 'string') {
        try { itemsArr = JSON.parse(itemsArr); } catch(e) { continue; }
      }
      if (Array.isArray(itemsArr) && itemsArr.some(it => it && String(it.maHang) === String(maHang))) {
        return o.ngayBan;
      }
    }
    return null;
  }

  parseDateString(str) {
    if (!str) return null;
    try {
      if (str.match(/^\d{4}-\d{2}-\d{2}/)) {
        return new Date(str.replace(' ', 'T'));
      }
      const parts = str.split(' ')[0].split('/');
      if (parts.length === 3) {
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      }
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    } catch(e) {
      return null;
    }
  }

  scanCloudinaryCleanup() {
    if (typeof CloudinaryService === 'undefined' || !CloudinaryService.hasAdminCredentials()) {
      alert('⚠️ Vui lòng nhập đầy đủ API Key và API Secret của Cloudinary ở mục trên trước khi quét dọn dẹp!');
      return;
    }

    const timeFilter = document.getElementById('cleanupTimeFilter')?.value || 'all';
    const dateFromVal = document.getElementById('cleanupDateFrom')?.value;
    const dateToVal = document.getElementById('cleanupDateTo')?.value;

    const fromDate = dateFromVal ? new Date(dateFromVal + 'T00:00:00') : null;
    const toDate = dateToVal ? new Date(dateToVal + 'T23:59:59') : null;

    const nowMs = Date.now();
    const msDay = 24 * 60 * 60 * 1000;

    const targets = [];
    const processedCodes = new Set();

    // Quét từ danh sách sản phẩm
    (this.products || []).forEach(p => {
      const isSoldOrCancelled = (p.trangThai === 'Đã bán' || p.trangThai === 'Đã hủy');
      if (!isSoldOrCancelled) return; // Tuyệt đối bỏ qua sản phẩm còn tồn kho!

      const hasCloudImage = p.anhSanPham && String(p.anhSanPham).includes('cloudinary.com');
      const hasCloudVideo = p.videoSanPham && String(p.videoSanPham).includes('cloudinary.com');
      if (!hasCloudImage && !hasCloudVideo) return;

      // Xác định ngày bán
      const soldDateStr = this.getOrderDateForProduct(p.maHang) || p.ngayNhap || '';
      const soldDate = this.parseDateString(soldDateStr);

      // Kiểm tra bộ lọc thời gian
      let matchTime = false;
      if (timeFilter === 'all') {
        matchTime = true;
      } else if (timeFilter === '30days') {
        matchTime = soldDate ? (nowMs - soldDate.getTime() >= 30 * msDay) : true;
      } else if (timeFilter === '60days') {
        matchTime = soldDate ? (nowMs - soldDate.getTime() >= 60 * msDay) : true;
      } else if (timeFilter === '90days') {
        matchTime = soldDate ? (nowMs - soldDate.getTime() >= 90 * msDay) : true;
      } else if (timeFilter === 'custom') {
        if (!soldDate) {
          matchTime = true;
        } else {
          matchTime = (!fromDate || soldDate >= fromDate) && (!toDate || soldDate <= toDate);
        }
      }

      if (!matchTime) return;

      // Đếm số ảnh Cloudinary
      let images = [];
      try {
        if (p.anhSanPham.startsWith('[')) {
          images = JSON.parse(p.anhSanPham).filter(u => u && u.includes('cloudinary.com'));
        } else if (hasCloudImage) {
          images = [p.anhSanPham];
        }
      } catch(e) {
        if (hasCloudImage) images = [p.anhSanPham];
      }

      targets.push({
        maHang: p.maHang,
        tenHang: p.tenHang || 'Sản phẩm',
        ngayBan: soldDateStr || 'Đã bán',
        trangThai: p.trangThai,
        images: images,
        video: hasCloudVideo ? p.videoSanPham : null,
        productRef: p
      });
      processedCodes.add(p.maHang);
    });

    this.cleanupTargets = targets;

    // Hiển thị kết quả lên giao diện
    const previewBox = document.getElementById('cleanupPreviewBox');
    const summaryText = document.getElementById('cleanupSummaryText');
    const tableBody = document.getElementById('cleanupPreviewTableBody');
    const btnStart = document.getElementById('btnStartCleanup');

    if (previewBox) previewBox.style.display = 'block';

    if (targets.length === 0) {
      if (summaryText) summaryText.innerHTML = '🎉 <span style="color: #059669;">Không tìm thấy ảnh/video nào của sản phẩm đã bán phù hợp với tiêu chí lọc này!</span>';
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #94A3B8; padding: 16px;">Tất cả ảnh & video hiện tại đều thuộc các sản phẩm còn tồn kho hoặc đã được dọn sạch.</td></tr>';
      if (btnStart) btnStart.style.display = 'none';
      return;
    }

    let totalImages = 0;
    let totalVideos = 0;
    targets.forEach(t => {
      totalImages += t.images.length;
      if (t.video) totalVideos++;
    });

    const totalMedia = totalImages + totalVideos;
    if (summaryText) {
      summaryText.innerHTML = `🔍 Tìm thấy <b>${targets.length}</b> sản phẩm đã bán phù hợp (Gồm <b>${totalImages} ảnh</b> và <b>${totalVideos} video</b> trên Cloudinary).`;
    }

    if (tableBody) {
      tableBody.innerHTML = targets.map(t => `
        <tr>
          <td><b>${t.maHang}</b></td>
          <td>${t.tenHang}</td>
          <td>${t.ngayBan}</td>
          <td style="text-align: center;">${t.images.length > 0 ? `<span class="badge" style="background:#DBEAFE;color:#1E40AF;padding:2px 6px;border-radius:4px;font-size:11px;">${t.images.length} ảnh</span>` : '--'}</td>
          <td style="text-align: center;">${t.video ? '<span class="badge" style="background:#FEF3C7;color:#92400E;padding:2px 6px;border-radius:4px;font-size:11px;">1 video</span>' : '--'}</td>
          <td><span class="badge" style="background:#FEE2E2;color:#991B1B;padding:2px 6px;border-radius:4px;font-size:11px;">${t.trangThai}</span></td>
        </tr>
      `).join('');
    }

    if (btnStart) {
      btnStart.style.display = 'inline-block';
      btnStart.innerHTML = `🧹 Bắt Đầu Dọn Dẹp (${totalMedia} file)`;
    }
  }

  async executeCloudinaryCleanup() {
    if (!this.cleanupTargets || this.cleanupTargets.length === 0) return;

    let totalImages = 0;
    let totalVideos = 0;
    this.cleanupTargets.forEach(t => {
      totalImages += t.images.length;
      if (t.video) totalVideos++;
    });
    const totalFiles = totalImages + totalVideos;

    const ok = confirm(`⚠️ BẠN CÓ CHẮC CHẮN MUỐN DỌN DẸP?\n\n- Sẽ xóa vĩnh viễn ${totalFiles} file (${totalImages} ảnh, ${totalVideos} video) của ${this.cleanupTargets.length} sản phẩm đã bán trên đám mây Cloudinary.\n- Toàn bộ sản phẩm CÒN TỒN KHO được giữ nguyên 100% không bị ảnh hưởng.\n\nBấm "OK" để bắt đầu xóa.`);
    if (!ok) return;

    const progressBox = document.getElementById('cleanupProgressBox');
    const progressBar = document.getElementById('cleanupProgressBar');
    const progressPct = document.getElementById('cleanupProgressPct');
    const progressText = document.getElementById('cleanupProgressText');
    const btnStart = document.getElementById('btnStartCleanup');

    if (progressBox) progressBox.style.display = 'block';
    if (btnStart) btnStart.disabled = true;

    let deletedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < this.cleanupTargets.length; i++) {
      const target = this.cleanupTargets[i];

      // 1. Xóa tất cả ảnh của sản phẩm này
      for (const imgUrl of target.images) {
        const info = CloudinaryService.extractCloudinaryInfo(imgUrl);
        if (info && info.publicId) {
          try {
            await CloudinaryService.deleteMedia(info.publicId, info.resourceType || 'image');
            deletedCount++;
          } catch(err) {
            console.warn('Lỗi xóa ảnh Cloudinary:', info.publicId, err);
            failedCount++;
          }
        }
        const pct = Math.round((deletedCount / totalFiles) * 100);
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressPct) progressPct.innerText = `${pct}%`;
        if (progressText) progressText.innerText = `Đang dọn dẹp: ${deletedCount}/${totalFiles} file...`;
      }

      // 2. Xóa video nếu có
      if (target.video) {
        const info = CloudinaryService.extractCloudinaryInfo(target.video);
        if (info && info.publicId) {
          try {
            await CloudinaryService.deleteMedia(info.publicId, 'video');
            deletedCount++;
          } catch(err) {
            console.warn('Lỗi xóa video Cloudinary:', info.publicId, err);
            failedCount++;
          }
        }
        const pct = Math.round((deletedCount / totalFiles) * 100);
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressPct) progressPct.innerText = `${pct}%`;
        if (progressText) progressText.innerText = `Đang dọn dẹp: ${deletedCount}/${totalFiles} file...`;
      }

      // 3. Xóa đường dẫn ảnh/video trong đối tượng sản phẩm để không còn link chết
      if (target.productRef) {
        target.productRef.anhSanPham = '';
        target.productRef.videoSanPham = '';
      }
    }

    // 4. Lưu lại dữ liệu cục bộ
    this.saveProductsToLocal();

    // 5. Cập nhật đồng bộ các sản phẩm này lên Google Sheet nếu có kết nối
    if (typeof GoogleSheetService !== 'undefined' && GoogleSheetService.isConfigured()) {
      if (progressText) progressText.innerText = `☁️ Đang đồng bộ cập nhật lại Google Sheet...`;
      for (const target of this.cleanupTargets) {
        if (target.productRef) {
          try {
            await GoogleSheetService.saveProduct(target.productRef);
          } catch(sheetErr) {
            console.warn('Lỗi cập nhật Google Sheet sau khi dọn dẹp:', sheetErr);
          }
        }
      }
    }

    if (progressBar) { progressBar.style.width = '100%'; progressBar.style.background = '#059669'; }
    if (progressPct) progressPct.innerText = '100%';
    if (progressText) progressText.innerText = `✅ Hoàn tất dọn dẹp: Đã xóa ${deletedCount} file trên Cloudinary!`;

    this.showToast(`✅ Đã dọn dẹp thành công ${deletedCount} file trên Cloudinary!`, 'success');

    setTimeout(() => {
      if (progressBox) progressBox.style.display = 'none';
      if (btnStart) { btnStart.style.display = 'none'; btnStart.disabled = false; }
      this.scanCloudinaryCleanup(); // Quét lại để cập nhật bảng
    }, 2500);
  }

  // ================= 7. MODALS & FORMS =================

  // Mở trang giới thiệu sản phẩm riêng cho khách xem (san-pham.html?ma=...)
  previewProductShowcase(maHang) {
    if (!maHang || !String(maHang).trim()) {
      alert('Vui lòng chọn hoặc nhập mã sản phẩm trước!');
      return;
    }
    const cleanMa = String(maHang).trim();
    window.open(`san-pham.html?ma=${encodeURIComponent(cleanMa)}`, '_blank');
  }

  // Menu thao tác sản phẩm trên điện thoại (Sửa, Xóa, Copy Link)
  showProductMobileActions(maHang) {
    if (window.innerWidth > 768) return; // Trên máy tính không mở popup này, giữ nguyên giao diện chuẩn
    if (!maHang) return;
    const p = this.products.find(prod => prod.maHang === maHang);
    if (!p) return;

    this.selectedActionProduct = p;

    const elMa = document.getElementById('actionModalMaHang');
    const elTen = document.getElementById('actionModalTenHang');
    const elSub = document.getElementById('actionModalSubInfo');
    if (elMa) elMa.textContent = p.maHang;
    if (elTen) elTen.textContent = p.tenHang || 'Sản phẩm';
    if (elSub) {
      const weightStr = (typeof BarcodeLabel !== 'undefined') ? BarcodeLabel.formatWeight(p.tlVang) : `${p.tlVang || 0} chỉ`;
      elSub.textContent = `${p.loaiVang || ''} • TL Vàng: ${weightStr} • ${p.chiNhanh || 'Kho'}`;
    }

    const modal = document.getElementById('productActionModal');
    if (modal) modal.classList.add('active');
  }

  closeProductActionModal() {
    const modal = document.getElementById('productActionModal');
    if (modal) modal.classList.remove('active');
    this.selectedActionProduct = null;
  }

  actionEditProduct() {
    const p = this.selectedActionProduct;
    this.closeProductActionModal();
    if (p && p.maHang) {
      this.openEditProductModal(p.maHang);
    }
  }

  actionDeleteProduct() {
    const isStaff = this.currentUser && (this.currentUser.role === 'nhanvien' || this.currentUser.role === 'staff');
    if (isStaff) {
      alert('Tài khoản nhân viên không có quyền xóa sản phẩm trong kho!');
      this.closeProductActionModal();
      return;
    }
    const p = this.selectedActionProduct;
    this.closeProductActionModal();
    if (p && p.maHang) {
      this.deleteProduct(p.maHang);
    }
  }

  actionCopyCustomerLink() {
    const p = this.selectedActionProduct;
    if (!p || !p.maHang) return;

    const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
    const showcaseUrl = `${base}san-pham.html?ma=${encodeURIComponent(p.maHang)}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(showcaseUrl).then(() => {
        this.showToast(`✅ Đã copy link ${p.maHang}! Dán gửi Zalo/Facebook cho khách xem.`, 'success');
      }).catch(() => {
        this.fallbackCopyText(showcaseUrl, p.maHang);
      });
    } else {
      this.fallbackCopyText(showcaseUrl, p.maHang);
    }
    this.closeProductActionModal();
  }

  fallbackCopyText(text, maHang) {
    const inp = document.createElement('textarea');
    inp.value = text;
    inp.style.position = 'fixed';
    inp.style.opacity = '0';
    document.body.appendChild(inp);
    inp.focus();
    inp.select();
    try {
      document.execCommand('copy');
      this.showToast(`✅ Đã copy link ${maHang}!`, 'success');
    } catch (e) {
      prompt('Hãy copy đường link giới thiệu sản phẩm bên dưới:', text);
    }
    document.body.removeChild(inp);
  }

  actionViewShowcase() {
    const p = this.selectedActionProduct;
    this.closeProductActionModal();
    if (p && p.maHang) {
      this.previewProductShowcase(p.maHang);
    }
  }

  openAddProductModal() {
    const isStaff = this.currentUser && (this.currentUser.role === 'nhanvien' || this.currentUser.role === 'staff');
    if (isStaff) {
      alert('Tài khoản nhân viên chỉ có quyền sửa Tên, Ảnh và Video của sản phẩm đã có sẵn trong kho, không có quyền thêm mới sản phẩm!');
      return;
    }

    // Đảm bảo ẩn thông báo nhân viên & mở khóa tất cả các trường
    const staffNotice = document.getElementById('modalStaffNotice');
    if (staffNotice) staffNotice.style.display = 'none';

    const lockedFieldIds = [
      'modalLoaiVang', 'modalQuayNho', 'modalChiNhanh', 'modalNhaCungCap',
      'modalNhaCungCapCustom', 'modalNi', 'modalTlTong', 'modalTlHot',
      'modalTlVang', 'modalCongBan', 'modalCongVon', 'modalGiaBanMon',
      'modalGiaVon', 'modalGiaVangNhap'
    ];
    lockedFieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (el.tagName === 'SELECT') el.disabled = false;
        else el.readOnly = false;
        el.style.backgroundColor = '';
        el.style.cursor = '';
      }
    });
    const tenHangEl = document.getElementById('modalTenHang');
    if (tenHangEl) {
      tenHangEl.readOnly = false;
      tenHangEl.style.backgroundColor = '';
      tenHangEl.style.cursor = '';
    }

    document.getElementById('productModalTitle').textContent = 'Thêm Sản Phẩm Mới';
    document.getElementById('productForm').reset();
    document.getElementById('modalMaHang').readOnly = false;
    document.getElementById('modalMaHang').value = 'I' + Math.floor(1000000 + Math.random() * 9000000);
    
    // Reset Album ảnh & Video
    this.currentProductImages = [];
    this.currentProductVideo = '';
    this.currentLocalVideoFile = null;
    this.currentLocalVideoUrl = null;
    const addUrlInput = document.getElementById('modalAddImageUrlInput');
    if (addUrlInput) addUrlInput.value = '';
    const videoInput = document.getElementById('modalVideoSanPham');
    if (videoInput) videoInput.value = '';
    const videoBox = document.getElementById('modalVideoPreviewBox');
    if (videoBox) { videoBox.style.display = 'none'; videoBox.innerHTML = ''; }
    const progressBox = document.getElementById('modalVideoProgressBox');
    if (progressBox) progressBox.style.display = 'none';
    const statusBadge = document.getElementById('modalVideoStatusBadge');
    if (statusBadge) statusBadge.innerText = 'Chưa có video';
    const btnClearVideo = document.getElementById('modalBtnClearVideo');
    if (btnClearVideo) btnClearVideo.style.display = 'none';
    const cloudBadge = document.getElementById('modalCloudinaryActiveBadge');
    if (cloudBadge) {
      const isCloud = (typeof CloudinaryService !== 'undefined' && CloudinaryService.isConfigured());
      cloudBadge.style.display = isCloud ? 'inline-block' : 'none';
    }
    this.renderModalMediaPreview();

    if (document.getElementById('modalChiNhanh')) {
      document.getElementById('modalChiNhanh').value = (this.currentBranch === 'Chi nhánh 2' ? 'Chi nhánh 2' : 'Chi nhánh 1');
    }
    if (document.getElementById('modalNhaCungCap')) {
      document.getElementById('modalNhaCungCap').value = '';
    }
    if (document.getElementById('modalNhaCungCapCustom')) {
      document.getElementById('modalNhaCungCapCustom').value = '';
      document.getElementById('modalNhaCungCapCustom').style.display = 'none';
    }
    if (document.getElementById('modalGiaVangNhap')) {
      document.getElementById('modalGiaVangNhap').value = '';
    }
    this.onModalLoaiVangChange();
    document.getElementById('productModal').classList.add('active');
  }

  openEditProductModal(maHang) {
    const p = this.products.find(item => item.maHang === maHang);
    if (!p) return;

    const isStaff = this.currentUser && (this.currentUser.role === 'nhanvien' || this.currentUser.role === 'staff');
    const staffNotice = document.getElementById('modalStaffNotice');
    if (staffNotice) staffNotice.style.display = isStaff ? 'block' : 'none';

    // Khóa/mở khóa các trường dữ liệu theo phân quyền nhân viên
    const lockedFieldIds = [
      'modalLoaiVang', 'modalQuayNho', 'modalChiNhanh', 'modalNhaCungCap',
      'modalNhaCungCapCustom', 'modalNi', 'modalTlTong', 'modalTlHot',
      'modalTlVang', 'modalCongBan', 'modalCongVon', 'modalGiaBanMon',
      'modalGiaVon', 'modalGiaVangNhap'
    ];
    lockedFieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (el.tagName === 'SELECT') {
          el.disabled = isStaff;
        } else {
          el.readOnly = isStaff;
        }
        el.style.backgroundColor = isStaff ? '#F1F5F9' : '';
        el.style.cursor = isStaff ? 'not-allowed' : '';
      }
    });

    const tenHangEl = document.getElementById('modalTenHang');
    if (tenHangEl) {
      tenHangEl.readOnly = false;
      tenHangEl.style.backgroundColor = '';
      tenHangEl.style.cursor = '';
    }

    document.getElementById('productModalTitle').textContent = 'Chỉnh Sửa Sản Phẩm: ' + maHang;
    document.getElementById('modalMaHang').value = p.maHang;
    document.getElementById('modalMaHang').readOnly = true;
    document.getElementById('modalTenHang').value = p.tenHang || '';
    const modalLoaiVangEl = document.getElementById('modalLoaiVang');
    if (modalLoaiVangEl) {
      modalLoaiVangEl.value = p.loaiVang || '';
      if (!modalLoaiVangEl.value && p.loaiVang) {
        const matchOpt = Array.from(modalLoaiVangEl.options).find(opt => this.isMatchingGoldType(p.loaiVang, opt.value));
        if (matchOpt) modalLoaiVangEl.value = matchOpt.value;
      }
      if (!modalLoaiVangEl.value && modalLoaiVangEl.options.length > 0) {
        modalLoaiVangEl.value = modalLoaiVangEl.options[0].value;
      }
    }
    document.getElementById('modalQuayNho').value = p.quayNho || '2VANG24K';
    if (document.getElementById('modalChiNhanh')) {
      document.getElementById('modalChiNhanh').value = p.chiNhanh || 'Chi nhánh 1';
    }
    
    // Thiết lập Nhà Cung Cấp
    const selNCC = document.getElementById('modalNhaCungCap');
    const customNCC = document.getElementById('modalNhaCungCapCustom');
    if (selNCC) {
      const nccVal = (p.nhaCungCap || '').trim();
      if (!nccVal) {
        selNCC.value = '';
        if (customNCC) { customNCC.value = ''; customNCC.style.display = 'none'; }
      } else if (nccVal.toUpperCase() === 'HK' || nccVal.toUpperCase().includes('HOÀNG KIM') || nccVal.toUpperCase().includes('HOANG KIM')) {
        selNCC.value = 'HK';
        if (customNCC) { customNCC.value = ''; customNCC.style.display = 'none'; }
      } else {
        selNCC.value = 'OTHER';
        if (customNCC) {
          customNCC.value = nccVal;
          customNCC.style.display = 'block';
        }
      }
    }
    document.getElementById('modalNi').value = p.ni || 0;
    document.getElementById('modalTlTong').value = p.tlTong || 0;
    document.getElementById('modalTlHot').value = p.tlHot || 0;
    document.getElementById('modalTlVang').value = p.tlVang || 0;
    document.getElementById('modalCongBan').value = p.congBan || 0;
    document.getElementById('modalGiaBanMon').value = p.giaBanMon || 0;
    document.getElementById('modalCongVon').value = p.congVon || 0;
    document.getElementById('modalGiaVon').value = p.giaVon || 0;

    const inpGiaVangNhap = document.getElementById('modalGiaVangNhap');
    if (inpGiaVangNhap) {
      if (p.giaVangNhap) {
        inpGiaVangNhap.value = p.giaVangNhap;
      } else if (p.tlVang > 0 && p.giaVon > (p.congVon || 0)) {
        inpGiaVangNhap.value = Math.round(((p.giaVon - (p.congVon || 0)) / p.tlVang) * 100) / 100;
      } else {
        inpGiaVangNhap.value = '';
      }
    }
    
    // Nạp Album ảnh & Video của sản phẩm
    this.currentProductImages = this.parseProductImages(p.anhSanPham);
    this.currentProductVideo = p.videoSanPham || '';
    this.currentLocalVideoFile = null;
    this.currentLocalVideoUrl = null;
    const addUrlInput = document.getElementById('modalAddImageUrlInput');
    if (addUrlInput) addUrlInput.value = '';
    const videoInput = document.getElementById('modalVideoSanPham');
    if (videoInput) videoInput.value = this.currentProductVideo;
    const videoBox = document.getElementById('modalVideoPreviewBox');
    if (videoBox) { videoBox.style.display = 'none'; videoBox.innerHTML = ''; }
    const progressBox = document.getElementById('modalVideoProgressBox');
    if (progressBox) progressBox.style.display = 'none';
    const statusBadge = document.getElementById('modalVideoStatusBadge');
    const btnClearVideo = document.getElementById('modalBtnClearVideo');

    if (this.currentProductVideo) {
      if (statusBadge) statusBadge.innerHTML = '<span style="color: #059669; font-weight: bold;">✅ Đã có video</span>';
      if (btnClearVideo) btnClearVideo.style.display = 'inline-block';
      this.testModalVideoPreview();
    } else {
      if (statusBadge) statusBadge.innerText = 'Chưa có video';
      if (btnClearVideo) btnClearVideo.style.display = 'none';
    }

    const cloudBadge = document.getElementById('modalCloudinaryActiveBadge');
    if (cloudBadge) {
      const isCloud = (typeof CloudinaryService !== 'undefined' && CloudinaryService.isConfigured());
      cloudBadge.style.display = isCloud ? 'inline-block' : 'none';
    }

    this.renderModalMediaPreview();
    document.getElementById('productModal').classList.add('active');
  }

  calcModalGoldWeight() {
    const tlTong = parseFloat(document.getElementById('modalTlTong')?.value) || 0;
    const tlHot = parseFloat(document.getElementById('modalTlHot')?.value) || 0;
    const tlVang = Math.max(0, Math.round((tlTong - tlHot) * 10000) / 10000);
    const inpVang = document.getElementById('modalTlVang');
    if (inpVang) inpVang.value = tlVang;
    this.calcModalCostPrice();
  }

  calcModalCostPrice() {
    const tlVang = parseFloat(document.getElementById('modalTlVang')?.value) || 0;
    const giaVangNhap = parseFloat(document.getElementById('modalGiaVangNhap')?.value) || 0;
    const congVon = parseFloat(document.getElementById('modalCongVon')?.value) || 0;

    if (giaVangNhap > 0 || congVon > 0) {
      const giaVon = Math.round((tlVang * giaVangNhap + congVon) * 100) / 100;
      const inpGiaVon = document.getElementById('modalGiaVon');
      if (inpGiaVon) inpGiaVon.value = giaVon;
    }
  }

  onModalLoaiVangChange() {
    const loaiVang = document.getElementById('modalLoaiVang')?.value || '';
    let rateObj = this.goldPrices.find(g => this.isMatchingGoldType(loaiVang, g.loaiVang));
    const inpGiaVangNhap = document.getElementById('modalGiaVangNhap');
    if (inpGiaVangNhap) {
      const defaultRate = rateObj ? (Number(rateObj.giaMua) || Number(rateObj.giaBan) || 0) : 0;
      if (defaultRate > 0) {
        inpGiaVangNhap.value = defaultRate;
        this.calcModalCostPrice();
      }
    }

    // Tự động gán quầy hàng phù hợp theo loại vàng đã chọn
    const quayInp = document.getElementById('modalQuayNho');
    if (quayInp) {
      const lvLower = loaiVang.toLowerCase();
      if (lvLower.includes('24k') || lvLower.includes('23k') || lvLower.includes('9999') || lvLower.includes('99.99') || lvLower.includes('999')) quayInp.value = '2VANG24K';
      else if (lvLower.includes('18k') || lvLower.includes('750')) quayInp.value = '2VANG18K';
      else if (lvLower.includes('14k') || lvLower.includes('585')) quayInp.value = '2VANG14K';
      else if (lvLower.includes('10k') || lvLower.includes('416')) quayInp.value = '2VANG10K';
      else if (lvLower.includes('bạc') || lvLower.includes('bac')) quayInp.value = '2BAC';
      else if (lvLower.includes('phong')) quayInp.value = '2PHONGTHUY';
      else quayInp.value = '2VANG24K';
    }
  }

  onModalNhaCungCapChange() {
    const sel = document.getElementById('modalNhaCungCap');
    const customInp = document.getElementById('modalNhaCungCapCustom');
    if (!sel || !customInp) return;
    if (sel.value === 'OTHER') {
      customInp.style.display = 'block';
      customInp.focus();
    } else {
      customInp.style.display = 'none';
      customInp.value = '';
    }
  }

  closeProductModal() {
    document.getElementById('productModal').classList.remove('active');
  }

  normalizeImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    url = url.trim();
    const driveMatch = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      return `https://lh3.googleusercontent.com/d/${driveMatch[1]}=s1000`;
    }
    return url;
  }

  parseProductImages(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean).map(u => this.normalizeImageUrl(u));
    if (typeof val === 'string') {
      val = val.trim();
      if (!val) return [];
      if (val.startsWith('[') && val.endsWith(']')) {
        try {
          const arr = JSON.parse(val);
          if (Array.isArray(arr)) return arr.filter(Boolean).map(u => this.normalizeImageUrl(u));
        } catch (e) {}
      }
      if (val.includes('\n')) {
        return val.split('\n').map(s => s.trim()).filter(Boolean).map(u => this.normalizeImageUrl(u));
      }
      if (val.includes(',') && !val.startsWith('data:image')) {
        return val.split(',').map(s => s.trim()).filter(Boolean).map(u => this.normalizeImageUrl(u));
      }
      return [this.normalizeImageUrl(val)];
    }
    return [];
  }

  getPrimaryProductImage(product) {
    const imgs = this.parseProductImages(product?.anhSanPham);
    return imgs.length > 0 ? imgs[0] : '';
  }

  renderModalMediaPreview() {
    const grid = document.getElementById('modalImagesGrid');
    const badge = document.getElementById('modalImgCountBadge');
    if (!grid) return;

    const count = (this.currentProductImages && Array.isArray(this.currentProductImages)) ? this.currentProductImages.length : 0;
    if (badge) {
      badge.textContent = `${count}`;
    }

    if (!this.currentProductImages || this.currentProductImages.length === 0) {
      grid.innerHTML = `
        <div id="modalImagesEmptyHint" style="font-size: 11.5px; color: #94A3B8; text-align: center; width: 100%; padding: 8px 0;">
          Chưa có ảnh nào.
        </div>
      `;
      return;
    }

    grid.innerHTML = this.currentProductImages.map((src, idx) => {
      const isPrimary = (idx === 0);
      return `
        <div style="position: relative; width: 68px; height: 68px; border-radius: 6px; border: 2px solid ${isPrimary ? '#D97706' : '#CBD5E1'}; overflow: hidden; background: #000; box-shadow: 0 1px 4px rgba(0,0,0,0.1); flex-shrink: 0;">
          <img src="${src}" style="width: 100%; height: 100%; object-fit: cover;" alt="Ảnh ${idx + 1}">
          ${isPrimary ? `
            <div style="position: absolute; top: 0; left: 0; right: 0; background: #D97706; color: #FFF; font-size: 9px; font-weight: 800; text-align: center; padding: 1px 0; letter-spacing: 0.5px;">
              ⭐ CHÍNH
            </div>
          ` : `
            <button type="button" onclick="app.setPrimaryImage(${idx})" title="Đặt làm ảnh đại diện chính" style="position: absolute; bottom: 2px; left: 2px; background: rgba(0,0,0,0.7); color: #FDE047; border: none; border-radius: 3px; font-size: 10px; cursor: pointer; padding: 1px 4px;">
              ⭐
            </button>
          `}
          <button type="button" onclick="app.removeImageAtIndex(${idx})" title="Xóa ảnh này" style="position: absolute; top: 2px; right: 2px; background: rgba(220,38,38,0.9); color: #FFF; border: none; border-radius: 50%; width: 18px; height: 18px; font-size: 10px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1;">
            ✕
          </button>
        </div>
      `;
    }).join('');
  }

  addImageFromInputUrl() {
    const input = document.getElementById('modalAddImageUrlInput');
    if (!input) return;
    const url = input.value.trim();
    if (!url) {
      alert('Vui lòng dán đường link ảnh trước!');
      return;
    }
    if (!this.currentProductImages) this.currentProductImages = [];
    this.currentProductImages.push(url);
    input.value = '';
    this.renderModalMediaPreview();
  }

  removeImageAtIndex(index) {
    if (this.currentProductImages && this.currentProductImages[index] !== undefined) {
      this.currentProductImages.splice(index, 1);
      this.renderModalMediaPreview();
    }
  }

  setPrimaryImage(index) {
    if (this.currentProductImages && this.currentProductImages[index]) {
      const chosen = this.currentProductImages.splice(index, 1)[0];
      this.currentProductImages.unshift(chosen);
      this.renderModalMediaPreview();
    }
  }

  handleMultipleImageUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    let processedCount = 0;
    const totalFiles = files.length;
    const isCloudinary = (typeof CloudinaryService !== 'undefined' && CloudinaryService.isConfigured());

    files.forEach((file, fileIdx) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_DIM = 960;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_DIM) {
              height = Math.round(height * (MAX_DIM / width));
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width = Math.round(width * (MAX_DIM / height));
              height = MAX_DIM;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Nén tối ưu 0.75 để ảnh sắc nét và nhẹ
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
          if (!this.currentProductImages) this.currentProductImages = [];
          this.currentProductImages.push(dataUrl);
          this.renderModalMediaPreview();
          this.isImageUploading = true;

          // Tải thẳng lên Cloudinary (Không dùng Google Drive)
          CloudinaryService.uploadMedia(dataUrl, 'image').then(res => {
            if (res && res.secure_url) {
              const idx = this.currentProductImages.indexOf(dataUrl);
              if (idx !== -1) {
                this.currentProductImages[idx] = res.secure_url;
                this.renderModalMediaPreview();
              }
            }
          }).catch(err => {
            console.warn('Lỗi upload ảnh lên Cloudinary:', err);
          }).finally(() => {
            const stillUploading = this.currentProductImages && this.currentProductImages.some(img => typeof img === 'string' && img.startsWith('data:image'));
            this.isImageUploading = stillUploading;
          });

          processedCount++;
          if (processedCount === totalFiles) {
            this.renderModalMediaPreview();
            e.target.value = '';
          }
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  extractVideoEmbed(url) {
    if (!url || typeof url !== 'string') return null;
    url = url.trim();

    // 1. YouTube standard, Shorts, youtu.be
    let ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch && ytMatch[1]) {
      return {
        type: 'youtube',
        embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0`,
        videoId: ytMatch[1]
      };
    }

    // 2. Google Drive video preview
    let driveMatch = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      return {
        type: 'drive',
        embedUrl: `https://drive.google.com/file/d/${driveMatch[1]}/preview`
      };
    }

    // 3. Direct video file (.mp4, .webm, .ogg, .mov, blob, data:video, or Cloudinary)
    if (url.startsWith('blob:') || url.startsWith('data:video') || url.includes('cloudinary.com') || url.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i)) {
      return {
        type: 'direct',
        embedUrl: url
      };
    }

    // 4. Fallback
    return {
      type: 'generic',
      embedUrl: url
    };
  }

  testModalVideoPreview() {
    const input = document.getElementById('modalVideoSanPham');
    const box = document.getElementById('modalVideoPreviewBox');
    if (!input || !box) return;

    const url = input.value.trim();
    if (!url) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }

    const embedInfo = this.extractVideoEmbed(url);
    if (!embedInfo) {
      box.style.display = 'none';
      return;
    }

    box.style.display = 'block';
    if (embedInfo.type === 'direct') {
      box.innerHTML = `
        <video src="${embedInfo.embedUrl}" controls playsinline autoplay muted style="width:100%; max-height:220px; display:block; margin:0 auto; background:#000; border-radius:6px;"></video>
      `;
    } else {
      box.innerHTML = `
        <iframe src="${embedInfo.embedUrl}" style="width:100%; height:220px; border:none; display:block; border-radius:6px;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      `;
    }
  }

  async handleVideoRecordingUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    const progressBox = document.getElementById('modalVideoProgressBox');
    const progressBar = document.getElementById('modalVideoProgressBar');
    const progressText = document.getElementById('modalVideoProgressText');
    const progressPct = document.getElementById('modalVideoProgressPercent');
    const statusBadge = document.getElementById('modalVideoStatusBadge');
    const btnClearVideo = document.getElementById('modalBtnClearVideo');
    const videoInput = document.getElementById('modalVideoSanPham');

    if (progressBox) progressBox.style.display = 'block';
    if (progressBar) { progressBar.style.width = '15%'; progressBar.style.background = '#2563EB'; }
    if (progressPct) progressPct.innerText = '15%';
    if (progressText) progressText.innerText = `🎥 Đang nạp video quay từ điện thoại... (${sizeMB} MB)`;

    // Tạo blob URL để phát ngay lập tức trên máy mà không cần chờ tải mạng
    const localUrl = URL.createObjectURL(file);
    this.currentLocalVideoFile = file;
    this.currentLocalVideoUrl = localUrl;
    this.currentProductVideo = localUrl;

    if (videoInput) videoInput.value = localUrl;
    if (btnClearVideo) btnClearVideo.style.display = 'inline-block';
    if (statusBadge) statusBadge.innerHTML = `<span style="color: #059669; font-weight: bold;">📹 Đã nạp video (${sizeMB} MB)</span>`;

    // Hiển thị ngay trên khung xem trước
    const previewBox = document.getElementById('modalVideoPreviewBox');
    if (previewBox) {
      previewBox.style.display = 'block';
      previewBox.innerHTML = `
        <video src="${localUrl}" controls playsinline autoplay muted style="width: 100%; max-height: 220px; background: #000; border-radius: 6px;"></video>
      `;
    }

    // TẢI LÊN CLOUDINARY (Chỉ lưu vào Cloud, không dùng Google Drive)
    const isCloudinary = (typeof CloudinaryService !== 'undefined' && CloudinaryService.isConfigured());
    if (isCloudinary) {
      this.isVideoUploading = true;
      if (progressText) progressText.innerText = `☁️ Đang tải video lên Cloudinary... (${sizeMB} MB)`;

      try {
        const uploadRes = await CloudinaryService.uploadMedia(file, 'video', (pct) => {
          if (progressBar) progressBar.style.width = `${Math.max(10, pct)}%`;
          if (progressPct) progressPct.innerText = `${Math.max(10, pct)}%`;
          if (progressText) progressText.innerText = `☁️ Đang tải lên Cloudinary: ${pct}% (${sizeMB} MB)`;
        });

        this.isVideoUploading = false;
        if (uploadRes && uploadRes.secure_url) {
          if (progressBar) { progressBar.style.width = '100%'; progressBar.style.background = '#059669'; }
          if (progressPct) progressPct.innerText = '100%';
          if (progressText) progressText.innerText = `✅ Đã tải lên Cloudinary thành công! Xem mượt trên mọi thiết bị.`;

          if (videoInput) videoInput.value = uploadRes.secure_url;
          this.currentProductVideo = uploadRes.secure_url;
          if (statusBadge) statusBadge.innerHTML = `<span style="color: #059669; font-weight: bold;">☁️ Cloudinary MP4 (${sizeMB} MB)</span>`;
          this.showToast('✅ Đã tải video lên Cloudinary thành công!', 'success');

          if (previewBox) {
            previewBox.innerHTML = `
              <video src="${uploadRes.secure_url}" controls playsinline autoplay muted style="width: 100%; max-height: 220px; background: #000; border-radius: 6px;"></video>
            `;
          }

          setTimeout(() => {
            if (progressBox) progressBox.style.display = 'none';
          }, 3500);
          e.target.value = '';
          return;
        }
      } catch (cloudErr) {
        this.isVideoUploading = false;
        console.error('Lỗi tải lên Cloudinary:', cloudErr);
        if (progressBar) { progressBar.style.width = '100%'; progressBar.style.background = '#EF4444'; }
        if (progressPct) progressPct.innerText = 'Lỗi';
        if (progressText) progressText.innerText = `❌ Lỗi tải video lên Cloudinary: ${cloudErr.message}`;
        this.showToast(`❌ Lỗi tải video lên Cloudinary: ${cloudErr.message}`, 'error');
      }
    } else {
      this.isVideoUploading = false;
      if (progressText) progressText.innerText = `⚠️ Chưa kích hoạt Cloudinary. Vui lòng kiểm tra Cài đặt!`;
      this.showToast('⚠️ Vui lòng cấu hình Cloudinary để tải video!', 'warning');
    }

    e.target.value = '';
  }

  onModalVideoInputChanged() {
    const input = document.getElementById('modalVideoSanPham');
    const val = input ? input.value.trim() : '';
    this.currentProductVideo = val;
    const btnClear = document.getElementById('modalBtnClearVideo');
    const statusBadge = document.getElementById('modalVideoStatusBadge');
    if (btnClear) {
      btnClear.style.display = val ? 'inline-block' : 'none';
    }
    if (statusBadge) {
      statusBadge.innerHTML = val ? `<span style="color: #059669; font-weight: bold;">✅ Có video</span>` : 'Chưa có video';
    }
  }

  clearModalVideo() {
    const videoInput = document.getElementById('modalVideoSanPham');
    if (videoInput) videoInput.value = '';
    this.currentProductVideo = '';
    this.currentLocalVideoFile = null;
    this.currentLocalVideoUrl = null;

    const box = document.getElementById('modalVideoPreviewBox');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }

    const progressBox = document.getElementById('modalVideoProgressBox');
    if (progressBox) progressBox.style.display = 'none';

    const statusBadge = document.getElementById('modalVideoStatusBadge');
    if (statusBadge) statusBadge.innerText = 'Chưa có video';

    const btnClear = document.getElementById('modalBtnClearVideo');
    if (btnClear) btnClear.style.display = 'none';
  }

  async saveProductFromModal() {
    try {
      const maHang = document.getElementById('modalMaHang').value.trim();
      const tenHang = document.getElementById('modalTenHang').value.trim();
      if (!maHang || !tenHang) {
        alert('Vui lòng nhập Mã Hàng và Tên Sản Phẩm!');
        return;
      }

      const loaiVang = document.getElementById('modalLoaiVang').value;
      const quayNho = document.getElementById('modalQuayNho').value;
      const chiNhanh = document.getElementById('modalChiNhanh') ? document.getElementById('modalChiNhanh').value : this.currentBranch;
      let nhaCungCap = '';
      const selNCC = document.getElementById('modalNhaCungCap');
      if (selNCC) {
        if (selNCC.value === 'HK') {
          nhaCungCap = 'HK';
        } else if (selNCC.value === 'OTHER') {
          nhaCungCap = document.getElementById('modalNhaCungCapCustom') ? document.getElementById('modalNhaCungCapCustom').value.trim() : '';
        } else {
          nhaCungCap = selNCC.value.trim();
        }
      }
      const nhaSanXuat = '';
      const ni = parseInt(document.getElementById('modalNi').value) || 0;
      const tlTong = parseFloat(document.getElementById('modalTlTong').value) || 0;
      const tlHot = parseFloat(document.getElementById('modalTlHot').value) || 0;
      const tlVang = parseFloat(document.getElementById('modalTlVang').value) || Math.max(0, tlTong - tlHot);
      const congBan = parseFloat(document.getElementById('modalCongBan').value) || 0;
      const giaBanMon = parseFloat(document.getElementById('modalGiaBanMon').value) || 0;
      const congVon = parseFloat(document.getElementById('modalCongVon').value) || 0;
      const giaVangNhap = parseFloat(document.getElementById('modalGiaVangNhap')?.value) || 0;
      const giaVon = parseFloat(document.getElementById('modalGiaVon').value) || 0;

      const btn = document.querySelector('#productModal button[type="submit"]');
      const origText = btn ? btn.textContent : 'Lưu Sản Phẩm';

      if (this.isVideoUploading) {
        alert('⏳ Video đang được tải lên Cloudinary, vui lòng đợi vài giây cho thanh tiến trình hoàn tất 100% rồi bấm Lưu lại nhé!');
        return;
      }

      if (this.isImageUploading) {
        alert('⏳ Hình ảnh đang được tải lên Cloudinary, vui lòng đợi vài giây cho hoàn tất rồi bấm Lưu lại nhé!');
        return;
      }

      // Đảm bảo tất cả ảnh đã được tải lên Cloudinary trước khi lưu để tránh tràn bộ nhớ Google Sheet
      if (this.currentProductImages && this.currentProductImages.length > 0) {
        const hasBase64 = this.currentProductImages.some(img => typeof img === 'string' && img.startsWith('data:image'));
        if (hasBase64) {
          if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang tải ảnh lên Cloudinary...'; }
          try {
            for (let i = 0; i < this.currentProductImages.length; i++) {
              const imgItem = this.currentProductImages[i];
              if (imgItem && typeof imgItem === 'string' && imgItem.startsWith('data:image')) {
                const res = await CloudinaryService.uploadMedia(imgItem, 'image');
                if (res && res.secure_url) {
                  this.currentProductImages[i] = res.secure_url;
                }
              }
            }
            this.renderModalMediaPreview();
          } catch (upErr) {
            console.error('Lỗi upload ảnh lên Cloudinary khi lưu:', upErr);
            alert('❌ Không thể tải ảnh lên Cloudinary: ' + upErr.message + '\n\nĐể bảo vệ dữ liệu Google Sheet, hệ thống không lưu trực tiếp ảnh dung lượng lớn. Vui lòng kiểm tra lại mạng hoặc thử lại!');
            if (btn) { btn.disabled = false; btn.textContent = origText; }
            return;
          }
        }
      }

      let videoSanPham = document.getElementById('modalVideoSanPham')?.value.trim() || '';

      // Nếu video vẫn còn là link blob cục bộ (chưa tải lên Cloudinary xong) -> Tự động tải lên ngay
      if (videoSanPham.startsWith('blob:') && this.currentLocalVideoFile && typeof CloudinaryService !== 'undefined' && CloudinaryService.isConfigured()) {
        try {
          if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang tải video lên Cloudinary...'; }
          const upRes = await CloudinaryService.uploadMedia(this.currentLocalVideoFile, 'video');
          if (upRes && upRes.secure_url) {
            videoSanPham = upRes.secure_url;
            this.currentProductVideo = upRes.secure_url;
            const videoInput = document.getElementById('modalVideoSanPham');
            if (videoInput) videoInput.value = upRes.secure_url;
          }
        } catch (vidErr) {
          console.error('Lỗi upload video lên Cloudinary khi bấm lưu:', vidErr);
          alert('❌ Tải video lên Cloudinary thất bại: ' + vidErr.message + '\nVui lòng thử lại hoặc xóa video trước khi lưu.');
          if (btn) { btn.disabled = false; btn.textContent = origText; }
          return;
        }
      } else if (videoSanPham.startsWith('blob:')) {
        alert('⚠️ Video chưa được tải lên đám mây Cloudinary. Vui lòng đợi hoàn tất trước khi bấm Lưu!');
        return;
      }

      // Xử lý đóng gói nhiều ảnh & video
      let anhSanPham = '';
      if (this.currentProductImages && this.currentProductImages.length > 0) {
        if (this.currentProductImages.length === 1) {
          anhSanPham = this.currentProductImages[0];
        } else {
          anhSanPham = JSON.stringify(this.currentProductImages);
        }
      }

      // Tuyệt đối không gửi chuỗi base64 khổng lồ làm lỗi Google Sheet
      if (typeof anhSanPham === 'string' && anhSanPham.startsWith('data:image')) {
        alert('⚠️ Ảnh chưa được tải lên Cloudinary. Vui lòng chụp lại ảnh hoặc kiểm tra kết nối mạng!');
        if (btn) { btn.disabled = false; btn.textContent = origText; }
        return;
      }

      const isStaff = this.currentUser && (this.currentUser.role === 'nhanvien' || this.currentUser.role === 'staff');
      const existingIndex = this.products.findIndex(p => p.maHang === maHang);

      if (isStaff && existingIndex < 0) {
        alert('Tài khoản nhân viên chỉ có quyền sửa Tên, Ảnh và Video của sản phẩm đã có sẵn trong kho, không có quyền thêm mới sản phẩm!');
        return;
      }

      const productData = {
        maHang,
        tenHang,
        loaiHang: 'Trang sức',
        loaiVang,
        quayNho,
        nhomHang: '',
        tlTong,
        tlHot,
        tlVang,
        ni,
        congBan,
        congVon,
        giaVangNhap,
        giaBanMon,
        giaVon,
        nhaSanXuat,
        nhaCungCap,
        trangThai: existingIndex >= 0 ? this.products[existingIndex].trangThai : 'Còn tồn',
        cuaHang: this.storeConfig.storeName,
        chiNhanh: chiNhanh,
        anhSanPham: anhSanPham,
        videoSanPham: videoSanPham,
        quayLon: '2HOANGKIM2',
        ngayNhap: new Date().toISOString().slice(0, 10),
        ngayCapNhat: new Date().toISOString(),
        loaiCapNhat: existingIndex >= 0 ? 'edit' : 'new'
      };

      if (existingIndex >= 0) {
        productData.trangThai = this.products[existingIndex].trangThai || 'Còn tồn';
        productData.ngayNhap = this.products[existingIndex].ngayNhap || productData.ngayNhap;

        // BẢO VỆ DỮ LIỆU: Nếu là tài khoản Nhân viên, chỉ cho phép cập nhật tên hàng, ảnh, video.
        // Giữ nguyên 100% các thông số kỹ thuật, trọng lượng vàng, nhà cung cấp, chi nhánh và giá tiền gốc
        if (isStaff) {
          const orig = this.products[existingIndex];
          productData.loaiHang = orig.loaiHang || productData.loaiHang;
          productData.loaiVang = orig.loaiVang;
          productData.quayNho = orig.quayNho;
          productData.quayLon = orig.quayLon || productData.quayLon;
          productData.nhomHang = orig.nhomHang || productData.nhomHang;
          productData.tlTong = orig.tlTong;
          productData.tlHot = orig.tlHot;
          productData.tlVang = orig.tlVang;
          productData.ni = orig.ni;
          productData.congBan = orig.congBan;
          productData.congVon = orig.congVon;
          productData.giaVangNhap = orig.giaVangNhap;
          productData.giaBanMon = orig.giaBanMon;
          productData.giaVon = orig.giaVon;
          productData.nhaSanXuat = orig.nhaSanXuat;
          productData.nhaCungCap = orig.nhaCungCap;
          productData.chiNhanh = orig.chiNhanh;
          // Chỉ cập nhật: tenHang, anhSanPham, videoSanPham
        }
      }

      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Đang lưu & đồng bộ...';
      }

      // Lưu lên Google Sheet nếu có kết nối
      let sheetStatusMsg = '';
      if (GoogleSheetService.isConfigured()) {
        try {
          const res = await GoogleSheetService.saveProduct(productData);
          if (res && res.success) {
            sheetStatusMsg = '\n☁️ Google Sheet: Đã cập nhật thành công!';
          } else {
            sheetStatusMsg = '\n⚠️ Google Sheet: ' + (res?.message || res?.error || 'Không đồng bộ được! Kiểm tra mạng.');
            console.warn('Lỗi lưu Google Sheet:', res);
          }
        } catch (sheetErr) {
          sheetStatusMsg = '\n⚠️ Google Sheet: Lỗi kết nối (' + sheetErr.message + ')';
          console.error('Lỗi khi gọi GoogleSheetService.saveProduct:', sheetErr);
        }
      } else {
        sheetStatusMsg = '\nℹ️ Google Sheet: Chưa kết nối URL Web App (dữ liệu chỉ lưu trên máy này).';
      }

      if (btn) {
        btn.disabled = false;
        btn.textContent = origText;
      }

      const isNew = existingIndex < 0;
      if (existingIndex >= 0) {
        this.products[existingIndex] = { ...this.products[existingIndex], ...productData };
      } else {
        this.products.unshift(productData);
      }

      // Đánh dấu mặt hàng vừa thêm mới / vừa sửa để tiện in tem
      this.addRecentModifiedProduct(productData.maHang, isNew ? 'new' : 'edit');

      this.saveProductsToLocal();
      this.closeProductModal();
      this.filterInventory();
      this.filterPosProducts();
      this.updateReportStats();

      alert('Đã lưu sản phẩm thành công!' + sheetStatusMsg);
    } catch (err) {
      console.error('Lỗi khi lưu sản phẩm:', err);
      alert('Có lỗi xảy ra khi lưu: ' + err.message);
      const btn = document.querySelector('#productModal button[type="submit"]');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Lưu Sản Phẩm';
      }
    }
  }

  async deleteProduct(maHang) {
    const isStaff = this.currentUser && (this.currentUser.role === 'nhanvien' || this.currentUser.role === 'staff');
    if (isStaff) {
      alert('Tài khoản nhân viên không có quyền xóa sản phẩm trong kho!');
      return;
    }

    if (!confirm(`Bạn có chắc muốn xóa sản phẩm ${maHang}?`)) return;

    this.showGlobalLoading('Đang xóa sản phẩm và giải phóng Cloudinary...');
    
    // 1. Tự động xóa ảnh & video của sản phẩm này trên Cloudinary
    const prod = this.products.find(p => p.maHang === maHang);
    if (prod && typeof CloudinaryService !== 'undefined' && CloudinaryService.hasAdminCredentials()) {
      try {
        if (prod.anhSanPham) {
          let imgs = [];
          if (prod.anhSanPham.startsWith('[')) {
            try { imgs = JSON.parse(prod.anhSanPham); } catch(e) { imgs = [prod.anhSanPham]; }
          } else {
            imgs = [prod.anhSanPham];
          }
          for (const imgUrl of imgs) {
            const info = CloudinaryService.extractCloudinaryInfo(imgUrl);
            if (info && info.publicId) {
              await CloudinaryService.deleteMedia(info.publicId, info.resourceType || 'image').catch(e => console.warn(e));
            }
          }
        }
        if (prod.videoSanPham) {
          const info = CloudinaryService.extractCloudinaryInfo(prod.videoSanPham);
          if (info && info.publicId) {
            await CloudinaryService.deleteMedia(info.publicId, 'video').catch(e => console.warn(e));
          }
        }
      } catch(cloudErr) {
        console.warn('Lỗi khi xóa media trên Cloudinary:', cloudErr);
      }
    }

    if (GoogleSheetService.isConfigured()) {
      const res = await GoogleSheetService.deleteProduct(maHang);
      if (!res || !res.success) {
        this.hideGlobalLoading();
        alert('Lỗi xóa trên Google Sheet: ' + (res?.message || res?.error || 'Kiểm tra mạng!'));
        return; // Dừng nếu lỗi
      }
    }

    this.products = this.products.filter(p => p.maHang !== maHang);
    this.removeRecentModifiedProduct(maHang);
    this.saveProductsToLocal();
    this.filterInventory();
    this.filterPosProducts();
    this.updateReportStats();
    
    this.hideGlobalLoading();
    alert('Đã xóa sản phẩm và giải phóng ảnh/video trên Cloudinary thành công!');
  }

  // ================= 8. CAMERA SCANNER =================

  openCameraScanner(mode = 'pos') {
    this.scannerMode = mode;
    const modal = document.getElementById('scannerModal');
    modal.classList.add('active');

    const statusEl = document.getElementById('scanner-status');
    if (statusEl) statusEl.textContent = 'Đang bật camera...';

    if (!window.Html5Qrcode) {
      alert('Thư viện quét mã camera chưa được tải xong, hãy kiểm tra kết nối mạng!');
      this.closeCameraScanner();
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const isSecure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      let msg = 'Trình duyệt không hỗ trợ camera hoặc bị vô hiệu hóa.';
      if (!isSecure) {
        msg = '⚠️ TRÌNH DUYỆT CHẶN CAMERA!\n\nBạn đang truy cập không có HTTPS (bảo mật). Apple Safari và Google Chrome trên điện thoại sẽ chặn camera.\n\nHãy dùng máy quét mã vạch cầm tay cắm vào máy tính / điện thoại thay thế.';
      }
      alert(msg);
      this.closeCameraScanner();
      return;
    }

    const formatsToSupport = [
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.QR_CODE
    ];

    this.html5QrCode = new Html5Qrcode('scanner-reader', {
      formatsToSupport: formatsToSupport,
      verbose: false
    });

    const config = {
      fps: 20,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        return {
          width: Math.floor(viewfinderWidth * 0.85),
          height: Math.floor(Math.min(viewfinderHeight * 0.45, 180))
        };
      },
      aspectRatio: 1.0,
      disableFlip: false
    };

    this.html5QrCode.start(
      { facingMode: 'environment' },
      config,
      (decodedText) => {
        this.onBarcodeScanned(decodedText);
      },
      (errorMessage) => {
        // parsing error ignored for noise
      }
    ).then(() => {
      if (statusEl) statusEl.textContent = 'Camera đã sẵn sàng! Đưa mã tem vào khung.';
    }).catch(err => {
      console.error('Lỗi khởi động camera:', err);
      const isSecure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      let msg = '⚠️ Không thể mở camera. Hãy kiểm tra quyền truy cập camera trong trình duyệt của bạn.';
      if (!isSecure) {
        msg = '⚠️ TRÌNH DUYỆT CHẶN CAMERA!\n\nTrên điện thoại (iOS/Android), trình duyệt yêu cầu bảo mật HTTPS để mở camera.\nHiện tại bạn đang dùng mạng nội bộ (HTTP) nên tính năng này bị vô hiệu hóa.\n\nGiải pháp: Sử dụng máy quét mã vạch cầm tay hoặc đưa web lên server có HTTPS.';
      }
      alert(msg);
      if (statusEl) statusEl.textContent = 'Khong the truy cap camera: Bị chặn quyền';
    });
  }

  onBarcodeScanned(barcode) {
    if (!barcode) return;
    barcode = String(barcode).trim().replace(/^\*+|\*+$/g, '');
    console.log('Quét được mã vạch:', barcode);

    // Phát âm thanh bip nhỏ nếu có thể
    this.playBeep();

    if (this.scannerMode === 'pos') {
      this.addToCart(barcode);
      this.closeCameraScanner();
    } else {
      const invInput = document.getElementById('invSearchInput');
      if (invInput) invInput.value = barcode;
      this.filterInventory();
      this.closeCameraScanner();
    }
  }

  playBeep() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 800;
      gain.gain.value = 0.15;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
    } catch (e) {}
  }

  closeCameraScanner() {
    if (this.html5QrCode) {
      this.html5QrCode.stop().then(() => {
        this.html5QrCode.clear();
        this.html5QrCode = null;
      }).catch(e => {
        this.html5QrCode = null;
      });
    }
    document.getElementById('scannerModal').classList.remove('active');
  }

  // ================= 9. ĐĂNG NHẬP & PHÂN QUYỀN =================

  // ================= 9. ĐĂNG NHẬP & BẢO MẬT HỆ THỐNG =================

  updateAuthGateUI() {
    const authGate = document.getElementById('appAuthGate');
    const authArea = document.getElementById('appAuthenticatedArea');

    if (!this.currentUser) {
      document.body.classList.add('not-authenticated');
      if (authGate) authGate.style.display = 'flex';
      if (authArea) authArea.style.display = 'none';

      // Cập nhật tên tiệm nếu đã lưu
      const storeNameEl = document.getElementById('authGateStoreName');
      if (storeNameEl && this.storeConfig && this.storeConfig.storeName) {
        storeNameEl.textContent = this.storeConfig.storeName;
      }

      // Tự động focus vào ô username
      setTimeout(() => {
        const uInp = document.getElementById('authGateUsername');
        if (uInp) uInp.focus();
      }, 100);
    } else {
      document.body.classList.remove('not-authenticated');
      if (authGate) authGate.style.display = 'none';
      if (authArea) authArea.style.display = 'block';
      this.updateUserRoleUI();
    }
  }

  handleAuthGateLogin() {
    try {
      const uInp = document.getElementById('authGateUsername');
      const pInp = document.getElementById('authGatePassword');
      const remCheck = document.getElementById('authGateRemember');
      const errEl = document.getElementById('authGateErrorMsg');

      const u = (uInp?.value || '').trim().toLowerCase();
      const p = (pInp?.value || '').trim();

      if (errEl) errEl.style.display = 'none';
      if (uInp) uInp.style.borderColor = '#CBD5E1';
      if (pInp) pInp.style.borderColor = '#CBD5E1';

      if (!u || !p) {
        if (errEl) {
          errEl.textContent = 'Vui lòng nhập đầy đủ Tên đăng nhập và Mật khẩu!';
          errEl.style.display = 'block';
        }
        if (!u && uInp) uInp.style.borderColor = '#DC2626';
        if (!p && pInp) pInp.style.borderColor = '#DC2626';
        return;
      }

      if (!this.users || this.users.length === 0) {
        this.users = window.DEFAULT_USERS || [];
      }

      let found = this.users.find(user => 
        String(user.username || '').trim().toLowerCase() === u && 
        String(user.password || '').trim() === p
      );

      // Fallback nếu có trong DEFAULT_USERS
      if (!found && window.DEFAULT_USERS) {
        found = window.DEFAULT_USERS.find(user =>
          String(user.username || '').trim().toLowerCase() === u &&
          String(user.password || '').trim() === p
        );
        if (found && !this.users.some(x => String(x.username || '').toLowerCase() === u)) {
          this.users.push(found);
          localStorage.setItem('pmqlv_users', JSON.stringify(this.users));
        }
      }

      if (!found) {
        if (errEl) {
          errEl.textContent = 'Tên đăng nhập hoặc mật khẩu không chính xác! Vui lòng thử lại.';
          errEl.style.display = 'block';
        }
        if (pInp) {
          pInp.style.borderColor = '#DC2626';
          pInp.value = '';
          pInp.focus();
        }
        return;
      }

      // Xác thực thành công
      this.currentUser = found;
      const isRemember = remCheck ? remCheck.checked : true;
      if (isRemember) {
        localStorage.setItem('pmqlv_current_user', JSON.stringify(found));
        sessionStorage.removeItem('pmqlv_current_user');
      } else {
        sessionStorage.setItem('pmqlv_current_user', JSON.stringify(found));
        localStorage.removeItem('pmqlv_current_user');
      }

      this.updateAuthGateUI();
      try { this.renderGoldRatesTable(); } catch(e) { console.error('renderGoldRatesTable error:', e); }
      try { this.filterPosProducts(); } catch(e) { console.error('filterPosProducts error:', e); }
      try { this.filterInventory(); } catch(e) { console.error('filterInventory error:', e); }
      try { this.updateReportStats(); } catch(e) { console.error('updateReportStats error:', e); }

      let roleTitle = 'QUẢN LÝ CHUNG (ADMIN)';
      if (found.role === 'chinhanh') {
        roleTitle = `QUẢN LÝ ${found.chiNhanh ? found.chiNhanh.toUpperCase() : ''}`;
      } else if (found.role === 'nhanvien') {
        roleTitle = 'NHÂN VIÊN THU NGÂN';
      }
      this.showToast(`Chào mừng ${found.fullName || found.username} (${roleTitle}) đã đăng nhập!`, 'success');
    } catch (err) {
      console.error('handleAuthGateLogin error:', err);
      const errEl = document.getElementById('authGateErrorMsg');
      if (errEl) {
        errEl.textContent = 'Lỗi hệ thống khi đăng nhập: ' + err.message;
        errEl.style.display = 'block';
      } else {
        alert('Lỗi đăng nhập: ' + err.message);
      }
    }
  }

  toggleAuthPasswordVisibility() {
    const pInp = document.getElementById('authGatePassword');
    const eyeBtn = document.getElementById('authGatePasswordToggle');
    if (!pInp) return;
    if (pInp.type === 'password') {
      pInp.type = 'text';
      if (eyeBtn) eyeBtn.textContent = '🙈';
    } else {
      pInp.type = 'password';
      if (eyeBtn) eyeBtn.textContent = '👁️';
    }
  }

  logout() {
    if (!confirm('Bạn có chắc chắn muốn đăng xuất khỏi hệ thống không?')) {
      return;
    }
    this.currentUser = null;
    localStorage.removeItem('pmqlv_current_user');
    sessionStorage.removeItem('pmqlv_current_user');
    this.updateAuthGateUI();

    const uInp = document.getElementById('authGateUsername');
    const pInp = document.getElementById('authGatePassword');
    const errEl = document.getElementById('authGateErrorMsg');
    if (uInp) uInp.value = '';
    if (pInp) pInp.value = '';
    if (errEl) errEl.style.display = 'none';
  }

  // Tương thích ngược nếu modal cũ được gọi
  closeLoginModal() {
    this.logout();
  }
  handleLogin() {
    this.handleAuthGateLogin();
  }

  // ================= 10. XUẤT EXCEL =================

  exportToExcel() {
    if (!window.XLSX) {
      alert('Thư viện Excel đang tải, vui lòng thử lại sau 2 giây.');
      return;
    }

    const dataToExport = this.filteredProducts.map(p => ({
      'Mã hàng': p.maHang,
      'Tên hàng': p.tenHang,
      'Loại hàng': p.loaiHang,
      'Loại vàng': p.loaiVang,
      'Quầy': p.quayNho,
      'TL tổng': p.tlTong,
      'TL hột': p.tlHot,
      'TL vàng': p.tlVang,
      'Ni': p.ni,
      'Công bán': p.congBan,
      'Giá bán món': p.giaBanMon,
      'Trạng thái': p.trangThai,
      'Ngày nhập': p.ngayNhap
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DanhSachSanPham');
    XLSX.writeFile(wb, `DanhSachSanPham_PMQLV_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // ================= 10.1 NHẬP SẢN PHẨM TỪ EXCEL =================

  async handleImportExcel(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const inputEl = event.target;

    if (!window.XLSX) {
      alert('Thư viện Excel (SheetJS) chưa được tải xong, vui lòng thử lại sau vài giây!');
      inputEl.value = '';
      return;
    }

    try {
      this.showGlobalLoading('Đang đọc và phân tích file Excel...');

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (!rawRows || rawRows.length === 0) {
        this.hideGlobalLoading();
        alert('File Excel không có dữ liệu!');
        inputEl.value = '';
        return;
      }

      // Chuẩn hóa tên cột để dò tự động không phân biệt hoa thường và dấu tiếng Việt
      const normalizeStr = (str) => {
        if (!str) return '';
        return String(str).toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '');
      };

      // Dò tìm dòng tiêu đề chứa "Mã hàng" trong 15 dòng đầu
      let headerRowIndex = -1;
      let colMap = {};

      for (let r = 0; r < Math.min(15, rawRows.length); r++) {
        const row = rawRows[r];
        if (!Array.isArray(row)) continue;

        let foundMaHang = false;
        let tempMap = {};

        row.forEach((cellVal, colIdx) => {
          const norm = normalizeStr(cellVal);
          if (norm.includes('mahang') || norm.includes('mavach') || norm.includes('masp') || norm === 'ma') {
            foundMaHang = true;
            tempMap['maHang'] = colIdx;
          } else if (norm.includes('tenhang') || norm.includes('tensp') || norm.includes('tenmon')) {
            tempMap['tenHang'] = colIdx;
          } else if (norm.includes('loaihang')) {
            tempMap['loaiHang'] = colIdx;
          } else if (norm.includes('loaivang')) {
            tempMap['loaiVang'] = colIdx;
          } else if (norm.includes('nhomhang')) {
            tempMap['nhomHang'] = colIdx;
          } else if (norm.includes('trangthai')) {
            tempMap['trangThai'] = colIdx;
          } else if (norm === 'tltong' || norm.includes('trongluongtong') || norm.includes('tongtl')) {
            tempMap['tlTong'] = colIdx;
          } else if (norm === 'tlhot' || norm.includes('trongluonghot') || norm.includes('hottl')) {
            tempMap['tlHot'] = colIdx;
          } else if (norm === 'tlvang' || norm.includes('trongluongvang') || norm.includes('vangtl')) {
            tempMap['tlVang'] = colIdx;
          } else if (norm === 'ni' || norm.includes('size')) {
            tempMap['ni'] = colIdx;
          } else if (norm === 'congban' || norm.includes('tiencongban')) {
            tempMap['congBan'] = colIdx;
          } else if (norm === 'congvon' || norm.includes('tiencongvon') || norm.includes('congtho')) {
            tempMap['congVon'] = colIdx;
          } else if (norm.includes('giabanmon') || norm.includes('giamon')) {
            tempMap['giaBanMon'] = colIdx;
          } else if (norm.includes('tygiamua') || norm.includes('giavangnhap') || norm.includes('gianhap') || norm.includes('tygia')) {
            tempMap['giaVangNhap'] = colIdx;
          } else if (norm === 'giavon' || norm.includes('giagoc') || norm.includes('tongvon')) {
            tempMap['giaVon'] = colIdx;
          } else if (norm.includes('ngaynhap')) {
            tempMap['ngayNhap'] = colIdx;
          } else if (norm.includes('cuahang')) {
            tempMap['cuaHang'] = colIdx;
          } else if (norm.includes('chinhanh') || norm.includes('kho')) {
            tempMap['chiNhanh'] = colIdx;
          } else if (norm.includes('quaylon')) {
            tempMap['quayLon'] = colIdx;
          } else if (norm.includes('quaynho') || norm === 'quay') {
            tempMap['quayNho'] = colIdx;
          } else if (norm.includes('anh') || norm.includes('image')) {
            tempMap['anhSanPham'] = colIdx;
          } else if (norm.includes('mota2')) {
            tempMap['moTa2'] = colIdx;
          } else if (norm.includes('mota')) {
            tempMap['moTa'] = colIdx;
          }
        });

        if (foundMaHang) {
          headerRowIndex = r;
          colMap = tempMap;
          break;
        }
      }

      if (headerRowIndex === -1 || colMap['maHang'] === undefined) {
        this.hideGlobalLoading();
        alert('Không tìm thấy cột "Mã hàng" trong file Excel!\nVui lòng kiểm tra lại cấu trúc file mẫu DanhSachSanPham.');
        inputEl.value = '';
        return;
      }

      const parseNum = (val) => {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        let s = String(val).trim().replace(/\s+/g, '');
        if (s.includes(',') && s.includes('.')) {
          if (s.indexOf('.') < s.indexOf(',')) {
            s = s.replace(/\./g, '').replace(',', '.');
          } else {
            s = s.replace(/,/g, '');
          }
        } else if (s.includes(',')) {
          s = s.replace(',', '.');
        }
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
      };

      const parseDate = (val) => {
        if (!val) return new Date().toISOString().slice(0, 10);
        if (val instanceof Date && !isNaN(val.getTime())) {
          return val.toISOString().slice(0, 10);
        }
        if (typeof val === 'number') {
          const excelEpoch = new Date(Date.UTC(1899, 11, 30));
          const d = new Date(excelEpoch.getTime() + val * 86400000);
          if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        }
        const s = String(val).trim();
        if (s.includes('/')) {
          const parts = s.split('/');
          if (parts.length === 3) {
            const p0 = parseInt(parts[0]);
            const p1 = parseInt(parts[1]);
            const p2 = parseInt(parts[2]);
            if (p2 > 1000) {
              return `${p2}-${String(p1).padStart(2, '0')}-${String(p0).padStart(2, '0')}`;
            }
          }
        }
        return s.slice(0, 10);
      };

      const inferQuayNho = (goldType) => {
        const g = (goldType || '').toLowerCase();
        if (g.includes('24k') || g.includes('9999') || g.includes('23k')) return '2VANG24K';
        if (g.includes('18k') || g.includes('750') || g.includes('ý')) return '2VANG18K';
        if (g.includes('14k') || g.includes('585')) return '2VANG14K';
        if (g.includes('10k') || g.includes('416')) return '2VANG10K';
        if (g.includes('bạc') || g.includes('bac')) return '2BAC';
        if (g.includes('phong')) return '2PHONGTHUY';
        return '2VANG18K';
      };

      let addedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!Array.isArray(row) || row.length === 0) continue;

        const maHang = String(row[colMap['maHang']] || '').trim();
        if (!maHang) {
          skippedCount++;
          continue;
        }

        const tenHang = colMap['tenHang'] !== undefined ? String(row[colMap['tenHang']] || '').trim() : '';
        const loaiHang = colMap['loaiHang'] !== undefined ? String(row[colMap['loaiHang']] || '').trim() : 'Trang sức';
        const loaiVang = colMap['loaiVang'] !== undefined ? String(row[colMap['loaiVang']] || '').trim() : 'Vàng 18K';
        const nhomHang = colMap['nhomHang'] !== undefined ? String(row[colMap['nhomHang']] || '').trim() : '';
        const trangThai = colMap['trangThai'] !== undefined && row[colMap['trangThai']] ? String(row[colMap['trangThai']]).trim() : 'Còn tồn';

        const tlTong = colMap['tlTong'] !== undefined ? parseNum(row[colMap['tlTong']]) : 0;
        const tlHot = colMap['tlHot'] !== undefined ? parseNum(row[colMap['tlHot']]) : 0;
        let tlVang = colMap['tlVang'] !== undefined ? parseNum(row[colMap['tlVang']]) : 0;
        if (!tlVang && tlTong > 0) {
          tlVang = Math.max(0, Math.round((tlTong - tlHot) * 10000) / 10000);
        }

        const ni = colMap['ni'] !== undefined ? (parseInt(row[colMap['ni']]) || 0) : 0;
        const congBan = colMap['congBan'] !== undefined ? parseNum(row[colMap['congBan']]) : 0;
        const congVon = colMap['congVon'] !== undefined ? parseNum(row[colMap['congVon']]) : 0;
        const giaBanMon = colMap['giaBanMon'] !== undefined ? parseNum(row[colMap['giaBanMon']]) : 0;
        let giaVangNhap = colMap['giaVangNhap'] !== undefined ? parseNum(row[colMap['giaVangNhap']]) : 0;
        let giaVon = colMap['giaVon'] !== undefined ? parseNum(row[colMap['giaVon']]) : 0;

        // Tính toán bổ trợ: Nếu chưa có giá vốn nhưng có giá vàng nhập và TL vàng
        if ((!giaVon || giaVon === 0) && giaVangNhap > 0 && tlVang > 0) {
          giaVon = Math.round((tlVang * giaVangNhap + congVon) * 100) / 100;
        } else if ((!giaVangNhap || giaVangNhap === 0) && giaVon > congVon && tlVang > 0) {
          // Ngược lại nếu có giá vốn nhưng chưa có giá vàng nhập, suy ra giá vàng nhập
          giaVangNhap = Math.round(((giaVon - congVon) / tlVang) * 100) / 100;
        }

        const ngayNhap = colMap['ngayNhap'] !== undefined && row[colMap['ngayNhap']] ? parseDate(row[colMap['ngayNhap']]) : new Date().toISOString().slice(0, 10);
        const cuaHang = colMap['cuaHang'] !== undefined && row[colMap['cuaHang']] ? String(row[colMap['cuaHang']]).trim() : (this.storeConfig?.storeName || 'TIỆM VÀNG HOÀNG KIM');
        const quayLon = colMap['quayLon'] !== undefined && row[colMap['quayLon']] ? String(row[colMap['quayLon']]).trim() : '2HOANGKIM2';
        const quayNho = colMap['quayNho'] !== undefined && row[colMap['quayNho']] ? String(row[colMap['quayNho']]).trim() : inferQuayNho(loaiVang);
        
        let chiNhanh = colMap['chiNhanh'] !== undefined && row[colMap['chiNhanh']] ? String(row[colMap['chiNhanh']]).trim() : '';
        if (!chiNhanh) {
          chiNhanh = (this.currentBranch === 'ALL' || !this.currentBranch) ? 'Chi nhánh 1' : this.currentBranch;
        }

        const anhSanPham = colMap['anhSanPham'] !== undefined && row[colMap['anhSanPham']] ? String(row[colMap['anhSanPham']]).trim() : '';

        const item = {
          maHang,
          tenHang: tenHang || maHang,
          loaiHang: loaiHang || 'Trang sức',
          loaiVang: loaiVang || 'Vàng 18K',
          nhomHang,
          trangThai,
          tlTong,
          tlHot,
          tlVang,
          ni,
          congBan,
          congVon,
          giaBanMon,
          giaVangNhap,
          giaVon,
          ngayNhap,
          cuaHang,
          chiNhanh,
          quayLon,
          quayNho,
          anhSanPham
        };

        const existingIdx = this.products.findIndex(p => p.maHang === maHang);
        if (existingIdx >= 0) {
          this.products[existingIdx] = { ...this.products[existingIdx], ...item };
          updatedCount++;
          this.addRecentModifiedProduct(maHang, 'edit', false);
        } else {
          this.products.unshift(item);
          addedCount++;
          this.addRecentModifiedProduct(maHang, 'new', false);
        }
      }

      if (addedCount > 0 || updatedCount > 0) {
        this.saveRecentModifiedItems();
        this.updateRecentModifiedUI();
      }

      this.saveProductsToLocal();
      this.filterInventory();
      this.filterPosProducts();
      this.updateReportStats();
      this.hideGlobalLoading();

      const totalProcessed = addedCount + updatedCount;
      const msg = `✅ Nhập file Excel thành công!\n- Thêm mới: ${addedCount} sản phẩm\n- Cập nhật: ${updatedCount} sản phẩm\n(Bỏ qua ${skippedCount} dòng trống)`;

      if (GoogleSheetService.isConfigured() && totalProcessed > 0) {
        if (confirm(`${msg}\n\nBạn có muốn đồng bộ ${totalProcessed} sản phẩm này lên Google Sheet ngay bây giờ không?`)) {
          this.syncAllProductsToGoogleSheet();
        }
      } else {
        alert(msg);
      }
    } catch (err) {
      this.hideGlobalLoading();
      console.error('Lỗi khi đọc file Excel:', err);
      alert('Đã xảy ra lỗi khi xử lý file Excel:\n' + err.message);
    } finally {
      inputEl.value = '';
    }
  }

  setupEventListeners() {
    // Keyboard listener for barcode gun (quét bằng máy quét USB ngoài)
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    window.addEventListener('keydown', (e) => {
      // 1. Bỏ qua nếu người dùng đang nhập liệu trong ô input, textarea, select
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable)) {
        return;
      }

      // 2. Bảo vệ an toàn chống lỗi nếu e.key là undefined (thường gặp khi dùng Unikey / bộ gõ tiếng Việt)
      if (!e || typeof e.key !== 'string') {
        return;
      }

      const now = Date.now();
      if (now - lastKeyTime > 150) {
        barcodeBuffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (barcodeBuffer && barcodeBuffer.length >= 4) {
          this.onBarcodeScanned(barcodeBuffer);
          barcodeBuffer = '';
        }
      } else if (e.key.length === 1) {
        barcodeBuffer += e.key;
      }
    });

    // 2. Đồng bộ giá vàng thời gian thực khi mở khóa điện thoại, quay lại ứng dụng, chuyển tab
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.currentUser) {
        this.fetchGoldPricesRealtime(true);
      }
    });
    window.addEventListener('focus', () => {
      if (this.currentUser) {
        this.fetchGoldPricesRealtime(true);
      }
    });
    window.addEventListener('pageshow', () => {
      if (this.currentUser) {
        this.fetchGoldPricesRealtime(true);
      }
    });

    // 3. Lắng nghe BroadcastChannel để đồng bộ tức thì 0.01 giây giữa các tab/cửa sổ trên cùng thiết bị
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel('pmqlv_channel');
        bc.onmessage = (ev) => {
          if (ev.data && ev.data.type === 'GOLD_PRICES_UPDATED' && Array.isArray(ev.data.goldPrices)) {
            console.log('⚡ Nhận tín hiệu giá vàng mới qua BroadcastChannel!');
            this.goldPrices = ev.data.goldPrices;
            localStorage.setItem('pmqlv_gold_prices', JSON.stringify(this.goldPrices));
            this.renderGoldRatesTable();
            this.filterPosProducts();
            if (typeof this.updateCartUI === 'function') this.updateCartUI();
          }
        };
      } catch(e) {}
    }

    // 4. Lắng nghe sự kiện storage cho các tab cùng trình duyệt
    window.addEventListener('storage', (e) => {
      if (e.key === 'pmqlv_gold_prices' && e.newValue) {
        try {
          this.goldPrices = JSON.parse(e.newValue);
          this.renderGoldRatesTable();
          this.filterPosProducts();
          if (typeof this.updateCartUI === 'function') this.updateCartUI();
        } catch(err) {}
      }
    });
  }

  // ================= 11. QUẢN TRỊ & XÓA DỮ LIỆU AN TOÀN (ADMIN ONLY) =================

  isBranch1(branchName) {
    const s = String(branchName || '').toLowerCase().trim();
    return s.includes('1') || s.includes('nhánh 1') || s === 'chi nhánh 1';
  }

  isBranch2(branchName) {
    const s = String(branchName || '').toLowerCase().trim();
    return s.includes('2') || s.includes('nhánh 2') || s === 'chi nhánh 2';
  }

  promptDeleteData(actionType) {
    if (this.currentUser && this.currentUser.role !== 'admin') {
      alert('Chức năng này chỉ dành riêng cho Quản trị viên (Chủ tiệm)!');
      return;
    }

    this.pendingSecurityAction = actionType;

    const titleEl = document.getElementById('securityModalTitle');
    const descEl = document.getElementById('securityModalDesc');
    const inputEl = document.getElementById('securityInputCode');
    const errEl = document.getElementById('securityCodeError');

    if (errEl) errEl.style.display = 'none';
    if (inputEl) inputEl.value = '';

    const countBranch1 = this.products.filter(p => this.isBranch1(p.chiNhanh)).length;
    const countBranch2 = this.products.filter(p => this.isBranch2(p.chiNhanh)).length;
    const totalProducts = this.products.length;
    const totalOrders = this.orders.length;

    switch (actionType) {
      case 'branch1':
        if (titleEl) titleEl.textContent = '🗑️ XÓA TOÀN BỘ SẢN PHẨM CHI NHÁNH 1';
        if (descEl) descEl.innerHTML = `Bạn đang chuẩn bị xóa sạch <b>${countBranch1}</b> sản phẩm thuộc <b>Chi nhánh 1</b>.<br>Dữ liệu của Chi nhánh 2 vẫn được giữ nguyên an toàn.`;
        break;
      case 'branch2':
        if (titleEl) titleEl.textContent = '🗑️ XÓA TOÀN BỘ SẢN PHẨM CHI NHÁNH 2';
        if (descEl) descEl.innerHTML = `Bạn đang chuẩn bị xóa sạch <b>${countBranch2}</b> sản phẩm thuộc <b>Chi nhánh 2</b>.<br>Dữ liệu của Chi nhánh 1 vẫn được giữ nguyên an toàn.`;
        break;
      case 'all_products':
        if (titleEl) titleEl.textContent = '💥 XÓA TOÀN BỘ SẢN PHẨM (TẤT CẢ CHI NHÁNH)';
        if (descEl) descEl.innerHTML = `Bạn đang chuẩn bị làm sạch kho, xóa toàn bộ <b>${totalProducts}</b> sản phẩm của cả 2 chi nhánh.<br><span style="color:#DC2626; font-weight:bold;">Kho hàng sẽ trở về trạng thái trống!</span>`;
        break;
      case 'orders_history':
        if (titleEl) titleEl.textContent = '🧾 XÓA LỊCH SỬ GIAO DỊCH & BÁO CÁO';
        if (descEl) descEl.innerHTML = `Bạn đang chuẩn bị xóa toàn bộ <b>${totalOrders}</b> hóa đơn bán hàng và phiếu đổi trả.<br>Các chỉ số thống kê Doanh thu & Lợi nhuận trong tab Báo Cáo sẽ được đưa về 0.`;
        break;
      case 'wipe_all':
        if (titleEl) titleEl.textContent = '☣️ XÓA TOÀN BỘ DỮ LIỆU HỆ THỐNG';
        if (descEl) descEl.innerHTML = `<b style="color:#DC2626;">CẢNH BÁO CAO NHẤT:</b> Thao tác này sẽ xóa toàn bộ <b>${totalProducts}</b> sản phẩm trong kho VÀ <b>${totalOrders}</b> hóa đơn giao dịch/báo cáo.<br>Hệ thống sẽ được làm sạch hoàn toàn để bắt đầu lại từ đầu!`;
        break;
      default:
        return;
    }

    const modal = document.getElementById('securityConfirmModal');
    if (modal) {
      modal.classList.add('active');
      setTimeout(() => inputEl && inputEl.focus(), 100);
    }
  }

  closeSecurityModal() {
    const modal = document.getElementById('securityConfirmModal');
    if (modal) modal.classList.remove('active');
    this.pendingSecurityAction = null;
  }

  async submitSecurityAction() {
    const inputEl = document.getElementById('securityInputCode');
    const errEl = document.getElementById('securityCodeError');
    const code = (inputEl ? inputEl.value : '').trim();

    if (code !== '821989') {
      if (errEl) {
        errEl.textContent = '❌ Mã xác thực không chính xác! Vui lòng nhập đúng mã code 821989.';
        errEl.style.display = 'block';
      }
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }
      return;
    }

    const action = this.pendingSecurityAction;
    this.closeSecurityModal();

    if (!action) return;

    this.showGlobalLoading('Đang tiến hành xóa dữ liệu và đồng bộ...');

    try {
      if (action === 'branch1') {
        const countBefore = this.products.length;
        this.products = this.products.filter(p => !this.isBranch1(p.chiNhanh));
        const deleted = countBefore - this.products.length;
        this.saveProductsToLocal();

        if (GoogleSheetService.isConfigured()) {
          await GoogleSheetService.syncAllProducts(this.products);
        }

        this.filterInventory();
        this.filterPosProducts();
        this.updateReportStats();
        this.hideGlobalLoading();
        alert(`✅ Đã xóa thành công ${deleted} sản phẩm thuộc Chi nhánh 1!`);

      } else if (action === 'branch2') {
        const countBefore = this.products.length;
        this.products = this.products.filter(p => !this.isBranch2(p.chiNhanh));
        const deleted = countBefore - this.products.length;
        this.saveProductsToLocal();

        if (GoogleSheetService.isConfigured()) {
          await GoogleSheetService.syncAllProducts(this.products);
        }

        this.filterInventory();
        this.filterPosProducts();
        this.updateReportStats();
        this.hideGlobalLoading();
        alert(`✅ Đã xóa thành công ${deleted} sản phẩm thuộc Chi nhánh 2!`);

      } else if (action === 'all_products') {
        const deleted = this.products.length;
        this.products = [];
        this.saveProductsToLocal();

        if (GoogleSheetService.isConfigured()) {
          await GoogleSheetService.syncAllProducts([]);
        }

        this.filterInventory();
        this.filterPosProducts();
        this.updateReportStats();
        this.hideGlobalLoading();
        alert(`✅ Đã xóa toàn bộ ${deleted} sản phẩm trong kho thành công! Kho hàng hiện tại đã sạch.`);

      } else if (action === 'orders_history') {
        const deleted = this.orders.length;
        this.orders = [];
        this.saveOrdersToLocal();

        if (GoogleSheetService.isConfigured()) {
          await GoogleSheetService.syncAllOrders([]);
        }

        this.updateReportStats();
        this.hideGlobalLoading();
        alert(`✅ Đã xóa toàn bộ ${deleted} hóa đơn giao dịch thành công!\nCác chỉ số báo cáo doanh thu và lợi nhuận đã được làm sạch về 0.`);

      } else if (action === 'wipe_all') {
        const pCount = this.products.length;
        const oCount = this.orders.length;
        this.products = [];
        this.orders = [];
        this.saveProductsToLocal();
        this.saveOrdersToLocal();

        if (GoogleSheetService.isConfigured()) {
          await GoogleSheetService.syncAllProducts([]);
          await GoogleSheetService.syncAllOrders([]);
        }

        this.filterInventory();
        this.filterPosProducts();
        this.updateReportStats();
        this.hideGlobalLoading();
        alert(`✅ Đã xóa toàn bộ hệ thống thành công!\n- Đã xóa: ${pCount} sản phẩm trong kho\n- Đã xóa: ${oCount} hóa đơn giao dịch & báo cáo`);
      }
    } catch (err) {
      this.hideGlobalLoading();
      console.error('Lỗi khi xóa dữ liệu:', err);
      alert('Có lỗi xảy ra trong quá trình xóa dữ liệu: ' + err.message);
    }
  }
}

// Khởi tạo ứng dụng toàn cục
let app;
window.addEventListener('DOMContentLoaded', () => {
  app = new GoldApp();
  window.app = app;
});
