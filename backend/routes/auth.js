const express = require("express");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");
const supabase = require("../lib/supabase");

const router = express.Router();

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many login attempts. Try again later." },
    standardHeaders: true,
    legacyHeaders: false,
});

const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: "Too many signup attempts. Try again later." },
    standardHeaders: true,
    legacyHeaders: false,
});

function validateUsername(username) {
    if (!username || typeof username !== "string") return false;
    if (username.length < 8) return false;
    return true;
}

function validatePassword(password) {
    if (!password || typeof password !== "string") return false;
    if (password.length < 8) return false;
    return true;
}

router.post("/signup", signupLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!validateUsername(username)) {
            return res.status(400).json({ error: "Username must be at least 8 characters." });
        }
        if (!validatePassword(password)) {
            return res.status(400).json({ error: "Password must be at least 8 characters." });
        }

        const hashedUsername = await bcrypt.hash(username, BCRYPT_ROUNDS);
        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

        const { data: existing, error: fetchError } = await supabase
            .from("users")
            .select("id, username_hash")
            .limit(1000);

        if (fetchError) {
            return res.status(500).json({ error: "Database error." });
        }

        for (const row of existing || []) {
            const match = await bcrypt.compare(username, row.username_hash);
            if (match) {
                return res.status(409).json({ error: "Username already exists." });
            }
        }

        const { error: insertError } = await supabase.from("users").insert({
            username_hash: hashedUsername,
            password_hash: hashedPassword,
            display_username: username,
        });

        if (insertError) {
            return res.status(500).json({ error: "Failed to create account." });
        }

        return res.status(201).json({ message: "Account created successfully." });
    } catch (err) {
        console.error("Signup error:", err);
        return res.status(500).json({ error: "Internal server error." });
    }
});

router.post("/login", loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!validateUsername(username)) {
            return res.status(400).json({ error: "Username must be at least 8 characters." });
        }
        if (!validatePassword(password)) {
            return res.status(400).json({ error: "Password must be at least 8 characters." });
        }

        const { data: users, error: fetchError } = await supabase
            .from("users")
            .select("id, username_hash, password_hash, display_username")
            .limit(1000);

        if (fetchError) {
            return res.status(500).json({ error: "Database error." });
        }

        let matchedUser = null;
        for (const row of users || []) {
            const usernameMatch = await bcrypt.compare(username, row.username_hash);
            if (usernameMatch) {
                matchedUser = row;
                break;
            }
        }

        if (!matchedUser) {
            return res.status(401).json({ error: "Invalid username or password." });
        }

        const passwordMatch = await bcrypt.compare(password, matchedUser.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ error: "Invalid username or password." });
        }

        return res.status(200).json({
            message: "Login successful.",
            user: {
                id: matchedUser.id,
                username: matchedUser.display_username,
            },
        });
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: "Internal server error." });
    }
});

router.delete("/account", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!validateUsername(username) || !validatePassword(password)) {
            return res.status(400).json({ error: "Invalid credentials." });
        }

        const { data: users, error: fetchError } = await supabase
            .from("users")
            .select("id, username_hash, password_hash")
            .limit(1000);

        if (fetchError) {
            return res.status(500).json({ error: "Database error." });
        }

        let matchedUser = null;
        for (const row of users || []) {
            const usernameMatch = await bcrypt.compare(username, row.username_hash);
            if (usernameMatch) {
                matchedUser = row;
                break;
            }
        }

        if (!matchedUser) {
            return res.status(401).json({ error: "Invalid credentials." });
        }

        const passwordMatch = await bcrypt.compare(password, matchedUser.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ error: "Invalid credentials." });
        }

        const { error: deleteError } = await supabase
            .from("users")
            .delete()
            .eq("id", matchedUser.id);

        if (deleteError) {
            return res.status(500).json({ error: "Failed to delete account." });
        }

        return res.status(200).json({ message: "Account deleted successfully." });
    } catch (err) {
        console.error("Delete account error:", err);
        return res.status(500).json({ error: "Internal server error." });
    }
});

module.exports = router;
