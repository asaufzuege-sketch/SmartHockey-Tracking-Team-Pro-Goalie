# Capacitor Setup Guide – SmartHockey Team Tracker Pro

## Prerequisites
- Node.js (v16+): https://nodejs.org
- Android Studio: https://developer.android.com/studio
- Java JDK 17+

## Initial Setup
1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/asaufzuege-sketch/SmartHockey-Tracking-Team-Pro.git
   cd SmartHockey-Tracking-Team-Pro
   npm install
   ```

2. Add Android platform & sync:
   ```bash
   npx cap add android
   npx cap sync android
   ```

3. Open in Android Studio:
   ```bash
   npx cap open android
   ```

## Building the Release AAB
1. In Android Studio: Build → Generate Signed Bundle / APK
2. Select "Android App Bundle"
3. Sign with your existing keystore
4. Build as Release
5. Upload the `.aab` to Google Play Console

## Google Play Console – Subscription Setup
After uploading the new `.aab` with billing permission:
1. Go to: Monetize → Products → Subscriptions
2. Click "Create subscription"
3. Product ID: `pro_yearly_subscription`
4. Name: SmartHockey Pro – Yearly Subscription
5. Add base plan: Yearly, $5.00/year
6. Set status to Active

## Important Notes
- The app still works as a PWA on GitHub Pages (billing is skipped in browser)
- The billing.js module detects native vs browser automatically
- Use the same keystore as your existing TWA to maintain the same signing key
- Package name must remain: `io.github.asaufzuege_sketch.twa`
