#!/usr/bin/env node
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ip = require('ip');
const chalk = require('chalk');
const { exec, execSync, spawn } = require('child_process');
const mime = require('mime-types');
const argv = require('minimist')(process.argv.slice(2));
const readline = require('readline-sync');
const archiver = require('archiver');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const PID_FILE = path.join(__dirname, 'server.pid');
const RECENT_FILE = path.join(__dirname, 'recent.json');

// Load or initialize config
let config = {
    rootDir: process.cwd(),
    port: 3000
};
if (fs.existsSync(CONFIG_FILE)) {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

const saveConfig = () => {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
};

const getRecent = () => {
    if (fs.existsSync(RECENT_FILE)) {
        return JSON.parse(fs.readFileSync(RECENT_FILE, 'utf8'));
    }
    return [];
};

const addRecent = (filePath) => {
    let recent = getRecent();
    recent = [filePath, ...recent.filter(p => p !== filePath)].slice(0, 20);
    fs.writeFileSync(RECENT_FILE, JSON.stringify(recent, null, 2));
};

const isAdmin = () => {
    try {
        execSync('net session', { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
};

const elevate = () => {
    const args = process.argv.slice(1).join(' ');
    const command = `powershell Start-Process node -ArgumentList '${args}' -Verb RunAs`;
    execSync(command);
    process.exit();
};

const stopServer = () => {
    let killed = false;
    
    // Try killing by PID file
    if (fs.existsSync(PID_FILE)) {
        const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
        try {
            execSync(`taskkill /pid ${pid} /f /t`, { stdio: 'ignore' });
            killed = true;
        } catch (e) {
            // Process might already be dead
        }
        fs.unlinkSync(PID_FILE);
    }

    // Fallback: Kill whatever is on our port
    try {
        const portOut = execSync(`netstat -ano | findstr :${config.port}`, { encoding: 'utf8' });
        const lines = portOut.split('\n');
        for (const line of lines) {
            if (line.includes('LISTENING')) {
                const parts = line.trim().split(/\s+/);
                const pid = parts[parts.length - 1];
                if (pid && pid !== '0') {
                    execSync(`taskkill /pid ${pid} /f /t`, { stdio: 'ignore' });
                    killed = true;
                }
            }
        }
    } catch (e) {
        // No process on port
    }

    return killed;
};

// --- Subcommand Handlers ---

const handleHelp = () => {
    console.log(chalk.bold('\nLANShare CLI Help\n'));
    console.log(`${chalk.cyan('lanshare --setup')}       : Initial setup (Admin required)`);
    console.log(`${chalk.cyan('lanshare start [path]')} : Start the server (defaults to config root or current dir)`);
    console.log(`${chalk.cyan('lanshare stop')}          : Stop the running server`);
    console.log(`${chalk.cyan('lanshare restart')}       : Restart the server`);
    console.log(`${chalk.cyan('lanshare status')}        : Check if server is running`);
    console.log(`${chalk.cyan('lanshare --port <num>')}  : Set default port`);
    console.log(`${chalk.cyan('lanshare help')}          : Show this help menu\n`);
};

const handleSetup = () => {
    if (!isAdmin()) {
        console.log(chalk.yellow('Admin privileges required. Elevating...'));
        elevate();
        return;
    }

    let newPath = readline.question('Type in here the root directory path you want to share: ');
    // Strip quotes
    newPath = newPath.replace(/^["'](.+(?=["']$))["']$/, '$1').trim();
    
    if (newPath && fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
        config.rootDir = path.resolve(newPath);
        saveConfig();
        console.log(chalk.green(`Root directory now set as "${config.rootDir}"`));
    } else {
        console.log(chalk.red('Invalid directory path.'));
    }
};

const handlePort = (port) => {
    config.port = parseInt(port);
    saveConfig();
    console.log(chalk.yellow(`Default port switched to ${config.port}. Restart by running ${chalk.bold('lanshare restart')} to apply changes`));
};

const startServerInternal = (customPath) => {
    const app = express();
    const ROOT_DIR = customPath || config.rootDir;
    const PORT = config.port;

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

    const isSafePath = (unsafePath) => {
        const absolutePath = path.resolve(ROOT_DIR, unsafePath);
        return absolutePath.startsWith(ROOT_DIR);
    };

    app.get('/api/files', (req, res) => {
        const relativePath = req.query.path || '';
        const absolutePath = path.join(ROOT_DIR, relativePath);
        if (!isSafePath(relativePath)) return res.status(403).json({ error: 'Access denied' });
        try {
            const names = fs.readdirSync(absolutePath);
            const items = [];
            
            for (const name of names) {
                // Skip common protected Windows folders
                if (name === 'System Volume Information' || name === '$RECYCLE.BIN') continue;

                try {
                    const itemPath = path.join(absolutePath, name);
                    const stats = fs.statSync(itemPath);
                    items.push({
                        name, 
                        isDir: stats.isDirectory(), 
                        size: stats.size, 
                        mtime: stats.mtime,
                        type: mime.lookup(name) || 'application/octet-stream'
                    });
                } catch (statErr) {
                    // Skip files/folders we can't access
                    continue;
                }
            }
            res.json({ path: relativePath, items: items.sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name)) });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.get('/api/recent', (req, res) => {
        const recentPaths = getRecent();
        const items = recentPaths.map(p => {
            const absolutePath = path.join(ROOT_DIR, p);
            if (fs.existsSync(absolutePath)) {
                const stats = fs.statSync(absolutePath);
                return {
                    name: path.basename(p),
                    path: p,
                    isDir: stats.isDirectory(),
                    size: stats.size,
                    mtime: stats.mtime,
                    type: mime.lookup(p) || 'application/octet-stream'
                };
            }
            return null;
        }).filter(Boolean);
        res.json(items);
    });

    app.get('/api/config', (req, res) => {
        res.json({ rootDir: ROOT_DIR, port: PORT });
    });

    app.post('/api/config', (req, res) => {
        const { rootDir, port } = req.body;
        if (rootDir) config.rootDir = rootDir;
        if (port) config.port = port;
        saveConfig();
        res.json({ message: 'Config updated' });
    });

    app.get('/api/download', (req, res) => {
        const filePath = req.query.path;
        if (!filePath || !isSafePath(filePath)) return res.status(403).json({ error: 'Access denied' });
        const absolutePath = path.join(ROOT_DIR, filePath);
        if (fs.existsSync(absolutePath) && !fs.statSync(absolutePath).isDirectory()) {
            addRecent(filePath);
            res.download(absolutePath);
        }
        else res.status(404).json({ error: 'File not found' });
    });

    app.post('/api/upload', upload.array('files'), (req, res) => {
        req.files.forEach(f => {
            const rel = req.query.path ? path.join(req.query.path, f.originalname) : f.originalname;
            addRecent(rel);
        });
        res.json({ message: 'Files uploaded successfully' });
    });

    app.post('/api/rename', (req, res) => {
        const { oldPath, newPath } = req.body;
        if (!isSafePath(oldPath) || !isSafePath(newPath)) return res.status(403).json({ error: 'Access denied' });
        try { fs.renameSync(path.join(ROOT_DIR, oldPath), path.join(ROOT_DIR, newPath)); res.json({ message: 'Renamed successfully' }); }
        catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.delete('/api/delete', (req, res) => {
        const { path: itemPath } = req.body;
        if (!isSafePath(itemPath)) return res.status(403).json({ error: 'Access denied' });
        const absolutePath = path.join(ROOT_DIR, itemPath);
        try {
            if (fs.statSync(absolutePath).isDirectory()) fs.rmSync(absolutePath, { recursive: true, force: true });
            else fs.unlinkSync(absolutePath);
            res.json({ message: 'Deleted successfully' });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/api/mkdir', (req, res) => {
        const { path: dirPath } = req.body;
        if (!isSafePath(dirPath)) return res.status(403).json({ error: 'Access denied' });
        try {
            const absolutePath = path.join(ROOT_DIR, dirPath);
            if (!fs.existsSync(absolutePath)) { fs.mkdirSync(absolutePath, { recursive: true }); res.json({ message: 'Folder created' }); }
            else res.status(400).json({ error: 'Folder already exists' });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/api/newfile', (req, res) => {
        const { path: filePath } = req.body;
        if (!isSafePath(filePath)) return res.status(403).json({ error: 'Access denied' });
        try {
            const absolutePath = path.join(ROOT_DIR, filePath);
            if (!fs.existsSync(absolutePath)) { 
                fs.writeFileSync(absolutePath, ''); 
                addRecent(filePath);
                res.json({ message: 'File created' }); 
            }
            else res.status(400).json({ error: 'File already exists' });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/api/zip', (req, res) => {
        const { paths } = req.body;
        if (!paths || !Array.isArray(paths)) return res.status(400).json({ error: 'Invalid paths' });

        const zipName = `LANShare_${new Date().getTime()}.zip`;
        res.attachment(zipName);

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);

        paths.forEach(p => {
            if (!isSafePath(p)) return;
            const absolutePath = path.join(ROOT_DIR, p);
            if (!fs.existsSync(absolutePath)) return;
            
            const stats = fs.statSync(absolutePath);
            if (stats.isDirectory()) {
                archive.directory(absolutePath, path.basename(p));
            } else {
                archive.file(absolutePath, { name: path.basename(p) });
            }
        });

        archive.finalize();
    });

    app.get('/api/preview', (req, res) => {
        const filePath = req.query.path;
        if (!filePath || !isSafePath(filePath)) return res.status(403).json({ error: 'Access denied' });
        const absolutePath = path.join(ROOT_DIR, filePath);
        if (fs.existsSync(absolutePath) && !fs.statSync(absolutePath).isDirectory()) {
            res.sendFile(absolutePath);
        } else {
            res.status(404).send('Not found');
        }
    });

    app.listen(PORT, '0.0.0.0', () => {
        const localIp = ip.address();
        console.log(chalk.cyan('Please wait...'));
        console.log(chalk.bold.green(`Deployed successfully. You can access your localhost via http://${localIp}:${PORT}`));
        console.log(`\nHosting Folder: "${ROOT_DIR}"`);
        console.log(chalk.gray('Press Ctrl+C to stop the server (if in foreground)...'));
        
        // Only open browser if not in "silent" background mode
        if (!process.argv.includes('--silent')) {
            exec(`start http://localhost:${PORT}`);
        }
    });
};

// --- Helpers ---

const getAccessURLs = (port) => {
    const localIP = ip.address();
    return {
        local: `http://localhost:${port}`,
        network: `http://${localIP}:${port}`
    };
};

const isAlreadyRunning = () => fs.existsSync(PID_FILE);

// --- Main Execution Logic ---

const command = argv._[0];

if (argv.setup) {
    handleSetup();
} else if (argv.port || argv.p) {
    handlePort(argv.port || argv.p);
} else if (argv['internal-server']) {
    // This is the actual background process
    const targetDir = argv.root || argv._[0] || config.rootDir;
    fs.writeFileSync(PID_FILE, process.pid.toString());
    startServerInternal(targetDir);
} else if (command === 'start') {
    if (isAlreadyRunning()) {
        console.log(chalk.yellow('Server is already running. Stopping it first...'));
        stopServer();
    }

    const targetDir = argv._[1] ? path.resolve(argv._[1]) : config.rootDir;
    if (!fs.existsSync(targetDir)) {
        console.error(chalk.red(`Error: Directory "${targetDir}" does not exist.`));
        process.exit(1);
    }

    console.log(chalk.cyan('Starting LANShare...'));
    const urls = getAccessURLs(config.port);
    console.log(chalk.green(`\nLocal Access:   ${urls.local}`));
    console.log(chalk.green(`Network Access: ${urls.network}\n`));
    console.log(chalk.gray(`Hosting Folder: "${targetDir}"`));

    const serverProcess = spawn('node', [__filename, '--internal-server', '--root', targetDir, '--silent'], {
        detached: true,
        stdio: 'ignore'
    });

    fs.writeFileSync(PID_FILE, serverProcess.pid.toString());
    serverProcess.unref();

    console.log(chalk.blue('\nLANShare started in background.'));
    console.log(chalk.gray('Use `lanshare stop` to terminate.'));
    process.exit(0);

} else if (command === 'stop') {
    console.log(chalk.cyan('Stopping LANShare...'));
    if (stopServer()) console.log(chalk.green('LANShare stopped.'));
    else console.log(chalk.yellow('LANShare was not running.'));

} else if (command === 'status') {
    if (isAlreadyRunning()) {
        const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
        console.log(chalk.green(`LANShare is running (PID: ${pid}).`));
        const urls = getAccessURLs(config.port);
        console.log(chalk.cyan(`Local Access:   ${urls.local}`));
        console.log(chalk.cyan(`Network Access: ${urls.network}`));
        console.log(chalk.gray(`Configured Root: "${config.rootDir}"`));
    } else {
        console.log(chalk.yellow('LANShare is not running.'));
    }

} else if (command === 'restart') {
    console.log(chalk.cyan('Restarting LANShare...'));
    stopServer();
    // Start it again
    const targetDir = config.rootDir;
    spawn('node', [__filename, 'start', targetDir], { stdio: 'inherit', detached: false });
    process.exit(0);

} else if (command === 'help' || argv.help || argv.h) {
    handleHelp();
} else if (!command) {
    handleHelp();
} else {
    console.log(chalk.red(`Unknown command: ${command}. Run ` + chalk.bold('lanshare help') + ' for more information.'));
}

