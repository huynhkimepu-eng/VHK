/**
 * PMQLV - Dịch vụ tải Media (Video & Ảnh) trực tiếp lên Cloudinary (Unsigned Upload)
 * Giúp video & ảnh tải siêu tốc, xem mượt mà trên mọi thiết bị mà không phụ thuộc Google Drive.
 */

const CloudinaryService = {
  STORAGE_CLOUD_NAME: 'pmqlv_cloudinary_cloud_name',
  STORAGE_PRESET: 'pmqlv_cloudinary_preset',

  getCloudName() {
    const local = localStorage.getItem(this.STORAGE_CLOUD_NAME);
    if (local && local.trim()) return local.trim();
    if (window.app && window.app.storeConfig && window.app.storeConfig.cloudinaryCloudName) {
      return String(window.app.storeConfig.cloudinaryCloudName).trim();
    }
    return '';
  },

  getUploadPreset() {
    const local = localStorage.getItem(this.STORAGE_PRESET);
    if (local && local.trim()) return local.trim();
    if (window.app && window.app.storeConfig && window.app.storeConfig.cloudinaryPreset) {
      return String(window.app.storeConfig.cloudinaryPreset).trim();
    }
    return '';
  },

  setConfig(cloudName, preset) {
    if (cloudName !== undefined) localStorage.setItem(this.STORAGE_CLOUD_NAME, String(cloudName).trim());
    if (preset !== undefined) localStorage.setItem(this.STORAGE_PRESET, String(preset).trim());
  },

  isConfigured() {
    return !!(this.getCloudName() && this.getUploadPreset());
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
      formData.append('file', fileOrData);
      formData.append('upload_preset', preset);
      formData.append('folder', 'pmqlv');
      xhr.send(formData);
    });
  },

  /**
   * Kiểm tra kết nối tài khoản Cloudinary bằng cách tải thử ảnh kiểm tra 1px
   */
  async testConnection() {
    const cloudName = this.getCloudName();
    const preset = this.getUploadPreset();
    if (!cloudName || !preset) {
      return { success: false, message: 'Vui lòng nhập đầy đủ Cloud Name và Upload Preset!' };
    }

    // 1px transparent GIF/PNG
    const testPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=';
    try {
      const res = await this.uploadMedia(testPixel, 'image');
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
  }
};

window.CloudinaryService = CloudinaryService;
