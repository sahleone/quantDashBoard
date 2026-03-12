import { useRef, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { authenticatedPost } from "../../utils/apiClient";

import UserContext from "../../context/UserContext";

function Login() {
  const { setUserId, setUser } = useContext(UserContext);
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
      const response = await authenticatedPost("/api/auth/login", formData);

      // Success - clear the form
      emailRef.current.value = "";
      passwordRef.current.value = "";

      // When using httpOnly cookies the server should set the JWT cookies.
      // Do not store tokens in localStorage. Keep minimal user context (id/secret).
      if (response.data.user) {
        const u = response.data.user;
        if (setUserId) setUserId(u.userId || u.id || null);
        if (setUser) setUser(u);
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
