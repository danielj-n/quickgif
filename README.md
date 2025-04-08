# Quickgif

A quick gif editor made with electron and FFmpeg. Can add text to a gif in a
single font with variable font size.

Made as an experiment to try out writing code via the "slop development" or
"vibe coding" method and learn about node + electron development. ~ 90% of this
code was a.i generated in [Cursor](https://www.cursor.com/) with lots of little edits
when things went wrong. Because of this may be a lot of dead code or excess
garbage laying around - the AI seems to love writing code like this.

This project was made mostly for educational purposes. PRs may be ignored if
we're lazy.

## Running:
Make sure you have Node.js and FFmpeg installed. Then from the top level directory run:

```
npm install
npm start
```

## Controls:
- Load a gif: have a .gif, .mp4, .webm, or tenor link on your clipboard when
  the program starts to load it automatically, or use `Ctrl`+`V` to paste a url in
  from your clipboard after the program starts.
- Insert text: `T` button
- Reposition text: Drag anywhere with mouse, or use arrow keys
- Resize text: `Shift`+`Up`/`Down`
- Render text onto gif: `Shift` + `Enter`, once text is typed.
- Export gif: `Ctrl` + `Enter` (this will convert the video to gif format and copy it
  to your clipboard)

## Known bugs:
- The input text escaping is awful and some ASCII characters even are still
  broken, let alone trying to get unicode to work (in particular single quotes
  are completely ignored right now). It's suspected some pathalogical inputs could
  even escape the FFmpeg command line and execute code! **DO NOT PUT EXECUTABLE
  BASH CODE INTO YOUR TEXT!** There's a chance it may execute if you're very
  unlucky.
- Exports are low quality. Getting FFmpeg to generate higher quality gifs is
  possible but a bit tricky.
- Input text and rendered text will not 100% match, but it's pretty close most
  of the time.
- There's some clipboard manager issues on linux where the gif will not end up
  on the clipboard if the program is closed even with a variety of clipboard
  managers.

## Other notes:
- There's no binary available because we never generated one
- This repo has no license because this is a deeply unserious project
- There is a shell.nix however npm requires a lot of dynamic linking which gets
  tricky on Nix. The cursor environment does some magic to find all these libraries and run this correctly from its
  command line.
- Only ever tested on arch linux X11 and Nixos wayland. Never tested on
  windows.
- Electron + FFmpeg gives a lot of headaches.
  Trying to get overlayed css+html text to match exactly with rendered text in
  FFmpeg is difficult. It probably makes more sense to use a programming language
  that supports the ffmpeg library rather than a command line for rendering,
  and gstreamer for rendering live video frames to the screen instead of using
  a webpage. This would also be a huge performance boost. There's a much better
  project than this one that does maybe all of this called [Gifcurry](https://github.com/lettier/gifcurry).

![](doc/quickgifexample.gif)
