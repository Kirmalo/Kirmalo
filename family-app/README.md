# My Family: a toddler photo board

A simple tablet app for a 2-year-old. The screen shows big round photos of family members. Tap a face and it fills the screen while that person's **own recorded voice** plays ("Hi sweetie! It's Grandma! I love you!").

- No ads, no links, no text to read, and no "wrong" answers.
- After a set play time (15 minutes by default) it shows an **"All done! Bye-bye!"** screen.
- **Private by design:** photos and voices are stored only on the tablet (in the browser's IndexedDB). Nothing is uploaded. This code contains no personal data. The child's name is entered on the device.
- Works offline once it's installed.

## Using it

| What | How |
|---|---|
| Open grown-up settings | Press and hold the **top-left corner** for 2 seconds, then answer the math question. |
| Add a person | Settings → **+ Add a person** → name, choose a photo, tap **● Record** and speak (up to 10 s). |
| Reorder people | ↑ / ↓ buttons in settings. |
| Child's name, play-time limit | Settings card. |
| Back up | **Save backup file** downloads a `.json` with all photos and voices. **Restore from backup** loads it on any device. |

If someone has no recording, a computer voice says "This is ___!" instead.

## Putting it on the tablet

The app has to be served from an `https://` address. Browsers only allow microphone recording and offline install on secure sites. Opening the HTML file directly won't let you record.

1. **Host it** (free). One option is GitHub Pages: repo Settings → Pages → deploy from the branch that contains this folder. The app will then be at `https://<username>.github.io/<repo>/family-app/`. Only the code is public. Family photos and voices never leave the tablet.
2. On the tablet, open that address in **Chrome** and choose ⋮ → **Add to Home screen / Install app**.
3. Open it from the home-screen icon. Add the family in grown-up settings, then press **Save backup file**.
4. Lock it down:
   - **App pinning:** Android Settings → Security → App pinning. Open the app, then pin it from the recent-apps view. Unpinning needs your PIN.
   - **Google Family Link:** set a daily limit and approve only the apps you want.

## Trying it on a computer

```bash
cd family-app
python3 -m http.server 8000
# open http://localhost:8000  (localhost counts as secure, so recording works)
```

## Files

- `index.html`: the screens (play, goodbye, grown-up gate, settings, editor)
- `styles.css`: the look (big touch targets, warm colors)
- `app.js`: all logic: storage, tap-to-play, recording, session timer, backup
- `sw.js`: offline caching. **Bump `CACHE` (e.g. `family-app-v2`) when you change files**, so tablets pick up the update.
- `manifest.webmanifest`, `icons/`: install-to-home-screen settings

## Ideas for next modules

1. First words and animals: real photos, your voice saying the word and the sound.
2. Colors, shapes, counting to 3.
3. Daily routine cards (bath → pajamas → books → bed).
4. Ages 3–5: letters, finger/stylus tracing, a daily "today's activities" list with stars, and a parent progress view.
