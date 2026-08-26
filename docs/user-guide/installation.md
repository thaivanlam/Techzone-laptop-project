# Installation Guide

How to get TechZone running on a computer, for someone who is not going to
change the code. Follow it top to bottom; it takes about twenty minutes, most of
which is waiting.

Developers setting up a working environment want
[../development/developer-guide.md](../development/developer-guide.md) instead.
Every startup mode and every setting is in
[../operations/running-locally.md](../operations/running-locally.md).

---

## Table of Contents

1. [What You Need](#1-what-you-need)
2. [Step 1 — Get the Files](#2-step-1--get-the-files)
3. [Step 2 — Get the Keys](#3-step-2--get-the-keys)
4. [Step 3 — Fill In the Settings](#4-step-3--fill-in-the-settings)
5. [Step 4 — Start It](#5-step-4--start-it)
6. [Step 5 — Load Demonstration Products](#6-step-5--load-demonstration-products)
7. [Step 6 — Check It Works](#7-step-6--check-it-works)
8. [Signing In the First Time](#8-signing-in-the-first-time)
9. [Stopping, Starting and Removing](#9-stopping-starting-and-removing)
10. [If Something Goes Wrong](#10-if-something-goes-wrong)

---

## 1. What You Need

| Requirement | Detail |
|---|---|
| **A computer** | Windows, macOS or Linux, with about 8 GB of memory free |
| **Docker Desktop** | Version 2.20 or newer. This is the only software you must install |
| **Git** | To download the project |
| **Disk space** | Roughly 5 GB for the images |
| **Internet** | For the first build only |

Nothing else. Java, Node.js, MySQL and RabbitMQ all run inside Docker — do not
install them yourself.

> **Where you should run this.** On your own machine, or a private network.
> This is a demonstration platform with known security weaknesses (listed in
> [admin-guide.md](admin-guide.md#9-security-you-need-to-know-about)). Do not
> put it on the public internet, and do not put real customer or payment data
> into it.

---

## 2. Step 1 — Get the Files

Open a terminal and run:

```bash
git clone --recurse-submodules <repository-url>
cd Techzone-laptop-project
```

`--recurse-submodules` matters: the project is three repositories in one, and
without it you get an empty `backend/` and `frontend/`. If you already cloned
without it:

```bash
git submodule update --init --recursive
```

---

## 3. Step 2 — Get the Keys

Two external services need credentials. Both are free.

### Stripe test keys — for the checkout

1. Create an account at <https://stripe.com> and stay in **Test mode** (the
   toggle in the dashboard).
2. Go to **Developers → API keys**.
3. Copy two values:
   - the **Publishable key**, starting `pk_test_`
   - the **Secret key**, starting `sk_test_`

Test keys move no money. Never use live keys here.

### Gmail app password — for confirmation emails

1. The Google account must have 2-Step Verification switched on.
2. Go to <https://myaccount.google.com/apppasswords> and create an app password.
3. Copy the 16-character value.

This is **not** the account's own password. If you skip this step everything
works except email.

---

## 4. Step 3 — Fill In the Settings

In the project folder there is a file called `.env.example`. Make a copy of it
named `.env`:

```bash
cp .env.example .env
```

Open `.env` in a text editor and fill in three lines:

```env
STRIPE_SECRET_KEY=sk_test_...your secret key...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...your publishable key...
MAIL_PASSWORD=...your 16-character Gmail app password...
```

Leave everything else as it is, with one possible exception:

> **If you already run MySQL on this computer**, the start will fail with
> *"address already in use"* on port 3306. Change one line:
> ```env
> MYSQL_PORT=3307
> ```

Save and close the file. **Never share `.env` or commit it to git** — it holds
your keys.

---

## 5. Step 4 — Start It

```bash
docker compose up --build
```

The first run compiles seven Java services and builds the web application, so
expect **five to fifteen minutes**. Later starts take under a minute.

You will see a lot of log output. That is normal. Wait until it settles and no
container is restarting.

To run it in the background instead, add `-d`:

```bash
docker compose up -d --build
```

Check what is running:

```bash
docker compose ps
```

Every container should say `running`, and most should say `healthy`.

---

## 6. Step 5 — Load Demonstration Products

**A freshly installed shop is empty.** With no products, the catalogue currently
shows an error rather than an empty page, which looks like a broken
installation. Load the demonstration catalogue — 14 laptops in 4 categories:

```bash
COMPOSE_PROFILES=prod,seed docker compose up -d
docker compose logs -f db-seed
```

Wait for the seeder to report that it has finished, then press `Ctrl+C` to stop
watching the log. It is safe to leave the setting on: if the catalogue already
has products, the seeder skips itself.

Details are in
[../operations/database-seeding.md](../operations/database-seeding.md).

---

## 7. Step 6 — Check It Works

Six checks, in order. If one fails, stop there and see
[§10](#10-if-something-goes-wrong).

| # | Check | Where | Expected |
|---|---|---|---|
| 1 | The shop loads | <http://localhost:5173> | The home page appears |
| 2 | Products are listed | Click **Products** | Laptops appear with prices and images |
| 3 | Filters work | Tick a brand | The list narrows |
| 4 | Sign-in works | Sign in as the demo administrator | You land in the management panel |
| 5 | Ordering works | Sign in as a customer, add a laptop, check out with card `4242 4242 4242 4242` | A confirmation page, and the order under *My Orders* |
| 6 | Products can be created | As the seller account, create a product in the panel | It saves without an error |

Check 6 catches the one failure the others miss: if the seeder did not finish
properly, saving a new product fails on a duplicate id while everything else
looks fine.

There are also two engine-room pages, useful only for diagnosis:

- <http://localhost:8761> — every service should be listed
- <http://localhost:15672> — the message broker (`guest` / `guest`)

---

## 8. Signing In the First Time

A fresh installation creates four demonstration accounts. Their usernames,
passwords and roles are listed in
[../operations/running-locally.md](../operations/running-locally.md#seeded-users).

They are **development credentials, published in the documentation**. Before
anyone else can reach this installation, delete them or change what they can do.

Then read the guide for your role:

- Buying → [customer-guide.md](customer-guide.md)
- Listing products → [seller-guide.md](seller-guide.md)
- Running the shop → [admin-guide.md](admin-guide.md)

---

## 9. Stopping, Starting and Removing

| Task | Command |
|---|---|
| Stop, keeping all data | `docker compose stop` |
| Start again | `docker compose start` |
| Stop and remove the containers, keeping data | `docker compose down` |
| **Erase everything, including all products, accounts and orders** | `docker compose down -v` |
| See what is running | `docker compose ps` |
| Read one service's log | `docker compose logs -f order-service` |
| Apply an updated `.env` | `docker compose up -d --build` |

`docker compose down -v` deletes the database volume and cannot be undone. It is
also the correct way to start completely fresh when an installation has got into
a confusing state.

---

## 10. If Something Goes Wrong

The most common problems and their fixes:

| What you see | Fix |
|---|---|
| `address already in use` on 3306 | Another MySQL is running — set `MYSQL_PORT=3307` in `.env` and start again |
| `include is not a valid compose key` | Docker Compose is older than 2.20 — update Docker Desktop |
| The page loads but nothing works, errors mention 502 | The services are still starting. Wait a minute, then `docker compose ps` |
| The shop shows an error instead of products | The catalogue is empty — do [step 5](#6-step-5--load-demonstration-products) |
| Checkout does not open the card form | `VITE_STRIPE_PUBLISHABLE_KEY` was missing when the image was built — fill it in and run `docker compose build frontend && docker compose up -d frontend` |
| No emails arrive | `MAIL_PASSWORD` is not a valid Gmail **app** password. Orders still work |
| A container keeps restarting | `docker compose logs <name>` will say why; usually a missing value in `.env` |
| Everything stops working after ~50 minutes | Your sign-in expired. Sign in again |
| Container name conflicts | Another copy of the stack is running — `docker compose down` in both project folders |

Anything not listed here: the full symptom-to-cause table is in
[../operations/troubleshooting-runbook.md](../operations/troubleshooting-runbook.md),
and common questions are answered in [faq.md](faq.md).
