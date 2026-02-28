"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export default function AuthPage() {
    const router = useRouter();
    const [tab, setTab] = useState("login");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [showDelete, setShowDelete] = useState(false);
    const [delUser, setDelUser] = useState("");
    const [delPass, setDelPass] = useState("");
    const [delLoading, setDelLoading] = useState(false);
    const [delError, setDelError] = useState("");
    const [delSuccess, setDelSuccess] = useState("");

    function switchTab(t) {
        setTab(t);
        setError("");
        setSuccess("");
        setUsername("");
        setPassword("");
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        setSuccess("");
        if (username.length < 8) {
            setError("Username must be at least 8 characters.");
            return;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }
        setLoading(true);
        try {
            const endpoint = tab === "login" ? "/api/auth/login" : "/api/auth/signup";
            const res = await fetch(`${BACKEND}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Something went wrong.");
            } else {
                if (tab === "login") {
                    sessionStorage.setItem("user", JSON.stringify(data.user));
                    router.push("/chat");
                } else {
                    setSuccess("Account created! You can now log in.");
                    switchTab("login");
                }
            }
        } catch {
            setError("Cannot connect to server. Make sure the backend is running.");
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(e) {
        e.preventDefault();
        setDelError("");
        setDelSuccess("");
        if (delUser.length < 8 || delPass.length < 8) {
            setDelError("Username and password must be at least 8 characters.");
            return;
        }
        setDelLoading(true);
        try {
            const res = await fetch(`${BACKEND}/api/auth/account`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: delUser, password: delPass }),
            });
            const data = await res.json();
            if (!res.ok) {
                setDelError(data.error || "Failed to delete account.");
            } else {
                setDelSuccess("Account deleted successfully.");
                setTimeout(() => {
                    setShowDelete(false);
                    setDelUser("");
                    setDelPass("");
                    setDelSuccess("");
                }, 2000);
            }
        } catch {
            setDelError("Cannot connect to server.");
        } finally {
            setDelLoading(false);
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-logo">
                    <div className="auth-logo-icon">
                        <i className="fa-solid fa-video" style={{ color: "#000", fontSize: 17 }} />
                    </div>
                    <span className="auth-logo-text">PvtCall</span>
                </div>

                <h1 className="auth-title">
                    {tab === "login" ? "Welcome back" : "Create account"}
                </h1>
                <p className="auth-subtitle">
                    {tab === "login"
                        ? "Login to start a private video chat session."
                        : "Register with a username and password to get started."}
                </p>

                <div className="auth-tabs">
                    <button
                        className={`auth-tab ${tab === "login" ? "active" : ""}`}
                        onClick={() => switchTab("login")}
                    >
                        Login
                    </button>
                    <button
                        className={`auth-tab ${tab === "signup" ? "active" : ""}`}
                        onClick={() => switchTab("signup")}
                    >
                        Register
                    </button>
                </div>

                {error && <div className="alert alert-error"><i className="fa-solid fa-circle-exclamation" style={{ marginRight: 7 }} />{error}</div>}
                {success && <div className="alert alert-success"><i className="fa-solid fa-circle-check" style={{ marginRight: 7 }} />{success}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Username</label>
                        <input
                            className={`form-input ${error && username.length < 8 ? "error" : ""}`}
                            type="text"
                            placeholder="Enter your username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoComplete="username"
                            spellCheck={false}
                        />
                        <span className="form-hint">Min. 8 characters. Any characters allowed.</span>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            className={`form-input ${error && password.length < 8 ? "error" : ""}`}
                            type="password"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete={tab === "login" ? "current-password" : "new-password"}
                        />
                        <span className="form-hint">Min. 8 characters.</span>
                    </div>

                    <button type="submit" className="auth-btn" disabled={loading}>
                        {loading
                            ? <><span className="spinner" /> Processing...</>
                            : tab === "login" ? "Login" : "Create Account"
                        }
                    </button>
                </form>

                <div className="divider" />
                <span className="delete-link" onClick={() => setShowDelete(true)}>
                    <i className="fa-solid fa-trash-can" style={{ marginRight: 6 }} />
                    Remove my account
                </span>
            </div>

            {showDelete && (
                <div className="modal-overlay" onClick={() => setShowDelete(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">
                            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 10, color: "var(--danger)" }} />
                            Delete Account
                        </h2>
                        <p className="modal-desc">
                            Enter your credentials to permanently delete your account. This
                            action cannot be undone.
                        </p>

                        {delError && <div className="alert alert-error"><i className="fa-solid fa-circle-exclamation" style={{ marginRight: 7 }} />{delError}</div>}
                        {delSuccess && <div className="alert alert-success"><i className="fa-solid fa-circle-check" style={{ marginRight: 7 }} />{delSuccess}</div>}

                        <form onSubmit={handleDelete}>
                            <div className="form-group">
                                <label className="form-label">Username</label>
                                <input
                                    className="form-input"
                                    type="text"
                                    placeholder="Your username"
                                    value={delUser}
                                    onChange={(e) => setDelUser(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Password</label>
                                <input
                                    className="form-input"
                                    type="password"
                                    placeholder="Your password"
                                    value={delPass}
                                    onChange={(e) => setDelPass(e.target.value)}
                                />
                            </div>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="modal-btn cancel"
                                    onClick={() => setShowDelete(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="modal-btn confirm"
                                    disabled={delLoading}
                                >
                                    {delLoading ? "Deleting..." : "Delete Account"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
