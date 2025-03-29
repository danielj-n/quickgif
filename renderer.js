const { ipcRenderer } = require('electron');
const https = require('https');
const http = require('http');

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

// Track all text boxes
let textBoxes = [];

// Function to create a new text box
function createNewTextBox() {
    const textBox = document.createElement('textarea');
    textBox.className = 'overlay-text-input';
    textBox.placeholder = 'Type your text here...';
    textBox.style.top = '50%';
    textBox.style.left = '50%';
    videoContainer.appendChild(textBox);
    textBoxes.push(textBox);
    return textBox;
}

console.log('Renderer.js loaded');

async function getTenorGifUrl(url) {
    console.log('Getting Tenor GIF URL:', url);
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        console.log('Fetching Tenor URL:', url);
        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                console.error('Failed to fetch Tenor page:', response.statusCode);
                reject(new Error(`Failed to fetch Tenor page: ${response.statusCode}`));
                return;
            }

            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                console.log('Received Tenor page HTML');
                // Try multiple patterns to find the GIF URL
                const patterns = [
                    /<div class="Gif".+?<img src="(.+?)".+?></,
                    /<img class="Gif".+?src="(.+?)".+?></,
                    /<video class="Gif".+?src="(.+?)".+?></,
                    /<source src="(.+?)".+?type="video\/mp4">/
                ];

                for (const pattern of patterns) {
                    const match = data.match(pattern);
                    if (match && match[1]) {
                        console.log('Found GIF URL:', match[1]);
                        resolve(match[1]);
                        return;
                    }
                }

                console.error('Could not find GIF URL in Tenor page');
                reject(new Error('Could not find GIF URL in Tenor page'));
            });
        }).on('error', (err) => {
            console.error('Error fetching Tenor page:', err);
            reject(err);
        });
    });
}

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

async function handleUrl(url) {
    try {
        const videoUrl = new URL(url);
        const isGif = url.toLowerCase().endsWith('.gif');
        const isTenor = url.includes('tenor.com');
        const isVideo = url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm');

        console.log('in handleUrl', url);

        if (isTenor && !isGif && !isVideo) {
            try {
                const actualUrl = await getTenorGifUrl(url);
                console.log('Got Tenor URL:', actualUrl);
                // Now handle as a regular gif/video
                if (actualUrl.toLowerCase().endsWith('.gif')) {
                    ipcRenderer.send('convert-gif', actualUrl);
                } else {
                    videoPreview.src = actualUrl;
                    videoPreview.style.display = 'block';
                    videoPreview.classList.add('has-video');
                    dropText.style.display = 'none';
                    renderBtn.disabled = false;
                    copyBtn.disabled = false;
                    currentVideoPath = actualUrl;
                    videoPreview.play();
                }
            } catch (err) {
                console.error('Failed to get Tenor URL:', err);
                alert('Failed to load Tenor GIF: ' + err.message);
            }
        } else if (isGif) {
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
    if (!currentVideoPath) return;

    // Collect all text box information
    const textBoxData = textBoxes.map(textBox => {
        // Get the position relative to the video container
        const rect = textBox.getBoundingClientRect();
        const containerRect = videoContainer.getBoundingClientRect();
        
        // Calculate position as percentage of video dimensions
        const x = ((rect.left - containerRect.left) / containerRect.width) * 100;
        const y = ((rect.top - containerRect.top) / containerRect.height) * 100;
        
        return {
            text: textBox.value,
            x: x,
            y: y,
            fontSize: parseInt(textBox.style.fontSize || '24px'),
            width: (rect.width / containerRect.width) * 100
        };
    });

    renderBtn.disabled = true;
    renderBtn.textContent = 'Rendering...';

    ipcRenderer.send('render-video', {
        inputPath: currentVideoPath,
        textBoxes: textBoxData
    });
});

ipcRenderer.on('render-complete', (event, outputPath) => {
    currentVideoPath = outputPath;
    videoPreview.src = outputPath;
    renderBtn.disabled = false;
    renderBtn.textContent = 'Render';
    
    // Remove all text boxes after successful rendering
    textBoxes.forEach(textBox => textBox.remove());
    textBoxes = [];
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

// Add keyboard event handling for text overlay
document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 't') {
        // Check if any text box is focused
        const focusedTextBox = document.querySelector('.overlay-text-input:focus');
        if (!focusedTextBox) {
            // Create new text box if none is focused
            const newTextBox = createNewTextBox();
            newTextBox.classList.add('active');
            newTextBox.focus();
        }
    }
});

// Handle text input in overlay
document.addEventListener('keydown', (e) => {
    const focusedTextBox = document.querySelector('.overlay-text-input:focus');
    if (!focusedTextBox) return;

    const step = 10; // pixels to move per keypress
    const fontSizeStep = 4; // pixels to change font size
    
    switch(e.key) {
        case 'ArrowUp':
            e.preventDefault();
            if (e.shiftKey) {
                // Increase font size
                const currentSize = parseInt(focusedTextBox.style.fontSize || '24px');
                focusedTextBox.style.fontSize = `${currentSize + fontSizeStep}px`;
            } else {
                // Move up
                const currentTop = parseInt(focusedTextBox.style.top || '50%');
                focusedTextBox.style.top = `${currentTop - step}%`;
            }
            break;
        case 'ArrowDown':
            e.preventDefault();
            if (e.shiftKey) {
                // Decrease font size
                const currentSize = parseInt(focusedTextBox.style.fontSize || '24px');
                focusedTextBox.style.fontSize = `${Math.max(8, currentSize - fontSizeStep)}px`;
            } else {
                // Move down
                const currentTopDown = parseInt(focusedTextBox.style.top || '50%');
                focusedTextBox.style.top = `${currentTopDown + step}%`;
            }
            break;
        case 'ArrowLeft':
            e.preventDefault();
            const currentLeft = parseInt(focusedTextBox.style.left || '50%');
            focusedTextBox.style.left = `${currentLeft - step}%`;
            break;
        case 'ArrowRight':
            e.preventDefault();
            const currentLeftRight = parseInt(focusedTextBox.style.left || '50%');
            focusedTextBox.style.left = `${currentLeftRight + step}%`;
            break;
        case 'Escape':
            focusedTextBox.blur();
            break;
        case 'Enter':
            // Allow default behavior for newline
            break;
    }
});

// Auto-resize textarea as content is added
document.addEventListener('input', function(e) {
    if (e.target.classList.contains('overlay-text-input')) {
        e.target.style.height = 'auto';
        e.target.style.height = (e.target.scrollHeight) + 'px';
    }
}); 
