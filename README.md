# The P&J Wedding Shenanigans 💍

A warm, mobile-first Splitwise for two families. Anyone on the guest list logs what they paid; the app works out each family's fair share and the fewest transfers needed to square up.

## How the split works

Every expense has a **payer** (a person, who belongs to a family) and a **split**:

| Split | Who bears it |
|---|---|
| **Shared** | Both families. 50:50 by default; slide to any ratio (e.g. 60:40) per expense |
| **Vora only** | 100% Vora family (e.g. groom's-side outfits). Still shows in total spend |
| **Parekh only** | 100% Parekh family |

- **Paid**: what a family's members actually paid.
- **Fair share**: what that family should bear. This is also the family's true overall wedding spend.
- **Balance** = Paid − Fair share ± payments recorded. Positive means the family gets money back.

**Settle up** has two modes:
- **Between families**: one transfer, head to head (e.g. HP → HV ₹5,000).
- **Person to person**: the fewest transfers between individuals. Each family's share sits with its *family head*, so if Jay paid for something shared, HV pays Jay back his part.

Tap **Mark paid** on a suggested transfer to record it. Balances update for everyone live.

## Run it locally (no setup)

Leave `config.js` as is and serve the folder:

```bash
npx serve .        # or: python3 -m http.server 8080
```

It runs in **Local mode**: data is saved in that browser only. Good for trying it out.

## Connect Firebase (live sync between phones)

1. **Create a project** at [console.firebase.google.com](https://console.firebase.google.com). Analytics is optional.
2. **Firestore**: Build → Firestore Database → Create database (production mode; region `asia-south1` for Mumbai).
3. **Auth**: Build → Authentication → Sign-in method → enable **Google**.
4. **Web app**: Project settings → Your apps → `</>` → register it, then copy the config object into `config.js` → `firebase`.
5. **Guest list**: put your and Priyal's Google emails in **both** `config.js → allowedEmails` and `firestore.rules`.
6. **Rules**: paste `firestore.rules` into Firestore → Rules → Publish, or run `firebase deploy --only firestore:rules`.
7. **Authorized domain**: Authentication → Settings → Authorized domains → add `<your-username>.github.io`.

The Firebase web `apiKey` is safe to commit. Access is enforced by the Firestore rules, not by hiding the key.

## Deploy on GitHub Pages

```bash
git init && git add . && git commit -m "The P&J Wedding Shenanigans"
git branch -M main
git remote add origin https://github.com/<you>/pj-wedding-shenanigans.git
git push -u origin main
```

Then go to Repo → Settings → Pages → Source: *Deploy from a branch* → `main` / root. Your app will be at `https://<you>.github.io/pj-wedding-shenanigans/`.

On your phone, open it and choose **Add to Home Screen** for an app-like icon.

## Files

```
index.html            app shell
styles.css            warm modern theme
app.js                logic, settlement maths, Firebase/local storage
config.js             ← your settings (Firebase, emails, families, members, functions)
firestore.rules       security rules (guest list)
manifest.webmanifest  home-screen install
icon.svg              P&J monogram
```

## Customising

- **Families and members**: edit `config.js → sides` and `people` before first run. After that, manage members in the **Family** tab.
- **Functions list**: `config.js → functions` (Roka, Gol Dhana, Mehendi, Sangeet…). You can also type any new one.
- **Export**: Family → Export to CSV gives every expense with each family's share, plus payments. It opens cleanly in Excel or Google Sheets.

Firestore data layout: `weddings/{weddingId}/people | expenses | payments`.
