import mongoose from "mongoose";
import validator from "validator";
import bcrypt from "bcrypt";

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
