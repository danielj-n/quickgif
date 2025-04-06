A quick gif editor made with electron and ffmpeg. Can add text to a gif in a
single font with variable font size.

Made as an experiment to try out writing code via the "slop development" or
"vibe coding" method and learn about node + electron development. ~ 90% of this
code was a.i generated in Cursor (TODO: link cursor) with lots of little edits
when things went wrong. Because of this may be a lot of dead code or excess
garbage laying around - the ai has a taste for these specific styles of
spaghetti. 

This project was made mostly for educational purposes. PRs may be ignored if
we're lazy.

Controls:
- Load a gif: have a .gif, .mp4, .webm, or tenor link on your clipboard when
  the program starts to load it automatically, or control+v to paste a url in
  from your clipboard after the program starts.
- Insert text: 't' button
- Reposition text: Drag anywhere with mouse, or use arrow keys
- Resize text: Shift up and down
- Render text onto gif: shift + enter, once text is typed.
- Export gif: control + enter, this will convert the video to gif and copy it
  to clipboard.

Known bugs:
- The input text escaping is awful and some ascii characters even are still
  broken, let alone trying to get unicode to work (in particular single quotes
  are completely ignored right now). It's suspected some perverse inputs could
  even escape the ffmpeg command line and execute code! **DO NOT PUT EXECUTABLE
  BASH CODE INTO YOUR TEXT!** There's a chance it may execute if you're very
  unlucky.
- Exports are low quality. Getting ffmpeg to generate higher quality gifs is
  possible but tricky for some reason involving specifics of how gifs are
  encoded.
- Input text and rendered text will not 100% match, but it's pretty close most
  of the time.
- There's some clipboard manager issues on linux where the gif will not end up
  on the clipboard if the program is closed even with a variety of clipboard
  managers.

Other notes:
- We never generated a binary for this, no idea how to generate an electron
  binary on linux lmao.
- There is a shell.nix however npm requires a lot of dynamic linking which gets
  tricky on nix. The cursor environment does some magic we still don't
  understand to find all these libraries and run this correctly from its
  command line. This is probably inherited from vscode. Never managed to get
  this to run outside the cursor environment.
- Only ever tested on arch linux X11 and nixos wayland. Never tested on
  windows.
- Electron + ffmpeg gives a lot of headaches. Part of this is the NPM libraries
  we could find to use ffmpeg with node actually just run ffmpeg through a
  hidden command line. This causes a lot of issues with string conversion.
  Trying to get overlayed css+html text to match exactly with rendered text in
  ffmpeg is also difficult due to cryptic text padding and required some nasty
  hard coded offsets in the code that were derived experimentally and are still
  far from perfect. It probably makes more sense to use a programming language
  that supports the ffmpeg library rather than a command line for rendering,
  and gstreamer for rendering live video frames to the screen instead of using
  a webpage. This would also be a huge performance boost. There's a much better
  project than this one that does maybe all of this called TODO, check it out.

Examples:
TODO
