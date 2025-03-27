const { ipcRenderer } = require('electron');

let currentVideoPath = null;
const videoPreview = document.getElementById('video-preview');
const textInput = document.getElementById('text-input');
const urlInput = document.getElementById('url-input');
const loadUrlBtn = document.getElementById('load-url-btn');
const renderBtn = document.getElementById('render-btn');
const videoContainer = document.getElementById('video-container');
const dropText = document.getElementById('drop-text');
const fileInput = document.getElementById('file-input');
const fileBtn = document.getElementById('file-btn');
const copyBtn = document.getElementById('copy-btn');

console.log('Renderer.js loaded');
function handleFile(file) {
    if (file && file.type.startsWith('video/')) {
        currentVideoPath = file.path;
        videoPreview.src = URL.createObjectURL(file);
        videoPreview.classList.add('has-video');
        dropText.style.display = 'none';
        renderBtn.disabled = false;
        copyBtn.disabled = false;
        urlInput.value = '';
        videoPreview.play();
    }
}

function handleUrl(url) {
    try {
        const videoUrl = new URL(url);
        const isGif = url.toLowerCase().endsWith('.gif');

        console.log('in handleUrl', url);

        if (isGif) {
            console.log('is gif', url);
            console.log('Sending GIF conversion request:', url);
            dropText.textContent = 'Converting GIF...';
            dropText.style.display = 'block';
            videoPreview.style.display = 'none';
            renderBtn.disabled = true;
            copyBtn.disabled = true;

            ipcRenderer.send('convert-gif', url);
        } else {
            console.log('is not gif', url);
            videoPreview.src = url;
            videoPreview.style.display = 'block';
            videoPreview.classList.add('has-video');
            dropText.style.display = 'none';
            renderBtn.disabled = false;
            copyBtn.disabled = false;
            currentVideoPath = url;
            videoPreview.play();
        }
    } catch (e) {
        alert('Please enter a valid URL');
    }
}

// URL input handling
loadUrlBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    console.log('Loading URL early:', url);
    if (url) {
        console.log('Loading URL:', url);
        handleUrl(url);
    }
});

urlInput.addEventListener('keypress', (e) => {
    console.log('Loading URL early 2:');
    if (e.key === 'Enter') {
        const url = urlInput.value.trim();
        if (url) {
            handleUrl(url);
        }
    }
});

// Prevent default drag behaviors
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, preventDefaults, false);
    videoContainer.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Handle drop zone highlighting
['dragenter', 'dragover'].forEach(eventName => {
    videoContainer.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    videoContainer.addEventListener(eventName, unhighlight, false);
});

function highlight(e) {
    videoContainer.classList.add('drag-over');
}

function unhighlight(e) {
    videoContainer.classList.remove('drag-over');
}

// Handle dropped files
videoContainer.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    handleFile(file);
});

renderBtn.addEventListener('click', () => {
    if (!currentVideoPath || !textInput.value.trim()) return;

    renderBtn.disabled = true;
    renderBtn.textContent = 'Rendering...';

    ipcRenderer.send('render-video', {
        inputPath: currentVideoPath,
        text: textInput.value.trim()
    });
});

ipcRenderer.on('render-complete', (event, outputPath) => {
    currentVideoPath = outputPath;
    videoPreview.src = outputPath;
    renderBtn.disabled = false;
    renderBtn.textContent = 'Render';
});

ipcRenderer.on('render-error', (event, error) => {
    alert('Error rendering video: ' + error);
    renderBtn.disabled = false;
    renderBtn.textContent = 'Render';
});

// Add handlers for GIF conversion events
ipcRenderer.on('gif-converted', (event, videoPath) => {
    console.log('GIF converted successfully:', videoPath);
    currentVideoPath = videoPath;
    videoPreview.src = `file://${videoPath}`;
    videoPreview.style.display = 'block';
    videoPreview.classList.add('has-video');
    dropText.style.display = 'none';
    renderBtn.disabled = false;
    copyBtn.disabled = false;
    videoPreview.play();
});

ipcRenderer.on('gif-conversion-error', (event, error) => {
    console.error('GIF conversion error:', error);
    alert('Error converting GIF: ' + error);
    dropText.textContent = 'Drag and drop a video here';
    renderBtn.disabled = true;
});

// Add file input button handler
fileBtn.addEventListener('click', () => {
    fileInput.click();
});

// Handle file selection
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
});

// Add copy button handler
copyBtn.addEventListener('click', () => {
    if (!currentVideoPath) return;

    copyBtn.disabled = true;
    copyBtn.textContent = 'Exporting...';

    ipcRenderer.send('copy-to-clipboard', {
        inputPath: currentVideoPath
    });
});

// Handle copy complete event
ipcRenderer.on('copy-complete', () => {
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
        copyBtn.textContent = 'Export';
        copyBtn.disabled = false;
    }, 2000);
});

// Handle copy error event
ipcRenderer.on('copy-error', (event, error) => {
    alert('Error copying to clipboard: ' + error);
    copyBtn.textContent = 'Export';
    copyBtn.disabled = false;
}); 