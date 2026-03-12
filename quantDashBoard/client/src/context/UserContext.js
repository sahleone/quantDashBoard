import { createContext } from "react";

// Rich UserContext shape:
// - user: object | null (may contain userId, firstName, lastName, email, ...)
// - setUser(userObj): replace/merge user object
// - userId: convenience string | null
// - setUserId(id): set/patch userId
const UserContext = createContext({
  user: null,
  setUser: () => {},
  userId: null,
  setUserId: () => {},
});

export default UserContext;
