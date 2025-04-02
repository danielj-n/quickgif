const { ipcRenderer, clipboard } = require('electron');
const https = require('https');
const http = require('http');

let currentVideoPath = null;
const videoPreview = document.getElementById('video-preview');
const textInput = document.getElementById('text-input');
const videoContainer = document.getElementById('video-container');
const dropText = document.getElementById('drop-text');
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

            ipcRenderer.send('convert-gif', url);
        } else {
            console.log('is not gif', url);
            videoPreview.src = url;
            videoPreview.style.display = 'block';
            videoPreview.classList.add('has-video');
            dropText.style.display = 'none';
            currentVideoPath = url;
            videoPreview.play();
        }
    } catch (e) {
        alert('Please enter a valid URL');
    }
}

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

function createRenderOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'render-overlay';
    overlay.textContent = 'Rendering...';
    document.body.appendChild(overlay);
    return overlay;
}

function render() {
    if (!currentVideoPath) return;

    // Create a new rendering overlay for this specific render operation
    const renderOverlay = createRenderOverlay();

    // Get both the intrinsic and displayed video dimensions
    const videoWidth = videoPreview.videoWidth;
    const displayWidth = videoPreview.offsetWidth;

    // Collect all text box information
    const textBoxData = textBoxes.map(textBox => {
        const rect = textBox.getBoundingClientRect();
        const containerRect = videoContainer.getBoundingClientRect();
        
        // Calculate position relative to container rect?
        const x = (rect.left - containerRect.left);
        const y = (rect.top - containerRect.top);
        
        return {
            text: textBox.value,
            x: x,
            y: y,
            fontSize: parseInt(textBox.style.fontSize || '24px'),
            width: (rect.width / containerRect.width)
        };
    });

    ipcRenderer.send('render-video', {
        inputPath: currentVideoPath,
        textBoxes: textBoxData,
        videoWidth: videoWidth,
        displayWidth: displayWidth,
        overlayId: renderOverlay.id // Not strictly necessary but might be useful later
    });
};

ipcRenderer.on('render-complete', (event, outputPath) => {
    console.log('Render complete:', outputPath);
    currentVideoPath = outputPath;
    videoPreview.src = outputPath;
    
    // Remove all render overlays that have completed
    const overlays = document.getElementsByClassName('render-overlay');
    Array.from(overlays).forEach(overlay => {
        overlay.remove();
    });
    
    // Remove all text boxes after successful rendering
    textBoxes.forEach(textBox => textBox.remove());
    textBoxes = [];
});

ipcRenderer.on('render-error', (event, error) => {
    // Remove all render overlays on error
    const overlays = document.getElementsByClassName('render-overlay');
    Array.from(overlays).forEach(overlay => {
        overlay.remove();
    });
    alert('Error rendering video: ' + error);
});

// Add handlers for GIF conversion events
ipcRenderer.on('gif-converted', (event, videoPath) => {
    console.log('GIF converted successfully:', videoPath);
    currentVideoPath = videoPath;
    videoPreview.src = `file://${videoPath}`;
    videoPreview.style.display = 'block';
    videoPreview.classList.add('has-video');
    dropText.style.display = 'none';
    videoPreview.play();
});

ipcRenderer.on('gif-conversion-error', (event, error) => {
    console.error('GIF conversion error:', error);
    alert('Error converting GIF: ' + error);
    dropText.textContent = 'Drag and drop a video here';
});

function exportToClipboard() {
    if (!currentVideoPath) return;

    ipcRenderer.send('copy-to-clipboard', {
        inputPath: currentVideoPath
    });
}

// Handle copy error event
ipcRenderer.on('copy-error', (event, error) => {
    alert('Error copying to clipboard: ' + error);
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
            e.preventDefault();
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

// Add clipboard URL check on startup
window.addEventListener('load', () => {
    const clipboardText = clipboard.readText().trim();
    if (clipboardText) {
        console.log('Found URL in clipboard:', clipboardText);
        handleUrl(clipboardText);
    }
});

// Add keyboard shortcuts for render and export
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        if (currentVideoPath) {
            exportToClipboard();
        }
    } else if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        if (currentVideoPath) {
            render();
        }
    }
});

// Add this to the video element's loadedmetadata event
videoPreview.addEventListener('loadedmetadata', () => {
    const width = videoPreview.videoWidth;
    const height = videoPreview.videoHeight;
    ipcRenderer.send('video-loaded', { width, height });
}); 
