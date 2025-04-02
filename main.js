const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const https = require('https');
const http = require('http');
const fs = require('fs');
const os = require('os');
const { URL } = require('url');
const { clipboard } = require('electron');
const crypto = require('crypto');

console.log('Main.js loaded');
let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
}


app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

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

async function downloadVideo(url) {
    // Check if it's a Tenor URL
    const isTenor = url.includes('tenor.com');
    const isGif = url.toLowerCase().endsWith('.gif');
    const isVideo = url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm');

    console.log(isTenor, isGif, isVideo);
    
    let actualUrl = url;
    
    // If it's a Tenor URL but not directly to a media file, get the actual GIF URL
    if (isTenor && !isGif && !isVideo) {
        try {
            actualUrl = await getTenorGifUrl(url);
        } catch (err) {
            throw new Error(`Failed to get Tenor GIF URL: ${err.message}`);
        }
    }

    const tempPath = path.join(os.tmpdir(), 
        isGif ? `temp_video_${Date.now()}.gif` : `temp_video_${Date.now()}.mp4`
    );
    
    return new Promise((resolve, reject) => {
        const protocol = actualUrl.startsWith('https') ? https : http;
        
        protocol.get(actualUrl, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }

            const fileStream = fs.createWriteStream(tempPath);
            response.pipe(fileStream);

            fileStream.on('finish', () => {
                resolve({ path: tempPath, isGif: actualUrl.toLowerCase().endsWith('.gif') });
            });

            fileStream.on('error', (err) => {
                reject(err);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

async function downloadFile(url) {
    // Map of content types to file extensions
    const contentTypeMap = {
        'image/gif': 'gif',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/quicktime': 'mov'
    };

    const tempInputPath = await new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }

            // Get content type from headers
            const contentType = response.headers['content-type']?.split(';')[0];
            console.log('Content-Type:', contentType);
            
            // Determine file extension from content type, fallback to 'mp4'
            const extension = contentTypeMap[contentType] || 'mp4';
            const filePath = path.join(os.tmpdir(), `temp_input_${Date.now()}.${extension}`);
            
            const fileStream = fs.createWriteStream(filePath);
            response.pipe(fileStream);
            
            fileStream.on('finish', () => resolve(filePath));
            fileStream.on('error', reject);
        }).on('error', reject);
    });

    return tempInputPath;
}

async function convertToWebm(inputPath, isGif) {
    const tempOutputPath = path.join(os.tmpdir(), `temp_output_${Date.now()}.webm`);
    
    await new Promise((resolve, reject) => {
        let command = ffmpeg(inputPath);
        
        if (isGif) {
            command = command.inputOptions(['-ignore_loop', '1']);
        }
        
        command
            .fps(25)
            .save(tempOutputPath)
            .on('end', () => {
                fs.unlink(inputPath, () => {});
                resolve();
            })
            .on('error', (err) => {
                fs.unlink(inputPath, () => {});
                reject(err);
            });
    });

    return tempOutputPath;
}

ipcMain.on('render-video', async (event, { inputPath, textBoxes, videoWidth, displayWidth }) => {
    try {
        let videoPath = inputPath;
        let isGif = false;
        
        // If input is a URL, download the file first
        if (inputPath.startsWith('http')) {
            try {
                const result = await downloadVideo(inputPath);
                videoPath = result.path;
                isGif = result.isGif;
            } catch (err) {
                event.reply('render-error', `Failed to download: ${err.message}`);
                return;
            }
        } else {
            // Check if local file is a GIF
            isGif = inputPath.toLowerCase().endsWith('.gif');
        }

        // Remove any existing UUID pattern and add a new one
        const outputPath = path.dirname(videoPath) + "/" + crypto.randomUUID() + ".webm"; 
        
        let ffmpegCommand = ffmpeg(videoPath);

        // If input is a GIF, set appropriate options
        if (isGif) {
            ffmpegCommand = ffmpegCommand
                .inputOptions(['-ignore_loop', '0']) // Read GIF correctly
                .fps(25); // Set reasonable framerate
        }

        // Create drawtext filters for each text box
        const displayScaleFactor = videoWidth / displayWidth;
        const fontScaleFactor = 1.05;
        const drawTextFilters = textBoxes.map((textBox, index) => {
            return {
                filter: 'drawtext',
                options: {
                    text: (textBox.text.replace(/\\/g, '\\\\\\\\\\\\\\\\')
                        .replace(/:/g, '\\\\:') 
                        .replace(/%/g, '\\\\%')
                        .replace(/,/g, '\\\\,')
                        .replace(/'/g, '')), // get rid of single quotes because they're buggy
                    fontsize: (textBox.fontSize * displayScaleFactor * fontScaleFactor),
                    fontcolor: 'white',
                    x: `${textBox.x*displayScaleFactor}`,
                    y: `${textBox.y*displayScaleFactor}`,
                    fontfile: 'impact.ttf',
                    line_spacing: 10
                }
            }
        });

        ffmpegCommand
            .videoFilters(drawTextFilters)
            .save(outputPath)
            .on('start', (command) => {
                console.log('FFmpeg command:', command);
            })
            .on('end', () => {
                // Clean up temporary file if it was a URL download
                if (inputPath.startsWith('http')) {
                    fs.unlink(videoPath, () => {});
                }
                event.reply('render-complete', outputPath);
            })
            .on('error', (err) => {
                // Clean up temporary file if it was a URL download
                if (inputPath.startsWith('http')) {
                    fs.unlink(videoPath, () => {});
                }
                event.reply('render-error', err.message);
            });
    } catch (err) {
        event.reply('render-error', err.message);
    }
});

ipcMain.on('download-media', async (event, url) => {
    console.log('Starting media conversion:', url);
    console.log("url:", url);
    
    try {
        const downloadedPath = await downloadFile(url);
        console.log('download-media:', downloadedPath);
        const isGif = downloadedPath.toLowerCase().endsWith('.gif');
        const outputPath = await convertToWebm(downloadedPath, isGif);
        event.reply('gif-converted', outputPath);
    } catch (err) {
        console.error('Conversion error:', err);
        event.reply('gif-conversion-error', err.message);
    }
});

ipcMain.on('copy-to-clipboard', async (event, { inputPath }) => {
    try {
        const tempDir = os.tmpdir();
        const outputPath = path.join(tempDir, `temp-${Date.now()}.gif`);
        
        // First convert to GIF
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .toFormat('gif')
                .videoFilters([
                    {
                        filter: 'fps',
                        options: '25'
                    },
                    {
                        filter: 'scale',
                        options: 'iw:ih'
                    }
                ])
                .on('end', () => resolve())
                .on('error', (err) => reject(err))
                .save(outputPath);
        });

        clipboard.writeBuffer(
            'text/uri-list',
            Buffer.from(`file://${outputPath}`, 'utf8')
        );

        event.reply('copy-complete');
    } catch (error) {
        console.error('Error during copy:', error);
        event.reply('copy-error', error.message);
    }
});

// Add this near the top with other IPC handlers
ipcMain.on('video-loaded', (event, { width, height }) => {
    // Add a small padding to account for window borders/chrome
    const padding = 0;  // Adjust if needed
    mainWindow.setContentSize(width + padding, height + padding);
    mainWindow.center(); // Re-center the window after resize
}); 