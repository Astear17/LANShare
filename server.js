#!/usr/bin/env node
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ip = require('ip');
const chalk = require('chalk');
const { exec } = require('child_process');
const mime = require('mime-types');
const argv = require('minimist')(process.argv.slice(2));

const app = express();
const DEFAULT_PORT = 3000;
const PORT = argv.port || argv.p || process.env.PORT || DEFAULT_PORT;
const ROOT_DIR = process.cwd();

// Setup storage for uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const relativePath = req.query.path || '';
        const dest = path.join(ROOT_DIR, relativePath);
        if (!dest.startsWith(ROOT_DIR)) {
            return cb(new Error('Invalid path'), null);
        }
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to check if path is safe
const isSafePath = (unsafePath) => {
    const absolutePath = path.resolve(ROOT_DIR, unsafePath);
    return absolutePath.startsWith(ROOT_DIR);
};

// API: List files
app.get('/api/files', (req, res) => {
    const relativePath = req.query.path || '';
    const absolutePath = path.join(ROOT_DIR, relativePath);

    if (!isSafePath(relativePath)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const items = fs.readdirSync(absolutePath).map(name => {
            const itemPath = path.join(absolutePath, name);
            const stats = fs.statSync(itemPath);
            return {
                name,
                isDir: stats.isDirectory(),
                size: stats.size,
                mtime: stats.mtime,
                type: mime.lookup(name) || 'application/octet-stream'
            };
        });
        res.json({
            path: relativePath,
            items: items.sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Download file
app.get('/api/download', (req, res) => {
    const filePath = req.query.path;
    if (!filePath || !isSafePath(filePath)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const absolutePath = path.join(ROOT_DIR, filePath);
    if (fs.existsSync(absolutePath) && !fs.statSync(absolutePath).isDirectory()) {
        res.download(absolutePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// API: Upload files
app.post('/api/upload', upload.array('files'), (req, res) => {
    res.json({ message: 'Files uploaded successfully' });
});

// API: Rename/Move
app.post('/api/rename', (req, res) => {
    const { oldPath, newPath } = req.body;
    if (!isSafePath(oldPath) || !isSafePath(newPath)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const oldAbs = path.join(ROOT_DIR, oldPath);
    const newAbs = path.join(ROOT_DIR, newPath);

    try {
        fs.renameSync(oldAbs, newAbs);
        res.json({ message: 'Renamed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Delete
app.delete('/api/delete', (req, res) => {
    const { path: itemPath } = req.body;
    if (!isSafePath(itemPath)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const absolutePath = path.join(ROOT_DIR, itemPath);

    try {
        if (fs.statSync(absolutePath).isDirectory()) {
            fs.rmSync(absolutePath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(absolutePath);
        }
        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Create Folder
app.post('/api/mkdir', (req, res) => {
    const { path: dirPath } = req.body;
    if (!isSafePath(dirPath)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const absolutePath = path.join(ROOT_DIR, dirPath);
    try {
        if (!fs.existsSync(absolutePath)) {
            fs.mkdirSync(absolutePath, { recursive: true });
            res.json({ message: 'Folder created' });
        } else {
            res.status(400).json({ error: 'Folder already exists' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    const localIp = ip.address();
    
    if (PORT !== DEFAULT_PORT && !process.env.PORT) {
        console.log(chalk.yellow(`Default port switched to ${PORT}. You can access via IP:${PORT}`));
    } else {
        console.log(chalk.cyan('Please wait...'));
        console.log(chalk.bold.green(`Deployed successfully. You can access your localhost via ${localIp}:${PORT}`));
    }

    console.log(chalk.gray(`\nHosting Folder: ${ROOT_DIR}`));
    
    // Auto-open browser on host machine
    exec(`start http://localhost:${PORT}`);
});
