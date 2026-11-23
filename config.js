// ─────────────────────────────────────────────────────────────
//  The P&J Wedding Shenanigans — configuration
//  1. Paste your Firebase web config below (Project settings → Your apps → Web).
//  2. Add the Google emails allowed to use the app (also put them in firestore.rules).
//  Leave apiKey as "YOUR_API_KEY" to run in local mode (data stays in this browser only).
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  firebase: {
    // ⬇ Paste these three values from Firebase → Project settings → Your apps → pj-wedding-web
    apiKey: "AIzaSyCNz-qprNCRMRMtKdPylg8ezAZekZRlc9Q",
  authDomain: "pj-wedding-shenanigans.firebaseapp.com",
  projectId: "pj-wedding-shenanigans",
  storageBucket: "pj-wedding-shenanigans.firebasestorage.app",
  messagingSenderId: "13410722420",
  appId: "1:13410722420:web:ecdfd89ae6cc4057c46721",
    // ⬇ Already filled in
    authDomain: "pj-wedding-shenanigans.firebaseapp.com",
    projectId: "pj-wedding-shenanigans",
    storageBucket: "pj-wedding-shenanigans.firebasestorage.app"
  },

  // All data lives under weddings/{weddingId}/… in Firestore
  weddingId: "pj-2026",

  // Who may sign in (lower-case). Empty array = any signed-in Google user (not recommended).
  allowedEmails: [
    "jhv2508@gmail.com", "priyalparekh2000@gmail.com"
  ],

  sides: {
    V: { name: "Vora family", short: "Vora" },
    P: { name: "Parekh family", short: "Parekh" }
  },

  // Seeded on first run. The "head" of each family carries that family's share in settlements.
  people: [
    { id: "hv", name: "HV", side: "V", head: true },
    { id: "jay", name: "Jay", side: "V" },
    { id: "hp", name: "HP", side: "P", head: true },
    { id: "priyal", name: "Priyal", side: "P" }
  ],

  // Suggestions for the "Function" field (you can type anything else too)
  functions: [
    "Roka", "Engagement", "Gol Dhana", "Mehendi", "Haldi", "Sangeet",
    "Wedding", "Reception", "Venue", "Catering", "Decor", "Photography",
    "Shopping", "Travel & Stay", "Gifts", "Other"
  ]
};
