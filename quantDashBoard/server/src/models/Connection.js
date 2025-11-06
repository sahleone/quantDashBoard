import mongoose from "mongoose";

const connectionSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId(),
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  connectionId: {
    type: String,
    required: true,
    unique: true,
  },
  // SnapTrade authorization id returned immediately after portal completion.
  // This is optional but useful to store and index for lookup. Make the index
  // sparse so missing values don't cause duplicate-null issues.
  authorizationId: {
    type: String,
  },
  brokerageName: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["ACTIVE", "INACTIVE", "PENDING", "ERROR"],
    default: "ACTIVE",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastSyncDate: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Create indexes for efficient querying
connectionSchema.index({ userId: 1, connectionId: 1 });
// Use a sparse index so documents without an authorizationId (null/undefined)
// are not included in the index. This prevents duplicate-key errors when
// multiple documents lack this field.
connectionSchema.index({ authorizationId: 1 }, { sparse: true });

// Update the updatedAt field before saving
connectionSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// get new connection from the database by user id
connectionSchema.statics.getConnection = async function (userId) {
  return this.findOne({ userId, isActive: true });
};

const Connection = mongoose.model("SnapTradeConnection", connectionSchema);

export default Connection;
