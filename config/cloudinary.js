const cloudinary = require('cloudinary').v2;

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.warn('[cloudinary] Missing ENV vars. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

/**
 * Upload a local file path to Cloudinary
 * @param {string} filePath - Local path to the file (e.g., from multer disk storage)
 * @param {string} [folder='products'] - Cloudinary folder
 * @param {object} [options={}] - Extra Cloudinary options
 * @returns {Promise<import('cloudinary').UploadApiResponse>}
 */
const uploadImage = (filePath, folder = 'products', options = {}) => {
  return cloudinary.uploader.upload(filePath, { folder, resource_type: 'image', ...options });
};

/**
 * Delete an image by publicId
 * @param {string} publicId
 * @returns {Promise<import('cloudinary').UploadApiResponse>}
 */
const deleteImage = (publicId) => cloudinary.uploader.destroy(publicId);

module.exports = { cloudinary, uploadImage, deleteImage };
