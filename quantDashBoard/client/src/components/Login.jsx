import { useRef, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import UserContext from "../context/Usercontext";

function Login() {
  const { user, setUser } = useContext(UserContext);
  const navigate = useNavigate();
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const [errorsData, setErrors] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    const formData = {
      email: emailRef.current.value,
      password: passwordRef.current.value,
    };

    try {
      const response = await axios.post(
        "http://localhost:3000/api/auth/login",
        formData,
        {
          headers: {
            "Content-Type": "application/json",
          },
          withCredentials: true,
        }
      );

      // Success - clear the form
      emailRef.current.value = "";
      passwordRef.current.value = "";

      // Store tokens in localStorage
      if (response.data.accessToken) {
        localStorage.setItem("accessToken", response.data.accessToken);
      }
      if (response.data.refreshToken) {
        localStorage.setItem("refreshToken", response.data.refreshToken);
      }

      // Set user info from login response
      if (response.data.user) {
        setUser((prev) => ({
          ...prev,
          firstName: response.data.user.firstName,
          lastName: response.data.user.lastName,
          email: response.data.user.email,
          userId: response.data.user.userId,
          userSecret: response.data.user.userSecret || prev.userSecret, // Keep existing userSecret if not provided
        }));
        console.log("User logged in:", response.data.user);
      }

      // Navigate to dashboard
      navigate("/dashboard");
    } catch (error) {
      if (error.response) {
        const errorData = error.response.data;
        if (errorData) {
          // Handle both direct error format and nested error format
          if (errorData.details) {
            setErrors({ ...errorData.details });
          } else {
            setErrors({ ...errorData });
          }
        }
      }
    }
  };

  return (
    <div>
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          type="email"
          id="email"
          name="email"
          ref={emailRef}
          required
          autoComplete="on"
        />
        <div className="email-error">{errorsData.email}</div>
        <br />
        <label htmlFor="password">Password</label>
        <input
          type="password"
          id="password"
          name="password"
          ref={passwordRef}
          required
          autoComplete="on"
        />
        <div className="password-error">{errorsData.password}</div>
        <button type="submit">Login</button>
      </form>
    </div>
  );
}

export default Login;
