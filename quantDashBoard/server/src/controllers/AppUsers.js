import User from "../models/Users.js";

async function getUserByEmail(req, res) {
  const { email } = req.query;
  try {
    const user = await User.findByEmail(email);
    res.status(200).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

//update user by userId
async function updateUser(req, res) {
  const { userId } = req.params;
  const updateData = req.body;

  try {
    // find out the best way to do this
    // Remove sensitive fields that shouldn't be updated directly
    const { password, _id, ...allowedUpdates } = updateData;

    const user = await User.findOneAndUpdate(
      { userId: userId },
      { $set: allowedUpdates }
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

// get user secret by userId
async function getUserSecret(req, res) {
  const { userId } = req.params;
  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json(user.userSecret);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export default { getUserByEmail, updateUser, getUserSecret };
