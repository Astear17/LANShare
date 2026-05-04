const app = {
    currentPath: '',
    files: [],
    recentFiles: [],
    selectedItem: null,
    selectedItems: new Set(),
    currentView: 'explorer',
    sortField: 'name',
    sortOrder: 1, // 1 for asc, -1 for desc

    async init() {
        this.setupEventListeners();
        await this.loadFiles();
        await this.loadConfig();
        this.detectNetworkIP();
    },

    // --- Data Loading ---

    async loadFiles(path = '') {
        this.currentPath = path;
        try {
            const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
            const data = await response.json();
            this.files = data.items;
            this.clearSelection();
            if (this.currentView === 'explorer') this.render();
        } catch (err) {
            console.error('Failed to load files:', err);
        }
    },

    async loadRecent() {
        try {
            const response = await fetch('/api/recent');
            this.recentFiles = await response.json();
            if (this.currentView === 'recent') this.renderRecent();
        } catch (err) {
            console.error('Failed to load recent files:', err);
        }
    },

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            const config = await response.json();
            document.getElementById('setting-root-dir').value = config.rootDir;
            document.getElementById('setting-port').value = config.port;
        } catch (err) {
            console.error('Failed to load config:', err);
        }
    },

    // --- UI Logic ---

    switchView(view) {
        this.currentView = view;
        document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
        document.querySelectorAll('.view-section').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
        if (view === 'explorer') this.render();
        if (view === 'recent') this.loadRecent();
        if (view === 'settings') this.loadConfig();
        this.hideProperties();
        this.clearSelection();
    },

    setSort(field) {
        if (this.sortField === field) {
            this.sortOrder *= -1;
        } else {
            this.sortField = field;
            this.sortOrder = 1;
        }
        this.render();
    },

    render() {
        const fileList = document.getElementById('file-list');
        const breadcrumb = document.getElementById('breadcrumb');
        
        // Update Sort Icons
        document.querySelectorAll('.view-header .sortable').forEach(el => {
            el.classList.remove('active');
            const icon = el.querySelector('i');
            icon.className = 'fas fa-sort';
        });
        const activeHeader = document.querySelector(`.col-${this.sortField === 'mtime' ? 'date' : this.sortField}`);
        if (activeHeader) {
            activeHeader.classList.add('active');
            activeHeader.querySelector('i').className = `fas fa-sort-${this.sortOrder === 1 ? 'up' : 'down'}`;
        }

        // Render Breadcrumbs
        const parts = this.currentPath.split(/[/\\]/).filter(p => p);
        let breadcrumbHtml = `<span onclick="app.loadFiles('')">Home</span>`;
        let tempPath = '';
        parts.forEach((part) => {
            tempPath += (tempPath ? '/' : '') + part;
            breadcrumbHtml += ` <span class="separator">/</span> <span onclick="app.loadFiles('${tempPath}')">${part}</span>`;
        });
        breadcrumb.innerHTML = breadcrumbHtml;

        // Sort Files
        const sortedFiles = [...this.files].sort((a, b) => {
            if (a.isDir !== b.isDir) return b.isDir - a.isDir;
            let valA = a[this.sortField];
            let valB = b[this.sortField];
            if (this.sortField === 'name') {
                return valA.localeCompare(valB) * this.sortOrder;
            }
            return (valA > valB ? 1 : -1) * this.sortOrder;
        });

        // Render Files
        if (sortedFiles.length === 0) {
            fileList.innerHTML = `<div class="empty-state">This folder is empty.</div>`;
        } else {
            fileList.innerHTML = sortedFiles.map(file => this.createFileItemHtml(file)).join('');
        }
        
        this.updateSelectionBar();
    },

    renderRecent() {
        const recentList = document.getElementById('recent-list');
        if (this.recentFiles.length === 0) {
            recentList.innerHTML = `<div class="empty-state">No recent activity.</div>`;
        } else {
            recentList.innerHTML = this.recentFiles.map(file => this.createFileItemHtml(file, true)).join('');
        }
    },

    createFileItemHtml(file, showPath = false) {
        const pathAttr = showPath ? `data-path="${file.path}"` : '';
        const isSelected = this.selectedItems.has(file.name);
        return `
            <div class="file-item ${isSelected ? 'selected' : ''}" 
                 ${pathAttr}
                 onclick="app.handleItemClick(event, '${file.name}', ${file.isDir})" 
                 oncontextmenu="app.showContextMenu(event, '${file.name}', ${file.isDir})">
                <div class="col-check">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); app.toggleSelectItem('${file.name}')">
                </div>
                <div class="name-col">
                    <i class="${this.getIconHtml(file)}"></i>
                    <span>${file.name}</span>
                </div>
                <div class="col-date">${new Date(file.mtime).toLocaleDateString()}</div>
                <div class="col-type">${file.isDir ? 'Folder' : (file.type || 'File')}</div>
                <div class="col-size">${file.isDir ? '--' : this.formatSize(file.size)}</div>
            </div>
        `;
    },

    getIconHtml(file) {
        if (file.isDir) return 'fas fa-folder';
        const ext = file.name.split('.').pop().toLowerCase();
        switch (ext) {
            case 'pdf': return 'fas fa-file-pdf';
            case 'doc': case 'docx': return 'fas fa-file-word';
            case 'xls': case 'xlsx': return 'fas fa-file-excel';
            case 'zip': case 'rar': case '7z': return 'fas fa-file-archive';
            case 'png': case 'jpg': case 'jpeg': case 'webp': case 'gif': return 'fas fa-file-image';
            case 'mp4': case 'mov': case 'mkv': return 'fas fa-file-video';
            case 'mp3': case 'wav': return 'fas fa-file-audio';
            case 'js': case 'json': case 'html': case 'css': case 'txt': case 'py': return 'fas fa-file-code';
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

    // --- Interactions ---

    handleItemClick(e, name, isDir) {
        if (e.ctrlKey || e.metaKey) {
            this.toggleSelectItem(name);
            return;
        }

        const item = (this.currentView === 'recent' ? this.recentFiles : this.files).find(f => f.name === name);
        if (!item) return;

        if (isDir) {
            const newPath = this.currentView === 'recent' ? item.path : (this.currentPath ? `${this.currentPath}/${name}` : name);
            this.switchView('explorer');
            this.loadFiles(newPath);
            return;
        }

        this.selectSingleItem(e, item);
    },

    toggleSelectItem(name) {
        if (this.selectedItems.has(name)) {
            this.selectedItems.delete(name);
        } else {
            this.selectedItems.add(name);
        }
        this.render();
    },

    selectSingleItem(e, item) {
        this.selectedItems.clear();
        this.selectedItems.add(item.name);
        this.selectedItem = item;
        this.render();
        this.showProperties();
    },

    clearSelection() {
        this.selectedItems.clear();
        this.selectedItem = null;
        if (document.getElementById('select-all')) document.getElementById('select-all').checked = false;
        this.updateSelectionBar();
    },

    toggleSelectAll(e) {
        if (e.target.checked) {
            this.files.forEach(f => this.selectedItems.add(f.name));
        } else {
            this.selectedItems.clear();
        }
        this.render();
    },

    updateSelectionBar() {
        const bar = document.getElementById('selection-bar');
        const count = document.getElementById('selected-count');
        if (this.selectedItems.size > 1) {
            bar.classList.add('active');
            count.innerText = this.selectedItems.size;
        } else {
            bar.classList.remove('active');
        }
    },

    showProperties() {
        if (!this.selectedItem) return;
        const panel = document.getElementById('properties-panel');
        const content = document.getElementById('properties-content');
        const previewArea = document.getElementById('preview-area');
        panel.classList.add('active');
        this.renderPreview(this.selectedItem, previewArea);

        content.innerHTML = `
            <div class="prop-group"><div class="prop-label">Name</div><div class="prop-value">${this.selectedItem.name}</div></div>
            <div class="prop-group"><div class="prop-label">Type</div><div class="prop-value">${this.selectedItem.isDir ? 'Folder' : (this.selectedItem.type || 'File')}</div></div>
            <div class="prop-group"><div class="prop-label">Size</div><div class="prop-value">${this.selectedItem.isDir ? '--' : this.formatSize(this.selectedItem.size)}</div></div>
            <div class="prop-group"><div class="prop-label">Last Modified</div><div class="prop-value">${new Date(this.selectedItem.mtime).toLocaleString()}</div></div>
        `;

        document.getElementById('panel-download-btn').onclick = () => this.downloadFile(this.selectedItem);
        document.getElementById('panel-rename-btn').onclick = () => this.renameItem();
        document.getElementById('panel-delete-btn').onclick = () => this.deleteItem();
    },

    renderPreview(item, container, isModal = false) {
        if (item.isDir) { container.innerHTML = `<i class="fas fa-folder"></i>`; return; }
        const path = item.path || (this.currentPath ? `${this.currentPath}/${item.name}` : item.name);
        const url = `/api/preview?path=${encodeURIComponent(path)}`;
        const type = item.type || '';
        if (type.startsWith('image/')) {
            container.innerHTML = `<img src="${url}" alt="${item.name}" onclick="app.openFullPreview('${path}', 'image')">`;
        } else if (type.startsWith('video/')) {
            container.innerHTML = `<video src="${url}" ${isModal ? 'controls' : ''} muted autoplay loop onclick="app.openFullPreview('${path}', 'video')"></video>`;
        } else if (type.startsWith('text/') || type === 'application/javascript' || type === 'application/json') {
            if (isModal) container.innerHTML = `<iframe src="${url}"></iframe>`;
            else container.innerHTML = `<i class="fas fa-file-lines"></i>`;
        } else {
            container.innerHTML = `<i class="${this.getIconHtml(item)}"></i>`;
        }
    },

    openFullPreview(path, type) {
        const modal = document.getElementById('preview-modal');
        const modalBody = document.getElementById('modal-body');
        const modalTitle = document.getElementById('modal-title');
        modalTitle.innerText = path.split(/[/\\]/).pop();
        modal.classList.add('active');
        const url = `/api/preview?path=${encodeURIComponent(path)}`;
        if (type === 'image') modalBody.innerHTML = `<img src="${url}">`;
        else if (type === 'video') modalBody.innerHTML = `<video src="${url}" controls autoplay></video>`;
    },

    closePreview() {
        document.getElementById('preview-modal').classList.remove('active');
        document.getElementById('modal-body').innerHTML = '';
    },

    hideProperties() { document.getElementById('properties-panel').classList.remove('active'); },

    // --- File Operations ---

    async downloadFile(item) {
        const path = item.path || (this.currentPath ? `${this.currentPath}/${item.name}` : item.name);
        window.open(`/api/download?path=${encodeURIComponent(path)}`, '_blank');
    },

    async downloadSelected() {
        const paths = Array.from(this.selectedItems).map(name => {
            return this.currentPath ? `${this.currentPath}/${name}` : name;
        });
        
        this.showToast('Preparing Zip...', 'info');
        
        try {
            const response = await fetch('/api/zip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paths })
            });
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `LANShare_Selection_${new Date().getTime()}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            this.showToast('Download started', 'success');
        } catch (err) {
            this.showToast('Zip failed', 'danger');
        }
    },

    handleUpload(e) {
        const files = e.target.files;
        if (!files.length) return;

        const formData = new FormData();
        let totalSize = 0;
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
            totalSize += files[i].size;
        }

        const toastId = 'upload-' + Date.now();
        this.showToast(`Uploading ${files.length} files...`, 'progress', { id: toastId, total: this.formatSize(totalSize) });

        const xhr = new XMLHttpRequest();
        const pathQuery = this.currentPath ? `?path=${encodeURIComponent(this.currentPath)}` : '';
        
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                this.updateToastProgress(toastId, percent, `${this.formatSize(e.loaded)} / ${this.formatSize(e.total)}`);
            }
        });

        xhr.onload = () => {
            if (xhr.status === 200) {
                this.showToast('Upload complete', 'success');
                this.loadFiles(this.currentPath);
            } else {
                this.showToast('Upload failed', 'danger');
            }
            setTimeout(() => this.removeToast(toastId), 3000);
        };

        xhr.open('POST', `/api/upload${pathQuery}`);
        xhr.send(formData);
    },

    showToast(message, type, options = {}) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        if (options.id) toast.id = options.id;

        let content = `
            <div class="toast-header">
                <span>${message}</span>
                ${type !== 'progress' ? '<i class="fas fa-times" onclick="this.parentElement.parentElement.remove()"></i>' : ''}
            </div>
        `;

        if (type === 'progress') {
            content += `
                <div class="toast-progress-container">
                    <div class="toast-progress" style="width: 0%"></div>
                </div>
                <div class="toast-details">
                    <span class="toast-percent">0%</span>
                    <span class="toast-size">0 / ${options.total || '--'}</span>
                </div>
            `;
        }

        toast.innerHTML = content;
        container.appendChild(toast);
        
        if (type !== 'progress') {
            setTimeout(() => toast.remove(), 5000);
        }
    },

    updateToastProgress(id, percent, details) {
        const toast = document.getElementById(id);
        if (!toast) return;
        toast.querySelector('.toast-progress').style.width = percent + '%';
        toast.querySelector('.toast-percent').innerText = percent + '%';
        toast.querySelector('.toast-size').innerText = details;
    },

    removeToast(id) {
        const toast = document.getElementById(id);
        if (toast) toast.remove();
    },

    async createFolder() {
        const name = prompt('Folder name:');
        if (!name) return;
        const path = this.currentPath ? `${this.currentPath}/${name}` : name;
        try {
            await fetch('/api/mkdir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
            this.loadFiles(this.currentPath);
        } catch (err) { alert('Failed to create folder'); }
    },

    async createFile() {
        const name = prompt('File name:');
        if (!name) return;
        const path = this.currentPath ? `${this.currentPath}/${name}` : name;
        try {
            await fetch('/api/newfile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
            this.loadFiles(this.currentPath);
        } catch (err) { alert('Failed to create file'); }
    },

    async renameItem() {
        if (!this.selectedItem) return;
        const newName = prompt('New name:', this.selectedItem.name);
        if (!newName || newName === this.selectedItem.name) return;
        const oldPath = this.selectedItem.path || (this.currentPath ? `${this.currentPath}/${this.selectedItem.name}` : this.selectedItem.name);
        const dir = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : '';
        const newPath = dir ? `${dir}/${newName}` : newName;
        try {
            await fetch('/api/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPath, newPath }) });
            this.refresh();
        } catch (err) { alert('Rename failed'); }
    },

    async deleteItem() {
        if (!this.selectedItem) return;
        if (!confirm(`Delete ${this.selectedItem.name}?`)) return;
        const path = this.selectedItem.path || (this.currentPath ? `${this.currentPath}/${this.selectedItem.name}` : this.selectedItem.name);
        try {
            await fetch('/api/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
            this.refresh(); this.hideProperties();
        } catch (err) { alert('Delete failed'); }
    },

    refresh() {
        if (this.currentView === 'explorer') this.loadFiles(this.currentPath);
        else if (this.currentView === 'recent') this.loadRecent();
    },

    async updatePort() {
        const port = document.getElementById('setting-port').value;
        try {
            await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: parseInt(port) }) });
            alert('Settings saved. Restart LANShare to apply.');
        } catch (err) { alert('Failed to update port'); }
    },

    showContextMenu(e, name, isDir) {
        e.preventDefault();
        const item = (this.currentView === 'recent' ? this.recentFiles : this.files).find(f => f.name === name);
        this.selectSingleItem(e, item);
        const menu = document.getElementById('context-menu');
        menu.style.display = 'block'; menu.style.left = `${e.pageX}px`; menu.style.top = `${e.pageY}px`;
        document.getElementById('ctx-open').onclick = () => this.handleItemClick(e, name, isDir);
        document.getElementById('ctx-download').style.display = isDir ? 'none' : 'flex';
        document.getElementById('ctx-download').onclick = () => this.downloadFile(item);
        document.getElementById('ctx-rename').onclick = () => this.renameItem();
        document.getElementById('ctx-delete').onclick = () => this.deleteItem();
        document.getElementById('ctx-properties').onclick = () => this.showProperties();
    },

    createNewMenu(e) {
        const menu = document.getElementById('new-menu');
        menu.style.display = 'block'; menu.style.left = `${e.pageX}px`; menu.style.top = `${e.pageY + 20}px`;
        e.stopPropagation();
    },

    setupEventListeners() {
        document.addEventListener('click', () => {
            document.getElementById('context-menu').style.display = 'none';
            document.getElementById('new-menu').style.display = 'none';
        });
        document.getElementById('search-input').oninput = (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = this.files.filter(f => f.name.toLowerCase().includes(query));
            const fileList = document.getElementById('file-list');
            fileList.innerHTML = filtered.map(file => this.createFileItemHtml(file)).join('');
        };
    },

    detectNetworkIP() { document.getElementById('network-ip').innerText = location.host; }
};

window.app = app;
app.init();

