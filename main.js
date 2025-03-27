const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const https = require('https');
const http = require('http');
const fs = require('fs');
const os = require('os');
const { URL } = require('url');
const { clipboard } = require('electron');

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

ipcMain.on('render-video', async (event, { inputPath, text }) => {
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

        const outputPath = videoPath.replace(/\.[^/.]+$/, "") + "_edited.webm";
        
        let ffmpegCommand = ffmpeg(videoPath);

        // If input is a GIF, set appropriate options
        if (isGif) {
            ffmpegCommand = ffmpegCommand
                .inputOptions(['-ignore_loop', '0']) // Read GIF correctly
                .fps(25); // Set reasonable framerate
        }

        ffmpegCommand
            .videoFilters([{
                filter: 'drawtext',
                options: {
                    text: text,
                    fontsize: 48,
                    fontcolor: 'white',
                    x: '(w-text_w)/2',
                    y: '(h-text_h)/2',
                    shadowcolor: 'black',
                    shadowx: 2,
                    shadowy: 2
                }
            }])
            .save(outputPath)
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

// Add a new IPC handler for converting GIFs to videos
ipcMain.on('convert-gif', async (event, url) => {
    console.log('Starting GIF conversion:', url); // Debug log
    try {
        // Download the GIF to temp directory
        const tempGifPath = path.join(os.tmpdir(), `temp_gif_${Date.now()}.gif`);
        const tempVideoPath = path.join(os.tmpdir(), `temp_video_${Date.now()}.webm`);
        
        console.log('Downloading GIF to:', tempGifPath); // Debug log

        // Download using https or http
        await new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : require('http');
            protocol.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download: ${response.statusCode}`));
                    return;
                }
                const fileStream = fs.createWriteStream(tempGifPath);
                response.pipe(fileStream);
                fileStream.on('finish', resolve);
                fileStream.on('error', reject);
            }).on('error', reject);
        });

        // Convert GIF to video using ffmpeg
        ffmpeg(tempGifPath)
            .inputOptions(['-ignore_loop', '1'])
            .fps(25)
            .save(tempVideoPath)
            .on('start', (command) => {
                console.log('FFmpeg started:', command); // Debug log
            })
            .on('progress', (progress) => {
                console.log(progress.timemark);
            })
            .on('end', () => {
                console.log('Conversion complete:', tempVideoPath); // Debug log
                fs.unlink(tempGifPath, () => {});
                event.reply('gif-converted', tempVideoPath);
            })
            .on('error', (err) => {
                console.error('FFmpeg error:', err); // Debug log
                fs.unlink(tempGifPath, () => {});
                event.reply('gif-conversion-error', err.message);
            });
    } catch (err) {
        console.error('Conversion error:', err); // Debug log
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
                        options: '25'  // Keep smooth framerate
                    },
                    {
                        filter: 'scale',
                        options: 'iw:ih'  // Maintain original dimensions
                    }
                ])
                .on('end', () => resolve())
                .on('error', (err) => reject(err))
                .save(outputPath);
        });

        
        // Read the GIF file
        const buffer = fs.readFileSync(outputPath);
        console.log('outputPath', outputPath);

        // Write to clipboard with both methods
        clipboard.writeBuffer('image/gif', buffer);  // Basic method

        // Clean up temp file
        fs.unlinkSync(outputPath);

        event.reply('copy-complete');
    } catch (error) {
        console.error('Error during copy:', error);
        event.reply('copy-error', error.message);
    }
}); 