import mongoose from "mongoose";
import validator from "validator";
import bcrypt from "bcrypt";
import crypto from "crypto";

// Encryption helpers for userSecret at rest
const ENCRYPTION_KEY = process.env.USER_SECRET_ENCRYPTION_KEY; // 32-byte hex key
const ALGORITHM = "aes-256-gcm";

function encrypt(text) {
  if (!text) return text;
  if (!ENCRYPTION_KEY) {
    console.warn("USER_SECRET_ENCRYPTION_KEY not set — userSecret stored as plaintext");
    return text;
  }
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  // Store as iv:authTag:ciphertext
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function decrypt(text) {
  if (!text) return text;
  if (!ENCRYPTION_KEY) return text;
  // If text doesn't look encrypted (no colons), return as-is (legacy plaintext)
  if (!text.includes(":")) return text;
  try {
    const key = Buffer.from(ENCRYPTION_KEY, "hex");
    const [ivHex, authTagHex, ciphertext] = text.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    // If decryption fails, return raw value (legacy plaintext)
    return text;
  }
}

const userSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId(),
  },
  firstName: {
    type: String,
    required: [true, "First name is required"],
  },
  lastName: {
    type: String,
    required: [true, "Last name is required"],
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    lowercase: true,
    unique: true,
    validate: [
      (val) => {
        return validator.isEmail(val);
      },
      "Invalid email address",
    ],
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: [8, "Password must be at least 8 characters long"],
  },
  userId: {
    type: String,
    required: true,
  },
  userSecret: {
    type: String,
    set: encrypt,
    get: decrypt,
  },
  preferences: {
    baseCurrency: {
      type: String,
      default: "USD",
    },
    benchmark: {
      type: String,
      default: "SPY",
    },
    riskFree: {
      type: String,
      default: "FF_RF",
    },
  },
});

userSchema.pre("save", async function (next) {
  // Only hash the password if it has been modified (and is not already hashed)
  if (!this.isModified("password")) return next();

  const salt = await bcrypt.genSalt();
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Static method to login user
userSchema.statics.login = async function (email, password) {
  const user = await this.findOne({ email });
  if (user) {
    const auth = await bcrypt.compare(password, user.password);
    if (auth) {
      return user;
    }
    throw new Error("Incorrect password");
  }
  throw new Error("Incorrect email");
};

// Static method to find user by email
userSchema.statics.findByEmail = async function (email) {
  const user = await this.findOne({ email });
  if (user) {
    return user;
  }
  throw new Error("User not found");
};

const User = mongoose.model("user", userSchema);

export default User;
