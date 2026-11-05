# Releasing Shagun Register

The steps to go from this repository to the app on a real phone, and then on Google Play. Run the `eas` commands from `apps/mobile`.

## 1. Set up the accounts (once)

1. **Deploy the API** to Render and MongoDB Atlas, as in the [README](../README.md#deploy). Note its `https://` URL.
2. **Set up Google sign-in,** as in the [README](../README.md#google-sign-in-setup-once). Note the web client ID.
3. **Link the project to Expo:**
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```
   If `init` can't edit the config by itself, add the `extra.eas.projectId` it prints to `app.json`.
4. **Give the builds their settings.** `.env` is gitignored, so EAS never sees it. Repeat for `preview` and `production`:
   ```bash
   npx eas-cli@latest env:set --name EXPO_PUBLIC_API_URL --value https://YOUR-API.onrender.com --environment production --visibility plaintext
   npx eas-cli@latest env:set --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value YOUR-WEB-CLIENT-ID --environment production --visibility plaintext
   ```
   These end up inside the app, so they aren't secrets. Nothing secret belongs in an `EXPO_PUBLIC_` variable.

## 2. Test on a real phone

```bash
npx eas-cli@latest build --profile development --platform android
```

Install the build on the phone from the link EAS gives you, then run `npx expo start --dev-client` on a computer on the same Wi-Fi. A development build takes its JavaScript and `.env` values from that computer, so set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `apps/mobile/.env` too.

**Add the build's SHA-1 to the Android OAuth client first** (`npx eas-cli@latest credentials`), or Google sign-in fails with `DEVELOPER_ERROR`.

Then check each of these on the phone. An emulator can run most of them, but not a real camera or fingerprint sensor, and Google sign-in needs the setup above:

- [ ] **Google sign-in:** a test user signs in, signs out, and signs in again. A second Google account can be picked.
- [ ] **Card scanning:** photograph a printed card, and choose a card from the gallery, in English and in Hindi. The form fills in correctly.
- [ ] **Fingerprint and face unlock,** with App lock on: a wrong finger is refused, and too many tries fall back to the PIN.
- [ ] **Two phones at a venue:** both go offline, log gifts, and come back online. Both show every gift.
- [ ] **Ledger controls:** rename a ledger, hand it to another member, and delete it. The other phone follows.
- [ ] **Delete account:** with a Google account made for testing. It's refused while you own a shared ledger, then works, and signing in again starts empty.

### Building on this computer instead

`npx expo run:android` builds locally, from `apps/mobile`. EAS builds in the cloud, so the rest of this section doesn't affect it.

**On Windows, two paths must be short,** or the build stops with `Filename longer than 260 characters` or a Ninja `mkdir` error. The native build repeats these paths inside a folder structure that is already nearly 260 characters long:

1. **Put the repo in a very short folder such as `C:\sr`.** `C:\dev\shagun-register` is too long by 11 characters.
2. **Move CMake's working folder.** Run `npx expo prebuild --platform android`, then add this line to the end of `android/app/build.gradle`:
   ```groovy
   android { externalNativeBuild { cmake { buildStagingDirectory = file('C:/b') } } }
   ```
   `android/` is generated and gitignored, so add the line again after any `prebuild --clean`.

Find the debug SHA-1 with `cd android && gradlew signingReport`.

## 3. Build for testers, then for Google Play

| Build | Command | Result |
|---|---|---|
| For family testers | `npx eas-cli@latest build --profile preview --platform android` | An APK anyone with the link can install |
| For Google Play | `npx eas-cli@latest build --profile production --platform android` | An app bundle, with the version code raised automatically |

**Developer sign-in can't appear in either:** the app ignores `EXPO_PUBLIC_DEV_LOGIN` outside debug builds, and the API refuses `DEV_LOGIN` in production.

Upload the first bundle by hand in Play Console, because Google requires that. After that, `npx eas-cli@latest submit --profile production --platform android` sends new builds to the internal track as drafts. It needs a Google service account key.

## 4. Before publishing on Google Play

Installing only for family, through the `preview` APK, skips this section.

- [ ] **Complete the privacy policy:** replace `[DATE]`, `[DEVELOPER NAME]` and `[CONTACT EMAIL]` in [privacy-policy.md](privacy-policy.md), and have someone qualified read it. It's written from what the code does, and it isn't legal advice.
- [ ] **Publish it:** the app and Play Console link to it on GitHub, so the repository must stay public. To host it elsewhere, change `PRIVACY_POLICY_URL` in `apps/mobile/src/lib/links.ts`.
- [ ] **Add the Android OAuth client for the Play app signing key:** its SHA-1 is in Play Console under *App integrity*.
- [ ] **Publish the OAuth consent screen:** in testing mode, only listed test users can sign in.
- [ ] **Enter both links in Play Console:** the privacy policy, and for account deletion the policy's [deleting section](privacy-policy.md#deleting-your-data).

### Data safety form

Starting answers from what the code does. Check them against the form's current wording, because the answers are your responsibility.

| Data type | Collected | Why | Notes |
|---|---|---|---|
| Name, email address, user IDs | Yes | Account management, app functionality | Sign-in |
| Phone number, and other personal info such as city and relation | Yes | App functionality | About people in the ledger |
| Other financial info | Yes | App functionality | Gift amounts |
| Contacts | Yes | App functionality | Only a contact the user picks |
| App info and performance, device or other IDs | Yes | Analytics | ML Kit diagnostics, and the app's random device ID |
| Photos | No | | Read on the phone and not uploaded |

- **Shared with third parties:** no. Render, MongoDB and Google's sign-in act as service providers, and ML Kit says it doesn't pass this data to third parties.
- **Encrypted in transit:** yes, as long as `EXPO_PUBLIC_API_URL` is `https://`.
- **Users can request deletion:** yes.

## Automated checks

`.github/workflows/ci.yml` runs the typecheck and all tests on every pull request and every push to `main`. To make passing a requirement for merging, turn on branch protection for `main` in the repository's settings.
