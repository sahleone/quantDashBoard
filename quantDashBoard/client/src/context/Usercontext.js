import { createContext } from "react";

// Rich UserContext shape:
// - user: object | null (may contain userId, userSecret, firstName, lastName, email, ...)
// - setUser(userObj): replace/merge user object
// - userId: convenience string | null
// - userSecret: convenience string | null
// - setUserId(id): set/patch userId
// - setUserSecret(secret): set/patch userSecret
const UserContext = createContext({
  user: null,
  setUser: () => {},
  userId: null,
  userSecret: null,
  setUserId: () => {},
  setUserSecret: () => {},
});

export default UserContext;
