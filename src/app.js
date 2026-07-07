import { chromium } from "playwright";
import { expect } from "@playwright/test";
import fs from "fs";

const input = JSON.parse(fs.readFileSync("./src/input.json", "utf-8"));

const searchQuery = input.searchQuery;
const MAX_RESULTS = input.maxResults;

function delay(min, max) {
  const randomDelay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, randomDelay));
}

async function scrapeBusinessList(page, searchQuery, maxResults) {
  await page.goto("https://www.google.com/maps");
  await page.fill('input[name="q"]', searchQuery);
  await page.keyboard.press("Enter");

  const feed = page.getByRole("feed");

  try {
    await expect(feed.getByRole("article").first()).toBeVisible({ timeout: 15000 });
  } catch (error) {
    console.log("No results found for this search query.");
    return [];
  }

  let previousCount = 0;

  while (true) {
    const currentCount = await feed.getByRole("article").count();
    if (currentCount >= maxResults) {
      previousCount = maxResults;
      break;
    }
    await feed.hover();
    await page.mouse.wheel(0, 3000);
    const newElementAppeared = await feed
      .getByRole("article")
      .nth(currentCount)
      .waitFor({ state: "visible", timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    const newCount = await feed.getByRole("article").count();
    previousCount = Math.min(newCount, maxResults);
    if (!newElementAppeared || newCount === currentCount) {
      break;
    }
  }

  const count = previousCount;
  const allResults = [];

  for (let i = 0; i < count; i++) {
    const results = feed.getByRole("article");
    const firstLink = results.nth(i).getByRole("link").first();
    const name = await firstLink.getAttribute("aria-label");
    const placeUrl = await firstLink.getAttribute("href");

    const fullText = await results.nth(i).innerText();
    const lines = fullText.split('\n').filter(line => line.trim() !== '');

    const ratingLine = lines.find(line => /^\d\.\d\(/.test(line));
    const rating = ratingLine ? ratingLine.split('(')[0] : null;
    const reviewCount = ratingLine ? ratingLine.match(/\((\d+)\)/)?.[1] : null;

    const categoryAddressLine = lines.find(line => line.includes('·') && !line.includes('Open') && !line.includes('Closed'));
    const parts = categoryAddressLine
      ? categoryAddressLine.split('·').map(p => p.trim()).filter(p => p !== '')
      : [];
    const category = parts[0] || null;
    const address = parts[parts.length - 1] || null;

    const statusLine = lines.find(line => line.includes('Open') || line.includes('Closed'));

    allResults.push({ name, rating, reviewCount, category, address, statusLine, placeUrl, phoneNumber: null, websiteUrl: null });
  }

  const uniqueResults = Array.from(
    new Map(allResults.map(item => [item.placeUrl, item])).values()
  );

  console.log(`Total collected: ${allResults.length}, After removing duplicates: ${uniqueResults.length}`);

  return uniqueResults;
}

async function extractBusinessDetails(page, businesses) {
  for (let i = 0; i < businesses.length; i++) {
    try {
      await page.goto(businesses[i].placeUrl);

      const phoneButton = page.getByRole('button', { name: /^Phone:/ });
      const phoneLabel = await phoneButton.getAttribute('aria-label', { timeout: 5000 }).catch(() => null);
      businesses[i].phoneNumber = phoneLabel ? phoneLabel.replace('Phone: ', '') : null;

      const websiteLink = page.getByRole('link', { name: /^Website:/ });
      businesses[i].websiteUrl = await websiteLink.getAttribute('href', { timeout: 5000 }).catch(() => null);

      const addressButton = page.getByRole('button', { name: /^Address:/ });
      const addressLabel = await addressButton.getAttribute('aria-label', { timeout: 5000 }).catch(() => null);
      businesses[i].address = addressLabel ? addressLabel.replace('Address: ', '') : businesses[i].address;

      await randomDelay(2000, 5000);

    } catch (error) {
      console.log(`Warning: result ${i} (${businesses[i].name}) ke liye detail extraction fail hui:`, error.message);
    }
  }

  return businesses;
}

async function saveResults(results) {
  const output = {
    totalResults: results.length,
    data: results
  };

  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync('output/results.json', JSON.stringify(output, null, 2));
  console.log(`Data saved to output/results.json (${results.length} records)`);
}

const testScript = async () => {
  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const businesses = await scrapeBusinessList(page, searchQuery, MAX_RESULTS);
    const detailedBusinesses = await extractBusinessDetails(page, businesses);
    saveResults(detailedBusinesses);
    await browser.close();
  } catch (error) {
    console.error("Error during script execution:", error);
    await browser.close();
  }
};

testScript();
