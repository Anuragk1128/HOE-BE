const { Schema, model, Types } = require('mongoose');

// Admin profile model (supplements the User with role: 'admin')
// Use this to store admin-specific metadata without duplicating the User document.
const AdminSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    displayName: { type: String, trim: true },
    phone: { type: String, trim: true },
    // Optional: fine-grained permissions to gate features in the admin panel
    permissions: {
      type: [
        {
          type: String,
          enum: [
            'brands:read',
            'brands:write',
            'categories:read',
            'categories:write',
            'products:read',
            'products:write',
            'users:read',
            'users:write'
          ],
        },
      ],
      default: [],
    },
    isSuperAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = model('Admin', AdminSchema);
