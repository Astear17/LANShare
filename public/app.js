const app = {
    currentPath: '',
    files: [],
    selectedItem: null,

    async init() {
        await this.loadFiles();
        this.setupEventListeners();
        this.detectNetworkIP();
    },

    async loadFiles(path = '') {
        this.currentPath = path;
        try {
            const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
            const data = await response.json();
            this.files = data.items;
            this.render();
        } catch (err) {
            console.error('Failed to load files:', err);
        }
    },

    render() {
        const fileList = document.getElementById('file-list');
        const breadcrumb = document.getElementById('breadcrumb');
        
        // Render Breadcrumbs
        const parts = this.currentPath.split('/').filter(p => p);
        let breadcrumbHtml = `<span onclick="app.loadFiles('')">Home</span>`;
        let tempPath = '';
        parts.forEach((part, index) => {
            tempPath += (tempPath ? '/' : '') + part;
            breadcrumbHtml += ` <span class="separator">/</span> <span onclick="app.loadFiles('${tempPath}')">${part}</span>`;
        });
        breadcrumb.innerHTML = breadcrumbHtml;

        // Render Files
        fileList.innerHTML = this.files.map(file => `
            <div class="file-item" 
                 onclick="app.selectItem(event, '${file.name}')" 
                 ondblclick="app.handleOpen('${file.name}', ${file.isDir})"
                 oncontextmenu="app.showContextMenu(event, '${file.name}', ${file.isDir})">
                <div class="name-col">
                    <i class="${this.getIcon(file)}"></i>
                    <span>${file.name}</span>
                </div>
                <div class="col-date">${new Date(file.mtime).toLocaleDateString()}</div>
                <div class="col-type">${file.isDir ? 'Folder' : (file.type || 'File')}</div>
                <div class="col-size">${file.isDir ? '--' : this.formatSize(file.size)}</div>
            </div>
        `).join('');
    },

    getIcon(file) {
        if (file.isDir) return 'fas fa-folder';
        const ext = file.name.split('.').pop().toLowerCase();
        switch (ext) {
            case 'pdf': return 'fas fa-file-pdf';
            case 'doc':
            case 'docx': return 'fas fa-file-word';
            case 'xls':
            case 'xlsx': return 'fas fa-file-excel';
            case 'zip':
            case 'rar':
            case '7z': return 'fas fa-file-archive';
            case 'png':
            case 'jpg':
            case 'jpeg':
            case 'gif': return 'fas fa-file-image';
            case 'js':
            case 'html':
            case 'css':
            case 'py': return 'fas fa-file-code';
            default: return 'fas fa-file';
        }
    },

    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    selectItem(e, name) {
        document.querySelectorAll('.file-item').forEach(el => el.classList.remove('selected'));
        const itemEl = e.currentTarget;
        itemEl.classList.add('selected');
        this.selectedItem = this.files.find(f => f.name === name);
        this.showProperties();
    },

    handleOpen(name, isDir) {
        if (isDir) {
            this.loadFiles(this.currentPath ? `${this.currentPath}/${name}` : name);
        } else {
            this.downloadFile(name);
        }
    },

    async downloadFile(name) {
        const path = this.currentPath ? `${this.currentPath}/${name}` : name;
        window.open(`/api/download?path=${encodeURIComponent(path)}`, '_blank');
    },

    async handleUpload(e) {
        const files = e.target.files;
        if (!files.length) return;

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }

        const pathQuery = this.currentPath ? `?path=${encodeURIComponent(this.currentPath)}` : '';
        try {
            await fetch(`/api/upload${pathQuery}`, {
                method: 'POST',
                body: formData
            });
            this.loadFiles(this.currentPath);
        } catch (err) {
            alert('Upload failed');
        }
    },

    async createFolder() {
        const name = prompt('Folder name:');
        if (!name) return;

        const path = this.currentPath ? `${this.currentPath}/${name}` : name;
        try {
            await fetch('/api/mkdir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            });
            this.loadFiles(this.currentPath);
        } catch (err) {
            alert('Failed to create folder');
        }
    },

    async renameItem() {
        if (!this.selectedItem) return;
        const newName = prompt('New name:', this.selectedItem.name);
        if (!newName || newName === this.selectedItem.name) return;

        const oldPath = this.currentPath ? `${this.currentPath}/${this.selectedItem.name}` : this.selectedItem.name;
        const newPath = this.currentPath ? `${this.currentPath}/${newName}` : newName;

        try {
            await fetch('/api/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPath, newPath })
            });
            this.loadFiles(this.currentPath);
        } catch (err) {
            alert('Rename failed');
        }
    },

    async deleteItem() {
        if (!this.selectedItem) return;
        if (!confirm(`Delete ${this.selectedItem.name}?`)) return;

        const path = this.currentPath ? `${this.currentPath}/${this.selectedItem.name}` : this.selectedItem.name;
        try {
            await fetch('/api/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            });
            this.loadFiles(this.currentPath);
            this.hideProperties();
        } catch (err) {
            alert('Delete failed');
        }
    },

    showProperties() {
        if (!this.selectedItem) return;
        const panel = document.getElementById('properties-panel');
        const content = document.getElementById('properties-content');
        panel.classList.add('active');

        content.innerHTML = `
            <div class="prop-group">
                <div class="prop-label">Name</div>
                <div class="prop-value">${this.selectedItem.name}</div>
            </div>
            <div class="prop-group">
                <div class="prop-label">Type</div>
                <div class="prop-value">${this.selectedItem.isDir ? 'Folder' : (this.selectedItem.type || 'File')}</div>
            </div>
            <div class="prop-group">
                <div class="prop-label">Size</div>
                <div class="prop-value">${this.selectedItem.isDir ? '--' : this.formatSize(this.selectedItem.size)}</div>
            </div>
            <div class="prop-group">
                <div class="prop-label">Last Modified</div>
                <div class="prop-value">${new Date(this.selectedItem.mtime).toLocaleString()}</div>
            </div>
            <div class="prop-group">
                <div class="prop-label">Location</div>
                <div class="prop-value">${this.currentPath || '/'}</div>
            </div>
        `;
    },

    hideProperties() {
        document.getElementById('properties-panel').classList.remove('active');
    },

    showContextMenu(e, name, isDir) {
        e.preventDefault();
        this.selectItem(e, name);
        const menu = document.getElementById('context-menu');
        menu.style.display = 'block';
        menu.style.left = `${e.pageX}px`;
        menu.style.top = `${e.pageY}px`;

        // Configure menu based on type
        document.getElementById('ctx-download').style.display = isDir ? 'none' : 'flex';
    },

    setupEventListeners() {
        document.addEventListener('click', () => {
            document.getElementById('context-menu').style.display = 'none';
        });

        document.getElementById('ctx-download').onclick = () => this.downloadFile(this.selectedItem.name);
        document.getElementById('ctx-rename').onclick = () => this.renameItem();
        document.getElementById('ctx-delete').onclick = () => this.deleteItem();
        document.getElementById('ctx-properties').onclick = () => this.showProperties();
        
        // Search functionality
        document.getElementById('search-input').oninput = (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = this.files.filter(f => f.name.toLowerCase().includes(query));
            this.renderFiltered(filtered);
        };
    },

    renderFiltered(filteredFiles) {
        const fileList = document.getElementById('file-list');
        fileList.innerHTML = filteredFiles.map(file => `
            <div class="file-item" onclick="app.selectItem(event, '${file.name}')" ondblclick="app.handleOpen('${file.name}', ${file.isDir})">
                <div class="name-col">
                    <i class="${this.getIcon(file)}"></i>
                    <span>${file.name}</span>
                </div>
                <div class="col-date">${new Date(file.mtime).toLocaleDateString()}</div>
                <div class="col-type">${file.isDir ? 'Folder' : (file.type || 'File')}</div>
                <div class="col-size">${file.isDir ? '--' : this.formatSize(file.size)}</div>
            </div>
        `).join('');
    },

    detectNetworkIP() {
        // Since we are running on localhost, we can just show the IP from the server in a real scenario
        // For this demo, we'll fetch a placeholder or just leave it to the server console
        document.getElementById('network-ip').innerText = location.host;
    }
};

app.init();
