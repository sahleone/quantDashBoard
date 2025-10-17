import React, { useRef, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import UserContext from "../context/Usercontext";
import axios from "axios";

function Signup() {
  const navigate = useNavigate();
  const { user, setUser } = useContext(UserContext);
  const firstNameRef = useRef(null);
  const lastNameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const [errorsData, setErrors] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});

    const formData = {
      firstName: firstNameRef.current.value,
      lastName: lastNameRef.current.value,
      email: emailRef.current.value,
      password: passwordRef.current.value,
    };

    try {
      const response = await axios.post(
        "http://localhost:3000/api/auth/signup",
        formData,
        {
          headers: {
            "Content-Type": "application/json",
          },
          withCredentials: true,
        }
      );

      // Success - clear the form
      firstNameRef.current.value = "";
      lastNameRef.current.value = "";
      emailRef.current.value = "";
      passwordRef.current.value = "";

      // Store access token in localStorage
      if (response.data.accessToken) {
        localStorage.setItem("accessToken", response.data.accessToken);
      }

      // Set user info from signup response
      if (response.data.user) {
        setUser((prev) => ({
          ...prev,
          userId: response.data.user.userId,
          firstName: response.data.user.firstName,
          lastName: response.data.user.lastName,
          email: response.data.user.email,
          userSecret: response.data.user.userSecret || prev.userSecret, // Keep existing userSecret if not provided
        }));
        console.log("User signed up:", response.data.user);
      }

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
    <div className="signup">
      <form onSubmit={handleSubmit}>
        <h2>Signup</h2>
        <label htmlFor="firstName">First Name</label>
        <input
          type="text"
          id="firstName"
          name="firstName"
          ref={firstNameRef}
          required
          autoComplete="on"
        />
        <div className="first-name-error">{errorsData.firstName}</div>
        <br />
        <label htmlFor="lastName">Last Name</label>
        <input
          type="text"
          id="lastName"
          name="lastName"
          ref={lastNameRef}
          required
          autoComplete="on"
        />
        <div className="last-name-error">{errorsData.lastName}</div>
        <br />
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
        <br />
        <button type="submit">Signup</button>
      </form>
    </div>
  );
}

export default Signup;
