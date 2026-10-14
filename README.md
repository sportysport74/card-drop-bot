# Card Drop Watcher - Setup Guide

Watches card pages for you. When something goes live it:

1. Sounds a siren on your PC and buzzes your phone.
2. With **Auto-cart** on: adds 1 to your cart and goes through checkout by itself.
3. Stops at the final **Pay now / Place Order** button for you to click.
   With **Full Auto-Buy** on, it clicks that button for you, but only if the price, item and
   quantity checks pass.

Setup takes about 20 minutes. Do Steps 1-6 in order.

---

## STEP 1 - Install the extension (5 min, once per PC)

You do **not** need a GitHub account, Git, or any coding. You just download a ZIP file.

### 1A. Download it

1. On the PC, open Chrome and go to this link:
   **https://github.com/sportysport74/card-drop-bot/archive/refs/heads/main.zip**
2. A file called **`card-drop-bot-main.zip`** downloads. (No download? Click the down-arrow
   icon at the top right of Chrome and check it there.)

   *Other way to get the same file:* go to https://github.com/sportysport74/card-drop-bot,
   click the green **`<> Code`** button, then **Download ZIP**.

### 1B. Unzip it and put it somewhere safe

1. Open **File Explorer** (the yellow folder icon on the taskbar) and click **Downloads** on the left.
2. **Right-click** `card-drop-bot-main.zip` > **Extract All...** > **Extract**.
   (Don't just double-click the ZIP and use it from there. That won't work. It must be extracted.)
3. A new folder called **`card-drop-bot-main`** opens. Drag that folder into **Documents**
   (on the left side of File Explorer).
4. **Never delete or move this folder.** Chrome runs the bot from it. If it's gone, the bot is gone.

> ⚠️ **Folder-inside-a-folder trap:** Windows often makes `card-drop-bot-main` **inside another**
> `card-drop-bot-main`. That's normal. Just keep opening folders until you see one called
> **`extension`** next to a file called **`README.md`**. The `extension` folder is the one you want.

### 1C. Put it in Chrome

1. Click Chrome's address bar (where you type websites), type **`chrome://extensions`**, press **Enter**.
2. Top right corner: flip the **Developer mode** switch **ON** (it turns blue).
   Three new buttons appear on the top left.
3. Click **Load unpacked** (top left).
4. A folder picker opens. Go to **Documents** > **card-drop-bot-main** (> **card-drop-bot-main**
   again if it's there) > click **once** on the **`extension`** folder so it's highlighted.
5. Click **Select Folder**.
6. A box called **Card Drop Watcher** now shows on the page. ✅ Installed.

**Got an error instead?**
- *"Manifest file is missing or unreadable"*: you picked the wrong folder. Click **Load unpacked**
  again and pick the folder named exactly **`extension`** (the one that has `manifest.json` inside it).
- *A red **Errors** button on the box*: you can ignore it if the extension still works. If it doesn't,
  click the **reload arrow** (↻) on the box.
- *No **Load unpacked** button*: Developer mode isn't on. Flip the switch top right.

### 1D. Pin the icon so you can see it

1. At the top right of Chrome, click the **puzzle-piece** icon 🧩.
2. Next to **Card Drop Watcher**, click the **pin** 📌.
3. A **red icon** now sits next to the address bar. That's the bot. Click it any time to open it.

### Getting updates later

When there's a new version:
1. Delete the old `card-drop-bot-main` folder in Documents.
2. Do **1A** and **1B** again (download the ZIP, extract, put it in Documents in the same place).
3. Go to `chrome://extensions` and click the **reload arrow** (↻) on Card Drop Watcher.

Your watches and settings are kept, as long as you **don't click "Remove"** on the extension.

*(If you know Git: `git clone https://github.com/sportysport74/card-drop-bot.git`, then
`git pull` to update and click the reload arrow.)*

### More than one PC?

Do Step 1 on each PC. Each PC gets its own phone-alert topic, so subscribe to each PC's topic
in the ntfy app (Step 2), and do Step 3 (sign in to stores) in Chrome on each PC.

**Run it on only one PC per store if Full Auto-Buy is on.** Each PC has its own
"bought once" lock, so two PCs watching the same product could each buy one.

## Phone

The extension can't run on a phone: Chrome on Android and iPhone doesn't support extensions.
Your phone's job is getting the alerts (Step 2). When one comes in, tap it to open the page
on your phone and buy there if you're away from the PC. You'll need to be signed in to the
store in your phone's browser too.

---

## STEP 2 - Phone alerts (5 min, once)

1. On your phone, install the free app **ntfy** (Play Store or App Store).
2. On your PC, click the red extension icon, then **Settings & phone alerts**.
   Copy the **ntfy topic** (it looks like `card-drops-1a2b3c4d5e6f`).
3. In the ntfy app tap **+**, paste that topic exactly, and tap **Subscribe**.
4. Back on the PC, click **Send test alert**. Your phone should buzz and your PC should play a siren.
5. So alerts get through on silent / Do Not Disturb:
   - **Android:** long-press the test notification > settings > allow it to **override Do Not Disturb**.
   - **iPhone:** Settings > Focus > (each Focus you use) > Apps > add **ntfy**.

---

## STEP 3 - Payment and store accounts (10 min, once per store)

### Where your card goes

**Your card does NOT go into the extension.** There is no card field in it, on purpose.
The extension never sees, stores or types your card number.

It pays with whatever is **saved in your account on each store's own website**. When it reaches
checkout, the store has already filled in your saved address and card, and the bot just clicks
the buttons. So you save your card **once on each store**, in this same Chrome.

### Do this on every store you'll buy from

1. **Sign in** to the store in this Chrome. Tick **"Remember me" / "Keep me signed in"** if offered.
2. Save your **shipping address** as the default.
3. Save your **payment** as the default, using the table below.
4. **Do one real checkout by hand** (any cheap item, or go up to the last page and stop) to make
   sure your address and card show up **already filled in**. If checkout makes you type anything
   (card, security code, address), the bot can't finish there.

| Store | Where to save payment |
|---|---|
| **Topps.com** and other **Shopify** stores (shown as "(fast cart)" in the popup) | Set up **Shop Pay**. At checkout, enter your card once and tick **"Save my information for a faster checkout"**. Shop Pay remembers your card and address for every Shopify store. |
| **Fanatics, Dave & Adam's, Blowout, Steel City** and other stores | Your account page on that site, under **Payment methods / Wallet / Saved cards**. Add your card and make it the **default**. |

### Which payment methods work

| Method | Works with the bot? |
|---|---|
| **Card saved in the store account** | ✅ Best. Use this. |
| **Shop Pay** (Shopify stores like Topps) | ✅ Works. But if Shop Pay **texts you a 6-digit code**, the bot stops and you type the code. Check "Remember me" on Shop Pay to get fewer codes. |
| **PayPal** | ❌ No. PayPal opens its own login window, and an extension can't (and shouldn't) log into PayPal for you. **Don't make PayPal your default.** If a store only offers PayPal, you'll finish by hand. |
| **Apple Pay / Google Pay** | ❌ No. They need your fingerprint, face or tap on your phone. |
| **Chrome's saved cards** (chrome://settings/payments) | ❌ Not on their own. Chrome only fills them in when you click. Save the card **in the store account** instead. |

### Make your card safer for a bot (recommended)

- Use a **credit card**, not a debit card: better fraud protection and disputes, and it's not your
  bank balance.
- Even better, use a **virtual card number with a spending limit** (many banks offer these, e.g.
  Capital One Eno, Citi virtual numbers, or the Privacy.com service). Set the limit a bit above
  one box. Then even a mistake can't charge more than that.
- Turn on **purchase alerts** in your bank app so you see every charge right away.

---

## STEP 4 - Add the products to watch

**A product page (best):**
1. Go to the product page (for example the Topps Chrome Sapphire Basketball page).
2. Click the red extension icon. The name and URL fill in by themselves.
3. **Check the Name.** Keep it short and exact, like `Topps Chrome Sapphire Basketball`.
   Full Auto-Buy only buys if every word of this name is on the checkout page.
4. If you know the drop date and time, fill in **Drop time**. **Always do this when you know it.**
   Around the drop time the bot checks much faster (see "What happens on drop day").
5. Click **Watch product page**.
6. In the list, click **Auto-cart: off** so it turns green and says **ON**.

**Is it a raffle? (Topps EQL drops)**
Some hyped Topps drops (Sapphire, Bowman Chrome, Inception...) are a **raffle (EQL)**, not first-come
first-served. The product page or Topps' announcement will say "raffle", "EQL" or "enter for a chance".
For those, click **Raffle: off** in the list so it says **ON**. Then the bot:
- only alerts you (siren + phone) when entry opens: **no auto-cart**,
- does **not** speed up at drop time. Speed doesn't help in a raffle, and bot-like activity can
  get your entry thrown out,
- reminds you 5 minutes before so you can enter by hand.

**A search or "new arrivals" page (catches products before they have a page):**
1. Go to the store's search results or new-releases page.
2. Click the extension, then **Watch for new listings**.
3. You get an alert when any of your 7 products shows up. Breaks, singles and graded cards are ignored.
   (These only alert you. They don't cart or buy.)

Repeat for each store and product.

---

## STEP 5 - Full Auto-Buy (optional, off by default)

Skip this step if you want to click the final button yourself.

1. Click the extension > **Settings & phone alerts**.
2. Tick **Full Auto-Buy** and click **OK** on the warning.
3. In **Don't buy if the total is over ($)**, enter a little more than **one box with shipping and tax**.
   Example: a $250 box: enter `300`. **Never enter a case price.**
4. Click **Save**.

At the final button it clicks **only if ALL of these pass**:

| Check | If it fails |
|---|---|
| Total (with shipping and tax) is at or under your limit | Siren + **"PRICE OVER LIMIT - did NOT buy"** |
| Every word of the watch's name is in the order summary | Stops, you click |
| Summary doesn't say **break**, **case**, **pack** or **spot** (unless your name does) | Stops, you click |
| Exactly **1 item, quantity 1** | Stops, you click |
| No CAPTCHA, waiting room, purchase limit or code request | Stops, you finish |
| Total didn't change in the last second | Stops, you click |

If anything fails or it can't read the page, **it doesn't click**. You get "ONE CLICK LEFT" with the reason.

**One purchase per watch.** Right before clicking, it marks that watch as bought, turns its
Auto-cart off and pauses it, so a page hang or refresh can never buy twice.
To buy that product again, turn its **Auto-cart** back on.

### Safe test run (does NOT buy)

1. Settings: Full Auto-Buy ON, limit **`1`** (one dollar), **Save**.
2. Find any cheap item that's **in stock right now** on a store you set up. Watch it, and turn its Auto-cart ON.
3. Within a minute it should open checkout, go to the last page, and alert
   **"PRICE OVER LIMIT - did NOT buy"**. That means carting, checkout and reading the total all work.
4. **Remove** that test watch, and set your real limit again.

If it says "Take over checkout" or "Couldn't read..." instead, that store needs attention.
See Troubleshooting.

---

## STEP 6 - Leave it running

- Keep **Chrome open** (it can be minimized). Your PC must be **on and not asleep**
  (Windows Settings > System > Power > Sleep: **Never** while plugged in).
- It checks each page every 45-90 seconds on its own, and much faster around a drop time you set.

| Status in the popup | Meaning |
|---|---|
| **IN STOCK** (green) | Live right now. Go! |
| **Not available** | Sold out or coming soon. Still watching. |
| **Can't tell** | Couldn't read the page. It switches to tab mode on its own. |
| **Blocked** / **Slowed down** | The store pushed back. It waits longer, then tries again. |
| **(fast cart)** next to the store | Shopify store: fastest checkout. |
| **Auto-bought ... for $...** | Full Auto-Buy placed an order on this watch. |

---

## What happens on drop day

1. **10 min before** a drop time you set: it checks you're signed in on that store.
   If not, you get a loud alert and the sign-in page opens. **Sign in right away.**
2. **5 min before**: siren, phone push, and the page opens. Be at your computer if you can.
   On Topps waiting-room drops, **join the line now, before the start time, and don't refresh.**
   Everyone who's in line before the start gets shuffled fairly. Showing up late puts you at the back.
3. **It speeds up** (not for Raffle watches):

   | Time | How often it checks | Popup shows |
   |---|---|---|
   | Until 2 min before | every 45-90 s (normal) | `Drops in ...` |
   | 2 min to 15 s before | every 10-15 s | `WARM` |
   | 15 s before to 60 s after | every 3-5 s | `STRIKE` |
   | After that, or once it's in stock | back to normal | |

   If the store says **"too many requests"** or shows a **bot check**, it backs off right away,
   even mid-drop. Hammering would only get you blocked at the worst moment.
4. **When it goes live** (Auto-cart ON): it adds 1 to your cart and goes through checkout. Then:

| Alert you get | What to do |
|---|---|
| **ONE CLICK LEFT** | Check the item and price, click the red-outlined **Pay now / Place Order**. |
| **ORDER PLACED: ...** | Auto-Buy bought it. Check your email for the store's confirmation. |
| **ENTER THE CODE** | Shop Pay texted you a code. Type it in that tab. |
| **CHECK THE ORDER** | Auto-Buy clicked but saw no thank-you page. Look at the tab and your email. |
| **PRICE OVER LIMIT** | Didn't buy. Look at the price yourself and decide. |
| **Take over checkout NOW** | Hit a CAPTCHA, waiting room, limit or unknown page. Finish by hand in that tab. |

---

## Buttons in the popup

| Button | What it does |
|---|---|
| **Check now** | Checks that page immediately. |
| **Pause / Resume** | Stops or restarts that one watch. |
| **Mode: fetch / tab** | Fetch is light, in the background. Tab reloads a pinned tab for pages that need it. Switches by itself. |
| **Raffle** | ON = Topps EQL / raffle drop. Alert only: no auto-cart, no speed-up at drop time. |
| **Auto-cart** | ON = carts and goes through checkout when it goes live. Hidden while Raffle is ON. |
| **Check sign-in** | Checks right now that you're signed in on that store. |
| **Remove** | Stops watching that page. |
| **Pause all** (top) | Stops everything, for example overnight. |

**Settings:** ntfy topic, check interval (45-90 s by default, minimum 30), siren on/off,
open page in front on/off, use Shop Pay on/off, Full Auto-Buy on/off, max price.

---

## Troubleshooting

- **Phone didn't buzz:** the ntfy topic must match exactly. Try **Send test alert** again.
- **No siren:** Settings > "Play siren on this PC" is ticked, and PC volume is up.
- **A watch stays "Blocked":** open that page yourself and complete any "verify you are human" check.
- **Checkout asks for card details / security code:** your card isn't saved as the default on that
  store, or the store always asks for the code. Redo Step 3 for that store. Auto-Buy can't type it.
- **"Doesn't mention ..." in an alert:** the watch name has a word the checkout doesn't show.
  Remove it and add the watch again with a shorter name (e.g. drop "2025" or "Hobby Box").
- **"Couldn't read the quantity / total":** that store's checkout layout isn't understood yet.
  Send Claude a screenshot or the page, and it can be added.
- **"Take over checkout" every time on one store:** send Claude that store's checkout page.
- **Change the product list:** edit `extension\presets.js`, then on `chrome://extensions`
  click the reload arrow on Card Drop Watcher.
- **After any update to the files:** click the reload arrow on `chrome://extensions`.

---

## Good to know

- Your card info stays with each store. The extension never sees it.
- It never clicks the final buy button unless Full Auto-Buy is on and every check passes.
- On raffle (EQL) drops, mark the watch **Raffle**. The bot just tells you when to enter.
- It doesn't get around CAPTCHAs, waiting rooms, verification codes or "1 per customer" limits.
  When it hits one, it hands control to you.
- PayPal, Apple Pay and Google Pay can't be used by the bot. Use a card saved in the store account.
