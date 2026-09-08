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
    this.tagQueue = [];

    this.branches = ['Chi nhánh 1', 'Chi nhánh 2'];
    this.currentBranch = 'Chi nhánh 1';

    // Bộ lọc kho
    this.filteredProducts = [];
    this.currentPage = 1;
    this.itemsPerPage = 40;
    this.selectedMaHangSet = new Set();

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
      this.applyStoreConfig();
      this.setupEventListeners();
      this.updateUserRoleUI();

      // Render dữ liệu ban đầu từ localStorage trước
      try { this.renderGoldRatesTable(); } catch(e) { console.error('renderGoldRatesTable error:', e); }
      try { this.filterPosProducts(); } catch(e) { console.error('filterPosProducts error:', e); }
      try { this.filterInventory(); } catch(e) { console.error('filterInventory error:', e); }
      if (typeof this.renderTagQueue === 'function') try { this.renderTagQueue(); } catch(e) {}
      try { this.updateReportStats(); } catch(e) { console.error('updateReportStats error:', e); }
      if (typeof this.checkCloudSync === 'function') try { this.checkCloudSync(); } catch(e) {}

      // Ẩn loading ngay để người dùng có thể dùng giao diện
      this.hideGlobalLoading();

      // Tự động tải dữ liệu từ cloud nền (không chặn UI)
      try {
        await this.fetchRealTimeData();
      } catch (e) {
        console.warn('Lỗi tải cloud:', e);
      }
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
        if (data.orders && Array.isArray(data.orders)) this.orders = data.orders;
        if (data.storeConfig && typeof data.storeConfig === 'object') {
          this.storeConfig = Object.assign({}, this.storeConfig, data.storeConfig);
          localStorage.setItem('pmqlv_store_config', JSON.stringify(this.storeConfig));
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
    if (!loadedPrices || loadedPrices.length === 0) {
      loadedPrices = defaultPrices;
    } else {
      defaultPrices.forEach(def => {
        if (!loadedPrices.some(p => p.loaiVang === def.loaiVang)) {
          loadedPrices.push(def);
        }
      });
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
        if (!loadedUsers.some(u => String(u.username || '').toLowerCase() === def.username.toLowerCase())) {
          loadedUsers.push(def);
        }
      });
    }
    this.users = loadedUsers;
    localStorage.setItem('pmqlv_users', JSON.stringify(this.users));

    // 5. Đăng nhập hiện tại (Mặc định tài khoản Quản Lý Chi Nhánh 1 nếu chưa đăng nhập)
    const defaultStaff = this.users.find(u => u.username === 'chinhanh1') || 
                         this.users.find(u => u.role === 'chinhanh') || 
                         { username: 'chinhanh1', role: 'chinhanh', fullName: 'Quản Lý Chi Nhánh 1', chiNhanh: 'Chi nhánh 1' };
    const savedCurrentUser = localStorage.getItem('pmqlv_current_user');
    if (savedCurrentUser) {
      try {
        this.currentUser = JSON.parse(savedCurrentUser);
      } catch (e) {
        this.currentUser = defaultStaff;
      }
    } else {
      this.currentUser = defaultStaff;
      localStorage.setItem('pmqlv_current_user', JSON.stringify(this.currentUser));
    }

    // 6. Lịch sử đơn hàng
    const savedOrders = localStorage.getItem('pmqlv_orders');
    this.orders = savedOrders ? JSON.parse(savedOrders) : [];
    this.orders.forEach(o => {
      if (typeof o.items === 'string') {
        try { o.items = JSON.parse(o.items); } catch(e) { o.items = []; }
      } else if (typeof o.chiTietSanPham === 'string') {
        try { o.items = JSON.parse(o.chiTietSanPham); } catch(e) { o.items = []; }
      }
    });
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

    // Ẩn/Hiện các thành phần chỉ dành riêng cho Admin
    const adminElements = document.querySelectorAll('.admin-only');
    adminElements.forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });

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
  }

  // ================= 1. NGHIỆP VỤ BÁN HÀNG (POS) =================

  // Tính giá bán chuẩn ngành vàng của 1 sản phẩm
  calcProductPrice(product) {
    const multiplier = this.storeConfig.currencyUnitMultiplier || 1000;

    // Nếu có giá bán theo món niêm yết (vd đồ phong thủy, bạc theo món)
    if (product.giaBanMon && Number(product.giaBanMon) > 0) {
      return {
        unitPrice: 0,
        laborCost: 0,
        total: Number(product.giaBanMon) * multiplier,
        isFixedPrice: true
      };
    }

    // Nếu tính theo trọng lượng vàng: (TL Vàng * Giá Vàng Bán Ra) + Tiền Công Bán
    const tlVang = Number(product.tlVang) || 0;
    const congBanVnd = (Number(product.congBan) || 0) * multiplier;

    // Tìm đơn giá vàng theo loại vàng của sản phẩm
    let rateObj = this.goldPrices.find(g => g.loaiVang && g.loaiVang.trim().toLowerCase() === (product.loaiVang || '').trim().toLowerCase());
    if (!rateObj) {
      // Tìm gần đúng (ví dụ "Vàng 24K" khớp "24K")
      rateObj = this.goldPrices.find(g => (product.loaiVang || '').includes(g.loaiVang) || g.loaiVang.includes(product.loaiVang || ''));
    }

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

  // Lọc sản phẩm tại màn hình POS
  filterPosProducts(goldType = 'ALL') {
    if (goldType !== undefined && goldType !== null) {
      this.currentPosGoldFilter = goldType;
    }
    const filterType = this.currentPosGoldFilter || 'ALL';
    const keyword = (document.getElementById('posSearchInput')?.value || '').trim().toLowerCase();

    const grid = document.getElementById('posProductGrid');
    if (!grid) return;

    // Chi Nhánh hiện tại (mặc định nếu trống thì thuộc về Chi nhánh 1 để tương thích dữ liệu cũ)
    const activeBranch = this.currentBranch;
    const isAdmin = this.currentUser && this.currentUser.role === 'admin';

    const available = this.products.filter(p => {
      // 1. Check Trạng thái
      const isConTon = (!p.trangThai || p.trangThai === 'Còn tồn');
      
      // 2. Check Chi nhánh
      const branchMatch = (activeBranch === 'ALL' && isAdmin) || (p.chiNhanh === activeBranch) || (!p.chiNhanh && activeBranch === 'Chi nhánh 1');
      if (!isConTon || !branchMatch) return false;

      // Lọc theo loại vàng
      if (filterType !== 'ALL') {
        if (filterType === 'Bạc' && !(p.loaiVang && p.loaiVang.includes('Bạc'))) return false;
        else if (filterType !== 'Bạc' && !(p.loaiVang && p.loaiVang.includes(filterType))) return false;
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

    // Giới hạn hiển thị 80 món nhanh nhất để cuộn siêu mượt
    const displayList = available.slice(0, 80);

    if (displayList.length === 0) {
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

        const fallbackHk = `<div class="pos-thumb-hk" title="Tiệm Vàng Hoàng Kim"><span class="hk-crown">👑</span><span class="hk-text">HK</span></div>`;
        const thumbHtml = (p.anhSanPham && p.anhSanPham.trim())
          ? `<div class="pos-thumb-wrap"><img src="${p.anhSanPham.trim().replace(/"/g, '&quot;')}" alt="${(p.tenHang || '').replace(/"/g, '&quot;')}" class="pos-thumb-img" onerror="this.parentElement.innerHTML='<div class=\\\'pos-thumb-hk\\\'><span class=\\\'hk-crown\\\'>👑</span><span class=\\\'hk-text\\\'>HK</span></div>'" /></div>`
          : `<div class="pos-thumb-wrap">${fallbackHk}</div>`;

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
        calcDesc = `Bán món niêm yết: ${item.thanhTien.toLocaleString('vi-VN')} đ`;
      } else {
        calcDesc = `(${item.tlVang}c × ${(item.donGiaVang / 1000).toLocaleString('vi-VN')}k) + Công ${item.congBan.toLocaleString('vi-VN')}đ`;
      }

      const thumbHtml = p.anhSanPham ? `<img src="${p.anhSanPham}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; margin-right: 10px; border: 1px solid #E2E8F0;">` : '';

      return `
        <div class="cart-item">
          <div class="cart-item-header">
            <div style="display: flex; align-items: center;">
              ${thumbHtml}
              <span>${p.tenHang || 'Món hàng'} (${p.loaiVang || ''})</span>
            </div>
            <button class="cart-item-remove" onclick="app.removeFromCart(${idx})" title="Xóa món">✖</button>
          </div>
          <div class="cart-item-desc">Mã tem: <b>${p.maHang}</b> | TL: ${item.tlVang} chỉ | Ni: ${p.ni || '0'}</div>
          <div class="cart-item-calc">${calcDesc}</div>
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

  // Thanh toán đơn hàng & Xuất hóa đơn
  async checkoutOrder() {
    if (this.cart.length === 0) {
      alert('Vui lòng chọn ít nhất 1 sản phẩm vào đơn hàng để thanh toán!');
      return;
    }

    const custName = (document.getElementById('cartCustomerName')?.value || '').trim() || 'Khách lẻ';
    const custPhone = (document.getElementById('cartCustomerPhone')?.value || '').trim();

    let grandTotal = this.cart.reduce((sum, item) => sum + item.thanhTien, 0);
    const multiplier = this.storeConfig.currencyUnitMultiplier || 1000;
    let grandCost = this.cart.reduce((sum, item) => sum + ((Number(item.product.giaVon) || 0) * multiplier), 0);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const maHD = 'HD' + dateStr + '-' + Math.floor(1000 + Math.random() * 9000);

    const orderData = {
      maHD: maHD,
      ngayBan: now.toLocaleString('vi-VN'),
      tenKhach: custName,
      sdt: custPhone,
      items: this.cart.map(c => ({
        maHang: c.product.maHang,
        tenHang: c.product.tenHang,
        loaiVang: c.product.loaiVang,
        tlVang: c.tlVang,
        donGia: c.donGiaVang,
        congBan: c.congBan,
        thanhTien: c.thanhTien,
        giaVon: c.product.giaVon // Thêm giá vốn vào chi tiết để dự phòng
      })),
      tongTien: grandTotal,
      tongVon: grandCost,
      nhanVien: (this.currentUser && this.currentUser.fullName) || 'Admin',
      nguoiBan: (this.currentUser && this.currentUser.username) || 'admin',
      ghiChu: '',
      chiNhanh: this.currentBranch
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

    // 3. Lưu lịch sử đơn hàng
    this.orders.unshift(orderData);
    this.saveOrdersToLocal();

    // 4. Chuẩn bị mẫu in hóa đơn & Giấy đảm bảo vàng
    this.preparePrintableInvoice(orderData);

    // 5. Cập nhật lại giao diện
    this.cart = [];
    document.getElementById('cartCustomerName').value = '';
    document.getElementById('cartCustomerPhone').value = '';
    this.renderCart();
    this.filterPosProducts();
    this.filterInventory();
    this.updateReportStats();

    this.hideGlobalLoading();

    // 6. Hỏi in hóa đơn
    setTimeout(() => {

      if (confirm(`Thanh toán thành công đơn hàng ${maHD} (${grandTotal.toLocaleString('vi-VN')} đ)!\n\nBạn có muốn IN GIẤY ĐẢM BẢO VÀNG / HÓA ĐƠN ngay bây giờ?`)) {
        window.print();
      }
    }, 150);
  }

  // Điền thông tin vào mẫu in Giấy Đảm Bảo Vàng
  preparePrintableInvoice(order) {
    document.getElementById('invPrintMaHD').textContent = order.maHD;
    document.getElementById('invPrintDate').textContent = order.ngayBan;
    document.getElementById('invPrintCustomer').textContent = order.tenKhach;
    document.getElementById('invPrintCustPhone').textContent = order.sdt || 'Không có';
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

  filterInventory() {
    const keyword = (document.getElementById('invSearchInput')?.value || '').trim().toLowerCase();
    const counter = document.getElementById('invCounterFilter')?.value || 'ALL';
    const goldType = document.getElementById('invGoldTypeFilter')?.value || 'ALL';
    const status = document.getElementById('invStatusFilter')?.value || 'ALL';

    const activeBranch = this.currentBranch;
    const isAdmin = this.currentUser && this.currentUser.role === 'admin';

    this.filteredProducts = this.products.filter(p => {
      // Check branch
      const branchMatch = (activeBranch === 'ALL' && isAdmin) || (p.chiNhanh === activeBranch) || (!p.chiNhanh && activeBranch === 'Chi nhánh 1');
      if (!branchMatch) return false;

      // Lọc trạng thái
      if (status !== 'ALL' && p.trangThai !== status) return false;

      // Lọc quầy
      if (counter !== 'ALL' && p.quayNho !== counter) return false;

      // Lọc loại vàng
      if (goldType !== 'ALL') {
        if (goldType === 'Bạc' && !(p.loaiVang && p.loaiVang.includes('Bạc'))) return false;
        else if (goldType !== 'Bạc' && p.loaiVang !== goldType) return false;
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
    const multiplier = this.storeConfig.currencyUnitMultiplier || 1000;

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

      return `
        <tr style="${isSold ? 'background-color: #FFF5F5;' : ''}">
          <td style="text-align: center;">
            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="app.toggleSelectProduct('${p.maHang}', this.checked)">
          </td>
          <td style="text-align: center;">
            ${p.anhSanPham ? `<img src="${p.anhSanPham}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 6px; border: 1px solid #E2E8F0;" alt="${p.maHang}">` : '<div style="width:32px;height:32px;background:linear-gradient(135deg,#FFFDF0,#FEF3C7);border:1px solid #F59E0B;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#B45309;font-family:\'Cinzel\',serif;box-shadow:inset 0 1px 1px #FFF;" title="Tiệm Vàng Hoàng Kim">HK</div>'}
          </td>
          <td><b>${p.maHang}</b></td>
          <td>${p.tenHang || '--'}</td>
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
            ${isAdmin ? `
              <button class="btn btn-sm btn-secondary" onclick="app.openEditProductModal('${p.maHang}')" title="Sửa">✏️</button>
              <button class="btn btn-sm btn-danger" onclick="app.deleteProduct('${p.maHang}')" title="Xóa">🗑️</button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');

    this.updateUserRoleUI();
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
    const isAdmin = this.currentUser && this.currentUser.role === 'admin';
    const visibleTypes = this.getTvVisibleTypes();

    tbody.innerHTML = this.goldPrices.map((g, idx) => {
      const banVnd = (Number(g.giaBan) * multiplier).toLocaleString('vi-VN') + ' đ';
      const isVisible = visibleTypes.includes(g.loaiVang);

      return `
        <tr>
          <td style="text-align: center;">
            <input type="checkbox" style="width: 18px; height: 18px; cursor: pointer; accent-color: #D97706;" 
              ${isVisible ? 'checked' : ''} ${isAdmin ? '' : 'disabled'}
              onchange="app.toggleTvDisplay('${g.loaiVang}', this.checked)" title="Tích để hiển thị loại vàng này trên Bảng giá TV">
          </td>
          <td><b>${g.loaiVang}</b></td>
          <td>${g.hamLuong || '--'}</td>
          <td style="text-align: right;">
            <input type="number" class="form-control" style="text-align: right; width: 130px; display: inline-block;" 
              value="${g.giaMua}" ${isAdmin ? '' : 'readonly'} onchange="app.updateGoldPriceVal(${idx}, 'giaMua', this.value)">
          </td>
          <td style="text-align: right;">
            <input type="number" class="form-control" style="text-align: right; width: 130px; display: inline-block; font-weight: bold; color: #B45309;" 
              value="${g.giaBan}" ${isAdmin ? '' : 'readonly'} onchange="app.updateGoldPriceVal(${idx}, 'giaBan', this.value)">
          </td>
          <td>${g.donVi || 'chỉ'}</td>
          <td style="text-align: right; font-weight: 800; color: #0284C7;">${banVnd}</td>
        </tr>
      `;
    }).join('');
  }

  updateGoldPriceVal(index, field, value) {
    if (this.goldPrices[index]) {
      this.goldPrices[index][field] = Number(value) || 0;
    }
  }

  async saveGoldPrices() {
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
    
    this.hideGlobalLoading();
    alert('Đã cập nhật bảng giá vàng thành công!');
  }

  // ================= 5. BÁO CÁO & THỐNG KÊ (ADMIN) =================

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
      // 1. Chi nhánh
      const branchMatch = (activeBranch === 'ALL' && isAdmin) || (o.chiNhanh === activeBranch) || (!o.chiNhanh && activeBranch === 'Chi nhánh 1');
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
          const isOrderOfMyBranch = (o.chiNhanh === myBranchName) || (!o.chiNhanh && myBranchName === 'Chi nhánh 1');
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
              <td>${o.chiNhanh || 'Chi nhánh 1'}</td>
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
      const isOrderOfMyBranch = (order.chiNhanh === myBranchName) || (!order.chiNhanh && myBranchName === 'Chi nhánh 1');
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
      chiNhanh: order.chiNhanh || 'Chi nhánh 1'
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
          this.saveOrdersToLocal();
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

  openAddProductModal() {
    document.getElementById('productModalTitle').textContent = 'Thêm Sản Phẩm Mới';
    document.getElementById('productForm').reset();
    document.getElementById('modalMaHang').readOnly = false;
    document.getElementById('modalMaHang').value = 'I' + Math.floor(1000000 + Math.random() * 9000000);
    this.currentProductImage = '';
    document.getElementById('modalAnhSanPhamUrl').value = '';
    this.updateImagePreview('');
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

    document.getElementById('productModalTitle').textContent = 'Chỉnh Sửa Sản Phẩm: ' + maHang;
    document.getElementById('modalMaHang').value = p.maHang;
    document.getElementById('modalMaHang').readOnly = true;
    document.getElementById('modalTenHang').value = p.tenHang || '';
    document.getElementById('modalLoaiVang').value = p.loaiVang || 'Vàng 24K';
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
    
    this.currentProductImage = p.anhSanPham || '';
    document.getElementById('modalAnhSanPhamUrl').value = p.anhSanPham && p.anhSanPham.startsWith('http') ? p.anhSanPham : '';
    this.updateImagePreview(this.currentProductImage);

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
    let rateObj = this.goldPrices.find(g => g.loaiVang && g.loaiVang.trim().toLowerCase() === loaiVang.trim().toLowerCase());
    if (!rateObj) {
      rateObj = this.goldPrices.find(g => (loaiVang || '').includes(g.loaiVang) || (g.loaiVang || '').includes(loaiVang));
    }
    const inpGiaVangNhap = document.getElementById('modalGiaVangNhap');
    if (inpGiaVangNhap) {
      const defaultRate = rateObj ? (Number(rateObj.giaMua) || Number(rateObj.giaBan) || 0) : 0;
      if (defaultRate > 0) {
        inpGiaVangNhap.value = defaultRate;
        this.calcModalCostPrice();
      }
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
      if (sel.value === 'HK') {
        customInp.value = '';
      }
    }
  }

  closeProductModal() {
    document.getElementById('productModal').classList.remove('active');
  }

  updateImagePreview(src) {
    const preview = document.getElementById('modalImagePreview');
    if (!src) {
      preview.innerHTML = '<span style="color: #94A3B8; font-size: 10px;">No IMG</span>';
      this.currentProductImage = '';
    } else {
      preview.innerHTML = `<img src="${src}" style="width: 100%; height: 100%; object-fit: cover;">`;
      this.currentProductImage = src;
    }
  }

  clearImagePreview() {
    document.getElementById('modalAnhSanPhamUrl').value = '';
    document.getElementById('modalAnhSanPhamFile').value = '';
    this.updateImagePreview('');
  }

  handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Resize image if it's too large to save space in Google Sheets
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to base64 jpeg
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        this.updateImagePreview(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
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
      const anhSanPham = this.currentProductImage || document.getElementById('modalAnhSanPhamUrl').value.trim();

      const existingIndex = this.products.findIndex(p => p.maHang === maHang);
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
        quayLon: '2HOANGKIM2',
        ngayNhap: new Date().toISOString().slice(0, 10)
      };

      if (existingIndex >= 0) {
        productData.trangThai = this.products[existingIndex].trangThai || 'Còn tồn';
        productData.ngayNhap = this.products[existingIndex].ngayNhap || productData.ngayNhap;
      }

      const btn = document.querySelector('#productModal button[type="submit"]');
      const origText = btn ? btn.textContent : 'Lưu Sản Phẩm';
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

      if (existingIndex >= 0) {
        this.products[existingIndex] = { ...this.products[existingIndex], ...productData };
      } else {
        this.products.unshift(productData);
      }

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
    if (!confirm(`Bạn có chắc muốn xóa sản phẩm ${maHang}?`)) return;

    this.showGlobalLoading('Đang xóa trực tiếp trên Google Sheet...');
    
    if (GoogleSheetService.isConfigured()) {
      const res = await GoogleSheetService.deleteProduct(maHang);
      if (!res || !res.success) {
        this.hideGlobalLoading();
        alert('Lỗi xóa trên Google Sheet: ' + (res?.message || res?.error || 'Kiểm tra mạng!'));
        return; // Dừng nếu lỗi
      }
    }

    this.products = this.products.filter(p => p.maHang !== maHang);
    this.saveProductsToLocal();
    this.filterInventory();
    this.filterPosProducts();
    this.updateReportStats();
    
    this.hideGlobalLoading();
    alert('Đã xóa thành công!');
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

  logout() {
    // Reset về tài khoản chi nhánh mặc định
    const defaultStaff = this.users.find(u => u.username === 'chinhanh1') || 
                         this.users.find(u => u.role === 'chinhanh') || 
                         { username: 'chinhanh1', role: 'chinhanh', fullName: 'Quản Lý Chi Nhánh 1', chiNhanh: 'Chi nhánh 1' };
    this.currentUser = defaultStaff;
    localStorage.setItem('pmqlv_current_user', JSON.stringify(defaultStaff));
    this.updateUserRoleUI();
    this.filterPosProducts();
    this.filterInventory();
    this.updateReportStats();
    this.renderGoldRatesTable();

    // Mở modal đăng nhập nếu muốn chuyển sang tài khoản khác
    const uInp = document.getElementById('loginUsername');
    const pInp = document.getElementById('loginPassword');
    const errEl = document.getElementById('loginErrorMsg');
    if (uInp) uInp.value = '';
    if (pInp) pInp.value = '';
    if (errEl) errEl.style.display = 'none';
    const modal = document.getElementById('loginModal');
    if (modal) modal.classList.add('active');
  }

  closeLoginModal() {
    document.getElementById('loginModal').classList.remove('active');
  }

  handleLogin() {
    const u = (document.getElementById('loginUsername')?.value || '').trim().toLowerCase();
    const p = (document.getElementById('loginPassword')?.value || '').trim();
    const errEl = document.getElementById('loginErrorMsg');

    // Luôn đảm bảo danh sách users có đủ dữ liệu từ DEFAULT_USERS
    if (!this.users || this.users.length === 0) {
      this.users = window.DEFAULT_USERS || [];
    }

    // Tìm kiếm user: so sánh chuỗi, không phân biệt hoa thường với username, hỗ trợ password dạng số hoặc chuỗi
    let found = this.users.find(user => 
      String(user.username || '').trim().toLowerCase() === u && 
      String(user.password || '').trim() === p
    );

    // Hỗ trợ alias nếu user gõ tên nhân viên cũ
    if (!found) {
      const aliasMap = {
        'nhanvien1': 'chinhanh1',
        'nhanvien2': 'chinhanh2',
        'nhanvien': 'chinhanh1'
      };
      const mapped = aliasMap[u];
      if (mapped) {
        found = this.users.find(user => 
          String(user.username || '').trim().toLowerCase() === mapped && 
          String(user.password || '').trim() === p
        );
      }
    }

    // Fallback: nếu trong this.users chưa có nhưng trong DEFAULT_USERS có tài khoản
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
        errEl.textContent = 'Tên đăng nhập hoặc mật khẩu không đúng!';
        errEl.style.display = 'block';
      }
      return;
    }

    this.currentUser = found;
    localStorage.setItem('pmqlv_current_user', JSON.stringify(found));
    this.updateUserRoleUI();
    this.closeLoginModal();
    this.filterPosProducts();
    this.filterInventory();
    this.updateReportStats();
    this.renderGoldRatesTable();

    let roleTitle = 'QUẢN LÝ CHUNG (ADMIN)';
    if (found.role === 'chinhanh') {
      roleTitle = `QUẢN LÝ ${found.chiNhanh ? found.chiNhanh.toUpperCase() : ''}`;
    } else if (found.role === 'nhanvien') {
      roleTitle = 'NHÂN VIÊN THU NGÂN';
    }
    alert(`Đăng nhập thành công với tài khoản: ${found.fullName || found.username}\nVai trò: ${roleTitle}`);
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
        } else {
          this.products.unshift(item);
          addedCount++;
        }
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
