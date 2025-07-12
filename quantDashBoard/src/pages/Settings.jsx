import "./Settings.css";
import { useReducer } from "react";
import Profile from "../components/Profile";
import Preferences from "../components/Preferences";
import Connections from "../components/Connections";

function Settings() {
  const [activeTab, setActiveTab] = useReducer((prev, next) => next, "profile");

  const renderContent = () => {
    switch (activeTab) {
      case "profile":
        return <Profile />;
      case "preferences":
        return <Preferences />;
      case "connections":
        return <Connections />;
      default:
        return <Profile />;
    }
  };

  const isActive = (tab) => {
    return activeTab === tab ? "active" : "";
  };

  return (
    <div className="settings">
      <div className="settings-container">
        <h1>Settings</h1>
        <ul>
          <li>
            <button
              className={`settings-btn ${isActive("profile")}`}
              onClick={() => setActiveTab("profile")}
            >
              Profile
            </button>
          </li>
          <li>
            <button
              className={`settings-btn ${isActive("preferences")}`}
              onClick={() => setActiveTab("preferences")}
            >
              Preferences
            </button>
          </li>
          <li>
            <button
              className={`settings-btn ${isActive("connections")}`}
              onClick={() => setActiveTab("connections")}
            >
              Connections
            </button>
          </li>
        </ul>
      </div>
      <section className="settings-content">{renderContent()}</section>
    </div>
  );
}

export default Settings;
