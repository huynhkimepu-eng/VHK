/**
 * PMQLV - Dịch vụ tải Media (Video & Ảnh) trực tiếp lên Cloudinary (Unsigned Upload)
 * Giúp video & ảnh tải siêu tốc, xem mượt mà trên mọi thiết bị mà không phụ thuộc Google Drive.
 */

const CloudinaryService = {
  STORAGE_CLOUD_NAME: 'pmqlv_cloudinary_cloud_name',
  STORAGE_PRESET: 'pmqlv_cloudinary_preset',
  STORAGE_API_KEY: 'pmqlv_cloudinary_api_key',
  STORAGE_API_SECRET: 'pmqlv_cloudinary_api_secret',
  DEFAULT_CLOUD_NAME: 'mjgp9vci',
  DEFAULT_UPLOAD_PRESET: 'pmqlv_upload',
  DEFAULT_API_KEY: '448884212172351',
  DEFAULT_API_SECRET: 'PQRaSLsY03iUQmTbYhu_7OayRlM',

  getCloudName() {
    const local = localStorage.getItem(this.STORAGE_CLOUD_NAME);
    if (local && local.trim()) return local.trim();
    if (window.app && window.app.storeConfig && window.app.storeConfig.cloudinaryCloudName) {
      return String(window.app.storeConfig.cloudinaryCloudName).trim();
    }
    if (window.DEFAULT_STORE_CONFIG && window.DEFAULT_STORE_CONFIG.cloudinaryCloudName) {
      return String(window.DEFAULT_STORE_CONFIG.cloudinaryCloudName).trim();
    }
    return this.DEFAULT_CLOUD_NAME;
  },

  getUploadPreset() {
    const local = localStorage.getItem(this.STORAGE_PRESET);
    if (local && local.trim()) return local.trim();
    if (window.app && window.app.storeConfig && window.app.storeConfig.cloudinaryPreset) {
      return String(window.app.storeConfig.cloudinaryPreset).trim();
    }
    if (window.DEFAULT_STORE_CONFIG && window.DEFAULT_STORE_CONFIG.cloudinaryPreset) {
      return String(window.DEFAULT_STORE_CONFIG.cloudinaryPreset).trim();
    }
    return this.DEFAULT_UPLOAD_PRESET;
  },

  getApiKey() {
    const local = localStorage.getItem(this.STORAGE_API_KEY);
    if (local && local.trim()) return local.trim();
    if (window.app && window.app.storeConfig && window.app.storeConfig.cloudinaryApiKey) {
      return String(window.app.storeConfig.cloudinaryApiKey).trim();
    }
    if (window.DEFAULT_STORE_CONFIG && window.DEFAULT_STORE_CONFIG.cloudinaryApiKey) {
      return String(window.DEFAULT_STORE_CONFIG.cloudinaryApiKey).trim();
    }
    return this.DEFAULT_API_KEY;
  },

  getApiSecret() {
    const local = localStorage.getItem(this.STORAGE_API_SECRET);
    if (local && local.trim()) return local.trim();
    if (window.app && window.app.storeConfig && window.app.storeConfig.cloudinaryApiSecret) {
      return String(window.app.storeConfig.cloudinaryApiSecret).trim();
    }
    if (window.DEFAULT_STORE_CONFIG && window.DEFAULT_STORE_CONFIG.cloudinaryApiSecret) {
      return String(window.DEFAULT_STORE_CONFIG.cloudinaryApiSecret).trim();
    }
    return this.DEFAULT_API_SECRET;
  },

  setConfig(cloudName, preset, apiKey = '', apiSecret = '') {
    if (cloudName !== undefined) localStorage.setItem(this.STORAGE_CLOUD_NAME, String(cloudName).trim());
    if (preset !== undefined) localStorage.setItem(this.STORAGE_PRESET, String(preset).trim());
    if (apiKey !== undefined && apiKey !== '') localStorage.setItem(this.STORAGE_API_KEY, String(apiKey).trim());
    if (apiSecret !== undefined && apiSecret !== '') localStorage.setItem(this.STORAGE_API_SECRET, String(apiSecret).trim());
  },

  isConfigured() {
    return !!(this.getCloudName() && this.getUploadPreset());
  },

  hasAdminCredentials() {
    return !!(this.getCloudName() && this.getApiKey() && this.getApiSecret());
  },

  /**
   * Chuyển chuỗi dataURI sang đối tượng Blob nhị phân chuẩn
   */
  dataURItoBlob(dataURI) {
    try {
      const parts = dataURI.split(',');
      const byteString = atob(parts[1]);
      const mimeString = parts[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type: mimeString });
    } catch (e) {
      return dataURI;
    }
  },

  /**
   * Tạo 1 ảnh PNG test 1x1 pixel hợp lệ bằng Canvas của trình duyệt
   */
  createTestImageBlob() {
    return new Promise((resolve) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(0, 0, 1, 1);
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/png');
      } catch (err) {
        resolve(null);
      }
    });
  },

  /**
   * Tải file (File/Blob hoặc chuỗi base64 dataURI) lên Cloudinary
   * @param {File|Blob|string} fileOrData 
   * @param {'video'|'image'|'auto'} resourceType 
   * @param {Function} onProgress callback nhận phần trăm (0-100)
   * @returns {Promise<{success: boolean, secure_url: string, url: string, public_id: string}>}
   */
  async uploadMedia(fileOrData, resourceType = 'auto', onProgress = null) {
    const cloudName = this.getCloudName();
    const preset = this.getUploadPreset();

    if (!cloudName || !preset) {
      throw new Error('Chưa điền Cloud Name hoặc Upload Preset trong Cài Đặt.');
    }

    // Nếu là chuỗi dataURI base64, chuyển sang Blob nhị phân để đảm bảo máy chủ không từ chối
    let filePayload = fileOrData;
    if (typeof fileOrData === 'string' && fileOrData.startsWith('data:')) {
      filePayload = this.dataURItoBlob(fileOrData);
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;
      xhr.open('POST', endpoint);

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            onProgress(pct);
          }
        };
      }

      xhr.onload = () => {
        try {
          const resp = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && resp.secure_url) {
            resolve({
              success: true,
              url: resp.secure_url,
              secure_url: resp.secure_url,
              public_id: resp.public_id,
              format: resp.format,
              resource_type: resp.resource_type,
              bytes: resp.bytes
            });
          } else {
            const errMsg = resp?.error?.message || `Lỗi Cloudinary HTTP ${xhr.status}`;
            reject(new Error(errMsg));
          }
        } catch (e) {
          reject(new Error('Lỗi giải mã phản hồi từ Cloudinary: ' + xhr.responseText.substring(0, 120)));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Lỗi kết nối mạng tới Cloudinary. Vui lòng kiểm tra internet.'));
      };

      const formData = new FormData();
      if (filePayload instanceof Blob) {
        const ext = (resourceType === 'video' ? 'mp4' : 'png');
        formData.append('file', filePayload, `media_${Date.now()}.${ext}`);
      } else {
        formData.append('file', filePayload);
      }
      formData.append('upload_preset', preset);
      formData.append('folder', 'pmqlv');
      xhr.send(formData);
    });
  },

  /**
   * Kiểm tra kết nối tài khoản Cloudinary bằng cách tạo & tải ảnh 1px thực tế
   */
  async testConnection() {
    const cloudName = this.getCloudName();
    const preset = this.getUploadPreset();
    if (!cloudName || !preset) {
      return { success: false, message: 'Vui lòng nhập đầy đủ Cloud Name và Upload Preset!' };
    }

    try {
      const testBlob = await this.createTestImageBlob();
      const payload = testBlob || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const res = await this.uploadMedia(payload, 'image');
      if (res && res.secure_url) {
        return {
          success: true,
          message: `✅ Kết nối Cloudinary thành công! (Tài khoản: "${cloudName}", Preset: "${preset}")`
        };
      }
      return { success: false, message: 'Cloudinary không trả về đường dẫn URL hợp lệ.' };
    } catch (err) {
      let msg = err.message || 'Lỗi không xác định';
      if (msg.toLowerCase().includes('upload_preset')) {
        msg += ' ➔ Hãy chắc chắn rằng trong cài đặt Cloudinary, bạn đã đặt Signing Mode là "Unsigned".';
      }
      return { success: false, message: `❌ ${msg}` };
    }
  },

  /**
   * Tính mã băm SHA-1 cho chuỗi ký tự bằng Web Crypto API
   */
  async sha1(str) {
    const enc = new TextEncoder();
    const data = enc.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Trích xuất public_id và resource_type ('image'|'video') từ đường dẫn Cloudinary URL
   */
  extractCloudinaryInfo(url) {
    if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) return null;
    try {
      const cleanUrl = url.split('?')[0].split('#')[0];
      const isVideo = cleanUrl.includes('/video/upload/');
      const resourceType = isVideo ? 'video' : 'image';
      
      const uploadKeyword = '/upload/';
      const uploadIdx = cleanUrl.indexOf(uploadKeyword);
      if (uploadIdx === -1) return null;
      
      let afterUpload = cleanUrl.substring(uploadIdx + uploadKeyword.length);
      const segments = afterUpload.split('/');
      const validSegments = [];
      let foundFolderOrFile = false;
      for (const seg of segments) {
        if (!foundFolderOrFile) {
          if (/^v\d+$/.test(seg) || (seg.includes('_') && !seg.includes('pmqlv')) || seg.includes(',')) {
            continue;
          }
        }
        foundFolderOrFile = true;
        validSegments.push(seg);
      }
      
      const fullPath = validSegments.length > 0 ? validSegments.join('/') : segments[segments.length - 1];
      const lastDot = fullPath.lastIndexOf('.');
      const publicId = lastDot > 0 ? fullPath.substring(0, lastDot) : fullPath;
      
      return {
        resourceType,
        publicId: decodeURIComponent(publicId)
      };
    } catch (e) {
      console.warn('Lỗi phân tích Cloudinary URL:', e);
      return null;
    }
  },

  /**
   * Gửi lệnh tiêu hủy (Destroy) file vĩnh viễn trên Cloudinary có chữ ký SHA-1
   */
  async deleteMedia(publicId, resourceType = 'image') {
    const cloudName = this.getCloudName();
    const apiKey = this.getApiKey();
    const apiSecret = this.getApiSecret();
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Chưa cấu hình API Key và API Secret của Cloudinary.');
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const toSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = await this.sha1(toSign);

    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('timestamp', timestamp);
    formData.append('api_key', apiKey);
    formData.append('signature', signature);

    const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`;
    const resp = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });
    const result = await resp.json();
    return result;
  },

  /**
   * Kiểm tra quyền quản trị API Key & Secret
   */
  async testAdminConnection() {
    const cloudName = this.getCloudName();
    const apiKey = this.getApiKey();
    const apiSecret = this.getApiSecret();
    if (!cloudName || !apiKey || !apiSecret) {
      return { success: false, message: 'Vui lòng nhập đầy đủ Cloud Name, API Key và API Secret!' };
    }
    try {
      // Thử gọi lệnh destroy một ID ngẫu nhiên không tồn tại để kiểm tra xác thực
      const res = await this.deleteMedia('pmqlv/ping_test_auth_check_' + Date.now(), 'image');
      if (res && (res.result === 'ok' || res.result === 'not found')) {
        return {
          success: true,
          message: `✅ Xác thực quyền Quản trị Cloudinary thành công! Sẵn sàng dọn dẹp.`
        };
      }
      return { success: false, message: `Cloudinary báo lỗi: ${res?.error?.message || JSON.stringify(res)}` };
    } catch (err) {
      return { success: false, message: `❌ Lỗi xác thực: ${err.message}` };
    }
  }
};

window.CloudinaryService = CloudinaryService;

