/**
 * Fama-French Service
 *
 * Downloads, parses, and caches daily factor data from the Kenneth French
 * Data Library. Provides the authoritative risk-free rate and factor data
 * for the QuantDashboard metrics pipeline.
 *
 * Data source:
 *   https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_daily_CSV.zip
 *
 * @module famaFrenchService
 */

import https from "https";
import { inflateRawSync } from "zlib";
import FamaFrenchFactors from "../models/FamaFrenchFactors.js";

const FF_ZIP_URL =
  "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_daily_CSV.zip";

/** Fallback annual RF when download fails and no cache exists */
const FALLBACK_ANNUAL_RF = 0.04;

/** Re-download if newest cached row is older than this (ms) */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── CSV Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse the raw CSV text from the Fama-French daily factors file.
 *
 * Skips preamble lines until it finds the header row containing "Mkt-RF".
 * Stops at the first blank line after data rows (annual data follows and
 * should be ignored).
 *
 * Values in the CSV are percentages — this function divides by 100 to
 * return decimal form.
 *
 * @param {string} csvText - Raw CSV content from the zip
 * @returns {Array<{date: Date, mktRf: number, smb: number, hml: number, rf: number}>}
 */
export function parseFamaFrenchCSV(csvText) {
  const lines = csvText.split(/\r?\n/);
  const records = [];
  let headerFound = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Look for header row
    if (!headerFound) {
      if (trimmed.includes("Mkt-RF")) {
        headerFound = true;
      }
      continue;
    }

    // Blank line after data = end of daily section
    if (trimmed === "") {
      break;
    }

    // Parse data row: YYYYMMDD, Mkt-RF, SMB, HML, RF
    const parts = trimmed.split(",").map((s) => s.trim());
    if (parts.length < 5) continue;

    const dateStr = parts[0];
    if (!/^\d{8}$/.test(dateStr)) continue;

    const year = parseInt(dateStr.slice(0, 4), 10);
    const month = parseInt(dateStr.slice(4, 6), 10) - 1; // 0-indexed
    const day = parseInt(dateStr.slice(6, 8), 10);
    const date = new Date(Date.UTC(year, month, day));

    const mktRf = parseFloat(parts[1]) / 100;
    const smb = parseFloat(parts[2]) / 100;
    const hml = parseFloat(parts[3]) / 100;
    const rf = parseFloat(parts[4]) / 100;

    if ([mktRf, smb, hml, rf].some((v) => !Number.isFinite(v))) continue;

    records.push({ date, mktRf, smb, hml, rf });
  }

  return records;
}

// ─── Download ────────────────────────────────────────────────────────────────

/**
 * Download and extract the Fama-French daily factors CSV from the zip URL.
 *
 * Uses Node built-in https + zlib (no external dependencies). The zip file
 * from the French library is a single-entry deflate archive. We use a
 * streaming approach: pipe the HTTPS response through zlib.createUnzip()
 * to extract the CSV content.
 *
 * Note: The Kenneth French zip uses standard deflate compression that
 * zlib.createUnzip() may not handle directly (it's a zip container, not
 * raw gzip/deflate). We buffer the full response and use a minimal zip
 * parser to extract the CSV entry.
 *
 * @returns {Promise<string>} Raw CSV text
 */
export async function downloadFamaFrenchCSV() {
  return new Promise((resolve, reject) => {
    const request = https.get(FF_ZIP_URL, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        https.get(response.headers.location, handleResponse).on("error", reject);
        return;
      }

      handleResponse(response);
    });

    request.on("error", reject);

    // Set a generous timeout for the download
    request.setTimeout(30000, () => {
      request.destroy(new Error("Download timed out after 30 seconds"));
    });

    function handleResponse(res) {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from French Data Library`));
        res.resume(); // Drain response
        return;
      }

      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        try {
          const zipBuffer = Buffer.concat(chunks);
          const csvText = extractCSVFromZip(zipBuffer);
          resolve(csvText);
        } catch (err) {
          reject(err);
        }
      });
      res.on("error", reject);
    }
  });
}

/**
 * Minimal zip extractor — finds the first file entry in a zip archive
 * and decompresses it. Works for the simple single-file zips from the
 * Kenneth French Data Library.
 *
 * @param {Buffer} zipBuffer - Raw zip file bytes
 * @returns {string} Extracted CSV text (UTF-8)
 */
function extractCSVFromZip(zipBuffer) {
  // Zip local file header signature: PK\x03\x04
  const LOCAL_HEADER_SIG = 0x04034b50;

  if (zipBuffer.length < 30) {
    throw new Error("Zip buffer too small");
  }

  const sig = zipBuffer.readUInt32LE(0);
  if (sig !== LOCAL_HEADER_SIG) {
    throw new Error("Not a valid zip file (bad signature)");
  }

  const compressionMethod = zipBuffer.readUInt16LE(8);
  const compressedSize = zipBuffer.readUInt32LE(18);
  const filenameLength = zipBuffer.readUInt16LE(26);
  const extraLength = zipBuffer.readUInt16LE(28);

  const dataStart = 30 + filenameLength + extraLength;

  if (compressionMethod === 0) {
    // Stored (no compression)
    return zipBuffer.slice(dataStart, dataStart + compressedSize).toString("utf-8");
  }

  if (compressionMethod === 8) {
    // Deflate — use zlib.inflateRawSync (imported at top of file)
    const compressed = zipBuffer.slice(dataStart, dataStart + compressedSize);
    const decompressed = inflateRawSync(compressed);
    return decompressed.toString("utf-8");
  }

  throw new Error(`Unsupported zip compression method: ${compressionMethod}`);
}

// ─── Cache Management ────────────────────────────────────────────────────────

/**
 * Check if the cached data is stale (newest record older than CACHE_TTL_MS).
 * @returns {Promise<boolean>} true if cache is stale or empty
 */
async function isCacheStale() {
  const newest = await FamaFrenchFactors.findOne()
    .sort({ date: -1 })
    .select("date createdAt")
    .lean();

  if (!newest) return true;

  const age = Date.now() - new Date(newest.createdAt).getTime();
  return age > CACHE_TTL_MS;
}

/**
 * Download, parse, and upsert all daily factor data into MongoDB.
 * Uses bulkWrite with upserts to efficiently update/insert records.
 *
 * @returns {Promise<{inserted: number, modified: number, total: number}>}
 */
export async function refreshCache() {
  console.log("[FamaFrenchService] Downloading factor data...");
  const csvText = await downloadFamaFrenchCSV();
  const records = parseFamaFrenchCSV(csvText);

  if (records.length === 0) {
    throw new Error("Parsed 0 records from Fama-French CSV");
  }

  console.log(`[FamaFrenchService] Parsed ${records.length} daily records. Upserting...`);

  // Bulk upsert in chunks to avoid overwhelming MongoDB
  const CHUNK_SIZE = 5000;
  let totalInserted = 0;
  let totalModified = 0;

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const ops = chunk.map((r) => ({
      updateOne: {
        filter: { date: r.date },
        update: {
          $set: {
            mktRf: r.mktRf,
            smb: r.smb,
            hml: r.hml,
            rf: r.rf,
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    const result = await FamaFrenchFactors.bulkWrite(ops, { ordered: false });
    totalInserted += result.upsertedCount || 0;
    totalModified += result.modifiedCount || 0;
  }

  console.log(
    `[FamaFrenchService] Cache refreshed: ${totalInserted} inserted, ${totalModified} modified, ${records.length} total`
  );

  return { inserted: totalInserted, modified: totalModified, total: records.length };
}

/**
 * Ensure cache is fresh. If stale, refresh. Swallows errors and logs warnings.
 * @returns {Promise<void>}
 */
async function ensureFreshCache() {
  try {
    if (await isCacheStale()) {
      await refreshCache();
    }
  } catch (err) {
    console.warn(
      `[FamaFrenchService] Failed to refresh cache: ${err.message}. Using stale/fallback data.`
    );
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the annualized risk-free rate from the most recent daily RF value.
 *
 * Annualization: dailyRF * 252
 *
 * Falls back to FALLBACK_ANNUAL_RF (0.04) if no data is available.
 *
 * @returns {Promise<number>} Annualized risk-free rate in decimal form
 */
export async function getAnnualizedRiskFreeRate() {
  await ensureFreshCache();

  const latest = await FamaFrenchFactors.findOne()
    .sort({ date: -1 })
    .select("rf date")
    .lean();

  if (!latest) {
    console.warn(
      `[FamaFrenchService] No cached data available. Using fallback RF = ${FALLBACK_ANNUAL_RF}`
    );
    return FALLBACK_ANNUAL_RF;
  }

  const annualized = latest.rf * 252;
  return annualized;
}

/**
 * Get daily factor data for a date range.
 *
 * Returns records sorted by date ascending, suitable for factor regression.
 *
 * @param {Date} startDate - Inclusive start date
 * @param {Date} endDate - Inclusive end date
 * @returns {Promise<Array<{date: Date, mktRf: number, smb: number, hml: number, rf: number}>>}
 */
export async function getDailyRates(startDate, endDate) {
  await ensureFreshCache();

  const records = await FamaFrenchFactors.find({
    date: { $gte: startDate, $lte: endDate },
  })
    .sort({ date: 1 })
    .select("date mktRf smb hml rf -_id")
    .lean();

  return records;
}

/**
 * Get the daily risk-free rate for a specific date (or closest prior date).
 *
 * @param {Date} date - Target date
 * @returns {Promise<number|null>} Daily RF in decimal, or null if no data
 */
export async function getDailyRiskFreeRate(date) {
  await ensureFreshCache();

  const record = await FamaFrenchFactors.findOne({
    date: { $lte: date },
  })
    .sort({ date: -1 })
    .select("rf")
    .lean();

  return record ? record.rf : null;
}

export default {
  parseFamaFrenchCSV,
  downloadFamaFrenchCSV,
  refreshCache,
  getAnnualizedRiskFreeRate,
  getDailyRates,
  getDailyRiskFreeRate,
};
