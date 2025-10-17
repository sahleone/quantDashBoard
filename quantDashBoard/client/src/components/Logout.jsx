import { Navigate } from "react-router-dom";
import axios from "axios";
import { clearAuth } from "../utils/authInterceptor";

function Logout() {
  axios
    .post(
      "http://localhost:3000/api/auth/logout",
      {},
      {
        withCredentials: true,
      }
    )
    .then((response) => {
      console.log(response);
      clearAuth(); // Clear local auth data
    })
    .catch((error) => {
      console.log(error);
      clearAuth(); // Clear local auth data even if logout fails
    });
  return <Navigate to="/" />;
}

export default Logout;
