# LANShare

LANShare is a high-performance local network file management utility designed for seamless file sharing and management across devices on a local area network. It features a modern, responsive web interface inspired by professional cloud storage platforms and a robust CLI for background process management.

## Key Features

- **Professional Web Interface**: A premium Single-Page Application (SPA) designed for clarity and speed.
- **Background Execution**: Runs as a detached background process, ensuring availability even after the terminal is closed.
- **Advanced File Operations**:
    - **Multi-Select & Bulk Download**: Select multiple files or folders to download them as a single ZIP archive generated on the fly.
    - **Real-time Uploads**: Monitor upload progress with detailed status notifications and progress bars.
    - **Previews**: Instant preview support for images, videos, text files, and code.
- **Efficient Management**:
    - **Multi-Column Sorting**: Persistent sorting by name, date modified, type, and size.
    - **Smart Search**: Quickly locate files within the current directory.
    - **Recent Activity**: Track recently accessed or uploaded files across the system.
- **Secure by Design**: Implements path-validation checks to prevent unauthorized directory traversal.

## Installation

Ensure you have [Node.js](https://nodejs.org/) installed on your system.

1. Clone the repository or download the source code.
2. Install dependencies:
   ```bash
   npm install
   ```
3. (Optional) Link the CLI for global access:
   ```bash
   npm link
   ```

## Configuration

Before starting the server for the first time, run the setup command to configure your root directory:

```bash
lanshare --setup
```

You can also change the default port using:

```bash
lanshare --port 3636
```

## CLI Usage

| Command | Description |
| :--- | :--- |
| `lanshare start [path]` | Starts the server in the background. Defaults to the configured root. |
| `lanshare stop` | Safely terminates the background server and releases the port. |
| `lanshare status` | Displays current server health, PID, and access URLs. |
| `lanshare restart` | Restarts the background process to apply new configurations. |
| `lanshare help` | Displays a summary of available commands and flags. |

## Technical Stack

- **Backend**: Node.js, Express.js
- **File Processing**: Multer (Uploads), Archiver (Streaming ZIP)
- **Frontend**: Vanilla JavaScript (ES6+), CSS3 (Modern Flex/Grid), FontAwesome
- **CLI**: Minimist, Chalk, IP

## Requirements

- **Operating System**: Windows (Optimized for Windows process management)
- **Environment**: Node.js 14.x or higher

## Security Note

LANShare is intended for use within trusted local networks. Ensure your firewall settings allow traffic on the configured port (default: 3636) for cross-device access.
