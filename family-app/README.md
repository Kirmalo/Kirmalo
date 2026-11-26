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

**Host it first** (free). One option is GitHub Pages: repo Settings → Pages → deploy from the branch that contains this folder. The app will then be at `https://<username>.github.io/<repo>/family-app/`. Only the code is public. Family photos and voices never leave the tablet.

### Amazon Fire tablet (our target)

Fire tablets run Fire OS: no Chrome, no Google Play, no Family Link. Lock-down is done with an **Amazon Kids** child profile, managed from the Parent Dashboard (parents.amazon.com). Two ways to get this app into the child profile:

**A. Approved website (try first, no install).**
1. In Parent Dashboard → the child's profile → Settings → **Fire Tablet Web Browser**, turn the web browser on and add the app's address as an approved website.
2. On the tablet, in the child profile, open the app in the kids' browser. Add the family through grown-up settings, **inside the child profile**. Browser storage is separate per profile, so people added in the adult profile's Silk browser won't show up here.
3. **Check:** does **● Record** work there? The kids' browser may block the microphone or the file picker. If it does, use option B.

**B. Tablet app (APK).** Wrap the same files in a small Android app. The Fire allows "Apps from unknown sources", but Amazon Kids won't list a sideloaded app. It has to be added to the child profile once from a computer over USB, with `adb shell pm install-existing --user <child-user-id> <package>`. Not built yet.

### Regular Android tablet

1. Open the address in **Chrome** → ⋮ → **Install app**.
2. Add the family, then **Save backup file**.
3. Turn on **App pinning** (Settings → Security) and set limits in **Google Family Link**.

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
