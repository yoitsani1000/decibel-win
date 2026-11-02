# Decibel for Windows

A desktop version of Decibel that uses the same music folder as the iPhone app. Copy the folder between the two and everything comes along: songs, artwork, albums, playlists, likes, covers and the accent color.

## Run it

1. Install Node.js (LTS) from nodejs.org if you don't have it.
2. Open a terminal in this folder and run:
   ```
   npm install
   npm start
   ```
3. To make a proper installer instead: `npm run dist`. The installer lands in `dist/`.

## The music folder

On first launch Decibel creates `Documents\Decibel` with this layout, which matches the iPhone app's Documents folder exactly:

```
Decibel\
  Songs\               audio files
  Artwork\             song art and playlist covers
  Inbox\               drop zone
  tracks_metadata.json
  playlists.json
  skin_settings.json
  library_settings.json
```

Use "Open music folder" in the sidebar to see it. "Change music folder" points the app at a different folder, for example one on a USB drive.

## Moving between PC and iPhone

PC to iPhone: with the phone plugged in, open iTunes (Apple's version), choose the phone, then File Sharing, then Decibel. Drag the contents of the Decibel folder in and replace when asked. Open the app on the phone.

iPhone to PC: drag everything out of the same File Sharing list into the Decibel folder. Focus the Decibel window and it reloads on its own.

Things to know:
- Copying replaces the other side's data. Whichever side you copy last wins, so do your edits on one device between copies.
- Song files themselves are never lost by a copy. The two JSON files hold the details.
- If the JSON lists a song whose file isn't in the folder yet, Decibel hides it and keeps the entry, so a half finished copy doesn't wipe anything.

## Importing

- Drag audio files onto the window, or click Import.
- Name files `Artist - Title - Album.mp3` (or `Artist - Title.mp3`) to fill in the details.
- Add a picture with the same name (`Artist - Title - Album.jpg`) in the same drop to attach artwork. A picture dropped later attaches to a song with a matching name, title or "Artist - Title".
- Loose files in the main folder or `Inbox` are picked up and tidied into `Songs` and `Artwork` when the window gains focus.
- Only mp3, m4a, aac, wav, flac, aiff, aif and caf are accepted so everything also plays on the iPhone.

## Using it

The layout copies the iPhone app: Your Library with Songs and Downloaded chips, search, a sort row, the Liked Songs and Add songs tiles, a mini player above a Songs and Playlists tab bar, and a Now Playing sheet.

- Click a song to play it. Click the three dots (or right-click) for Play next, Add to queue, Add to playlist, Edit details, Choose artwork and Remove.
- Click the mini player to open Now Playing. The list button at the bottom right opens the queue: drag to reorder, click to jump, Shuffle next or Clear.
- Playlists tab: New playlist, then open one and use Reorder to drag songs into place (the sort switches to Custom order). The three dots at the top of a playlist rename it, change its cover or delete it.
- The palette button changes the accent color, and it is saved to `skin_settings.json` for the iPhone app too.
- Media keys (play/pause, next, previous) work even when the window is in the background. Space toggles play when you aren't typing.
