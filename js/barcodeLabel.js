/**
 * PMQLV - MODULE THIẾT KẾ & IN TEM ĐUÔI CHUỘT (RAT-TAIL JEWELRY TAGS)
 * Tự động tạo mã vạch chuẩn Code 128 và xuất giao diện in tem gập 2 cánh / đuôi bên phải.
 */

const BarcodeLabel = {
  // Bộ tạo mã vạch Code 128B siêu nhẹ, chuẩn xác, không cần thư viện ngoài
  code128Patterns: [
    "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
    "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
    "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
    "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
    "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
    "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
    "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
    "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
    "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
    "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
    "114131","311141","411131","211412","211214","211232","2331112"
  ],

  generateCode128Svg(text, height = 20) {
    if (!text) return '';
    text = String(text).trim();

    // 1. Ưu tiên sử dụng thư viện chuẩn quốc tế JsBarcode nếu đã tải xong
    if (typeof JsBarcode !== 'undefined') {
      try {
        const svgNode = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        JsBarcode(svgNode, text, {
          format: "CODE128",
          displayValue: false,
          height: height,
          margin: 10,
          background: "#ffffff",
          lineColor: "#000000"
        });
        svgNode.setAttribute('class', 'barcode-svg');
        svgNode.style.width = '100%';
        svgNode.style.height = '100%';
        svgNode.style.maxHeight = height + 'px';
        svgNode.style.display = 'block';
        return svgNode.outerHTML;
      } catch (err) {
        console.warn('JsBarcode error, falling back:', err);
      }
    }

    // 2. Bộ tạo Code 128B dự phòng chuẩn xác
    let checksum = 104;
    const codes = [104];

    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const val = charCode - 32;
      codes.push(val);
      checksum += val * (i + 1);
    }

    const checkDigit = checksum % 103;
    codes.push(checkDigit);
    codes.push(106); // Stop code

    let binary = "";
    for (const code of codes) {
      const pattern = this.code128Patterns[code];
      if (pattern) {
        for (let j = 0; j < pattern.length; j++) {
          const width = parseInt(pattern[j]);
          const isBar = (j % 2 === 0);
          binary += (isBar ? "1" : "0").repeat(width);
        }
      }
    }

    // Thêm khoảng trắng an toàn (Quiet Zone) 10 vạch ở 2 bên theo chuẩn Barcode Code 128 quốc tế
    const quietZone = 12;
    let rects = '';
    let x = quietZone;
    const barWidth = 1.0;
    for (let i = 0; i < binary.length; i++) {
      if (binary[i] === '1') {
        rects += `<rect x="${(x * barWidth).toFixed(1)}" y="0" width="${barWidth.toFixed(1)}" height="${height}" fill="#000" />`;
      }
      x++;
    }

    const totalWidth = ((binary.length + quietZone * 2) * barWidth).toFixed(1);
    return `
      <svg class="barcode-svg" viewBox="0 0 ${totalWidth} ${height}" preserveAspectRatio="none" style="width:100%; height:100%; max-height:${height}px; display:block; background:#fff;">
        <rect width="${totalWidth}" height="${height}" fill="#fff" />
        ${rects}
      </svg>
    `;
  },

  // Định dạng số tiền VNĐ gọn gàng trên tem (VD: 550 -> 550k hoặc 550.000)
  formatPriceTag(num, multiplier = 1000) {
    if (!num) return '0đ';
    const val = Number(num) * (multiplier === 1000 ? 1000 : 1);
    if (val >= 1000000) {
      return (val / 1000000).toFixed(2).replace(/\.00$/, '') + ' tr';
    }
    if (val >= 1000) {
      return (val / 1000).toLocaleString('vi-VN') + 'k';
    }
    return val.toLocaleString('vi-VN') + 'đ';
  },

  // Định dạng trọng lượng chỉ / phân / ly
  formatWeight(tl) {
    if (tl === null || tl === undefined || isNaN(tl)) return '0c';
    return Number(tl).toFixed(3).replace(/\.?0+$/, '') + 'c';
  },

  /**
   * Tính toán các kích thước mm dựa trên cấu hình
   */
  resolveLayout(cfg) {
    const parseNum = (v, fallback = 0) => {
      if (v === undefined || v === null || v === '') return fallback;
      const n = parseFloat(String(v).replace(',', '.').trim());
      return isNaN(n) ? fallback : n;
    };
    const totalWidth = parseNum(cfg.totalWidth, 72);
    const totalHeight = parseNum(cfg.totalHeight, 10);
    const tailWidth = parseNum(cfg.tailWidth, 30);
    const tailPos = cfg.tailPos || 'right'; // 'right' hoặc 'center'
    const shiftX = parseNum(cfg.shiftX, 0); // mm
    const shiftY = parseNum(cfg.shiftY, 0); // mm
    const bodyWidth = Math.max(10, totalWidth - tailWidth);

    let wing1Width, wing2Width;
    if (tailPos === 'right') {
      // 2 cánh gập nằm ở phía thân trái
      wing1Width = Number((bodyWidth / 2).toFixed(1));
      wing2Width = Number((bodyWidth - wing1Width).toFixed(1));
    } else {
      // Đuôi ở giữa
      wing1Width = Number((bodyWidth / 2).toFixed(1));
      wing2Width = wing1Width;
    }

    return {
      totalWidth,
      totalHeight,
      tailWidth,
      tailPos,
      shiftX,
      shiftY,
      bodyWidth,
      wing1Width,
      wing2Width
    };
  },

  /**
   * Tạo HTML cho 1 tem đuôi chuột hoàn chỉnh
   * @param {Object} product Dữ liệu sản phẩm
   * @param {Object} config Cấu hình tem
   */
  renderSingleTag(product, config = {}) {
    const globalCfg = window.storeConfig || {};
    const storeName = config.storeName || globalCfg.storeName || 'HOÀNG KIM';
    
    // Tùy chọn hiển thị nội dung
    const showStore = config.showStore !== false;
    const showBarcode = config.showBarcode !== false;
    const showBarcodeText = config.showBarcodeText !== false;
    const showProductName = config.showProductName !== false;
    const showGoldType = config.showGoldType !== false;
    const showWeight = (config.showWeight !== undefined) ? config.showWeight : (globalCfg.printWeight !== false);
    const showTLT = config.showTLT !== false;
    const showTLH = config.showTLH !== false;
    const showTLV = config.showTLV !== false;
    const showLaborCost = (config.showLaborCost !== undefined) ? config.showLaborCost : (globalCfg.printLabor !== false);
    const showNi = (config.showNi !== undefined) ? config.showNi : (globalCfg.printNi !== false);
    
    const multiplier = globalCfg.currencyUnitMultiplier || 1000;
    const fontSize = Number(config.fontSize) || 6.5; // pt
    const barcodeHeight = Number(config.barcodeHeight) || 16; // px

    const layout = this.resolveLayout(config);

    const barcodeSvg = showBarcode ? this.generateCode128Svg(product.maHang, barcodeHeight) : '';

    // Xử lý giá / tiền công
    let giaHienThi = '';
    if (showLaborCost) {
      if (product.giaBanMon && Number(product.giaBanMon) > 0) {
        giaHienThi = `<span><b>Giá:</b> ${this.formatPriceTag(product.giaBanMon, multiplier)}</span>`;
      } else if (product.congBan && Number(product.congBan) > 0) {
        giaHienThi = `<span><b>Công:</b> ${this.formatPriceTag(product.congBan, multiplier)}</span>`;
      }
    }

    // Ni
    const niHtml = (showNi && product.ni && Number(product.ni) > 0) ? `<span>Ni: ${product.ni}</span>` : '';

    // Cánh 1: Tên tiệm, Barcode, Mã hàng + Ni
    const wing1Html = `
      <div class="tag-wing tag-wing-1" style="width: ${layout.wing1Width}mm; font-size: ${fontSize}pt;">
        ${showStore ? `<div class="tag-store-name" style="font-size: ${(fontSize * 0.9).toFixed(1)}pt;">${storeName}</div>` : ''}
        ${showBarcode ? `<div class="tag-barcode-box" style="height: ${barcodeHeight}px; flex: 1; min-height: 8px;">${barcodeSvg}</div>` : ''}
        ${showBarcodeText ? `
          <div class="tag-barcode-text" style="font-size: ${(fontSize * 0.85).toFixed(1)}pt;">
            <span>*${product.maHang || ''}*</span>
            ${niHtml}
          </div>
        ` : (niHtml ? `<div class="tag-barcode-text" style="font-size: ${(fontSize * 0.85).toFixed(1)}pt;">${niHtml}</div>` : '')}
      </div>
    `;

    // Cánh 2: Tên sản phẩm, Loại vàng, Trọng lượng (TLT, TLH, TLV), Tiền công
    let weightRow1 = [];
    if (showWeight && showTLT) weightRow1.push(`<span><b>TLT:</b>${this.formatWeight(product.tlTong)}</span>`);
    if (showWeight && showTLH) weightRow1.push(`<span><b>TLH:</b>${this.formatWeight(product.tlHot)}</span>`);

    let weightRow2 = [];
    if (showWeight && showTLV) weightRow2.push(`<span><b>TLV:</b>${this.formatWeight(product.tlVang)}</span>`);
    if (giaHienThi) weightRow2.push(giaHienThi);

    const wing2Html = `
      <div class="tag-wing tag-wing-2" style="width: ${layout.wing2Width}mm; font-size: ${fontSize}pt;">
        ${showProductName ? `<div class="tag-product-title" style="font-size: ${(fontSize * 0.95).toFixed(1)}pt;">${product.tenHang || 'Trang sức'}</div>` : ''}
        ${showGoldType ? `<div class="tag-gold-type" style="font-size: ${(fontSize * 0.85).toFixed(1)}pt;"><b>${product.loaiVang || ''}</b> ${product.quayNho ? `(${product.quayNho})` : ''}</div>` : ''}
        ${weightRow1.length > 0 ? `<div class="tag-weight-row" style="font-size: ${(fontSize * 0.82).toFixed(1)}pt;">${weightRow1.join('')}</div>` : ''}
        ${weightRow2.length > 0 ? `<div class="tag-weight-row" style="font-size: ${(fontSize * 0.82).toFixed(1)}pt;">${weightRow2.join('')}</div>` : ''}
      </div>
    `;

    // Xử lý Nhà sản xuất / Nhà cung cấp / Tiêu chuẩn cơ sở (TCCS)
    const showMfg = config.showManufacturer !== false;
    const nhaSX = product.nhaSanXuat || '';
    const nhaCC = product.nhaCungCap || '';
    const hasMfg = Boolean(nhaSX || nhaCC);

    let mfgTailHtml = '';
    if (showMfg && hasMfg) {
      const sxText = 'SX: Việt Nam';
      const nccText = nhaCC ? `NCC: ${nhaCC}` : '';
      const tccsText = nhaSX === 'HK' ? 'TCCS: 01:2025/HK' : (nhaSX ? `TCCS: ${nhaSX}` : '');

      mfgTailHtml = `
        <div class="tag-mfg-info" style="font-size: ${(fontSize * 0.75).toFixed(1)}pt;">
          <div class="mfg-line"><b>${sxText}</b></div>
          ${nccText ? `<div class="mfg-line"><b>${nccText}</b></div>` : ''}
          ${tccsText ? `<div class="mfg-line"><b>${tccsText}</b></div>` : ''}
        </div>
      `;
    }

    // Phần đuôi tem (Tail)
    const tailHtml = `
      <div class="tag-tail" style="width: ${layout.tailWidth}mm;">
        ${mfgTailHtml ? mfgTailHtml : '<div class="tail-line"></div>'}
      </div>
    `;

    let tagInnerContent = '';

    if (layout.tailPos === 'right') {
      tagInnerContent = `
        <div class="tag-body-zone" style="width: ${layout.bodyWidth}mm; height: 100%;">
          ${wing1Html}
          ${wing2Html}
        </div>
        ${tailHtml}
      `;
    } else {
      // center tail
      tagInnerContent = `
        <div style="display: flex; flex-direction: row; align-items: center; width: 100%; height: 100%;">
          ${wing1Html}
          ${tailHtml}
          ${wing2Html}
        </div>
      `;
    }

    const shiftStyle = (layout.shiftX !== 0 || layout.shiftY !== 0) ? `transform: translate(${layout.shiftX}mm, ${layout.shiftY}mm);` : '';

    return `
      <div class="jewelry-tag-wrapper" style="width: ${layout.totalWidth}mm; height: ${layout.totalHeight}mm;">
        <div class="jewelry-tag" style="width: ${layout.totalWidth}mm; height: ${layout.totalHeight}mm; ${shiftStyle}">
          ${tagInnerContent}
        </div>
      </div>
    `;
  },

  /**
   * Mở cửa sổ in tem đuôi chuột
   * @param {Array} products Danh sách sản phẩm cần in
   * @param {Object} config Cấu hình tem
   */
  printTags(products, config = {}) {
    if (!products || !products.length) {
      alert('Chưa có sản phẩm nào được chọn để in tem!');
      return;
    }

    const layout = this.resolveLayout(config);
    const tagsHtml = products.map(p => this.renderSingleTag(p, config)).join('\n');

    const printWindow = window.open('', '_blank', 'width=950,height=750');
    if (!printWindow) {
      alert('Trình duyệt đang chặn cửa sổ pop-up. Vui lòng cấp quyền cho phép mở pop-up để in tem.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <title>In Tem Đuôi Chuột Tiệm Vàng - PMQLV (${products.length} tem)</title>
        <style>
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          }
          
          body {
            background-color: #f4f4f5;
            padding: 20px;
            color: #111;
          }

          .print-toolbar {
            max-width: 850px;
            margin: 0 auto 20px auto;
            background: #fff;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .btn-print {
            background: #d4af37;
            color: #000;
            font-weight: bold;
            padding: 10px 24px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 15px;
          }
          .btn-print:hover { background: #b89628; }

          .print-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
            align-items: center;
          }

          /* THIẾT KẾ TEM ĐUÔI CHUỘT TỰ ĐỘNG THEO KÍCH THƯỚC */
          .jewelry-tag-wrapper {
            background: #fff;
            padding: 0;
            border: 1px dashed #ccc;
            page-break-inside: avoid;
            page-break-after: always;
            display: inline-block;
          }

          .jewelry-tag {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: flex-start;
            line-height: 1.15;
            background: #fff;
          }

          .tag-body-zone {
            display: flex;
            flex-direction: row;
            align-items: center;
          }

          .tag-wing {
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-evenly;
            padding: 0.2mm 0.8mm;
          }

          .tag-wing-1 {
            text-align: center;
            border-right: 1px dotted #e2e8f0;
          }

          .tag-store-name {
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.1px;
            white-space: nowrap;
            line-height: 1.1;
            padding-top: 0.2mm;
          }

          .tag-barcode-box {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
          }

          .tag-barcode-text {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: bold;
            padding: 0;
            line-height: 1.1;
            white-space: nowrap;
          }

          .tag-wing-2 {
            text-align: left;
          }

          .tag-product-title {
            font-weight: bold;
            white-space: nowrap;
            line-height: 1.05;
          }

          .tag-gold-type {
            color: #111;
            white-space: nowrap;
            line-height: 1.05;
          }

          .tag-weight-row {
            display: flex;
            justify-content: space-between;
            white-space: nowrap;
            line-height: 1.05;
          }

          .tag-tail {
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            padding: 0 1mm;
          }

          .tag-mfg-info {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-evenly;
            text-align: left;
            line-height: 1.05;
            color: #000;
          }

          .mfg-line {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .tail-line {
            width: 100%;
            height: 1.5px;
            background: #bbb;
          }

          /* CSS KHI THỰC SỰ IN */
          @media print {
            @page {
              size: auto;
              margin: 0mm !important;
            }
            html, body {
              width: ${layout.totalWidth}mm !important;
              height: ${layout.totalHeight}mm !important;
              background: none !important;
              padding: 0 !important;
              margin: 0 !important;
              overflow: visible !important;
            }
            .print-toolbar {
              display: none !important;
            }
            .print-container {
              display: block !important;
              padding: 0 !important;
              margin: 0 !important;
              width: ${layout.totalWidth}mm !important;
              height: ${layout.totalHeight}mm !important;
              gap: 0 !important;
              overflow: visible !important;
            }
            .jewelry-tag-wrapper {
              border: none !important;
              box-shadow: none !important;
              padding: 0 !important;
              margin: 0 !important;
              width: ${layout.totalWidth}mm !important;
              height: ${layout.totalHeight}mm !important;
              page-break-inside: avoid !important;
              page-break-after: always !important;
              page-break-before: avoid !important;
              overflow: visible !important;
            }
            .jewelry-tag {
              margin: 0 !important;
              width: ${layout.totalWidth}mm !important;
              height: ${layout.totalHeight}mm !important;
              overflow: visible !important;
            }
            .tag-wing-1 {
              border-right: none !important;
            }
            .tail-line {
              display: none !important; /* Không in đường line ở phần đuôi dán */
            }
          }
        </style>
      </head>
      <body>
        <div class="print-toolbar">
          <div>
            <b>Xem trước tem đuôi chuột:</b> ${products.length} tem | Khổ: ${layout.totalWidth}mm x ${layout.totalHeight}mm (Đuôi: ${layout.tailWidth}mm ${layout.tailPos === 'right' ? 'bên phải' : 'ở giữa'})
          </div>
          <button class="btn-print" onclick="window.print()">IN NGAY (PRINT)</button>
        </div>

        <div class="print-container">
          ${tagsHtml}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
  }
};
