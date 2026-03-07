/**
 * Metrics Controller
 *
 * Handles all portfolio metrics and analytics operations including
 * performance calculations, risk metrics, factor analysis, and
 * time series data. Implements the metrics API endpoints from the product spec.
 *
 * @class MetricsController
 * @author Rhys Jervis
 * @version 1.0.0
 * @since 2024
 */

import AccountHoldings from "../models/AccountHoldings.js";
import AccountBalances from "../models/AccountBalances.js";
import Metrics from "../models/Metrics.js";
import PortfolioTimeseries from "../models/PortfolioTimeseries.js";
import { config } from "../config/environment.js";
import * as riskMetrics from "../metrics/helpers/riskMetrics.js";
import * as riskAdjustedMetrics from "../metrics/helpers/riskAdjustedMetrics.js";
import * as returnsMetrics from "../metrics/helpers/returnsMetrics.js";
import * as portfolioSnapshotMetrics from "../metrics/helpers/portfolioSnapshotMetrics.js";
import { calculateTWRFromDailyReturns } from "../metrics/helpers/returnsMetrics.js";
import { getDateRange, mapRangeToPeriod } from '../metrics/helpers/dateRanges.js';

/**
 * Metrics Controller
 *
 * Provides REST API endpoints for portfolio analytics and metrics.
 * Handles performance calculations, risk metrics, factor analysis,
 * and time series data generation.
 *
 * @class MetricsController
 */
class MetricsController {
  constructor() {
    this.benchmarkSymbol = process.env.BENCHMARK_SYMBOL || "SPY";
    this.riskFreeRate = process.env.RISK_FREE_RATE || 0.02; // 2% annual
  }

  /**
   * Get portfolio value time series
   *
   * Calculates and returns cumulative portfolio value over time
   * with support for different time ranges and benchmark comparison.
   *
   * @async
   * @method getPortfolioValue
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * GET /api/portfolio/value?range=YTD
   * Body: { userId: "user123" }
   * Response: { benchmark: "SPY", points: [...] }
   */
  async getPortfolioValue(req, res) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing required parameter: userId is required",
          },
        });
      }
      const { range = "YTD", accountId } = req.query;

      console.log(
        `Getting portfolio value for user: ${userId}, range: ${range}, accountId: ${
          accountId || "all"
        }`
      );

      const { startDate, endDate } = getDateRange(range);

      const dateFilter = { $lte: endDate };
      if (startDate) dateFilter.$gte = startDate;
      const query = {
        userId,
        date: dateFilter,
      };
      if (accountId) {
        query.accountId = accountId;
      }

      const timeseriesData = await PortfolioTimeseries.find(query).sort({
        date: 1,
      }).lean();

      console.log(
        `Found ${timeseriesData.length} portfolio timeseries records for user ${userId} in range ${range}`
      );

      if (!timeseriesData || timeseriesData.length === 0) {
        console.log(
          `No portfolio timeseries data found for user ${userId}. User may need to run metrics pipeline.`
        );
        return res.status(200).json({
          benchmark: this.benchmarkSymbol,
          range: range,
          points: [],
          summary: {
            startValue: 0,
            endValue: 0,
            totalReturn: 0,
            dataPoints: 0,
          },
        });
      }

      const portfolioByDate = new Map();
      let latestTWRMetrics = null;
      let latestDate = null;
      let rangeTWRReturn = null;

      timeseriesData.forEach((record) => {
        const dateKey = record.date.toISOString().split("T")[0];
        const existing = portfolioByDate.get(dateKey) || {
          date: dateKey,
          equity: 0,
          cashFlow: 0,
        };
        existing.equity += record.totalValue || 0;
        existing.cashFlow += record.depositWithdrawal || 0;
        portfolioByDate.set(dateKey, existing);

        // Only use pre-calculated TWR from database if a specific account is selected
        // For "All Portfolios", we'll recalculate from aggregated data
        if (accountId) {
          const recordDate = new Date(record.date);
          const hasTWRData =
            (record.twr1Day !== null && record.twr1Day !== undefined) ||
            (record.twr3Months !== null && record.twr3Months !== undefined) ||
            (record.twrYearToDate !== null &&
              record.twrYearToDate !== undefined) ||
            (record.twrAllTime !== null && record.twrAllTime !== undefined);

          if (hasTWRData && (!latestDate || recordDate >= latestDate)) {
            latestDate = recordDate;
            latestTWRMetrics = {
              twr1Day: record.twr1Day,
              twr3Months: record.twr3Months,
              twrYearToDate: record.twrYearToDate,
              twrAllTime: record.twrAllTime,
            };

            // Get the appropriate TWR return for the selected range
            const rangeUpper = range.toUpperCase();
            switch (rangeUpper) {
              case "3M":
                rangeTWRReturn = record.twr3Months;
                break;
              case "YTD":
                rangeTWRReturn = record.twrYearToDate;
                break;
              case "ALL":
              case "ITD":
              case "ALLTIME":
                rangeTWRReturn = record.twrAllTime;
                break;
              case "1M":
              case "1Y":
                // For 1M and 1Y, calculate from dailyTWRReturn
                rangeTWRReturn = calculateTWRFromDailyReturns(
                  timeseriesData,
                  startDate,
                  endDate
                );
                break;
              default:
                rangeTWRReturn = record.twrAllTime;
            }
          }
        }
      });

      const portfolioValues = Array.from(portfolioByDate.values())
        .map((point) => ({
          date: point.date,
          equity: point.equity,
          cashFlow: point.cashFlow,
        }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      // If "All Portfolios" is selected, recalculate TWR from aggregated data
      if (!accountId && portfolioValues.length >= 2) {
        latestTWRMetrics = this.calculateTWRMetricsFromAggregatedData(
          portfolioValues,
          range
        );

        // Get the appropriate TWR return for the selected range from aggregated metrics
        const rangeUpper = range.toUpperCase();
        switch (rangeUpper) {
          case "3M":
            rangeTWRReturn = latestTWRMetrics.twr3Months;
            break;
          case "YTD":
            rangeTWRReturn = latestTWRMetrics.twrYearToDate;
            break;
          case "ALL":
          case "ITD":
          case "ALLTIME":
            rangeTWRReturn = latestTWRMetrics.twrAllTime;
            break;
          case "1M":
          case "1Y":
            // For 1M and 1Y, calculate from aggregated portfolio values
            const rangeStartDate = new Date(startDate);
            const rangeEndDate = new Date(endDate);
            const rangeData = portfolioValues.filter((p) => {
              const pDate = new Date(p.date);
              return pDate >= rangeStartDate && pDate <= rangeEndDate;
            });
            if (rangeData.length >= 2) {
              rangeTWRReturn = this.calculateTimeWeightedReturn(rangeData);
            }
            break;
          default:
            rangeTWRReturn = latestTWRMetrics.twrAllTime;
        }
      }

      // Determine data freshness — find the most recent data point date
      const lastDataDate = portfolioValues.length > 0
        ? portfolioValues[portfolioValues.length - 1].date
        : null;
      const todayStr = new Date().toISOString().split("T")[0];
      const isStale = lastDataDate && lastDataDate < todayStr;

      res.status(200).json({
        benchmark: this.benchmarkSymbol,
        range: range,
        points: portfolioValues,
        summary: {
          startValue: portfolioValues[0]?.equity || 0,
          endValue: portfolioValues[portfolioValues.length - 1]?.equity || 0,
          totalReturn:
            rangeTWRReturn !== null && rangeTWRReturn !== undefined
              ? rangeTWRReturn
              : this.calculateTimeWeightedReturn(portfolioValues),
          dataPoints: portfolioValues.length,
        },
        twrMetrics: latestTWRMetrics || null,
        dataFreshness: {
          lastDataDate,
          isStale,
          staleMessage: isStale
            ? `Data is from ${lastDataDate}. Click "Update All Data" to refresh.`
            : null,
        },
      });
    } catch (error) {
      console.error("Error getting portfolio value:", error);
      res.status(500).json({
        error: {
          code: "PORTFOLIO_VALUE_FAILED",
          message: "Failed to calculate portfolio value",
          retryAfter: 60,
        },
      });
    }
  }

  /**
   * Get performance metrics
   *
   * Calculates key performance metrics including total return,
   * YTD performance, and P&L analysis.
   *
   * @async
   * @method getPerformance
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * GET /api/metrics/performance
   * Body: { userId: "user123" }
   * Response: { totalReturn: 0.15, ytd: 0.08, pnl: {...} }
   */
  async getPerformance(req, res) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing required parameter: userId is required",
          },
        });
      }

      const { range = "ALL", accountId } = req.query;
      const period = mapRangeToPeriod(range);

      console.log(
        `Getting performance metrics for user: ${userId}, range: ${range}, period: ${period}, accountId: ${
          accountId || "all"
        }`
      );

      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      today.setUTCHours(0, 0, 0, 0);
      const metricsDateCeiling = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999
      ));

      let metricsDoc = null;
      if (accountId) {
        metricsDoc = await Metrics.findOne({
          userId,
          accountId,
          date: { $lte: metricsDateCeiling },
          period: period,
        }).sort({ date: -1 }).lean();
      }

      if (metricsDoc && metricsDoc.metrics) {
        const perf = {
          totalReturn: metricsDoc.metrics.totalReturn || null,
          cagr: metricsDoc.metrics.cagr || null,
          sharpe: metricsDoc.metrics.sharpe || null,
          sortino: metricsDoc.metrics.sortino || null,
          calmar: metricsDoc.metrics.calmar || null,
          alpha: metricsDoc.metrics.alpha || null,
          volatility: metricsDoc.metrics.volatility || null,
        };

        return res.status(200).json({
          range: range,
          performance: perf,
          calculatedAt: metricsDoc.computedAtUtc || metricsDoc.date,
          source: "database",
        });
      }

      const { startDate } = getDateRange(range);
      const dateFilter = { $lte: today };
      if (startDate) dateFilter.$gte = startDate;
      const query = {
        userId,
        date: dateFilter,
      };
      if (accountId) {
        query.accountId = accountId;
      }

      const portfolioData = await PortfolioTimeseries.find(query)
        .sort({ date: 1 })
        .lean();

      if (!portfolioData || portfolioData.length < 2) {
        return res.status(200).json({
          range: range,
          performance: {
            totalReturn: null,
            cagr: null,
            sharpe: null,
            sortino: null,
            calmar: null,
            alpha: null,
            volatility: null,
          },
          calculatedAt: new Date(),
          source: "calculated",
        });
      }

      // Aggregate portfolio data by date if "All Portfolios" is selected
      let aggregatedPortfolioValues = null;
      if (!accountId) {
        const portfolioByDate = new Map();
        portfolioData.forEach((record) => {
          const dateKey = record.date.toISOString().split("T")[0];
          const existing = portfolioByDate.get(dateKey) || {
            date: dateKey,
            equity: 0,
            cashFlow: 0,
          };
          existing.equity += record.totalValue || 0;
          existing.cashFlow += record.depositWithdrawal || 0;
          portfolioByDate.set(dateKey, existing);
        });

        aggregatedPortfolioValues = Array.from(portfolioByDate.values())
          .map((point) => ({
            date: point.date,
            equity: point.equity,
            cashFlow: point.cashFlow,
          }))
          .sort((a, b) => new Date(a.date) - new Date(b.date));
      }

      // Calculate TWR return
      let twrReturn = null;
      const rangeUpper = range.toUpperCase();

      if (
        !accountId &&
        aggregatedPortfolioValues &&
        aggregatedPortfolioValues.length >= 2
      ) {
        // For "All Portfolios", calculate TWR from aggregated data
        const twrMetrics = this.calculateTWRMetricsFromAggregatedData(
          aggregatedPortfolioValues,
          range
        );

        switch (rangeUpper) {
          case "3M":
            twrReturn = twrMetrics.twr3Months;
            break;
          case "YTD":
            twrReturn = twrMetrics.twrYearToDate;
            break;
          case "ALL":
          case "ITD":
          case "ALLTIME":
            twrReturn = twrMetrics.twrAllTime;
            break;
          case "1M":
          case "1Y":
            // For 1M and 1Y, calculate from aggregated portfolio values
            const rangeStartDate = new Date(startDate);
            const rangeEndDate = new Date(today);
            const rangeData = aggregatedPortfolioValues.filter((p) => {
              const pDate = new Date(p.date);
              return pDate >= rangeStartDate && pDate <= rangeEndDate;
            });
            if (rangeData.length >= 2) {
              twrReturn = this.calculateTimeWeightedReturn(rangeData);
            }
            break;
          default:
            twrReturn = twrMetrics.twrAllTime;
        }
      } else if (accountId) {
        // For single account, use pre-calculated TWR from latest record
        const latest = portfolioData[portfolioData.length - 1];
        switch (rangeUpper) {
          case "3M":
            twrReturn = latest.twr3Months;
            break;
          case "YTD":
            twrReturn = latest.twrYearToDate;
            break;
          case "ALL":
          case "ITD":
          case "ALLTIME":
            twrReturn = latest.twrAllTime;
            break;
          case "1M":
          case "1Y":
            // For 1M and 1Y, calculate from dailyTWRReturn
            twrReturn = calculateTWRFromDailyReturns(
              portfolioData,
              startDate,
              today
            );
            break;
          default:
            twrReturn = null;
        }
      }

      const returns = portfolioData
        .map((pt) => pt.simpleReturns || pt.dailyTWRReturn)
        .filter((r) => r !== null && r !== undefined && !isNaN(r));

      const cumulativeReturns = portfolioData
        .map((pt) => pt.equityIndex || pt.totalValue)
        .filter((v) => v !== null && v !== undefined && !isNaN(v));

      if (returns.length < 2) {
        return res.status(200).json({
          range: range,
          performance: {
            totalReturn: null,
            cagr: null,
            sharpe: null,
            sortino: null,
            calmar: null,
            alpha: null,
            volatility: null,
          },
          calculatedAt: new Date(),
          source: "calculated",
        });
      }

      const periodsPerYear = 252;
      const sharpe = riskAdjustedMetrics.calculateSharpeRatio(
        returns,
        this.riskFreeRate,
        true
      );
      const sortino = riskAdjustedMetrics.calculateSortinoRatio(
        returns,
        0,
        true
      );
      const meanReturn =
        returns.length > 0
          ? returns.reduce((s, r) => s + r, 0) / returns.length
          : 0;
      const annualizedReturn = meanReturn * periodsPerYear;
      const perfMetrics = {
        sharpe,
        sortino,
        expectedReturn: meanReturn,
        annualizedReturn,
        calmar: null, // TODO: implement in helpers
        alpha: null,
      };

      // Use pre-calculated TWR if available, otherwise fall back to point-to-point return
      let totalReturn;
      if (twrReturn !== null && twrReturn !== undefined && !isNaN(twrReturn)) {
        totalReturn = twrReturn;
      } else {
        // For "All Portfolios", always use aggregated data (never raw portfolioData)
        if (!accountId) {
          if (
            aggregatedPortfolioValues &&
            aggregatedPortfolioValues.length >= 2
          ) {
            // Sufficient data: calculate return from aggregated values
            const firstValue = aggregatedPortfolioValues[0].equity || 0;
            const lastValue =
              aggregatedPortfolioValues[aggregatedPortfolioValues.length - 1]
                .equity || 0;
            totalReturn =
              firstValue > 0 ? (lastValue - firstValue) / firstValue : 0;
          } else if (
            aggregatedPortfolioValues &&
            aggregatedPortfolioValues.length === 1
          ) {
            // Only one date: cannot calculate return, set to 0
            totalReturn = 0;
          } else {
            // No aggregated data available: set to null
            totalReturn = null;
          }
        } else {
          // Single account: use raw portfolioData (this is correct for single account)
          const firstValue = portfolioData[0].totalValue || 0;
          const lastValue =
            portfolioData[portfolioData.length - 1].totalValue || 0;
          totalReturn =
            firstValue > 0 ? (lastValue - firstValue) / firstValue : 0;
        }
      }

      const days = (today - startDate) / (1000 * 60 * 60 * 24);
      const years = days / 365.25;
      const cagr = years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : 0;

      const performance = {
        totalReturn: totalReturn,
        cagr: cagr,
        sharpe: perfMetrics.sharpe,
        sortino: perfMetrics.sortino,
        calmar: perfMetrics.calmar,
        alpha: null,
        volatility: null,
      };

      res.status(200).json({
        range: range,
        performance: performance,
        calculatedAt: new Date(),
        source: "calculated",
      });
    } catch (error) {
      console.error("Error getting performance metrics:", error);
      res.status(500).json({
        error: {
          code: "PERFORMANCE_CALCULATION_FAILED",
          message: "Failed to calculate performance metrics",
          retryAfter: 60,
        },
      });
    }
  }

  /**
   * Get risk metrics
   *
   * Calculates portfolio risk metrics including volatility,
   * beta, maximum drawdown, and VaR.
   *
   * @async
   * @method getRiskMetrics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * GET /api/metrics/risk
   * Body: { userId: "user123" }
   * Response: { volatility: 0.18, beta: 0.94, maxDrawdown: -0.127 }
   */
  async getRiskMetrics(req, res) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing required parameter: userId is required",
          },
        });
      }

      const { range = "1Y", accountId, confidence = 0.95 } = req.query;
      const period = mapRangeToPeriod(range);
      const confLevel = parseFloat(confidence);

      console.log(
        `Getting risk metrics for user: ${userId}, range: ${range}, period: ${period}, accountId: ${
          accountId || "all"
        }`
      );

      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      today.setUTCHours(0, 0, 0, 0);
      const metricsDateCeiling = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999
      ));

      let metricsDoc = null;
      if (accountId) {
        metricsDoc = await Metrics.findOne({
          userId,
          accountId,
          date: { $lte: metricsDateCeiling },
          period: period,
        }).sort({ date: -1 }).lean();
      }

      if (metricsDoc && metricsDoc.metrics) {
        const risk = {
          volatility: metricsDoc.metrics.volatility || null,
          maxDrawdown: metricsDoc.metrics.maxDrawdown || null,
          var95: metricsDoc.metrics.var95 || null,
          cvar95: metricsDoc.metrics.cvar95 || null,
          downsideDeviation: metricsDoc.metrics.downsideDeviation || null,
          omega: metricsDoc.metrics.omega || null,
          sharpeConfidenceInterval:
            metricsDoc.metrics.sharpeConfidenceInterval || null,
          beta: metricsDoc.metrics.beta || null,
        };

        return res.status(200).json({
          range: range,
          riskMetrics: risk,
          calculatedAt: metricsDoc.computedAtUtc || metricsDoc.date,
          source: "database",
        });
      }

      const { startDate } = getDateRange(range);
      const dateFilter = { $lte: today };
      if (startDate) dateFilter.$gte = startDate;
      const query = {
        userId,
        date: dateFilter,
      };
      if (accountId) {
        query.accountId = accountId;
      }

      const portfolioData = await PortfolioTimeseries.find(query)
        .sort({ date: 1 })
        .lean();

      if (!portfolioData || portfolioData.length < 2) {
        return res.status(200).json({
          range: range,
          riskMetrics: {
            volatility: null,
            maxDrawdown: null,
            var95: null,
            cvar95: null,
            downsideDeviation: null,
            omega: null,
            sharpeConfidenceInterval: null,
            beta: null,
          },
          calculatedAt: new Date(),
          source: "calculated",
        });
      }

      const returns = portfolioData
        .map((pt) => pt.simpleReturns || pt.dailyTWRReturn)
        .filter((r) => r !== null && r !== undefined && !isNaN(r));

      const cumulativeReturns = portfolioData
        .map((pt) => pt.equityIndex || pt.totalValue)
        .filter((v) => v !== null && v !== undefined && !isNaN(v));

      if (returns.length < 2) {
        return res.status(200).json({
          range: range,
          riskMetrics: {
            volatility: null,
            maxDrawdown: null,
            var95: null,
            cvar95: null,
            downsideDeviation: null,
            omega: null,
            sharpeConfidenceInterval: null,
            beta: null,
          },
          calculatedAt: new Date(),
          source: "calculated",
        });
      }

      // Calculate risk metrics from helpers
      const periodsPerYear = 252;
      const volatility = riskMetrics.calculateVolatility(returns, true);
      const var95Raw = riskMetrics.calculateVaRHistorical(returns, confLevel);
      const cvar95Raw = riskMetrics.calculateCVaR(returns, var95Raw);
      // TODO: implement in helpers — downsideDeviation, omega, sharpeConfidenceInterval
      const riskResult = {
        annualizedVolatility: volatility,
        var95: Math.abs(var95Raw),
        cvar95: Math.abs(cvar95Raw),
        downsideDeviation: null,
        omega: null,
        sharpeConfidenceInterval: null,
      };

      // Max drawdown: helper returns negative (e.g. -0.25); API expects negative
      const maxDrawdown = riskMetrics.calculateMaxDrawdown(cumulativeReturns);

      const risk = {
        volatility: riskResult.annualizedVolatility,
        maxDrawdown: maxDrawdown,
        var95: riskResult.var95,
        cvar95: riskResult.cvar95,
        downsideDeviation: riskResult.downsideDeviation,
        omega: riskResult.omega,
        sharpeConfidenceInterval: riskResult.sharpeConfidenceInterval,
        beta: null, // Beta requires benchmark, calculated in factor metrics
      };

      res.status(200).json({
        range: range,
        riskMetrics: risk,
        calculatedAt: new Date(),
        source: "calculated",
      });
    } catch (error) {
      console.error("Error getting risk metrics:", error);
      res.status(500).json({
        error: {
          code: "RISK_CALCULATION_FAILED",
          message: "Failed to calculate risk metrics",
          retryAfter: 60,
        },
      });
    }
  }

  /**
   * Get factor exposures
   *
   * Calculates factor model exposures (Fama-French 3/5, Carhart)
   * with statistical significance testing.
   *
   * @async
   * @method getFactorExposures
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * GET /api/metrics/factors?model=FF3&range=1Y
   * Body: { userId: "user123" }
   * Response: { model: "FF3", exposures: {...}, statistics: {...} }
   */
  async getFactorExposures(req, res) {
    return res.status(501).json({
      error: {
        code: "NOT_IMPLEMENTED",
        message: "Factor exposure analysis is not yet implemented",
      },
    });
  }

  /**
   * Get KPI metrics
   *
   * Calculates key performance indicators including Sharpe ratio,
   * Sortino ratio, CAGR, and other standard metrics.
   *
   * @async
   * @method getKPIs
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * GET /api/metrics/kpis?range=YTD
   * Body: { userId: "user123" }
   * Response: { kpis: { sharpe: 1.22, sortino: 1.85, cagr: 0.108 } }
   */
  async getKPIs(req, res) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing required parameter: userId is required",
          },
        });
      }

      const { range = "YTD", accountId } = req.query;

      // Sanitize accountId to prevent NoSQL injection via query operators
      let safeAccountId = null;
      if (typeof accountId === "string") {
        const trimmed = accountId.trim();
        if (trimmed.length > 0) {
          safeAccountId = trimmed;
        }
      }

      console.log(
        `Getting KPI metrics for user: ${userId}, range: ${range}, accountId: ${
          safeAccountId || "all"
        }`
      );

      // Get portfolio time series data
      const { startDate } = getDateRange(range);
      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      today.setUTCHours(0, 0, 0, 0);

      const dateFilter = { $lte: today };
      if (startDate) dateFilter.$gte = startDate;
      const query = {
        userId,
        date: dateFilter,
      };
      if (safeAccountId) {
        // Use $eq to ensure accountId is treated as a literal value
        query.accountId = { $eq: safeAccountId };
      }

      const portfolioData = await PortfolioTimeseries.find(query)
        .sort({ date: 1 })
        .lean();

      const returns = portfolioData
        .map((pt) => pt.simpleReturns || pt.dailyTWRReturn)
        .filter((r) => r !== null && r !== undefined && !isNaN(r));

      if (returns.length < 2) {
        return res.status(200).json({
          range: range,
          kpis: {
            sharpe: null,
            sortino: null,
            beta: null,
            maxDrawdown: null,
            cagr: null,
            volatility: null,
          },
          calculatedAt: new Date(),
        });
      }

      // Build equity index from returns
      const equityIndex = [1];
      for (const r of returns) equityIndex.push(equityIndex[equityIndex.length - 1] * (1 + r));

      const volatility = riskMetrics.calculateVolatility(returns, true);
      const sharpe = riskAdjustedMetrics.calculateSharpeRatio(returns, 0, true);
      const sortino = riskAdjustedMetrics.calculateSortinoRatio(returns, 0, true);
      const maxDrawdown = riskMetrics.calculateMaxDrawdown(equityIndex);

      // Calculate CAGR from total return
      const firstValue = portfolioData[0].totalValue || portfolioData[0].equityIndex || 0;
      const lastValue = portfolioData[portfolioData.length - 1].totalValue || portfolioData[portfolioData.length - 1].equityIndex || 0;
      const totalReturn = firstValue > 0 ? (lastValue - firstValue) / firstValue : 0;
      const days = (today - startDate) / (1000 * 60 * 60 * 24);
      const years = days / 365.25;
      const cagr = years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : 0;

      const kpis = {
        sharpe: sharpe,
        sortino: sortino,
        beta: null, // TODO: requires benchmark returns and regression to compute
        maxDrawdown: maxDrawdown,
        cagr: cagr,
        volatility: volatility,
      };

      res.status(200).json({
        range: range,
        kpis: kpis,
        calculatedAt: new Date(),
      });
    } catch (error) {
      console.error("Error getting KPI metrics:", error);
      res.status(500).json({
        error: {
          code: "KPI_CALCULATION_FAILED",
          message: "Failed to calculate KPI metrics",
          retryAfter: 60,
        },
      });
    }
  }

  /**
   * Get time series metrics
   *
   * Returns rolling metrics over time including returns,
   * volatility, and drawdown curves.
   *
   * @async
   * @method getTimeSeries
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * GET /api/metrics/timeseries?series=returns,vol&range=1Y
   * Body: { userId: "user123" }
   * Response: { series: {...}, data: [...] }
   */
  async getTimeSeries(req, res) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing required parameter: userId is required",
          },
        });
      }
      const { series = "returns", range = "1Y", accountId } = req.query;

      console.log(
        `Getting time series for user: ${userId}, series: ${series}, range: ${range}, accountId: ${
          accountId || "all"
        }`
      );

      // Get historical holdings data
      const { startDate } = getDateRange(range);
      const dateFilter = {};
      if (startDate) dateFilter.$gte = startDate;
      const query = {
        userId,
      };
      if (Object.keys(dateFilter).length > 0) query.asOfDate = dateFilter;
      if (accountId) {
        query.accountId = accountId;
      }
      const holdings = await AccountHoldings.find(query).sort({ asOfDate: 1 }).lean();

      // Calculate time series
      const timeSeries = this.calculateTimeSeries(holdings, series, range);

      res.status(200).json({
        series: series,
        range: range,
        data: timeSeries,
        calculatedAt: new Date(),
      });
    } catch (error) {
      console.error("Error getting time series:", error);
      res.status(500).json({
        error: {
          code: "TIMESERIES_CALCULATION_FAILED",
          message: "Failed to calculate time series",
          retryAfter: 60,
        },
      });
    }
  }

  // Helper Methods

  /**
   * Calculate portfolio time series from holdings data
   */
  calculatePortfolioTimeSeries(holdings, range) {
    // Group holdings by date
    const holdingsByDate = {};
    holdings.forEach((holding) => {
      const date = holding.asOfDate.toISOString().split("T")[0];
      if (!holdingsByDate[date]) {
        holdingsByDate[date] = [];
      }
      holdingsByDate[date].push(holding);
    });

    // Calculate daily portfolio values
    const timeSeries = [];
    Object.keys(holdingsByDate)
      .sort()
      .forEach((date) => {
        const dailyHoldings = holdingsByDate[date];
        const totalValue = dailyHoldings.reduce(
          (sum, holding) => sum + (holding.marketValue || 0),
          0
        );

        timeSeries.push({
          date: date,
          equity: totalValue,
        });
      });

    return timeSeries;
  }

  /**
   * Calculate TWR metrics from aggregated portfolio data
   * Used when "All Portfolios" is selected to recalculate TWR from aggregated equity and cashFlow
   *
   * @param {Array} portfolioValues - Array of {date, equity, cashFlow} objects sorted by date
   * @param {string} range - Time range (1M, 3M, YTD, 1Y, ALL)
   * @returns {Object} TWR metrics object with twr1Day, twr3Months, twrYearToDate, twrAllTime
   */
  calculateTWRMetricsFromAggregatedData(portfolioValues, range) {
    if (!portfolioValues || portfolioValues.length === 0) {
      return {
        twr1Day: null,
        twr3Months: null,
        twrYearToDate: null,
        twrAllTime: null,
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    // Find the last data point (should be today or most recent)
    const lastIndex = portfolioValues.length - 1;
    const lastDateStr = portfolioValues[lastIndex]?.date;

    // Calculate 1 Day TWR (from yesterday to today, if available)
    let twr1Day = null;
    if (portfolioValues.length >= 2) {
      const yesterday = portfolioValues[lastIndex - 1];
      const todayData = portfolioValues[lastIndex];
      if (yesterday && todayData) {
        const oneDaySeries = [yesterday, todayData];
        twr1Day = this.calculateTimeWeightedReturn(oneDaySeries);
      }
    }

    // Calculate 3 Months TWR
    let twr3Months = null;
    if (portfolioValues.length >= 2) {
      const threeMonthsAgo = new Date(today);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const threeMonthsAgoStr = threeMonthsAgo.toISOString().split("T")[0];

      const startIndex = portfolioValues.findIndex(
        (p) => p.date >= threeMonthsAgoStr
      );
      if (startIndex !== -1 && startIndex < portfolioValues.length) {
        const threeMonthSeries = portfolioValues.slice(startIndex);
        if (threeMonthSeries.length >= 2) {
          twr3Months = this.calculateTimeWeightedReturn(threeMonthSeries);
        }
      }
    }

    // Calculate Year to Date TWR
    let twrYearToDate = null;
    if (portfolioValues.length >= 2) {
      const currentYear = today.getFullYear();
      const yearStartStr = `${currentYear}-01-01`;

      const startIndex = portfolioValues.findIndex(
        (p) => p.date >= yearStartStr
      );
      if (startIndex !== -1 && startIndex < portfolioValues.length) {
        const ytdSeries = portfolioValues.slice(startIndex);
        if (ytdSeries.length >= 2) {
          twrYearToDate = this.calculateTimeWeightedReturn(ytdSeries);
        }
      }
    }

    // Calculate All Time TWR
    let twrAllTime = null;
    if (portfolioValues.length >= 2) {
      twrAllTime = this.calculateTimeWeightedReturn(portfolioValues);
    }

    return {
      twr1Day: twr1Day !== null && isFinite(twr1Day) ? twr1Day : null,
      twr3Months:
        twr3Months !== null && isFinite(twr3Months) ? twr3Months : null,
      twrYearToDate:
        twrYearToDate !== null && isFinite(twrYearToDate)
          ? twrYearToDate
          : null,
      twrAllTime:
        twrAllTime !== null && isFinite(twrAllTime) ? twrAllTime : null,
    };
  }

  /**
   * Calculate Time-Weighted Rate of Return (TWR)
   *
   * TWR eliminates the impact of external cash flows by breaking the investment period
   * into sub-periods at each cash flow event, calculating returns for each sub-period,
   * and then linking them geometrically.
   *
   * Formula: TWR = [(1 + HP1) × (1 + HP2) × ... × (1 + HPn)] - 1
   * where HP = (End Value - (Initial Value + Cash Flow)) / (Initial Value + Cash Flow)
   *
   * For each sub-period:
   * - Sub-period ends just before a cash flow (or at the end of the period)
   * - The return is calculated using the value before the cash flow
   * - Then the cash flow is applied, and the next sub-period starts
   *
   * Reference: https://www.investopedia.com/terms/t/time-weightedror.asp
   *
   * @param {Array} timeSeries - Array of {date, equity, cashFlow} objects sorted by date
   * @returns {number} Time-weighted return as a decimal (e.g., 0.15 for 15%)
   */
  calculateTimeWeightedReturn(timeSeries) {
    if (timeSeries.length < 2) return 0;

    const subPeriodReturns = [];
    let subPeriodStartIdx = 0;

    // Process each day to identify sub-periods
    for (let i = 1; i < timeSeries.length; i++) {
      const hasCashFlow = Math.abs(timeSeries[i].cashFlow || 0) > 1e-6;
      const isLastDay = i === timeSeries.length - 1;

      // A sub-period ends when we encounter a cash flow or reach the last day
      if (hasCashFlow || isLastDay) {
        const startValue = timeSeries[subPeriodStartIdx].equity;
        const endValue = timeSeries[i].equity;
        const cashFlow = timeSeries[i].cashFlow || 0;

        // Calculate holding period return for this sub-period
        // The end value should be adjusted to exclude the cash flow for return calculation
        // HP = (End Value Before Cash Flow - Start Value) / Start Value
        // But if cash flow happens on the same day, we need to adjust:
        // End Value Before Cash Flow = End Value - Cash Flow
        const endValueBeforeCashFlow = endValue - cashFlow;

        let holdingPeriodReturn = 0;
        if (Math.abs(startValue) > 1e-6) {
          holdingPeriodReturn =
            (endValueBeforeCashFlow - startValue) / startValue;
        } else if (Math.abs(endValueBeforeCashFlow) > 1e-6) {
          // If start value is zero but we have an end value, return is undefined
          // In practice, this might indicate a new account - skip this sub-period
          holdingPeriodReturn = 0;
        }

        subPeriodReturns.push(holdingPeriodReturn);

        // Next sub-period starts after this cash flow (or continues if no cash flow on last day)
        if (hasCashFlow) {
          subPeriodStartIdx = i;
        }
      }
    }

    // If no sub-periods were created (shouldn't happen, but handle edge case)
    if (subPeriodReturns.length === 0) {
      const startValue = timeSeries[0].equity;
      const endValue = timeSeries[timeSeries.length - 1].equity;
      if (Math.abs(startValue) > 1e-6) {
        return (endValue - startValue) / startValue;
      }
      return 0;
    }

    // Link sub-period returns geometrically: TWR = product of (1 + HP) - 1
    const twr =
      subPeriodReturns.reduce((product, hp) => {
        // Handle edge cases where return might be very negative
        // Allow negative factors (losses) - only check for finite values
        const factor = 1 + hp;
        return product * (isFinite(factor) ? factor : 1);
      }, 1) - 1;

    return isFinite(twr) ? twr : 0;
  }

  /**
   * Calculate performance metrics
   */
  calculatePerformanceMetrics(currentHoldings, historicalHoldings, range) {
    const currentValue = currentHoldings.reduce(
      (sum, h) => sum + (h.marketValue || 0),
      0
    );
    const historicalValue =
      historicalHoldings.length > 0
        ? historicalHoldings[0].marketValue || 0
        : currentValue;

    const totalReturn =
      historicalValue > 0
        ? (currentValue - historicalValue) / historicalValue
        : 0;
    const totalPnL = currentValue - historicalValue;

    return {
      totalReturn: totalReturn,
      totalPnL: totalPnL,
      currentValue: currentValue,
      historicalValue: historicalValue,
      ytd: this.calculateYTDReturn(historicalHoldings),
      itd: totalReturn,
    };
  }

  /**
   * Calculate YTD return
   */
  calculateYTDReturn(holdings) {
    const currentYear = new Date().getFullYear();
    const ytdStart = new Date(currentYear, 0, 1);

    const ytdHoldings = holdings.filter((h) => h.asOfDate >= ytdStart);
    if (ytdHoldings.length < 2) return 0;

    const startValue = ytdHoldings[0].marketValue || 0;
    const endValue = ytdHoldings[ytdHoldings.length - 1].marketValue || 0;

    return startValue > 0 ? (endValue - startValue) / startValue : 0;
  }

  /**
   * Calculate time series metrics
   */
  calculateTimeSeries(holdings, series, range) {
    // Compute daily returns from holdings market values
    const returns = [];
    for (let i = 1; i < holdings.length; i++) {
      const prevValue = holdings[i - 1].marketValue || 0;
      const currentValue = holdings[i].marketValue || 0;
      if (prevValue > 0) {
        returns.push((currentValue - prevValue) / prevValue);
      }
    }
    const timeSeries = [];

    if (series.includes("returns")) {
      returns.forEach((ret, index) => {
        timeSeries.push({
          date: holdings[index + 1]?.asOfDate?.toISOString().split("T")[0],
          returns: ret,
        });
      });
    }

    if (series.includes("vol")) {
      const window = 21; // 21-day rolling volatility
      for (let i = window; i < returns.length; i++) {
        const windowReturns = returns.slice(i - window, i);
        const vol = riskMetrics.calculateVolatility(windowReturns, true);
        timeSeries.push({
          date: holdings[i]?.asOfDate?.toISOString().split("T")[0],
          volatility: vol,
        });
      }
    }

    if (series.includes("dd")) {
      const drawdowns = this.calculateDrawdownCurve(returns);
      drawdowns.forEach((dd, index) => {
        timeSeries.push({
          date: holdings[index + 1]?.asOfDate?.toISOString().split("T")[0],
          drawdown: dd,
        });
      });
    }

    return timeSeries;
  }

  /**
   * Calculate drawdown curve
   */
  calculateDrawdownCurve(returns) {
    const drawdowns = [];
    let peak = 0;
    let cumulative = 1;

    returns.forEach((ret) => {
      cumulative *= 1 + ret;
      if (cumulative > peak) {
        peak = cumulative;
      }
      const drawdown = (peak - cumulative) / peak;
      drawdowns.push(-drawdown); // Return as negative
    });

    return drawdowns;
  }

  /**
   * Calculate Metrics (Manual Trigger)
   * POST /api/metrics/calculate
   *
   * Triggers the metrics calculation pipeline.
   * Supports both fullSync (for new connections) and incremental (for daily refresh).
   *
   * @async
   * @method calculateMetrics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * POST /api/metrics/calculate
   * Body: { userId: "user123", fullSync: false, steps: ["price", "valuation", "metrics"] }
   * Response: { success: true, results: {...}, summary: {...} }
   */
  async calculateMetrics(req, res) {
    try {
      const userId = req.user?.userId;
      const { accountId, fullSync = false, steps } = req.body;

      // Validate required parameters
      if (!userId) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing required parameter: userId is required",
          },
        });
      }

      console.log(
        `Calculating metrics for user: ${userId}, accountId: ${
          accountId || "all"
        }, fullSync: ${fullSync}`
      );

      // Dynamically import the pipeline function
      // Path is relative to server/src/controllers/
      const { runMetricsPipeline } = await import(
        "../metrics/runMetricsPipeline.js"
      );

      // Run the pipeline
      const results = await runMetricsPipeline({
        databaseUrl: config.DATABASE_URL,
        userId,
        accountId,
        fullSync,
        steps,
      });

      // Check for errors
      if (results.errors && results.errors.length > 0) {
        return res.status(200).json({
          success: true,
          results,
          summary: {
            completed: true,
            errors: results.errors.length,
            warnings: 0,
          },
          message: "Metrics calculation completed with some errors",
        });
      }

      res.status(200).json({
        success: true,
        results,
        summary: {
          completed: true,
          errors: 0,
          warnings: 0,
        },
        message: "Metrics calculation completed successfully",
      });
    } catch (error) {
      console.error("Error calculating metrics:", error);
      res.status(500).json({
        error: {
          code: "METRICS_CALCULATION_FAILED",
          message: "Failed to calculate metrics",
          details: error.message,
        },
      });
    }
  }
}

export default new MetricsController();
